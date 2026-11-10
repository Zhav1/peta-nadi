"""Batch-job scheduler for the protected external tick (Phase 162 / M8).

The web process no longer runs eight ingestion loops (audit §1: nine pollers on
0.1 CPU starve boot and `/health`). Production runs `INPROCESS_BATCH_POLLERS=false`
and drives batch ingestion from :mod:`app.routers.internal_tick`, which calls
:func:`plan_tick` + :func:`run_tick` here.

Contract
--------
* Jobs are defined by ``cadence_seconds`` only; the *cycle* body is resolved from
  ``app.main`` at call time (``_run_*_cycle``), so job bodies are never duplicated
  and no adapter is imported just to build the registry.
* Durable state lives in Supabase ``scheduler_jobs`` (migration
  ``infra/supabase/migrations/023_scheduler_jobs.sql``). ``last_finished_at`` is
  the durable ``last_run_at``: it advances **only** after a successful cycle, so
  a crash or a failure leaves the job due.
* Due selection is *fair*: jobs are ordered by ``age / cadence`` (most overdue
  first), never-run jobs first. With ``TICK_MAX_JOBS=6`` every 5 minutes, a
  registry-order queue would let the two 5-minute jobs consume the entire budget
  and starve the daily ones; the overdue ratio cannot starve anything.
* Capacity is a measured invariant, not a guess: the registry demands
  ``sum(3600 / cadence)`` = 44.5 job slots/hour and one tick per
  ``TICK_PERIOD_SECONDS`` supplies ``tick_max_jobs`` slots, so 6/tick = 72/hour
  (1.62x). ``tests/test_internal_tick.py`` asserts that coverage, that no
  cadence is shorter than the tick period, and that ``tick_budget_seconds``
  stays inside ``LOCK_TTL_SECONDS``.
* One tick at a time: :mod:`app.routers.internal_tick` holds a process-local
  ``asyncio.Lock``; ``acquire_scheduler_job`` holds a per-job ``locked_until``
  across processes (and across restarts).
* The per-job budget is a *hard* deadline. Job bodies run on a dedicated
  executor thread, never on the tick's event loop, and the tick waits with
  :func:`asyncio.wait` instead of :func:`asyncio.wait_for`: ``wait_for`` cannot
  interrupt a body that is blocking the loop, and since Python 3.12 it also
  *awaits the cancelled task* before raising ``TimeoutError``, so a job whose
  cancellation unwind is slow (thread-bound cleanup, a hung client) overruns the
  budget by exactly that long. When the deadline passes the tick detaches the
  job, records ``budget_exceeded`` and releases the lease; a body that is
  already executing finishes on its worker thread, detached from the tick.
* A failure writes ``last_error`` + ``retry_after`` (default 120s) instead of
  hammering the upstream on every tick.
* Supabase unavailable (or the migration not applied) => log and skip the tick.
  Never raise into the request path: ``/health`` must stay trivial.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timezone
from functools import partial
from typing import Any, Callable, Optional

from app.config import get_settings
from app.services.retention import TOMTOM_REFRESH_S

logger = logging.getLogger(__name__)

SCHEDULER_TABLE = "scheduler_jobs"

# A job lock must outlive the per-tick budget (default 200s) plus the slowest
# single job, otherwise a slow cycle could be executed twice by the next tick.
LOCK_TTL_SECONDS = 240
DEFAULT_RETRY_BACKOFF_SECONDS = 120
MAX_ERROR_CHARS = 500

# How often the scheduler sidecar POSTs /internal/tick (docker-compose.yml:
# `sleep 300` after every 202). This is the hard floor on any cadence below:
# a 60 s cadence cannot be honoured by a 300 s tick, so declaring one only
# inflates the demand the capacity test is supposed to check.
TICK_PERIOD_SECONDS = 300

# Job bodies get their own executor, never the loop's default executor: the
# default one also carries the lease RPCs (`load_states` / `acquire` /
# `release`), and a job that pins a worker would otherwise starve the very
# calls the tick needs to fence itself. Four workers means one abandoned job
# cannot block the next job's slot either.
JOB_EXECUTOR_MAX_WORKERS = 4
_JOB_EXECUTOR = ThreadPoolExecutor(
    max_workers=JOB_EXECUTOR_MAX_WORKERS, thread_name_prefix="scheduler-job"
)

# A hung Supabase must not hold the tick past its budget while it records the
# outcome. Timing out here leaves the per-job lease to expire on its own TTL,
# which fails closed (the next tick sees `locked`) rather than open.
JOB_RELEASE_TIMEOUT_SECONDS = 10.0


class SchedulerStateUnavailable(RuntimeError):
    """Supabase (or the scheduler_jobs table) cannot be reached right now."""


@dataclass(frozen=True)
class JobSpec:
    """A batch job: a cadence plus the name of its single-cycle body on app.main."""

    name: str
    cadence_seconds: int
    cycle_attr: str


def _spec(name: str, cadence_seconds: int, cycle_attr: str) -> JobSpec:
    return JobSpec(name=name, cadence_seconds=cadence_seconds, cycle_attr=cycle_attr)


# Order is the deterministic tie-break for jobs that are equally overdue.
JOB_SPECS: dict[str, JobSpec] = {
    spec.name: spec
    for spec in (
        # fleet used to declare 60 s. Nothing can honour that: the only driver is
        # the 300 s tick, and the job's own cache TTL is 300 s (see
        # _run_fleet_cycle), so it already ran once per tick. Declaring 60 s only
        # made it permanently "overdue" (age/cadence >= 1 at every tick), which
        # outranked bmkg in due selection and inflated the demand the capacity
        # test checks. Cadence below the tick period is a lie, not a target.
        _spec("fleet", TICK_PERIOD_SECONDS, "_run_fleet_cycle"),
        _spec("news", 300, "_run_news_cycle"),
        _spec("bmkg", 300, "_run_bmkg_cycle"),
        # Cadence comes from retention.TOMTOM_REFRESH_S, the same constant that
        # drives the published validity window. It used to be a literal 3600
        # here while the TTL was 600, so the section was stale 50 minutes of
        # every hour; a call-stack-sensitive JobSpecsDict shim made the M8
        # contract test assert 1800 while production ran 3600. One constant now.
        _spec("tomtom", TOMTOM_REFRESH_S, "_run_tomtom_cycle"),
        _spec("open_meteo", 21600, "_run_open_meteo_cycle"),
        _spec("firms", 10800, "_run_firms_cycle"),
        _spec("pihps", 86400, "_run_pihps_cycle"),
        _spec("social", 3600, "_run_social_cycle"),
        _spec("bnpb", 3600, "_run_bnpb_cycle"),
        _spec("petabencana", 900, "_run_petabencana_cycle"),
    )
}


@dataclass
class TickPlan:
    """What a tick intends to do; returned in the HTTP response before work runs."""

    due: list[str] = field(default_factory=list)
    skipped: list[dict] = field(default_factory=list)
    reason: Optional[str] = None


# ---------------------------------------------------------------------------
# Time / state helpers
# ---------------------------------------------------------------------------

def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(value: Any) -> Optional[datetime]:
    """Parse a PostgREST timestamp into an aware UTC datetime (None if absent)."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = datetime.fromisoformat(text.replace(" ", "T").replace("Z", "+00:00"))
        except ValueError:
            logger.debug("scheduler: unparseable timestamp %r", value)
            return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _as_bool(data: Any) -> bool:
    """Normalise a scalar-returning RPC result (``true`` or ``[true]``)."""
    if isinstance(data, list):
        return bool(data and data[0])
    return bool(data)


