"""Dashboard bootstrap read path (Phase 163a / M8).

One auth-aware request replaces the ~25-30 endpoint first-paint fan-out:

* public sections come from the DB-backed read model
  (``dashboard_snapshots``, written by the external tick);
* a missing or stale (> 600 s = 2 x tick cadence) row triggers a **bounded**
  live build (8 s cap) returned to this caller only - the tick stays the only
  writer;
* ``DISPATCHER`` / ``REGULATOR`` additionally get tenant-scoped ``fleet`` and
  ``erp`` sections, built live from the existing service/router caches.

Contract
--------
* Auth: ``get_optional_user`` (phase 161 fail-closed) - no header => guest,
  supplied-but-invalid token => 401 + ``WWW-Authenticate: Bearer``.
* Every response carries ``Cache-Control: private, no-store`` (including the
  auth 401 and the 400 for an unknown modality).
* This endpoint only reads/builds. It never runs a tick, never ingests, and
  never writes a snapshot.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials

from app.auth.supabase_auth import (
    ROLE_DISPATCHER,
    ROLE_GUEST,
    ROLE_REGULATOR,
    UserSession,
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

TENANT_ROLES = {ROLE_DISPATCHER, ROLE_REGULATOR}

# Public API modality -> vehicles-router modality ("vessel" is the M8 contract,
# the fleet endpoint calls the same thing "maritime").
MODALITIES: dict[str, str] = {
    "truck": "truck",
    "vessel": "maritime",
    "air": "air",
}


async def bootstrap_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> UserSession:
    """Phase 161 optional-auth contract + the bootstrap cache directive.

    ``get_optional_user`` is called with the already-resolved credentials so the
    endpoint can attach ``Cache-Control`` to its 401 as well. The behaviour is
    unchanged: no header -> guest, bad token -> 401 (never a silent guest).
    """
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
# Read model resolution
# ---------------------------------------------------------------------------

async def _resolve_sections(corridor_id: Optional[str]) -> tuple[dict, Optional[str], bool, Optional[str]]:
    """Return ``(sections, computed_at, stale, reason)``.

    Fresh stored row -> that payload. Missing/stale -> bounded live build; if the
    build fails or exceeds the cap, fall back to the stored payload (if any) and
    report the reason. Never raises.
    """
    snapshot = await asyncio.to_thread(snapshots.read_global_snapshot)
    age = snapshots.snapshot_age_seconds(snapshot)

    if snapshot is not None and age is not None and age <= snapshots.STALE_AFTER_SECONDS:
        return dict(snapshot.get("payload") or {}), snapshot.get("computed_at"), False, None

    if snapshot is None:
        reason = "missing_snapshot"
    elif age is None:
        reason = "unparseable_computed_at"
    else:
        reason = "snapshot_stale"

    try:
        live = await asyncio.wait_for(
            snapshots.build_global_snapshot(corridor_id=corridor_id),
            timeout=LIVE_BUILD_TIMEOUT_SECONDS,
        )
        sections = dict(live.get("payload") or {})
        if sections:
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
    user: UserSession = Depends(bootstrap_user),
):
    """Serve the dashboard read model (see module docstring)."""
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

    sections, computed_at, stale, reason = await _resolve_sections(corridor_id)

    role = (user.role or ROLE_GUEST).upper()
    if role in TENANT_ROLES:
        try:
            sections.update(await tenant_sections(user, requested))
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # gather itself failed - keep the public data
            logger.warning("dashboard bootstrap: tenant sections failed: %s", exc)
            for name in ("fleet", "erp"):
                sections.setdefault(
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
        "sections": sections,
    }
    if stale:
        body["reason"] = reason

    return JSONResponse(content=jsonable_encoder(body), headers=dict(CACHE_CONTROL))
