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
  first), never-run jobs first. With ``TICK_MAX_JOBS=2`` every 5 minutes, a
  registry-order queue would let the two 5-minute jobs consume the entire budget
  and starve the daily ones; the overdue ratio cannot starve anything.
* One tick at a time: :mod:`app.routers.internal_tick` holds a process-local
  ``asyncio.Lock``; ``acquire_scheduler_job`` holds a per-job ``locked_until``
  across processes (and across restarts).
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
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from app.config import get_settings

logger = logging.getLogger(__name__)

SCHEDULER_TABLE = "scheduler_jobs"

# A job lock must outlive the per-tick budget (default 120s) plus the slowest
# single job, otherwise a slow cycle could be executed twice by the next tick.
LOCK_TTL_SECONDS = 600
DEFAULT_RETRY_BACKOFF_SECONDS = 120
MAX_ERROR_CHARS = 500


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
        _spec("news", 300, "_run_news_cycle"),
        _spec("bmkg", 300, "_run_bmkg_cycle"),
        _spec("tomtom", 1800, "_run_tomtom_cycle"),
        _spec("open_meteo", 21600, "_run_open_meteo_cycle"),
        _spec("firms", 10800, "_run_firms_cycle"),
        _spec("pihps", 86400, "_run_pihps_cycle"),
        _spec("social", 3600, "_run_social_cycle"),
        _spec("bnpb", 3600, "_run_bnpb_cycle"),
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
    """Service-role-first Supabase client (never expose it to the frontend)."""
    from app.db.supabase_client import get_write_client

    return get_write_client()


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


def _acquire_optimistic(client, job: str, ttl_seconds: int) -> bool:
    """Compare-and-set fallback used when the acquire RPC is missing.

    Limitation: one extra round-trip (read, then conditional update). The update
    is still atomic — it only matches when ``locked_until`` is unchanged (or
    still null), so two concurrent processes cannot both win.
    """
    now = utcnow()
    expires = (now + timedelta(seconds=max(1, int(ttl_seconds)))).isoformat()
    table = client.table(SCHEDULER_TABLE)
    try:
        rows = table.select("job_name,locked_until").eq("job_name", job).limit(1).execute().data or []
    except Exception as exc:
        raise SchedulerStateUnavailable(f"read {SCHEDULER_TABLE}/{job} failed: {exc}") from exc

    if not rows:
        try:
            table.insert(
                {"job_name": job, "locked_until": expires, "last_started_at": now.isoformat()}
            ).execute()
            return True
        except Exception:
            # Another process inserted the row first; fall through to the CAS.
            try:
                rows = table.select("job_name,locked_until").eq("job_name", job).limit(1).execute().data or []
            except Exception as exc:
                raise SchedulerStateUnavailable(f"read {SCHEDULER_TABLE}/{job} failed: {exc}") from exc

    current = rows[0].get("locked_until") if rows else None
    query = table.update(
        {"locked_until": expires, "last_started_at": now.isoformat()}
    ).eq("job_name", job)
    query = query.is_("locked_until", "null") if not current else query.eq("locked_until", current)
    try:
        return bool(query.execute().data)
    except Exception as exc:
        raise SchedulerStateUnavailable(f"lock {SCHEDULER_TABLE}/{job} failed: {exc}") from exc


def acquire(job: str, ttl_seconds: int = LOCK_TTL_SECONDS) -> bool:
    """Try to take the cross-process lock for ``job``. True when this caller won."""
    client = _client()
    try:
        result = client.rpc(
            "acquire_scheduler_job",
            {"p_job": job, "p_ttl_seconds": int(ttl_seconds)},
        ).execute()
        return _as_bool(result.data)
    except Exception as exc:
        if not _is_missing_rpc(exc):
            raise SchedulerStateUnavailable(f"acquire {job} failed: {exc}") from exc
    logger.warning(
        "scheduler: acquire_scheduler_job() missing (migration 023 not applied?); "
        "falling back to an optimistic locked_until update"
    )
    return _acquire_optimistic(client, job, ttl_seconds)


def release(
    job: str,
    status: str,
    error: Optional[str] = None,
    retry_after_seconds: int = DEFAULT_RETRY_BACKOFF_SECONDS,
) -> None:
    """Release the lock and persist the outcome.

    ``last_finished_at`` moves only for ``status == "ok"``; a failure keeps the
    job due and sets ``retry_after`` so the next tick can retry without hammering.
    """
    error = (error or "")[:MAX_ERROR_CHARS] or None
    client = _client()
    try:
        client.rpc(
            "release_scheduler_job",
            {
                "p_job": job,
                "p_status": status,
                "p_error": error,
                "p_retry_after_seconds": int(retry_after_seconds),
            },
        ).execute()
        return
    except Exception as exc:
        if not _is_missing_rpc(exc):
            raise SchedulerStateUnavailable(f"release {job} failed: {exc}") from exc
    logger.warning(
        "scheduler: release_scheduler_job() missing (migration 023 not applied?); "
        "falling back to a direct locked_until update"
    )

    now = utcnow()
    payload: dict[str, Any] = {
        "locked_until": None,
        "last_status": status,
        "last_error": error,
    }
    if status == "ok":
        payload["last_finished_at"] = now.isoformat()
        payload["retry_after"] = None
    else:
        payload["retry_after"] = (
            now + timedelta(seconds=max(1, int(retry_after_seconds)))
        ).isoformat()
    try:
        client.table(SCHEDULER_TABLE).update(payload).eq("job_name", job).execute()
    except Exception as exc:
        raise SchedulerStateUnavailable(f"release {job} failed: {exc}") from exc


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
        raise RuntimeError(f"job {name!r} has no {spec.cycle_attr!r} on app.main")
    return cycle


async def _invoke(fn: Callable[[], Any]) -> Any:
    """Run sync bodies off the event loop; await async bodies in place."""
    if inspect.iscoroutinefunction(fn):
        return await fn()
    result = await asyncio.to_thread(fn)
    if inspect.isawaitable(result):
        return await result
    return result


async def _acquire_job(name: str) -> Optional[str]:
    """Return None when the lease was won, else the skip reason for this job."""
    try:
        won = await asyncio.to_thread(acquire, name, LOCK_TTL_SECONDS)
    except SchedulerStateUnavailable as exc:
        logger.warning("scheduler: cannot lock %s (%s); skipping this tick", name, exc)
        return "state_unavailable"
    return None if won else "locked"


async def _execute_job(name: str, timeout: float, run_id: str) -> dict:
    started = time.monotonic()
    status = "ok"
    error: Optional[str] = None
    try:
        await asyncio.wait_for(_invoke(get_job_callable(name)), timeout=max(1.0, timeout))
    except asyncio.TimeoutError:
        status = "error"
        error = f"budget_exceeded: job did not finish within {timeout:.0f}s"
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        status = "error"
        error = f"{type(exc).__name__}: {exc}"

    duration_ms = int((time.monotonic() - started) * 1000)
    if status == "ok":
        logger.info("scheduler[%s]: %s ok in %dms", run_id, name, duration_ms)
    else:
        logger.warning("scheduler[%s]: %s failed in %dms — %s", run_id, name, duration_ms, error)

    try:
        await asyncio.to_thread(release, name, status, error, DEFAULT_RETRY_BACKOFF_SECONDS)
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

        skip_reason = await _acquire_job(name)
        if skip_reason:
            skipped.append({"job": name, "reason": skip_reason})
            continue

        executed.append(await _execute_job(name, remaining, run_id))

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
