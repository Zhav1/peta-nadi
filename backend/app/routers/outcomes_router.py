"""
FastAPI Router for Ground-Truth Field Outcomes.
Enables logging and retrieving verified post-disruption conditions (clearance time, delays, price shifts)
at T+12h and T+24h horizons with local SQLite fallback resilience.
"""
import logging
import asyncio
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.decision_schemas import (
    OutcomeHorizon,
    VerificationSource,
    OutcomeCreate,
    OutcomeResponse,
    OutcomeListResponse
)
from app.db import local_storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/outcomes", tags=["outcomes"])


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


def _resolve_outcome_forecast(
    incident_id: str,
    explicit: Dict[str, Any],
) -> tuple:
    """Resolve the stored decision-time forecast for an outcome row.

    Priority (never recomputes or defaults a probability):
    1. explicit usable pred_prob supplied on POST /outcomes -> "explicit";
    2. newest local decision trace for the incident with a usable pred_prob
       (persisted at approval time) -> "stored_decision_trace";
    3. Supabase incidents / route_approvals rows (migration 021 columns,
       written by the news ingestor) -> "stored_supabase";
    4. nothing usable -> (None, "missing").
    """
    if _coerce_pred(explicit.get("pred_prob")) is not None:
        return explicit, "explicit"

    try:
        for trace in local_storage.list_decision_traces(incident_id=incident_id, limit=10):
            if _coerce_pred(trace.get("pred_prob")) is not None:
                return {
                    "pred_prob": trace.get("pred_prob"),
                    "raw_prob": trace.get("raw_prob"),
                    "p_max": trace.get("p_max"),
                    "weights_version": trace.get("weights_version"),
                    "active_sources": trace.get("active_sources"),
                    "forecast_created_at": trace.get("forecast_created_at"),
                }, "stored_decision_trace"
    except Exception as e:
        logger.debug(f"Outcome forecast auto-join skipped local traces ({e})")

    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        for table in ("incidents", "route_approvals"):
            try:
                res = sb.table(table).select(
                    "pred_prob,raw_prob,p_max,weights_version,active_sources,forecast_created_at"
                ).eq("incident_id", incident_id).limit(5).execute()
                for row in (getattr(res, "data", None) or []):
                    if _coerce_pred((row or {}).get("pred_prob")) is not None:
                        return dict(row), "stored_supabase"
            except Exception as te:
                logger.debug(f"Outcome forecast auto-join skipped Supabase {table} ({te})")
                continue
    except Exception as e:
        logger.debug(f"Outcome forecast auto-join skipped Supabase ({e})")

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

    The stored-forecast columns may be absent from the remote schema cache
    (PGRST204). In that case the row still syncs WITHOUT the forecast bundle
    while the local mirror keeps the full pred provenance for the live
    aggregate — sync is never sacrificed for provenance.
    """
    try:
        return await asyncio.to_thread(
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
            return await asyncio.to_thread(
                lambda: sb.table(table).insert(slim).execute()
            )
        raise


def _response_pred_fields(item: Dict[str, Any]) -> Dict[str, Any]:
    """Coerce stored forecast provenance for OutcomeResponse (audit echo)."""
    fc = item.get("forecast_created_at")
    fc_dt = None
    if fc:
        try:
            fc_dt = fc if isinstance(fc, datetime) else datetime.fromisoformat(str(fc).replace("Z", "+00:00"))
        except Exception:
            fc_dt = None
    src = item.get("active_sources")
    if isinstance(src, str):
        try:
            import json as _json
            parsed = _json.loads(src)
            src = parsed if isinstance(parsed, list) else None
        except Exception:
            src = None
    if src is not None and not isinstance(src, list):
        src = None

    def _num(key: str) -> Optional[float]:
        try:
            val = item.get(key)
            return float(val) if val is not None and val != "" else None
        except (TypeError, ValueError):
            return None

    return {
        "pred_prob": _num("pred_prob"),
        "raw_prob": _num("raw_prob"),
        "p_max": _num("p_max"),
        "weights_version": item.get("weights_version"),
        "active_sources": src,
        "forecast_created_at": fc_dt,
    }


@router.post("", response_model=Dict[str, Any], status_code=status.HTTP_201_CREATED)
async def record_outcome(payload: OutcomeCreate):
    """
    Record a verified ground-truth field outcome for an incident.
    Persists to Supabase cloud with automatic fallback to local SQLite.
    """
    clearance_str = payload.actual_clearance_time.isoformat() if payload.actual_clearance_time else None
    # WS-LIVE: persist the stored decision-time forecast with the row so the
    # live aggregate (pred_prob in [0, 1] + non-echo source) can count it.
    # Omitted pred auto-joins from the linked decision/incident
    # forecast; rows that resolve to nothing stay NULL (missing_pred).
    explicit_forecast = {
        "pred_prob": payload.pred_prob,
        "raw_prob": payload.raw_prob,
        "p_max": payload.p_max,
        "weights_version": payload.weights_version,
        "active_sources": payload.active_sources,
        "forecast_created_at": payload.forecast_created_at.isoformat() if payload.forecast_created_at else None,
    }
    forecast, pred_source = _resolve_outcome_forecast(payload.incident_id, explicit_forecast)
    db_payload = {
        "incident_id": payload.incident_id,
        "horizon": payload.horizon.value,
        "actual_clearance_time": clearance_str,
        "observed_delay_hours": float(payload.observed_delay_hours),
        "actual_price_spike_pct": float(payload.actual_price_spike_pct),
        "verified_by": payload.verified_by,
        "verification_source": payload.verification_source.value,
        "notes": payload.notes or "",
        "sync_status": "synced",
        "pred_prob": (forecast or {}).get("pred_prob"),
        "raw_prob": (forecast or {}).get("raw_prob"),
        "p_max": (forecast or {}).get("p_max"),
        "weights_version": (forecast or {}).get("weights_version"),
        "active_sources": (forecast or {}).get("active_sources"),
        "forecast_created_at": (forecast or {}).get("forecast_created_at"),
    }

    # Attempt Supabase cloud write
    try:
        from app.db.supabase_client import get_client
        sb = get_client()

        result = await _insert_row_resilient(sb, "ground_truth_outcomes", db_payload)
        
        if result.data and len(result.data) > 0:
            item = result.data[0]
            record_id = str(item.get("id") or f"OUT-{payload.incident_id}")
            created_at = item.get("created_at") or datetime.now().isoformat()
            
            # Mirror locally as synced
            local_payload = dict(db_payload, id=record_id, created_at=created_at, sync_status="synced")
            local_storage.save_outcome(local_payload)
            
            logger.info(f"Ground-truth outcome logged in Supabase: id={record_id}")
            return {
                "id": record_id,
                "incident_id": payload.incident_id,
                "horizon": payload.horizon.value,
                "status": "success",
                "pred_source": pred_source,
                "pred_prob": db_payload.get("pred_prob"),
            }
    except Exception as e:
        logger.warning(f"Supabase unavailable for outcome log, persisting to local SQLite: {e}")

    # Offline / local storage fallback
    db_payload["sync_status"] = "pending"
    saved = local_storage.save_outcome(db_payload)
    logger.info(
        f"[OFFLINE-OUTCOME-LOG] incident={payload.incident_id} | horizon={payload.horizon.value} | delay={payload.observed_delay_hours}h"
    )
    return {
        "id": saved["id"],
        "incident_id": saved["incident_id"],
        "horizon": saved["horizon"],
        "status": "local_queued",
        "pred_source": pred_source,
        "pred_prob": db_payload.get("pred_prob"),
    }


@router.get("", response_model=OutcomeListResponse)
async def list_outcomes(
    incident_id: Optional[str] = Query(None, description="Filter by incident ID"),
    horizon: Optional[str] = Query(None, description="Filter by horizon (T+12h or T+24h)"),
    limit: int = Query(50, ge=1, le=100)
):
    """List ground-truth outcome verification records."""
    # Attempt cloud query first
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        
        query = sb.table("ground_truth_outcomes").select("*").order("created_at", desc=True).limit(limit)
        if incident_id:
            query = query.eq("incident_id", incident_id)
        if horizon:
            query = query.eq("horizon", horizon)
            
        result = await asyncio.to_thread(lambda: query.execute())
        items = result.data or []
        if items:
            responses = []
            for item in items:
                created_str = item.get("created_at") or datetime.now().isoformat()
                created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                clearance_dt = None
                if item.get("actual_clearance_time"):
                    try:
                        clearance_dt = datetime.fromisoformat(item["actual_clearance_time"].replace("Z", "+00:00"))
                    except Exception:
                        pass

                v_source = VerificationSource.FIELD_REPORT
                try:
                    v_source = VerificationSource(item.get("verification_source", "FIELD_REPORT"))
                except (ValueError, KeyError):
                    pass

                v_horizon = OutcomeHorizon.T_12H
                try:
                    v_horizon = OutcomeHorizon(item.get("horizon", "T+12h"))
                except (ValueError, KeyError):
                    pass

                responses.append(
                    OutcomeResponse(
                        id=str(item.get("id")),
                        incident_id=item.get("incident_id", "INC-DEFAULT"),
                        horizon=v_horizon,
                        actual_clearance_time=clearance_dt,
                        observed_delay_hours=float(item.get("observed_delay_hours", 0.0)),
                        actual_price_spike_pct=float(item.get("actual_price_spike_pct", 0.0)),
                        verified_by=item.get("verified_by", "anonymous"),
                        verification_source=v_source,
                        notes=item.get("notes"),
                        sync_status="synced",
                        created_at=created_dt,
                        **_response_pred_fields(item),
                    )
                )
            return OutcomeListResponse(items=responses, total=len(responses))
    except Exception as e:
        logger.debug(f"Supabase unavailable for list_outcomes, querying local SQLite: {e}")

    # Fallback to local SQLite
    local_items = local_storage.list_outcomes(incident_id=incident_id, horizon=horizon, limit=limit)
    responses = []
    for item in local_items:
        created_str = item.get("created_at") or datetime.now().isoformat()
        try:
            created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
        except Exception:
            created_dt = datetime.now()
            
        clearance_dt = None
        if item.get("actual_clearance_time"):
            try:
                clearance_dt = datetime.fromisoformat(item["actual_clearance_time"].replace("Z", "+00:00"))
            except Exception:
                pass

        v_source = VerificationSource.FIELD_REPORT
        try:
            v_source = VerificationSource(item.get("verification_source", "FIELD_REPORT"))
        except (ValueError, KeyError):
            pass

        v_horizon = OutcomeHorizon.T_12H
        try:
            v_horizon = OutcomeHorizon(item.get("horizon", "T+12h"))
        except (ValueError, KeyError):
            pass

        responses.append(
            OutcomeResponse(
                id=item["id"],
                incident_id=item["incident_id"],
                horizon=v_horizon,
                actual_clearance_time=clearance_dt,
                observed_delay_hours=float(item.get("observed_delay_hours", 0.0)),
                actual_price_spike_pct=float(item.get("actual_price_spike_pct", 0.0)),
                verified_by=item.get("verified_by", "operator-1"),
                verification_source=v_source,
                notes=item.get("notes"),
                sync_status=item.get("sync_status", "pending"),
                created_at=created_dt,
                **_response_pred_fields(item),
            )
        )
    return OutcomeListResponse(items=responses, total=len(responses))


@router.get("/evaluation/{incident_id}")
async def get_incident_evaluation(incident_id: str):
    """
    Get prediction vs. actual outcome evaluation and recalibration advisory for an incident.
    """
    from app.services.outcome_evaluation_service import evaluate_incident_outcome
    report = evaluate_incident_outcome(incident_id=incident_id)
    return report.model_dump()


@router.get("/benchmark/summary")
async def get_benchmark_outcomes_summary():
    """
    Evaluate closed-loop outcome prediction variance across benchmark scenarios.
    """
    from app.services.outcome_evaluation_service import evaluate_benchmark_outcomes
    return evaluate_benchmark_outcomes()
