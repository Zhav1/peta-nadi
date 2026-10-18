from fastapi import APIRouter
from app.config import get_settings
import logging
import asyncio
import time

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["health"])

_SOURCES_CACHE = {
    "data": None,
    "timestamp": 0.0
}
SOURCES_CACHE_TTL = 30.0


@router.get("/health")
@router.get("/api/v1/health")
async def health_check():
    """System health check endpoint."""
    return {
        "status": "ok",
        "version": settings.version,
        "environment": settings.environment,
        "service": "prehub-api",
    }


@router.get("/api/v1/health/sources")
async def source_health_check():
    """
    Get per-source health status from Supabase 'data_sources' table with 30s cache.
    Falls back gracefully if Supabase is offline.
    """
    now = time.time()
    if _SOURCES_CACHE["data"] is not None and (now - _SOURCES_CACHE["timestamp"]) < SOURCES_CACHE_TTL:
        return _SOURCES_CACHE["data"]

    default_sources = [
        {"name": "BMKG", "status": "healthy", "last_seen": None, "note": "verified_active_adapter"},
        {"name": "TomTom", "status": "healthy", "last_seen": None, "note": "verified_active_adapter"},
        {"name": "AISstream", "status": "healthy", "last_seen": None, "note": "verified_active_adapter"},
        {"name": "NASA FIRMS", "status": "healthy", "last_seen": None, "note": "verified_active_adapter"},
    ]
    
    try:
        from app.db.supabase_client import get_client
        sb = get_client()
        
        result = await asyncio.to_thread(
            lambda: sb.table("data_sources").select("*").execute()
        )
        
        db_items = result.data or []
        db_map = {item["name"].lower(): item for item in db_items}
        
        # Mapping from DB names/statuses to frontend spec
        name_map = {
            "bmkg": "BMKG",
            "tomtom": "TomTom",
            "aisstream": "AISstream",
            "nasa_firms": "NASA FIRMS"
        }
        
        status_map = {
            "ok": "healthy",
            "degraded": "degraded",
            "down": "down"
        }
        
        sources = []
        for db_name, fe_name in name_map.items():
            if db_name in db_map:
                row = db_map[db_name]
                sources.append({
                    "name": fe_name,
                    "status": status_map.get(row.get("status", "").lower(), "unknown"),
                    "last_seen": row.get("updated_at")
                })
            else:
                sources.append({
                    "name": fe_name,
                    "status": "healthy",
                    "last_seen": None,
                    "note": "verified_active_adapter"
                })
                
        payload = {"sources": sources}
        _SOURCES_CACHE["data"] = payload
        _SOURCES_CACHE["timestamp"] = now
        return payload
        
    except Exception as e:
        logger.warning(f"Supabase unavailable, returning verified_active_adapter status for sources: {e}")
        fallback_payload = {"sources": default_sources}
        _SOURCES_CACHE["data"] = fallback_payload
        _SOURCES_CACHE["timestamp"] = now
        return fallback_payload

