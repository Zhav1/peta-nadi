"""Cache-only BNPB events endpoint.

The observed-disaster coordinator writes the versioned source envelope. This
router never contacts BNPB; a healthy cached empty is distinct from a failed
refresh whose last-good events are being served stale.
"""
import json
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bnpb", tags=["BNPB Disaster Events"])
OBSERVED_BNPB_CACHE_KEY = "lrip:state:observed_disasters:source:bnpb:v1"
LEGACY_BNPB_CACHE_KEY = "lrip:state:source:bnpb"
BNPB_SOURCE_URL = "https://data.bnpb.go.id/"
BNPB_ATTRIBUTION = "BNPB (Badan Nasional Penanggulangan Bencana)"


def _json_value(raw: Any) -> Any:
    if isinstance(raw, bytes):
        raw = raw.decode("utf-8", errors="replace")
    try:
        return json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, ValueError):
        return None


def _event_timestamp(events: List[Dict[str, Any]]) -> Optional[str]:
    timestamps = [str(event.get("ts")) for event in events if event.get("ts")]
    return max(timestamps) if timestamps else None


def _public_events(items: list[Any]) -> List[Dict[str, Any]]:
    events = []
    for item in items:
        if not isinstance(item, dict):
            continue
        event = dict(item)
        # BNPB's supported products do not provide event-footprint radii.
        event.pop("radius_km", None)
        events.append(event)
    return events


@router.get("/events")
async def get_bnpb_events(
    limit: int = Query(50, ge=1, le=200, description="Max events to return"),
) -> Dict[str, Any]:
    state = None
    legacy_exists = False
    try:
        from app.services.redis_client import cache_get
        state = _json_value(cache_get(OBSERVED_BNPB_CACHE_KEY))
        if isinstance(state, list):
            legacy_exists = True
        if state is None:
            legacy = cache_get(LEGACY_BNPB_CACHE_KEY)
            legacy_exists = legacy is not None
            state = _json_value(legacy)
    except Exception as exc:
        logger.debug("BNPB cache read failed: %s", exc)

    limit_value = limit if isinstance(limit, int) else 50
    if isinstance(state, dict) and isinstance(state.get("items"), list):
        events = _public_events(state["items"])
        status = str(state.get("status") or "unavailable")
        if status not in {"ok", "degraded", "disabled", "budget_unavailable"}:
            status = "unavailable"
        last_success_at = state.get("last_success_at")
        return {
            "events": events[:limit_value],
            "total": len(events),
            "status": status,
            "stale": bool(state.get("stale", status != "ok")),
            "reason": state.get("error_status") if status == "degraded" else None,
            "source": BNPB_SOURCE_URL,
            "attribution": BNPB_ATTRIBUTION,
            "updated_at": last_success_at or _event_timestamp(events),
        }

    # Compatibility for the pre-envelope cache; its age cannot be established.
    if isinstance(state, list) and legacy_exists:
        events = _public_events(state)
        return {
            "events": events[:limit_value],
            "total": len(events),
            "status": "ok" if events else "unavailable",
            "stale": bool(events),
            "reason": "legacy cache freshness is unknown" if events else "no cached events",
            "source": BNPB_SOURCE_URL,
            "attribution": BNPB_ATTRIBUTION,
            "updated_at": _event_timestamp(events),
        }

    return {
        "events": [],
        "total": 0,
        "status": "unavailable",
        "stale": True,
        "reason": "No cached BNPB refresh is available",
        "source": BNPB_SOURCE_URL,
        "attribution": BNPB_ATTRIBUTION,
        "updated_at": None,
    }
