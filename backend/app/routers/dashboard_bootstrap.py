"""Dashboard bootstrap read path (Phase 163a / M8).

One auth-aware request replaces the ~25-30 endpoint first-paint fan-out:

* public sections come from the DB-backed read model
  (``dashboard_snapshots``, written by the external tick);
* a stored row is served immediately (stale-first): fresh (<= 600 s) with
  ``stale=false``; stale (> 600 s) with ``stale=true`` + ``snapshot_stale``
  while a detached background refresh rebuilds (single-flight, never blocks);
* no stored row triggers a bounded single-flight live build (8 s cap);
* ``DISPATCHER`` / ``REGULATOR`` additionally get tenant-scoped ``fleet`` and
  ``erp`` sections, built live from the existing service/router caches.

Contract
--------
* Auth: ``get_optional_user`` (phase 161 fail-closed) - no header => guest,
  supplied-but-invalid token => 401 + ``WWW-Authenticate: Bearer``.
  ``sections=public`` is auth-blind: it ignores ``Authorization`` entirely.
* ``sections=all|public|tenant`` (default ``all``). Invalid -> 400 +
  ``Cache-Control: private, no-store``.
* ``sections=public`` returns role GUEST, no company_id/fleet/erp,
  ``Cache-Control: public, s-maxage=30, stale-while-revalidate=60``.
* ``sections=tenant`` skips public sections, builds fleet/erp only,
  ``private, no-store``; a guest gets empty sections (200), never 401.
* ``sections=all`` preserves the previous behaviour exactly.
* This endpoint only reads/builds. It never runs a tick, never ingests, and
  never writes a snapshot (background refreshes cache in memory only).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials

from app.auth.supabase_auth import (
    ROLE_DISPATCHER,
    ROLE_GUEST,
    ROLE_REGULATOR,
    UserSession,
    default_guest_session,
    get_optional_user,
    security_scheme,
)
from app.services import dashboard_snapshot_service as snapshots

logger = logging.getLogger(__name__)

router = APIRouter(tags=["dashboard"])

# Overall cap on the live fallback. The per-section budget is 5 s and the
# sections run in parallel, so a healthy build lands well inside this.
LIVE_BUILD_TIMEOUT_SECONDS = 8.0
TENANT_SECTION_TIMEOUT_SECONDS = 5.0

CACHE_CONTROL: dict[str, str] = {"Cache-Control": "private, no-store"}
PUBLIC_CACHE_CONTROL: dict[str, str] = {
    "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60"
}

TENANT_ROLES = {ROLE_DISPATCHER, ROLE_REGULATOR}

VALID_SECTIONS = ("all", "public", "tenant")

# Public API modality -> vehicles-router modality ("vessel" is the M8 contract,
# the fleet endpoint calls the same thing "maritime").
MODALITIES: dict[str, str] = {
    "truck": "truck",
    "vessel": "maritime",
    "air": "air",
}


async def bootstrap_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> UserSession:
    """Phase 161 optional-auth contract + the bootstrap cache directive.

    ``get_optional_user`` is called with the already-resolved credentials so the
    endpoint can attach ``Cache-Control`` to its 401 as well. The behaviour is
    unchanged: no header -> guest, bad token -> 401 (never a silent guest).

    ``sections=public`` is auth-blind: the query parameter is read from
    ``Request`` and a default guest session is returned before any credential
    is validated, so an invalid (or valid dispatcher) token can never 401 (or
    leak tenant data) on the public path.
    """
    try:
        sections = (request.query_params.get("sections") or "all").strip().lower()
    except Exception:
        sections = "all"
    if sections == "public":
        return default_guest_session()
    try:
        return await get_optional_user(credentials)
    except HTTPException as exc:
        exc.headers = {**(exc.headers or {}), **CACHE_CONTROL}
        raise


# ---------------------------------------------------------------------------
# Tenant sections (live, never stored)
# ---------------------------------------------------------------------------

def _fleet_payload(response: Any) -> Any:
    """Unwrap the vehicles router response (it returns a serialised Response)."""
    body = getattr(response, "body", None)
    if isinstance(body, (bytes, bytearray)):
        return json.loads(bytes(body).decode("utf-8"))
    if isinstance(body, str):
        return json.loads(body)
    return response


async def _fleet_section(user: UserSession, modality: str) -> Any:
    """Fleet for the caller's tenant, via the existing router cache.

    ``company_id`` is deliberately never passed: the vehicles router locks a
    DISPATCHER to the JWT claim and gives REGULATOR/GUEST the public macro view,
    so a query string can never widen the tenant boundary (audit F6).
    """
    from app.routers import vehicles_router

    response = await vehicles_router.get_active_fleet(
        modality=MODALITIES.get(modality, modality),
        status=None,
        company_id=None,
        include_geometry=False,
        user=user,
    )
    return _fleet_payload(response)


async def _erp_section(user: UserSession) -> Any:
    """ERP summary with the same role policy as ``GET /api/v1/erp/summary``.

    DISPATCHER is scoped to the verified ``company_id`` claim; REGULATOR/GUEST
    get the macro aggregate (no per-rit detail). No tenant value is read from
    the query string.
    """
    from app.services.travel_ledger_service import build_erp_summary

    role = (user.role or "").upper()
    effective_company = user.company_id if role == ROLE_DISPATCHER else None
    include_trips = role not in (ROLE_REGULATOR, ROLE_GUEST)
    return await asyncio.to_thread(
        build_erp_summary,
        company_id=effective_company,
        include_trips=include_trips,
        limit=500,
    )


async def tenant_sections(user: UserSession, modality: str) -> dict[str, dict]:
    """Build ``fleet`` + ``erp`` in parallel, isolated like the public sections."""
    plan = [
        ("fleet", lambda: _fleet_section(user, modality)),
        ("erp", lambda: _erp_section(user)),
    ]
    results = await asyncio.gather(
        *(
            snapshots.run_section(
                name,
                factory,
                timeout=TENANT_SECTION_TIMEOUT_SECONDS,
                # Never reuse a cached payload for a tenant section: the cache is
                # keyed by section name only and would cross tenant boundaries.
                cache=False,
            )
            for name, factory in plan
        )
    )
    return {name: section for (name, _), (section, _fresh) in zip(plan, results)}


# ---------------------------------------------------------------------------
# Single-flight + stale-while-revalidate read model
# ---------------------------------------------------------------------------

# In-flight snapshot builds keyed by (event-loop id, corridor). A detached
# task is awaited via ``asyncio.shield`` so a client abort never cancels the
# shared build.
_INFLIGHT: dict[tuple[int, str], asyncio.Task] = {}
# Background build results cached in memory for ~60 s so the next request can
# see fresh data without waiting for the 5-minute tick. Keyed by corridor so a
# non-default corridor can never serve another corridor's snapshot.
_MEMORY: dict[str, dict[str, Any]] = {}
_MEMORY_TTL_SECONDS = 60.0


def reset_inflight() -> None:
    """Drop in-flight builds and the memory cache (used by tests)."""
    for task in list(_INFLIGHT.values()):
        try:
            task.cancel()
        except Exception:
            pass
    _INFLIGHT.clear()
    _MEMORY.clear()


def _inflight_key(corridor_id: Optional[str]) -> tuple[int, str]:
    try:
        loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        loop_id = 0
    return (loop_id, corridor_id or "__global__")


def _memory_key(corridor_id: Optional[str]) -> str:
    return corridor_id or "__global__"


def _get_memory_snapshot(corridor_id: Optional[str]) -> Optional[dict]:
    entry = _MEMORY.get(_memory_key(corridor_id))
    if not isinstance(entry, dict):
        return None
    snap = entry.get("snapshot")
    if not isinstance(snap, dict):
        return None
    try:
        age_wall = time.monotonic() - float(entry.get("at", 0.0))
    except Exception:
        return None
    if age_wall < 0 or age_wall > _MEMORY_TTL_SECONDS:
        return None
    return snap


def _store_memory_snapshot(corridor_id: Optional[str], snapshot: dict) -> None:
    _MEMORY[_memory_key(corridor_id)] = {
        "snapshot": snapshot,
        "at": time.monotonic(),
    }


async def _run_build(corridor_id: Optional[str]) -> dict:
    """Bounded build shared by every concurrent caller.

    The timeout lives on the task itself, not only on the awaiting request: a
    hung build must not stay in ``_INFLIGHT`` forever and must not leak work
    after the caller aborts.
    """
    return await asyncio.wait_for(
        snapshots.build_global_snapshot(corridor_id=corridor_id),
        timeout=LIVE_BUILD_TIMEOUT_SECONDS,
    )


def _get_or_create_build_task(corridor_id: Optional[str]) -> asyncio.Task:
    """Return the shared build task, creating it when none is in flight."""
    key = _inflight_key(corridor_id)
    existing = _INFLIGHT.get(key)
    if existing is not None and not existing.done():
        return existing
    task = asyncio.create_task(_run_build(corridor_id))

    def _done(t: asyncio.Task, k: tuple[int, str] = key) -> None:
        # Cache successful builds so the next request sees fresh data; always
        # retrieve the result to avoid "exception never retrieved" warnings.
        try:
            result = t.result()
            if isinstance(result, dict) and (result.get("payload") or {}):
                try:
                    _store_memory_snapshot(corridor_id, result)
                except Exception:
                    pass
        except asyncio.CancelledError:
            pass
        except Exception:
            pass
        finally:
            if _INFLIGHT.get(k) is t:
                _INFLIGHT.pop(k, None)

    task.add_done_callback(_done)
    _INFLIGHT[key] = task
    return task


def _schedule_background_refresh(corridor_id: Optional[str]) -> None:
    """Schedule a detached refresh; concurrent callers share one build."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return
    key = _inflight_key(corridor_id)
    existing = _INFLIGHT.get(key)
    if existing is not None and not existing.done():
        return
    if _get_memory_snapshot(corridor_id) is not None:
        return
    try:
        task = _get_or_create_build_task(corridor_id)
    except Exception as exc:
        logger.warning("dashboard bootstrap: background refresh not scheduled: %s", exc)
        return

    def _log_background_failure(t: asyncio.Task) -> None:
        try:
            t.result()
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            logger.warning("dashboard bootstrap: background refresh failed: %s", exc)

    try:
        task.add_done_callback(_log_background_failure)
    except Exception:
        pass


