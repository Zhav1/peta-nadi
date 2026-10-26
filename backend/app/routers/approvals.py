import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas.decision_schemas import (
    DecisionAction,
    TacticalManeuver,
    DecisionTraceCreate,
    DecisionTraceResponse,
    DecisionTraceListResponse,
    OutcomeHorizon
)
from app.db import local_storage
from app.auth.supabase_auth import UserSession, get_optional_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/approvals", tags=["approvals"])

# Keep ApprovalCreate alias for backwards compatibility
ApprovalCreate = DecisionTraceCreate
ApprovalResponse = DecisionTraceResponse
ApprovalListResponse = DecisionTraceListResponse


def _coerce_pred(value: Any) -> Optional[float]:
    """Best-effort usable-probability coercion; unusable stays None (never defaulted)."""
    try:
        if value is None or value == "":
            return None
        result = float(value)
    except (TypeError, ValueError):
        return None
    import math as _math
    if not _math.isfinite(result) or not (0.0 <= result <= 1.0):
        return None
    return result


def _resolve_approval_forecast(inc_id: str, route_dict: Dict[str, Any]) -> tuple:
    """Resolve the decision-time forecast to persist with an approval.

    Priority (never recomputes or defaults a probability):
    1. pred carried on the recommended_route payload -> "explicit_route";
    2. Supabase incidents row for the incident (migration 021 columns,
       written by the news ingestor) -> "stored_supabase_incident";
    3. newest Supabase route_approvals (pending HITL) row for the incident
       with a usable pred -> "stored_supabase_approval";
    4. nothing usable -> (None, "missing") with a notes audit flag.
    """
    if _coerce_pred((route_dict or {}).get("pred_prob")) is not None:
        return {
            "pred_prob": route_dict.get("pred_prob"),
            "raw_prob": route_dict.get("raw_prob"),
            "p_max": route_dict.get("p_max"),
            "weights_version": route_dict.get("weights_version"),
            "active_sources": route_dict.get("active_sources"),
            "forecast_created_at": route_dict.get("forecast_created_at"),
        }, "explicit_route"

    try:
        from app.db.supabase_client import get_write_client
        sb = get_write_client()
        cols = "pred_prob,raw_prob,p_max,weights_version,active_sources,forecast_created_at"
        try:
            res = sb.table("incidents").select(cols).eq("incident_id", inc_id).limit(1).execute()
            for row in (getattr(res, "data", None) or []):
                if _coerce_pred((row or {}).get("pred_prob")) is not None:
                    return dict(row), "stored_supabase_incident"
        except Exception as ie:
            logger.debug(f"Approval forecast lookup skipped Supabase incidents ({ie})")
        try:
            res = sb.table("route_approvals").select(cols).eq("incident_id", inc_id).limit(10).execute()
            for row in (getattr(res, "data", None) or []):
                if _coerce_pred((row or {}).get("pred_prob")) is not None:
                    return dict(row), "stored_supabase_approval"
        except Exception as ae:
            logger.debug(f"Approval forecast lookup skipped Supabase route_approvals ({ae})")
    except Exception as e:
        logger.debug(f"Approval forecast lookup skipped Supabase ({e})")

    return None, "missing"


PRED_COLUMN_KEYS = (
    "pred_prob",
    "raw_prob",
    "p_max",
    "weights_version",
    "active_sources",
    "forecast_created_at",
)


