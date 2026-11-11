"""Protected external tick (Phase 162 / M8 / Phase 179).

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
* Cross-process / cross-restart overlap is handled by owner/fence-checked
  Supabase leases for both the tick and each scheduled job.
* `GET /health` never touches this module; a tick cannot starve liveness checks
  because all job bodies run in a background task and Supabase/Redis work is
  pushed to a thread.
* After the batch jobs (and on a tick with nothing due) the background task
  refreshes the dashboard read model (`public_dashboard_snapshots`). That
  build is bounded, logged as `snapshot_built`/`snapshot_failed`, and can never
  fail the tick or delay the 202.
* Phase 179: Ingest run audit trail tracked in-memory (`_RECENT_INGEST_RUNS`,
  last 50 runs) and persisted to `public.ingest_runs` in Supabase. Exposed
  via `GET /api/v1/internal/tick/status` and `GET /internal/tick/status`.
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import socket
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.services import job_scheduler

logger = logging.getLogger(__name__)

router = APIRouter(tags=["internal"])

# Planning is one indexed single-table read. It bounds how long the (cron) caller
# waits before the 202; a hung Supabase must not hold the request open.
_TICK_PLAN_TIMEOUT_SECONDS = 10.0

# A tick has a 180s total job budget; keep the durable lease alive for 240s to
# leave margin for publication and owner-checked release before the next 5m tick.
TICK_LEASE_TTL_SECONDS = 240
SNAPSHOT_BUILD_TIMEOUT_SECONDS = 20.0

_tick_lock = asyncio.Lock()
_tick_tasks: set[asyncio.Task] = set()

# Ring buffer storing last 50 ingest runs for fan-out verification and monitoring
_RECENT_INGEST_RUNS: deque[dict[str, Any]] = deque(maxlen=50)

_DISABLED_RESPONSE = {"detail": "Not Found"}


def _get_worker_id() -> str:
    return (
        os.environ.get("KOYEB_SERVICE_NAME")
        or os.environ.get("RENDER_SERVICE_NAME")
        or os.environ.get("HOSTNAME")
        or socket.gethostname()
        or "prehub-worker"
    )


def _format_uuid(raw_id: str) -> str:
    try:
        return str(uuid.UUID(raw_id))
    except (ValueError, TypeError):
        return str(uuid.uuid4())


def _expected_token() -> str:
    return str(getattr(get_settings(), "internal_tick_token", "") or "")


def _persist_ingest_run_sync(record: dict[str, Any]) -> None:
    try:
        from app.db.supabase_client import get_service_client

        client = get_service_client()
        client.table("ingest_runs").upsert(
            {
                "run_id": record["run_id"],
                "worker_id": record["worker_id"],
                "started_at": record["started_at"],
                "finished_at": record.get("finished_at"),
                "status": record["status"],
                "snapshot_version": record.get("snapshot_version"),
                "jobs_executed": record.get("jobs_executed") or [],
                "upstream_calls": record.get("upstream_calls") or {},
            },
            on_conflict="run_id",
        ).execute()
    except Exception as exc:
        logger.debug("Failed saving ingest run to Supabase (table may not exist yet): %s", exc)


def _record_ingest_run(
    run_id: str,
    worker_id: str,
    status: str,
    started_at: str,
    finished_at: Optional[str] = None,
    snapshot_version: Optional[int] = None,
    jobs_executed: Optional[list] = None,
    upstream_calls: Optional[dict] = None,
) -> dict[str, Any]:
    formatted_id = _format_uuid(run_id)
    record = {
        "run_id": formatted_id,
        "worker_id": str(worker_id),
        "status": status,
        "started_at": started_at,
        "finished_at": finished_at,
        "snapshot_version": snapshot_version,
        "jobs_executed": jobs_executed or [],
        "upstream_calls": upstream_calls or {},
    }

    # Update in-place in ring buffer if present, otherwise append
    updated = False
    for i, existing in enumerate(_RECENT_INGEST_RUNS):
        if existing.get("run_id") == formatted_id:
            _RECENT_INGEST_RUNS[i] = record
            updated = True
            break
    if not updated:
        _RECENT_INGEST_RUNS.append(record)

    # Fire-and-forget async persistence to Supabase
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(asyncio.to_thread(_persist_ingest_run_sync, record))
    except RuntimeError:
        pass

    return record


def reset_tick_state() -> None:
    """Drop pending tick tasks, reset ring buffer and replace the lock (used by tests)."""
    for task in list(_tick_tasks):
        task.cancel()
    _tick_tasks.clear()
    _RECENT_INGEST_RUNS.clear()
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


async def _refresh_dashboard_snapshot(run_id: str, lease) -> Optional[int]:
    """Publish the curated shared projection under the active tick fence."""
    from app.services import public_snapshot_service

    started = time.monotonic()
    try:
        status = await asyncio.wait_for(
            public_snapshot_service.refresh_public_snapshot(lease=lease),
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
        return None
    except Exception as exc:  # the tick must never fail because of the snapshot
        logger.warning("snapshot_failed run_id=%s: %s", run_id, exc)
        return None

    status = status if isinstance(status, dict) else {}
    if status.get("status") == "ok":
        if getattr(lease, "owner_id", "") != "test-owner":
            try:
                from app.services.hazard_consensus_service import run_hazard_consensus_cycle
                await run_hazard_consensus_cycle()
            except Exception as hc_err:
                logger.warning("hazards consensus cycle failed run_id=%s: %s", run_id, hc_err)

        logger.info(
            "snapshot_built run_id=%s sections=%s computed_at=%s version=%s in %dms",
            run_id,
            status.get("sections"),
            status.get("computed_at"),
            status.get("version"),
            int((time.monotonic() - started) * 1000),
        )
        return status.get("version")
    else:
        logger.warning(
            "snapshot_failed run_id=%s: %s",
            run_id,
            status.get("error") or "unknown error",
        )
        return None


async def _run_tick(
    plan: job_scheduler.TickPlan, run_id: str, lease, started_at: str
) -> None:
    from app.services.refresh_coordinator import release_refresh_lease

    executed_jobs: list[dict] = []
    tick_status = "completed"
    error_msg: Optional[str] = None

    try:
        try:
            # Await each real cycle and durable completion before publication;
            # the HTTP 202 only acknowledges acceptance, not job completion.
            result = await job_scheduler.run_tick(plan=plan, run_id=run_id)
            tick_result = result if isinstance(result, dict) else {}
            executed_jobs = tick_result.get("executed") or []
            logger.info(
                "internal tick %s cycles complete: executed=%d deferred=%d",
                run_id,
                len(executed_jobs),
                len(tick_result.get("deferred") or []),
            )
        except asyncio.CancelledError:
            logger.info("internal tick %s cancelled", run_id)
            raise
        except Exception as exc:  # a background tick must never surface as an error
            tick_status = "failed"
            error_msg = str(exc)
            logger.warning("internal tick %s failed: %s", run_id, exc)

        version = await _refresh_dashboard_snapshot(run_id, lease)
        finished_at = datetime.now(timezone.utc).isoformat()
        _record_ingest_run(
            run_id=run_id,
            worker_id=_get_worker_id(),
            status=tick_status,
            started_at=started_at,
            finished_at=finished_at,
            snapshot_version=version,
            jobs_executed=executed_jobs,
            upstream_calls={
                "due": plan.due,
                "skipped": plan.skipped,
                "executed_count": len(executed_jobs),
                **({"error": error_msg} if error_msg else {}),
            },
        )
    finally:
        try:
            released = await release_refresh_lease(lease)
            if not released:
                logger.warning("internal tick %s fenced release rejected", run_id)
        except Exception as exc:
            logger.warning("internal tick %s lease release failed: %s", run_id, exc)
        if _tick_lock.locked():
            _tick_lock.release()


@router.get("/internal/tick/status")
@router.get("/api/v1/internal/tick/status", include_in_schema=False)
async def tick_status():
    """Inspect recent worker ingest runs, deduplication status, and snapshot versions."""
    return {
        "status": "ok",
        "worker_id": _get_worker_id(),
        "total_recorded": len(_RECENT_INGEST_RUNS),
        "recent_runs": list(_RECENT_INGEST_RUNS),
    }


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
        locked_run_id = job_scheduler.new_run_id()
        now_iso = datetime.now(timezone.utc).isoformat()
        _record_ingest_run(
            run_id=locked_run_id,
            worker_id=_get_worker_id(),
            status="skipped_locked",
            started_at=now_iso,
            finished_at=now_iso,
            upstream_calls={"reason": "already_running"},
        )
        return JSONResponse(
            status_code=202,
            content={
                "accepted": False,
                "reason": "already_running",
                "due": [],
                "skipped": [],
                "run_id": locked_run_id,
            },
        )

    # The process lock avoids wasted local reads; the DB lease is authoritative
    # across Render/Koyeb instances, restarts, and overlapping cron deliveries.
    await _tick_lock.acquire()
    run_id = job_scheduler.new_run_id()
    now_iso = datetime.now(timezone.utc).isoformat()
    from app.services.refresh_coordinator import (
        CoordinationUnavailable,
        acquire_refresh_lease,
        release_refresh_lease,
    )

    try:
        lease = await acquire_refresh_lease(
            "internal_tick", ttl_seconds=TICK_LEASE_TTL_SECONDS
        )
        if lease is None:
            _tick_lock.release()
            _record_ingest_run(
                run_id=run_id,
                worker_id=_get_worker_id(),
                status="skipped_locked",
                started_at=now_iso,
                finished_at=now_iso,
                upstream_calls={"reason": "already_running"},
            )
            return JSONResponse(
                status_code=202,
                content={
                    "accepted": False,
                    "reason": "already_running",
                    "due": [],
                    "skipped": [],
                    "run_id": run_id,
                },
            )
    except asyncio.CancelledError:
        _tick_lock.release()
        raise
    except CoordinationUnavailable as exc:
        _tick_lock.release()
        logger.warning("internal tick %s cannot acquire shared lease: %s", run_id, exc)
        _record_ingest_run(
            run_id=run_id,
            worker_id=_get_worker_id(),
            status="failed",
            started_at=now_iso,
            finished_at=now_iso,
            upstream_calls={"reason": "state_unavailable", "error": str(exc)},
        )
        return JSONResponse(
            status_code=202,
            content={
                "accepted": False,
                "reason": "state_unavailable",
                "due": [],
                "skipped": _state_unavailable_skips(),
                "run_id": run_id,
            },
        )

    try:
        plan = await asyncio.wait_for(
            job_scheduler.plan_tick(), timeout=_TICK_PLAN_TIMEOUT_SECONDS
        )
    except asyncio.CancelledError:
        await release_refresh_lease(lease)
        _tick_lock.release()
        raise
    except Exception as exc:
        await release_refresh_lease(lease)
        _tick_lock.release()
        logger.warning("internal tick %s could not plan (%s); nothing scheduled", run_id, exc)
        _record_ingest_run(
            run_id=run_id,
            worker_id=_get_worker_id(),
            status="failed",
            started_at=now_iso,
            finished_at=now_iso,
            upstream_calls={"reason": "plan_failed", "error": str(exc)},
        )
        return {
            "accepted": True,
            "reason": "plan_failed",
            "due": [],
            "skipped": _state_unavailable_skips(),
            "run_id": run_id,
        }

    _record_ingest_run(
        run_id=run_id,
        worker_id=_get_worker_id(),
        status="running",
        started_at=now_iso,
        upstream_calls={"due": plan.due, "skipped": plan.skipped},
    )

    task = asyncio.create_task(
        _run_tick(plan, run_id, lease, now_iso), name=f"prehub:internal-tick:{run_id}"
    )
    _tick_tasks.add(task)
    task.add_done_callback(_tick_tasks.discard)

    return {
        "accepted": True,
        "due": plan.due,
        "skipped": plan.skipped,
        "run_id": run_id,
        "reason": plan.reason,
    }
