"""
FastAPI router for North Sumatra Logistics Corridor context & aggregated telemetry.
"""
import logging
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any

from app.services.corridor_service import get_corridor_context

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Corridor Telemetry & Context"])


@router.get("/corridor/context")
async def fetch_corridor_context(
    corridor_id: str = Query("sumatra_belawan_medan", description="ID of the logistics corridor")
) -> Dict[str, Any]:
    """
    Returns live aggregated context for the specified corridor, combining
    BMKG weather, TomTom traffic flow, and PIHPS food inflation data.
    """
    try:
        context = await get_corridor_context(corridor_id)
        return context
    except Exception as e:
        logger.error(f"Error fetching corridor context for '{corridor_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