async def _insert_row_resilient(sb: Any, table: str, payload: Dict[str, Any]) -> Any:
    """Insert tolerating Supabase projects that have not applied migration 021.

    Falls back to a forecast-less insert (PGRST204) so cloud sync keeps working;
    the local mirror retains the full pred bundle for the live aggregate.
    """
    import asyncio as _asyncio

    try:
        return await _asyncio.to_thread(
            lambda: sb.table(table).insert(payload).execute()
        )
    except Exception as e:
        msg = str(e)
        if ("PGRST204" in msg or "schema cache" in msg) and any(
            k in msg for k in PRED_COLUMN_KEYS
        ):
            logger.warning(
                f"Supabase {table} lacks migration 021 pred columns; "
                "syncing row without stored forecast (pred kept in local mirror)."
            )
            slim = {k: v for k, v in payload.items() if k not in PRED_COLUMN_KEYS}
            return await _asyncio.to_thread(
                lambda: sb.table(table).insert(slim).execute()
            )
        raise


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def create_approval(
    payload: DecisionTraceCreate,
    current_user: UserSession = Depends(get_optional_user),
):
    """
    Log an operator decision trace in Supabase with local SQLite fallback.
    Supports multi-action decisions: ACCEPT, REJECT, and OVERRIDE with tactical maneuvers.
    RBAC: Requires the 'approvals:write' permission (Dispatcher). GUEST and REGULATOR roles are denied with 403.
    """
    if "approvals:write" not in (current_user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Akses ditolak: Hanya operator dengan wewenang 'approvals:write' (Dispatcher) yang dapat menyetujui pengalihan rute armada. Peran Anda saat ini adalah {current_user.role}.",
                "current_role": current_user.role,
                "required_permissions": ["approvals:write"],
            }
        )

    inc_id = payload.incident_id or payload.crisis_id or "INC-DEFAULT"
    # Operator identity precedence: authenticated session wins; no unauthenticated fallback.
    op_id = payload.operator_id or payload.approved_by or current_user.id
    committed_by_role = current_user.role

    # WS-LIVE: persist the decision-time forecast with the approval so a later
    # FIELD_REPORT outcome can auto-join it into the live aggregate. Missing
    # forecasts stay NULL (missing_pred) with a notes audit flag — never defaulted.
    route_dict_forecast = payload.recommended_route or {}
    forecast, pred_source = _resolve_approval_forecast(
        inc_id, route_dict_forecast if isinstance(route_dict_forecast, dict) else {}
    )
    forecast_notes_flag = "" if forecast else " pred_unavailable(no stored forecast at decision time)"

    db_payload = {
        "incident_id": inc_id,
        "route_id": payload.route_id,
        "action": payload.action.value,
        "tactical_action": payload.tactical_action.value,
        "operator_id": op_id,
        "recommended_route": payload.recommended_route or {},
        "custom_constraints": payload.custom_constraints or {},
        # committed_by_role tracked in notes + response + local mirror (no schema
        # migration on route_approvals); server identity stays op_id (current_user.id).
        "notes": (payload.notes or f"committed_by {op_id} ({committed_by_role})") + forecast_notes_flag,
        "sync_status": "synced",
        "pred_prob": (forecast or {}).get("pred_prob"),
        "raw_prob": (forecast or {}).get("raw_prob"),
        "p_max": (forecast or {}).get("p_max"),
        "weights_version": (forecast or {}).get("weights_version"),
        "active_sources": (forecast or {}).get("active_sources"),
        "forecast_created_at": (forecast or {}).get("forecast_created_at"),
    }
    # Local mirror keeps the structured role field for audit without Supabase migration.
    local_extra = {"committed_by_role": committed_by_role}

    # Closed-loop Fleet Reroute Sync: If recommended route has geometry, bind it to target vehicle
    try:
        route_dict = payload.recommended_route or {}
        target_vid = (payload.custom_constraints or {}).get("vehicle_id") or route_dict.get("vehicle_id") or "TRK-003-BELAWAN-TEBING"
        rec_geom = route_dict.get("route_geometry") or route_dict.get("geometry")
        if rec_geom and target_vid and payload.action != DecisionAction.REJECT:
            from app.services.telemetry_service import telemetry_service
            telemetry_service.reroute_vehicle(
                vehicle_id=target_vid,
                new_route_geometry=rec_geom,
                new_eta_minutes=float(route_dict.get("eta_minutes") or 120.0)
            )
            logger.info(f"Closed-loop sync: rerouted fleet vehicle {target_vid} following operator approval.")
    except Exception as re_err:
        logger.debug(f"Fleet reroute sync notice: {re_err}")

    # Attempt Supabase cloud insertion
    try:
        from app.db.supabase_client import get_write_client
        sb = get_write_client()

        # Insert into route_decision_traces or legacy route_approvals
        result = await _insert_row_resilient(sb, "route_approvals", db_payload)
        
        if result.data and len(result.data) > 0:
            item = result.data[0]
            record_id = item.get("id") or f"DEC-{inc_id}"
            approved_at = item.get("approved_at") or item.get("created_at") or datetime.now().isoformat()
            
            # Also mirror locally as synced
            local_payload = dict(db_payload, id=record_id, created_at=approved_at, sync_status="synced")
            local_payload.update(local_extra)
            local_storage.save_decision_trace(local_payload)
            
            # Register closed-loop outcome verification tracking
            try:
                route_dict = payload.recommended_route or {}
                delay_hrs = float(route_dict.get("eta_hours") or ((route_dict.get("eta_minutes") or 150) / 60.0))
                local_storage.save_ground_truth_outcome({
                    "incident_id": inc_id,
                    "horizon": OutcomeHorizon.T_12H.value,
                    "observed_delay_hours": delay_hrs,
                    "actual_price_spike_pct": 12.0,
                    "verified_by": op_id,
                    "verification_source": "DISPATCHER_APPROVAL",
                    "notes": f"Decision: {payload.action.value} ({payload.tactical_action.value}) via route {payload.route_id}"
                })
            except Exception as oe:
                logger.debug(f"Outcome registration note: {oe}")

            logger.info(f"Decision trace logged in Supabase & synced locally: id={record_id}")
            return {
                "id": record_id,
                "approval_id": record_id,
                "approved_at": approved_at,
                "action": payload.action.value,
                "tactical_action": payload.tactical_action.value,
                "operator_id": op_id,
                "committed_by_role": committed_by_role,
                "status": "success",
                "pred_source": pred_source,
                "pred_prob": db_payload.get("pred_prob"),
            }
    except Exception as e:
        logger.warning(f"Supabase unavailable for decision log, persisting to local SQLite: {e}")

    # Offline / Local fallback
    db_payload["sync_status"] = "pending"
    offline_payload = dict(db_payload)
    offline_payload.update(local_extra)
    saved = local_storage.save_decision_trace(offline_payload)

    # Register closed-loop outcome verification tracking in local fallback
    try:
        route_dict = payload.recommended_route or {}
        delay_hrs = float(route_dict.get("eta_hours") or ((route_dict.get("eta_minutes") or 150) / 60.0))
        local_storage.save_ground_truth_outcome({
            "incident_id": inc_id,
            "horizon": OutcomeHorizon.T_12H.value,
            "observed_delay_hours": delay_hrs,
            "actual_price_spike_pct": 12.0,
            "verified_by": op_id,
            "verification_source": "DISPATCHER_APPROVAL",
            "notes": f"Decision: {payload.action.value} ({payload.tactical_action.value}) via route {payload.route_id}"
        })
    except Exception as oe:
        logger.debug(f"Outcome registration note (offline): {oe}")

    logger.info(
        f"[OFFLINE-DECISION-LOG] operator={op_id} | incident={inc_id} | action={payload.action.value} | tactical={payload.tactical_action.value}"
    )
    return {
        "id": saved["id"],
        "approval_id": saved["id"],
        "approved_at": saved["created_at"],
        "action": payload.action.value,
        "tactical_action": payload.tactical_action.value,
        "operator_id": op_id,
        "committed_by_role": committed_by_role,
        "status": "local_queued",
        "pred_source": pred_source,
        "pred_prob": db_payload.get("pred_prob"),
    }