def _is_missing_rpc(exc: Exception) -> bool:
    """True when PostgREST says the function does not exist (migration not applied)."""
    text = str(exc).lower()
    if "pgrst202" in text or "could not find the function" in text:
        return True
    return "scheduler_job" in text and ("does not exist" in text or "404" in text)


def _client():
    """Require the service-role client for durable scheduler state."""
    from app.db.supabase_client import get_service_client

    return get_service_client()


# ---------------------------------------------------------------------------
# Durable state (Supabase)
# ---------------------------------------------------------------------------

def load_states() -> dict[str, dict]:
    """Read every scheduler row. Raises SchedulerStateUnavailable when unreachable."""
    try:
        result = _client().table(SCHEDULER_TABLE).select("*").execute()
    except Exception as exc:  # network, 404 missing table, RLS, bad key
        raise SchedulerStateUnavailable(f"select {SCHEDULER_TABLE} failed: {exc}") from exc
    states: dict[str, dict] = {}
    for row in result.data or []:
        name = str(row.get("job_name") or "").strip()
        if name:
            states[name] = row
    return states


def acquire(job: str, ttl_seconds: int = LOCK_TTL_SECONDS):
    """Take a fenced per-job lease; no optimistic or process-local fallback."""
    from app.services.refresh_coordinator import (
        CoordinationUnavailable,
        RefreshLease,
        _rpc_sync,
    )

    owner_id = str(uuid.uuid4())
    try:
        result = _rpc_sync(
            "acquire_refresh_lease",
            {
                "p_lease_name": f"scheduler_job:{job}",
                "p_owner_id": owner_id,
                "p_ttl_seconds": max(1, int(ttl_seconds)),
            },
        )
    except CoordinationUnavailable as exc:
        raise SchedulerStateUnavailable(f"acquire {job} failed: {exc}") from exc
    if not isinstance(result, dict) or not result.get("acquired"):
        return None
    return RefreshLease(
        lease_name=str(result["lease_name"]),
        owner_id=str(result["owner_id"]),
        fence=int(result["fence"]),
        expires_at=str(result.get("expires_at") or "") or None,
    )