async def _resolve_sections(corridor_id: Optional[str]) -> tuple[dict, Optional[str], bool, Optional[str]]:
    """Return ``(sections, computed_at, stale, reason)``.

    Stale-first: a stored row is served immediately (fresh -> ``stale=false``;
    older than 600 s -> ``stale=true``/``snapshot_stale`` with a detached
    background refresh). No stored row -> single-flight bounded live build.
    Never raises (except ``CancelledError`` on client abort, which never
    cancels the shared build thanks to ``asyncio.shield``).
    """
    try:
        mem = _get_memory_snapshot(corridor_id)
        if mem is not None:
            mem_age = snapshots.snapshot_age_seconds(mem)
            if mem_age is not None and mem_age <= snapshots.STALE_AFTER_SECONDS:
                return dict(mem.get("payload") or {}), mem.get("computed_at"), False, None
    except Exception:
        pass

    snapshot = await asyncio.to_thread(snapshots.read_global_snapshot)
    age = snapshots.snapshot_age_seconds(snapshot)

    if snapshot is not None and age is not None and age <= snapshots.STALE_AFTER_SECONDS:
        return dict(snapshot.get("payload") or {}), snapshot.get("computed_at"), False, None

    if snapshot is not None:
        try:
            _schedule_background_refresh(corridor_id)
        except Exception as exc:
            logger.warning("dashboard bootstrap: background refresh failed: %s", exc)
        return dict(snapshot.get("payload") or {}), snapshot.get("computed_at"), True, "snapshot_stale"

    reason = "missing_snapshot"
    try:
        task = _get_or_create_build_task(corridor_id)
        live = await asyncio.wait_for(
            asyncio.shield(task),
            # The task owns the real timeout; leave a small margin so its
            # TimeoutError wins over the caller's outer timeout.
            timeout=LIVE_BUILD_TIMEOUT_SECONDS + 0.5,
        )
        sections = dict(live.get("payload") or {})
        if sections:
            try:
                _store_memory_snapshot(corridor_id, live)
            except Exception:
                pass
            return sections, live.get("computed_at"), True, reason
        logger.warning("dashboard bootstrap: live build produced no sections (%s)", reason)
    except asyncio.TimeoutError:
        reason = "live_build_timeout"
        logger.warning(
            "dashboard bootstrap: live build exceeded %.1fs; serving the stored row if any",
            LIVE_BUILD_TIMEOUT_SECONDS,
        )
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        reason = "live_build_failed"
        logger.warning("dashboard bootstrap: live build failed: %s", exc)

    if snapshot is not None:
        return dict(snapshot.get("payload") or {}), snapshot.get("computed_at"), True, reason
    return {}, None, True, reason


