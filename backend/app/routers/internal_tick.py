"""Protected external tick (Phase 162 / M8).

`POST /internal/tick` is the production driver for batch ingestion. cron-job.org
calls it every 5 minutes (see `docs/KEEPALIVE_RUNBOOK.md`); the endpoint returns
`202` immediately and the ingestion work runs in a background task, so a slow
source can never hold the HTTP response open.

Contract
--------
* Auth: `X-Internal-Token`, constant-time compared (``secrets.compare_digest``)
  against ``INTERNAL_TICK_TOKEN``. An empty setting disables the endpoint with
  ``404`` — an empty supplied token never matches.
* Overlap: a process-local ``asyncio.Lock``. A second concurrent call gets
  ``202 {"accepted": false, "reason": "already_running"}`` and no work.
* Cross-process / cross-restart overlap is handled in ``job_scheduler`` by the
  per-job ``locked_until`` in Supabase.
* `GET /health` never touches this module; a tick cannot starve liveness checks
  because all job bodies run in a background task and Supabase/Redis work is
  pushed to a thread.
* After the batch jobs (and on a tick with nothing due) the background task
  refreshes the dashboard read model (`dashboard_snapshots`, Phase 163a). That
  build is bounded, logged as `snapshot_built`/`snapshot_failed`, and can never
  fail the tick or delay the 202.
"""

from __future__ import annotations

import asyncio
import logging
import secrets
import time
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.services import job_scheduler

logger = logging.getLogger(__name__)

router = APIRouter(tags=["internal"])

# Planning is one indexed single-table read. It bounds how long the (cron) caller
# waits before the 202; a hung Supabase must not hold the request open.
_TICK_PLAN_TIMEOUT_SECONDS = 10.0

# Phase 163a: after the batch jobs, the tick refreshes the dashboard read model
# (dashboard_snapshots). The build already caps every section at 5 s and runs
# them in parallel; this is the outer bound so a hung upstream can never hold the
# tick lock open indefinitely. It runs inside the background task, never before
# the 202 response.
SNAPSHOT_BUILD_TIMEOUT_SECONDS = 30.0

_tick_lock = asyncio.Lock()
_tick_tasks: set[asyncio.Task] = set()

_DISABLED_RESPONSE = {"detail": "Not Found"}


def _expected_token() -> str:
    return str(getattr(get_settings(), "internal_tick_token", "") or "")


def reset_tick_state() -> None:
    """Drop pending tick tasks and replace the lock (used by tests)."""
    for task in list(_tick_tasks):
        task.cancel()
    _tick_tasks.clear()
    global _tick_lock
    _tick_lock = asyncio.Lock()


async def wait_for_pending_ticks() -> None:
    """Await every scheduled tick task (used by tests and shutdown checks)."""
    pending = [task for task in list(_tick_tasks) if not task.done()]
    if pending:
        await asyncio.gather(*pending, return_exceptions=True)


def _state_unavailable_skips() -> list[dict]:
    return [
        {"job": name, "reason": "state_unavailable"} for name in job_scheduler.JOB_SPECS
    ]


async def _refresh_dashboard_snapshot(run_id: str) -> None:
    """Build + store the dashboard snapshot after the jobs. Never raises.

    This is the *only* writer of ``dashboard_snapshots`` (Phase 163a). It runs
    on every tick - including a tick with no batch job due - so the read model
    stays inside the 600 s staleness window even when nothing else is scheduled.
    """
    from app.services import dashboard_snapshot_service

    started = time.monotonic()
    try:
        status = await asyncio.wait_for(
            dashboard_snapshot_service.build_and_store_global_snapshot(),
            timeout=SNAPSHOT_BUILD_TIMEOUT_SECONDS,
        )
    except asyncio.CancelledError:
        raise
    except asyncio.TimeoutError:
        logger.warning(
            "snapshot_failed run_id=%s: build exceeded %.0fs",
            run_id,
            SNAPSHOT_BUILD_TIMEOUT_SECONDS,
        )
        return
    except Exception as exc:  # the tick must never fail because of the snapshot
        logger.warning("snapshot_failed run_id=%s: %s", run_id, exc)
        return

    status = status if isinstance(status, dict) else {}
    if status.get("status") == "ok":
        logger.info(
            "snapshot_built run_id=%s sections=%s computed_at=%s in %dms",
            run_id,
            status.get("sections"),
            status.get("computed_at"),
            int((time.monotonic() - started) * 1000),
        )
    else:
        logger.warning(
            "snapshot_failed run_id=%s: %s",
            run_id,
            status.get("error") or "unknown error",
        )


async def _run_tick(plan: job_scheduler.TickPlan, run_id: str) -> None:
    try:
        try:
            await job_scheduler.run_tick(plan=plan, run_id=run_id)
        except asyncio.CancelledError:
            logger.info("internal tick %s cancelled", run_id)
            raise
        except Exception as exc:  # a background tick must never surface as an error
            logger.warning("internal tick %s failed: %s", run_id, exc)

        # Phase 163a: refresh the dashboard read model in the same background
        # task, after the jobs (and even when no job was due). The 202 has
        # already been returned; a failed snapshot never fails the tick.
        await _refresh_dashboard_snapshot(run_id)
    finally:
        if _tick_lock.locked():
            _tick_lock.release()


@router.post("/internal/tick", status_code=202)
@router.post("/api/v1/internal/tick", status_code=202, include_in_schema=False)
async def internal_tick(
    x_internal_token: Optional[str] = Header(default=None, alias="X-Internal-Token"),
):
    """Accept a tick, report the plan, run the work in the background."""
    expected = _expected_token()
    if not expected:
        # Disabled: behave as if the route does not exist, and never let an
        # empty supplied value compare equal to an empty setting.
        raise HTTPException(status_code=404, detail=_DISABLED_RESPONSE["detail"])

    supplied = x_internal_token or ""
    if not supplied or not secrets.compare_digest(supplied, expected):
        raise HTTPException(
            status_code=401,
            detail="Invalid internal token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if _tick_lock.locked():
        return JSONResponse(
            status_code=202,
            content={
                "accepted": False,
                "reason": "already_running",
                "due": [],
                "skipped": [],
                "run_id": job_scheduler.new_run_id(),
            },
        )

    # No await between the check and the acquire, so this is atomic on the loop.
    await _tick_lock.acquire()
    run_id = job_scheduler.new_run_id()

    try:
        plan = await asyncio.wait_for(
            job_scheduler.plan_tick(), timeout=_TICK_PLAN_TIMEOUT_SECONDS
        )
    except asyncio.CancelledError:
        _tick_lock.release()
        raise
    except Exception as exc:
        _tick_lock.release()
        logger.warning("internal tick %s could not plan (%s); nothing scheduled", run_id, exc)
        return {
            "accepted": True,
            "reason": "plan_failed",
            "due": [],
            "skipped": _state_unavailable_skips(),
            "run_id": run_id,
        }

    task = asyncio.create_task(_run_tick(plan, run_id), name=f"prehub:internal-tick:{run_id}")
    _tick_tasks.add(task)
    task.add_done_callback(_tick_tasks.discard)

    return {
        "accepted": True,
        "due": plan.due,
        "skipped": plan.skipped,
        "run_id": run_id,
        "reason": plan.reason,
    }