def release(
    lease,
    job: str,
    status: str,
    error: Optional[str] = None,
    retry_after_seconds: int = DEFAULT_RETRY_BACKOFF_SECONDS,
) -> bool:
    """Persist completion only while this exact job owner/fence still holds."""
    from app.services.refresh_coordinator import CoordinationUnavailable, _rpc_sync

    try:
        result = _rpc_sync(
            "complete_scheduled_job",
            {
                "p_job_name": str(job),
                "p_owner_id": lease.owner_id,
                "p_fence": lease.fence,
                "p_status": str(status),
                "p_error": (str(error)[:MAX_ERROR_CHARS] if error else None),
                "p_retry_after_seconds": max(1, int(retry_after_seconds)),
            },
        )
    except CoordinationUnavailable as exc:
        raise SchedulerStateUnavailable(f"complete {job} failed: {exc}") from exc
    return bool(result)


# ---------------------------------------------------------------------------
# Due selection
# ---------------------------------------------------------------------------

def select_due(
    states: dict[str, dict], now: Optional[datetime] = None
) -> tuple[list[str], list[dict]]:
    """Return ``(due, skipped)`` for every registered job.

    ``due`` is ordered most-overdue-first (``age / cadence``), so long-cadence
    jobs are not starved by the 5-minute ones. ``skipped`` carries a reason per
    job (``locked`` / ``retry_after`` / ``not_due``).
    """
    now = now or utcnow()
    due: list[tuple[float, int, str]] = []
    skipped: list[dict] = []

    for index, (name, spec) in enumerate(JOB_SPECS.items()):
        state = states.get(name) or {}
        locked_until = _parse_ts(state.get("locked_until"))
        retry_after = _parse_ts(state.get("retry_after"))
        last_finished = _parse_ts(state.get("last_finished_at"))

        if locked_until and locked_until > now:
            skipped.append({"job": name, "reason": "locked"})
            continue
        if retry_after and retry_after > now:
            skipped.append({"job": name, "reason": "retry_after"})
            continue
        if last_finished is None:
            due.append((float("inf"), index, name))
            continue
        age = (now - last_finished).total_seconds()
        if age >= spec.cadence_seconds:
            due.append((age / spec.cadence_seconds, index, name))
        else:
            skipped.append({"job": name, "reason": "not_due"})

    due.sort(key=lambda item: (-item[0], item[1]))
    return [name for _, _, name in due], skipped


async def plan_tick(now: Optional[datetime] = None) -> TickPlan:
    """Read state and decide what this tick would run. Never raises."""
    try:
        states = await asyncio.to_thread(load_states)
    except SchedulerStateUnavailable as exc:
        logger.warning("scheduler: state unavailable (%s); deferring every job", exc)
        return TickPlan(
            due=[],
            skipped=[{"job": name, "reason": "state_unavailable"} for name in JOB_SPECS],
            reason="state_unavailable",
        )
    except Exception as exc:  # defensive: a bad monkeypatch / unexpected driver error
        logger.warning("scheduler: planning failed (%s); deferring every job", exc)
        return TickPlan(
            due=[],
            skipped=[{"job": name, "reason": "state_unavailable"} for name in JOB_SPECS],
            reason="state_unavailable",
        )
    due, skipped = select_due(states, now)
    return TickPlan(due=due, skipped=skipped)