@router.get("/api/v1/dashboard/bootstrap")
@router.get("/dashboard/bootstrap", include_in_schema=False)
async def dashboard_bootstrap(
    modality: str = Query("truck", description="Fleet modality: truck | vessel | air"),
    corridor_id: Optional[str] = Query(
        None, description="Corridor context to include (default: sumatra_belawan_medan)"
    ),
    sections: str = Query("all", description="Section set: all | public | tenant"),
    user: UserSession = Depends(bootstrap_user),
):
    """Serve the dashboard read model (see module docstring)."""
    requested_sections = (sections or "all").strip().lower()
    if requested_sections not in VALID_SECTIONS:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_SECTIONS",
                "message": "sections must be one of: all, public, tenant",
                "allowed": sorted(VALID_SECTIONS),
            },
            headers=dict(CACHE_CONTROL),
        )

    requested = (modality or "truck").strip().lower()
    if requested not in MODALITIES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_MODALITY",
                "message": "modality must be one of: truck, vessel, air",
                "allowed": sorted(MODALITIES),
            },
            headers=dict(CACHE_CONTROL),
        )

    if requested_sections == "public":
        # Auth-blind by construction: bootstrap_user already returned a guest,
        # and tenant sections are never built here even when a dispatcher
        # token was supplied.
        public_sections, computed_at, stale, reason = await _resolve_sections(corridor_id)
        body = {
            "schema_version": snapshots.SNAPSHOT_SCHEMA_VERSION,
            "computed_at": computed_at,
            "stale": stale,
            "role": ROLE_GUEST,
            "company_id": None,
            "modality": requested,
            "sections": public_sections,
        }
        if stale:
            body["reason"] = reason
        return JSONResponse(
            content=jsonable_encoder(body), headers=dict(PUBLIC_CACHE_CONTROL)
        )

    if requested_sections == "tenant":
        role = (user.role or ROLE_GUEST).upper()
        tenant: dict[str, dict] = {}
        if role in TENANT_ROLES:
            try:
                tenant = await tenant_sections(user, requested)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.warning("dashboard bootstrap: tenant sections failed: %s", exc)
                for name in ("fleet", "erp"):
                    tenant.setdefault(
                        name,
                        {"status": "degraded", "data": None, "error": f"{type(exc).__name__}: {exc}"},
                    )
        body = {
            "schema_version": snapshots.SNAPSHOT_SCHEMA_VERSION,
            "computed_at": None,
            "stale": False,
            "role": role,
            "company_id": (user.company_id or None),
            "modality": requested,
            "sections": tenant,
        }
        return JSONResponse(content=jsonable_encoder(body), headers=dict(CACHE_CONTROL))

    sections_data, computed_at, stale, reason = await _resolve_sections(corridor_id)

    role = (user.role or ROLE_GUEST).upper()
    if role in TENANT_ROLES:
        try:
            sections_data.update(await tenant_sections(user, requested))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # gather itself failed - keep the public data
            logger.warning("dashboard bootstrap: tenant sections failed: %s", exc)
            for name in ("fleet", "erp"):
                sections_data.setdefault(
                    name,
                    {"status": "degraded", "data": None, "error": f"{type(exc).__name__}: {exc}"},
                )

    body = {
        "schema_version": snapshots.SNAPSHOT_SCHEMA_VERSION,
        "computed_at": computed_at,
        "stale": stale,
        "role": role,
        "company_id": (user.company_id or None),
        "modality": requested,
        "sections": sections_data,
    }
    if stale:
        body["reason"] = reason

    return JSONResponse(content=jsonable_encoder(body), headers=dict(CACHE_CONTROL))
