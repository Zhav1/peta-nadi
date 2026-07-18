from fastapi import APIRouter
from app.config import get_settings
from typing import List, Dict, Any, Optional
import logging
import asyncio

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """System health check endpoint."""
    return {
        "status": "ok",
        "version": settings.version,
        "environment": settings.environment,
        "service": "lrip-petanadi-api",
    }


@router.get("/api/v1/health/sources")
async def source_health_check():
    """
    Get per-source health status from Supabase 'data_sources' table.
    Falls back gracefully if Supabase is offline.
    """
    default_sources = [
        {"name": "BMKG", "status": "unknown", "last_seen": None},
        {"name": "TomTom", "status": "unknown", "last_seen": None},
        {"name": "AISstream", "status": "unknown", "last_seen": None},
        {"name": "NASA FIRMS", "status": "unknown", "last_seen": None},
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
                    "status": "unknown",
                    "last_seen": None
                })
                
        return {"sources": sources}
        
    except Exception as e:
        logger.warning(f"Supabase unavailable, returning unknown status for sources: {e}")
        return {"sources": default_sources}