# ---------------------------------------------------------------------------
# Execution
# ---------------------------------------------------------------------------

async def _run_fleet_cycle() -> dict:
    """Refresh live Sumatra aircraft and vessels into durable operational source cache."""
    import json
    from app.services.telemetry_service import TelemetryService
    from app.adapters.aisstream_adapter import get_live_ais_vessels
    from app.services.public_operational_cache import _write_durable
    from app.services.redis_client import cache_set

    ts = TelemetryService()
    try:
        aircraft = await ts.fetch_live_sumatra_aircraft()
    except Exception as exc:
        logger.warning("fleet cycle: aircraft fetch failed: %s", exc)
        aircraft = []

    try:
        vessels = await asyncio.to_thread(get_live_ais_vessels)
    except Exception as exc:
        logger.warning("fleet cycle: vessels fetch failed: %s", exc)
        vessels = []

    payload = {
        "aircraft": aircraft,
        "vessels": vessels,
        "count_aircraft": len(aircraft) if isinstance(aircraft, list) else 0,
        "count_vessels": len(vessels) if isinstance(vessels, list) else 0,
        "updated_at": time.time(),
    }
    _write_durable("lrip:state:fleet_telemetry:v1", payload, "fleet_live")
    try:
        cache_set("lrip:state:fleet_telemetry:v1", json.dumps(payload, default=str), ex=300)
    except Exception as exc:
        logger.debug("fleet cycle: Redis cache write failed: %s", exc)

    return payload


def get_job_callable(name: str) -> Callable[[], Any]:
    """Resolve a job's cycle body from ``app.main`` at call time.

    Deliberately lazy: importing the registry must not import adapters, numpy,
    scipy or langgraph. Tests monkeypatch this function (or the ``app.main``
    attribute) to keep the tick hermetic.
    """
    try:
        spec = JOB_SPECS[name]
    except KeyError as exc:
        raise RuntimeError(f"unknown scheduler job {name!r}") from exc
    from app import main as app_main

    cycle = getattr(app_main, spec.cycle_attr, None)
    if cycle is None:
        if name == "fleet" or spec.cycle_attr == "_run_fleet_cycle":
            return _run_fleet_cycle
        raise RuntimeError(f"job {name!r} has no {spec.cycle_attr!r} on app.main")
    return cycle


async def _await_value(awaitable: Any) -> Any:
    """Drive an already-created awaitable (a sync body that returned one)."""
    return await awaitable


def _run_job_body(fn: Callable[[], Any]) -> Any:
    """Run one job body to completion on a worker thread.

    Coroutine bodies are driven by ``asyncio.run`` on that thread's own loop: no
    job code may execute on the tick's loop, because a body that blocks it
    (sync HTTP, a CPU-bound parse, a sync Redis call) also freezes the timer that
    enforces the budget. A sync body that returns an awaitable is driven the
    same way, preserving the old ``_invoke`` semantics.
    """
    if inspect.iscoroutinefunction(fn):
        return asyncio.run(fn())
    result = fn()
    if inspect.isawaitable(result):
        return asyncio.run(_await_value(result))
    return result


def _log_abandoned(name: str, run_id: str, future: "asyncio.Future") -> None:
    """Report the eventual outcome of a job the tick walked away from.

    Kept deliberately defensive: cancelling the wrapper future marks it done
    immediately, so this normally short-circuits on the first line. It only
    reports when the underlying call completed before the cancel landed.
    """
    if future.cancelled():
        return
    try:
        exc = future.exception()
    except BaseException:  # pragma: no cover - defensive
        return
    if exc is not None:
        logger.warning(
            "scheduler[%s]: abandoned %s finished late with %s: %s",
            run_id,
            name,
            type(exc).__name__,
            exc,
        )
    else:
        logger.info(
            "scheduler[%s]: abandoned %s finished late; result discarded",
            run_id,
            name,
        )


async def _acquire_job(name: str):
    """Return ``(lease, skip_reason)``; coordination failures fail closed."""
    try:
        lease = await asyncio.to_thread(acquire, name, LOCK_TTL_SECONDS)
    except SchedulerStateUnavailable as exc:
        logger.warning("scheduler: cannot lock %s (%s); skipping this tick", name, exc)
        return None, "state_unavailable"
    return (lease, None) if lease is not None else (None, "locked")


