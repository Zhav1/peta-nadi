import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any, cast
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas.decision_schemas import (
    DecisionAction,
    DecisionScope,
    TacticalManeuver,
    DecisionTraceCreate,
    DecisionTraceResponse,
    DecisionTraceListResponse
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
    """Record incident reviews or atomically apply a route to one canonical trip."""
    if "approvals:write" not in (current_user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": "Akses ditolak: memerlukan wewenang 'approvals:write'.",
                "current_role": current_user.role,
                "required_permissions": ["approvals:write"],
            },
        )

    # The authenticated principal is authoritative; caller-supplied operator IDs
    # remain accepted only as historical request fields, never as audit identity.
    op_id = current_user.id
    committed_by_role = current_user.role
    route_dict = payload.recommended_route or {}
    inc_id = payload.incident_id or payload.crisis_id
    changes_route = payload.action != DecisionAction.REJECT and payload.tactical_action != TacticalManeuver.HOLD
    is_trip_operation = payload.decision_scope == DecisionScope.OPERATIONAL_ROUTE or (
        payload.decision_scope is None and changes_route
    )
    if payload.decision_scope == DecisionScope.OPERATIONAL_ROUTE and not changes_route:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Operational route scope requires a route-changing action.")
    if payload.decision_scope == DecisionScope.INCIDENT_REVIEW and payload.travel_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Incident-only review cannot target a trip.")

    if not inc_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="incident_id is required for an incident review or operational route change.")

    if is_trip_operation:
        required_permissions = {"approvals:write", "fleet:write"}
        if committed_by_role != "DISPATCHER" or not required_permissions.issubset(set(current_user.permissions or [])):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Trip route changes require Dispatcher approvals:write and fleet:write permissions.")
        if not payload.travel_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="travel_id is required for an operational route change.")

        if payload.expected_route_version is None or payload.idempotency_key is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="expected_route_version and idempotency_key are required for an operational route change.")
        if not payload.notes or not payload.notes.strip():
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Operator rationale is required for an operational route change.")
        route_text = " ".join(str(route_dict.get(k) or "") for k in ("route_name", "description", "safety_tag", "source")).upper()
        if payload.simulation_mode or route_dict.get("is_simulated") is True or route_dict.get("simulation_mode") is True or not route_dict.get("safety_status") or "SIMULASI" in route_text or "OFFLINE" in route_text:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Operational approval requires a grounded, non-simulated route.")
        proof = any(str(route_dict.get(k) or "").strip() for k in ("proof", "dampak", "dasar_risiko"))
        refs = [str(ref).strip() for ref in payload.evidence_refs if str(ref).strip()]
        if not proof and not refs:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Operational approval requires reviewed evidence references or route proof.")

        rpc_params = {
            "p_travel_id": payload.travel_id,
            "p_incident_id": inc_id,
            "p_route_id": payload.route_id,
            "p_action": payload.action.value,
            "p_tactical_action": payload.tactical_action.value,
            "p_operator_id": op_id,
            "p_company_id": current_user.company_id,
            "p_expected_route_version": payload.expected_route_version,
            "p_requested_vehicle_id": str((payload.custom_constraints or {}).get("vehicle_id") or route_dict.get("vehicle_id")) if ((payload.custom_constraints or {}).get("vehicle_id") or route_dict.get("vehicle_id")) else None,
            "p_idempotency_key": str(payload.idempotency_key),
            "p_recommended_route": route_dict,
            "p_evidence_refs": refs,
            "p_notes": payload.notes,
        }
        try:
            from app.db.supabase_client import get_write_client

            sb = get_write_client()
            result = await asyncio.to_thread(lambda: sb.rpc("apply_trip_route_decision", rpc_params).execute())
            data = getattr(result, "data", None)
            applied = data[0] if isinstance(data, list) and data else data
            if not isinstance(applied, dict) or not applied.get("approval_id"):
                raise RuntimeError("Trip decision RPC returned no committed approval record")
            return {
                **applied,
                "id": str(applied["approval_id"]),
                "action": payload.action.value,
                "tactical_action": payload.tactical_action.value,
                "decision_scope": DecisionScope.OPERATIONAL_ROUTE.value,
                "operator_id": op_id,
                "status": applied.get("application_status"),
            }
        except HTTPException:
            raise
        except Exception as exc:
            message = str(exc)
            known_errors = {
                "TRIP_NOT_FOUND": (status.HTTP_404_NOT_FOUND, "Trip tidak ditemukan."),
                "TRIP_FORBIDDEN": (status.HTTP_403_FORBIDDEN, "Trip berada di luar tenant Dispatcher."),
                "TRIP_INELIGIBLE": (status.HTTP_409_CONFLICT, "Trip tidak lagi eligible untuk perubahan rute."),
                "TRIP_INCIDENT_MISMATCH": (status.HTTP_409_CONFLICT, "Trip sudah terikat ke insiden yang berbeda."),
                "TRIP_VEHICLE_MISMATCH": (status.HTTP_409_CONFLICT, "Vehicle pada rekomendasi tidak cocok dengan assignment trip."),
                "TRIP_STALE": (status.HTTP_409_CONFLICT, "Versi rute trip berubah; muat ulang trip dan bandingkan kembali."),
                "IDEMPOTENCY_KEY_REQUIRED": (status.HTTP_422_UNPROCESSABLE_ENTITY, "Kunci idempotensi wajib diisi."),
                "IDEMPOTENCY_KEY_CONFLICT": (status.HTTP_409_CONFLICT, "Kunci idempotensi sudah dipakai untuk keputusan lain."),
            }
            for marker, (http_status, detail) in known_errors.items():
                if marker in message:
                    raise HTTPException(status_code=http_status, detail=detail) from exc
            logger.exception("Atomic trip route decision failed; no applied success returned")
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Trip decision could not be durably applied. No applied success was recorded.") from exc

    # Incident/news review remains trip-independent. Historical approvals have
    # no trip link and are never backfilled to whichever trip happens to be latest.
    forecast, pred_source = _resolve_approval_forecast(inc_id, route_dict if isinstance(route_dict, dict) else {})
    forecast_notes_flag = "" if forecast else " pred_unavailable(no stored forecast at decision time)"
    db_payload = {
        "incident_id": inc_id,
        "route_id": payload.route_id,
        "action": payload.action.value,
        "tactical_action": payload.tactical_action.value,
        "decision_scope": DecisionScope.INCIDENT_REVIEW.value,
        "operator_id": op_id,
        "recommended_route": route_dict,
        "custom_constraints": payload.custom_constraints or {},
        "notes": (payload.notes or f"committed_by {op_id} ({committed_by_role})") + forecast_notes_flag,
        "sync_status": "synced",
        "execution_status": "decision_recorded",
        "pred_prob": (forecast or {}).get("pred_prob"),
        "raw_prob": (forecast or {}).get("raw_prob"),
        "p_max": (forecast or {}).get("p_max"),
        "weights_version": (forecast or {}).get("weights_version"),
        "active_sources": (forecast or {}).get("active_sources"),
        "forecast_created_at": (forecast or {}).get("forecast_created_at"),
    }
    local_extra = {"committed_by_role": committed_by_role}

    try:
        from app.db.supabase_client import get_write_client
        sb = get_write_client()
        result = await _insert_row_resilient(sb, "route_approvals", db_payload)
        if result.data and len(result.data) > 0:
            item = result.data[0]
            record_id = item.get("id") or f"DEC-{inc_id}"
            approved_at = item.get("approved_at") or item.get("created_at") or datetime.now().isoformat()
            local_payload = dict(db_payload, id=record_id, created_at=approved_at, sync_status="synced")
            local_payload.update(local_extra)
            local_storage.save_decision_trace(local_payload)
            return {
                "id": record_id,
                "approval_id": record_id,
                "approved_at": approved_at,
                "action": payload.action.value,
                "tactical_action": payload.tactical_action.value,
                "decision_scope": DecisionScope.INCIDENT_REVIEW.value,
                "operator_id": op_id,
                "committed_by_role": committed_by_role,
                "status": "decision_recorded",
                "application_status": "decision_recorded",
                "pred_source": pred_source,
                "pred_prob": db_payload.get("pred_prob"),
            }
    except Exception as exc:
        logger.warning("Supabase unavailable for incident-only review, queuing locally: %s", exc)

    db_payload["sync_status"] = "pending"
    offline_payload = dict(db_payload)
    offline_payload.update(local_extra)
    saved = local_storage.save_decision_trace(offline_payload)
    return {
        "id": saved["id"],
        "approval_id": saved["id"],
        "approved_at": saved["created_at"],
        "action": payload.action.value,
        "tactical_action": payload.tactical_action.value,
        "decision_scope": DecisionScope.INCIDENT_REVIEW.value,
        "operator_id": op_id,
        "committed_by_role": committed_by_role,
        "status": "local_queued",
        "application_status": "decision_recorded_locally",
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
        items = cast(List[Dict[str, Any]], result.data or [])
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
                        approved_at=created_dt,
                        travel_id=item.get("travel_id"),
                        applied_vehicle_id=item.get("applied_vehicle_id"),
                        decision_scope=item.get("decision_scope"),
                        trip_version=item.get("trip_version"),
                        application_status=item.get("execution_status"),
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
                approved_at=created_dt,
                travel_id=item.get("travel_id"),
                applied_vehicle_id=item.get("applied_vehicle_id"),
                decision_scope=item.get("decision_scope"),
                application_status=item.get("execution_status"),
            )
        )
    return DecisionTraceListResponse(items=responses, total=len(responses))
