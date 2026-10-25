"""BNPB disaster events router — honest [] when the feed is unavailable.

GET /api/v1/bnpb/events has no required params (optional `limit` only).
Reads the adapter's last-known-good Redis cache (lrip:state:source:bnpb);
never 500s, never fabricates bulletins.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bnpb", tags=["BNPB Disaster Events"])


@router.get("/events")
async def get_bnpb_events(
    limit: int = Query(50, ge=1, le=200, description="Max events to return"),
) -> Dict[str, Any]:
    events: List[Dict[str, Any]] = []
    updated_at: Optional[str] = None
    try:
        from app.services.redis_client import SOURCE_CACHE_PREFIX, get_redis
        r = get_redis()
        raw = r.get(f"{SOURCE_CACHE_PREFIX}bnpb")
        if raw:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                events = [e for e in parsed if isinstance(e, dict)][:limit]
                # Honest timestamp: newest event ts, never now() when data exists.
                newest: Optional[str] = None
                for e in events:
                    ts = str(e.get("ts") or "")
                    if ts and (newest is None or ts > newest):
                        newest = ts
                updated_at = newest
    except Exception as e:
        logger.debug(f"BNPB events cache read failed: {e}")
    if not events:
        return {
            "events": [],
            "total": 0,
            "status": "unavailable",
            "reason": "BNPB DIBI/bulletin feed unreachable — poller 1h cadence, retrying (never fabricated)",
            "source": "bnpb.go.id/DIBI",
            "updated_at": updated_at,
        }
    return {
        "events": events,
        "total": len(events),
        "status": "ok",
        "reason": None,
        "source": "bnpb.go.id/DIBI",
        "updated_at": updated_at or datetime.now(timezone.utc).isoformat(),
    }