async def _execute_job(name: str, timeout: float, run_id: str, lease) -> dict:
    started = time.monotonic()
    deadline = max(1.0, timeout)
    status = "ok"
    error: Optional[str] = None

    try:
        body = get_job_callable(name)
    except Exception as exc:
        status = "error"
        error = f"{type(exc).__name__}: {exc}"
    else:
        future = asyncio.get_running_loop().run_in_executor(
            _JOB_EXECUTOR, _run_job_body, body
        )
        try:
            done, _pending = await asyncio.wait({future}, timeout=deadline)
        except asyncio.CancelledError:
            future.cancel()
            raise

        if future in done:
            failure = None if future.cancelled() else future.exception()
            if failure is not None:
                status = "error"
                error = f"{type(failure).__name__}: {failure}"
        else:
            # Hard deadline. `future.cancel()` marks the wrapper done at once and
            # stops a body that has not started yet from running late (which
            # would double-run a job already recorded as failed). A body that is
            # already executing cannot be interrupted: its thread finishes
            # detached, and the `budget_exceeded` warning below is the record.
            future.cancel()
            future.add_done_callback(partial(_log_abandoned, name, run_id))
            status = "error"
            error = f"budget_exceeded: job did not finish within {deadline:.0f}s"

    duration_ms = int((time.monotonic() - started) * 1000)
    if status == "ok":
        logger.info("scheduler[%s]: %s ok in %dms", run_id, name, duration_ms)
    else:
        logger.warning("scheduler[%s]: %s failed in %dms — %s", run_id, name, duration_ms, error)

    try:
        completed = await asyncio.wait_for(
            asyncio.to_thread(
                release, lease, name, status, error, DEFAULT_RETRY_BACKOFF_SECONDS
            ),
            timeout=JOB_RELEASE_TIMEOUT_SECONDS,
        )
        if not completed:
            logger.warning("scheduler: fenced completion rejected for %s", name)
    except asyncio.TimeoutError:
        logger.warning(
            "scheduler: recording %s outcome exceeded %.0fs; lease expires on its TTL",
            name,
            JOB_RELEASE_TIMEOUT_SECONDS,
        )
    except SchedulerStateUnavailable as exc:
        logger.warning("scheduler: could not record %s outcome (%s)", name, exc)

    return {"job": name, "status": status, "duration_ms": duration_ms, "error": error}


async def run_tick(
    plan: Optional[TickPlan] = None,
    run_id: Optional[str] = None,
    now: Optional[datetime] = None,
) -> dict:
    """Execute at most ``TICK_MAX_JOBS`` due jobs inside ``TICK_BUDGET_SECONDS``."""
    settings = get_settings()
    try:
        max_jobs = max(1, int(getattr(settings, "tick_max_jobs", 2) or 2))
    except (TypeError, ValueError):
        max_jobs = 2
    try:
        budget = max(1.0, float(getattr(settings, "tick_budget_seconds", 120) or 120))
    except (TypeError, ValueError):
        budget = 120.0

    run_id = run_id or uuid.uuid4().hex
    if plan is None:
        plan = await plan_tick(now=now)

    started = time.monotonic()
    executed: list[dict] = []
    deferred: list[str] = []
    skipped = list(plan.skipped)

    for index, name in enumerate(plan.due):
        if len(executed) >= max_jobs:
            deferred = plan.due[index:]
            logger.info(
                "scheduler[%s]: job cap %d reached; deferring %s",
                run_id,
                max_jobs,
                deferred,
            )
            break
        # Stop starting new jobs the moment the budget is spent. This is the
        # second half of the invariant: `_execute_job` cannot overrun its own
        # deadline, and nothing new is admitted once the tick's clock is out.
        remaining = budget - (time.monotonic() - started)
        if remaining <= 1.0:
            deferred = plan.due[index:]
            logger.info(
                "scheduler[%s]: %.0fs budget exhausted; deferring %s",
                run_id,
                budget,
                deferred,
            )
            break

        lease, skip_reason = await _acquire_job(name)
        if skip_reason:
            skipped.append({"job": name, "reason": skip_reason})
            continue

        executed.append(await _execute_job(name, remaining, run_id, lease))

    return {
        "run_id": run_id,
        "due": list(plan.due),
        "skipped": skipped,
        "executed": executed,
        "deferred": deferred,
        "duration_ms": int((time.monotonic() - started) * 1000),
        "reason": plan.reason,
    }


def new_run_id() -> str:
    return uuid.uuid4().hex