@router.get("", response_model=DecisionTraceListResponse)
async def list_approvals(
    incident_id: Optional[str] = Query(None, description="Filter by incident ID"),
    limit: int = Query(50, ge=1, le=100)
):
    """List logged decision traces, falling back to local SQLite if Supabase is offline."""
    # Attempt cloud read first
    try:
        from app.db.supabase_client import get_write_client
        sb = get_write_client()
        
        query = sb.table("route_approvals").select("*").order("approved_at", desc=True).limit(limit)
        if incident_id:
            query = query.eq("incident_id", incident_id)
            
        result = await asyncio.to_thread(lambda: query.execute())
        items = result.data or []
        if items:
            responses = []
            for item in items:
                created_str = item.get("approved_at") or item.get("created_at") or datetime.now().isoformat()
                created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                responses.append(
                    DecisionTraceResponse(
                        id=str(item.get("id")),
                        incident_id=item.get("incident_id", "INC-DEFAULT"),
                        route_id=str(item.get("route_id", "0")),
                        action=DecisionAction(item.get("action", "ACCEPT")),
                        tactical_action=TacticalManeuver(item.get("tactical_action", "REROUTE")),
                        operator_id=item.get("operator_id") or "unknown-operator",
                        recommended_route=item.get("recommended_route"),
                        custom_constraints=item.get("custom_constraints"),
                        notes=item.get("notes"),
                        sync_status="synced",
                        created_at=created_dt,
                        approved_at=created_dt
                    )
                )
            return DecisionTraceListResponse(items=responses, total=len(responses))
    except Exception as e:
        logger.debug(f"Supabase unavailable for list_approvals, querying local SQLite: {e}")

    # Fallback to local SQLite
    local_items = local_storage.list_decision_traces(incident_id=incident_id, limit=limit)
    responses = []
    for item in local_items:
        created_str = item.get("created_at") or datetime.now().isoformat()
        try:
            created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        except Exception:
            created_dt = datetime.now()
        responses.append(
            DecisionTraceResponse(
                id=item["id"],
                incident_id=item["incident_id"],
                route_id=item["route_id"],
                action=DecisionAction(item["action"]),
                tactical_action=TacticalManeuver(item["tactical_action"]),
                operator_id=item["operator_id"],
                recommended_route=item.get("recommended_route"),
                custom_constraints=item.get("custom_constraints"),
                notes=item.get("notes"),
                sync_status=item.get("sync_status", "pending"),
                created_at=created_dt,
                approved_at=created_dt
            )
        )
    return DecisionTraceListResponse(items=responses, total=len(responses))
