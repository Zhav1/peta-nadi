"""Server-enforced safety controls for the mainland Sumatra research pilot.

Shadow previews intentionally have no durable trace: route_approvals and
travels are operational ledgers, not an isolated research-audit store. Keep
preview responses explicit so callers cannot mistake them for applied work.
"""
from __future__ import annotations

import logging
from collections.abc import Mapping
from typing import Any

from fastapi import HTTPException, status

from app.config import get_settings

logger = logging.getLogger(__name__)


ELIGIBLE_TRIP_STATUSES = {"planned", "moving", "rerouted"}
_ALLOWED_LIVE_ROUTE_STATUSES = {"SAFE_DETOUR", "CLEAR"}


def is_pilot_shadow_mode() -> bool:
    """Fail closed until the shared setting lands; tolerate bool or env text."""
    configured = getattr(get_settings(), "pilot_shadow_mode", True)
    if isinstance(configured, str):
        return configured.strip().lower() not in {"0", "false", "no", "off"}
    return configured is not False


def require_tenant_claim(user: Any) -> str:
    company_id = getattr(user, "company_id", None)
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant Dispatcher tidak tersedia; permintaan ditolak.",
        )
    return str(company_id)


def require_dispatcher_write(user: Any, permission: str = "fleet:write") -> str:
    role = str(getattr(user, "role", "") or "").upper()
    permissions = set(getattr(user, "permissions", None) or [])
    if role != "DISPATCHER" or permission not in permissions:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Aksi hanya untuk Dispatcher dengan wewenang '{permission}'.",
                "current_role": role,
                "required_permissions": [permission],
            },
        )
    return require_tenant_claim(user)


def assert_tenant_owns_record(user: Any, record: Mapping[str, Any] | None) -> Mapping[str, Any]:
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trip tidak ditemukan.")
    company_id = require_tenant_claim(user)
    if str(record.get("company_id") or "") != company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trip berada di luar tenant Dispatcher.")
    return record


def get_tenant_trip(user: Any, travel_id: str) -> Mapping[str, Any]:
    """Read and tenant-check an existing trip without changing its ledger."""
    from app.services import travel_ledger_service

    trip = travel_ledger_service.get_travel(travel_id)
    return assert_tenant_owns_record(user, trip)


def shadow_decision_response(
    *,
    action: str,
    decision_scope: str,
    incident_id: str | None = None,
    route_id: str | None = None,
    travel_id: str | None = None,
    operator_id: str | None = None,
    tactical_action: str | None = None,
    preview: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Return a non-durable, non-operational evaluation result and log its trace."""
    logger.info(
        "pilot_shadow_decision_preview",
        extra={
            "shadow_mode": True,
            "decision_scope": decision_scope,
            "action": action,
            "incident_id": incident_id,
            "route_id": route_id,
            "travel_id": travel_id,
            "operator_id": operator_id,
            "applied": False,
            "persisted": False,
        },
    )
    return {
        "status": "shadow_preview",
        "application_status": "shadow_preview",
        "decision_scope": decision_scope,
        "incident_id": incident_id,
        "route_id": route_id,
        "travel_id": travel_id,
        "operator_id": operator_id,
        "action": action,
        "tactical_action": tactical_action,
        "shadow_mode": True,
        "applied": False,
        "recorded": False,
        "persistence_status": "not_persisted",
        "external_dispatch_status": "disabled",
        "preview": dict(preview or {}),
    }


def shadow_mutation_response(
    *,
    resource: str,
    action: str,
    resource_id: str | None = None,
    preview: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    result = shadow_decision_response(
        action=action,
        decision_scope=f"{resource}_research_preview",
        travel_id=resource_id if resource == "travel" else None,
        preview=preview,
    )
    result.update({"resource": resource, "resource_id": resource_id})
    return result


def _server_route_assessment(incident_id: str, route_id: str) -> tuple[Mapping[str, Any], Mapping[str, Any]]:
    """Load authoritative freshness and route viability; never trust client proof."""
    try:
        from app.db.supabase_client import get_client

        response = (
            get_client()
            .table("incidents")
            .select("incident_id,verification_audit,ground_truth_metrics,route_assessments")
            .eq("incident_id", incident_id)
            .limit(1)
            .execute()
        )
        rows = getattr(response, "data", None) or []
    except Exception as exc:
        logger.warning("Live route assessment unavailable; refusing operation: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Operasi live ditutup: verifikasi keselamatan server tidak tersedia.",
        ) from exc

    if not rows:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Operasi live ditutup: bukti insiden terverifikasi tidak tersedia di server.",
        )
    incident = rows[0]
    audit = incident.get("verification_audit") or (incident.get("ground_truth_metrics") or {}).get("verification_audit")
    assessments = incident.get("route_assessments")
    if not isinstance(audit, dict) or not isinstance(assessments, dict):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Operasi live ditutup: kontrak verifikasi rute server belum tersedia.",
        )
    assessment = assessments.get(route_id)
    if not isinstance(assessment, dict):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Operasi live ditutup: penilaian rute server tidak tersedia.",
        )
    return audit, assessment


def validate_live_route_decision(incident_id: str, route_id: str, route: Mapping[str, Any]) -> None:
    """Fail closed on invalid client claims and require server-owned proof.

    This keeps a future explicit live toggle from treating client-provided
    `proof`, `safety_status`, or evidence references as authoritative.
    """
    safety_status = str(route.get("safety_status") or "").upper()
    if safety_status not in _ALLOWED_LIVE_ROUTE_STATUSES:
        raise HTTPException(status_code=422, detail="Operasi live ditolak: status keselamatan rute tidak eligible.")
    if route.get("is_compromised") is True or str(route.get("passability") or "").upper() == "BLOCKED":
        raise HTTPException(status_code=422, detail="Operasi live ditolak: rute terkompromi atau terblokir.")
    if route.get("viable") is False or route.get("is_viable") is False or route.get("non_viable") is True:
        raise HTTPException(status_code=422, detail="Operasi live ditolak: rute tidak viabel.")

    audit, assessment = _server_route_assessment(incident_id, route_id)
    age_value = audit.get("age_hours")
    try:
        age_hours = float(age_value) if age_value is not None else float("inf")
    except (TypeError, ValueError):
        age_hours = float("inf")
    if (
        audit.get("freshness_passed") is not True
        or audit.get("impact_corroborated") is not True
        or not 0 <= age_hours <= 48
    ):
        raise HTTPException(status_code=422, detail="Operasi live ditolak: bukti server tidak segar atau belum terkoroborasi.")
    if (
        assessment.get("viable") is not True
        or assessment.get("is_compromised") is True
        or str(assessment.get("safety_status") or "").upper() not in _ALLOWED_LIVE_ROUTE_STATUSES
    ):
        raise HTTPException(status_code=422, detail="Operasi live ditolak: penilaian rute server tidak viabel/aman.")


def require_tenant_outcome_link(user: Any, incident_id: str) -> None:
    """Live outcome writes require an existing trip owned by this tenant."""
    company_id = require_tenant_claim(user)
    from app.services import travel_ledger_service

    trips = travel_ledger_service.list_travels(company_id=company_id, limit=5000)
    if not any(
        str(trip.get("id") or "") == incident_id
        or str(trip.get("disruption_id") or "") == incident_id
        for trip in trips
    ):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Insiden tidak terhubung ke trip yang dapat diakses tenant Dispatcher.",
        )
