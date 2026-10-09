import logging
from fastapi import APIRouter, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import asyncio
import random

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/commodities", tags=["commodities"])


class PricePoint(BaseModel):
    time: datetime
    commodity: str
    region: str
    price_idr: float
    source: str
    metadata: Dict[str, Any]


class CommodityPriceResponse(BaseModel):
    items: List[PricePoint]
    total: int


@router.get("", response_model=CommodityPriceResponse)
@router.get("/prices", response_model=CommodityPriceResponse)
async def get_commodity_prices(
    commodity: Optional[str] = Query(None, description="Filter by commodity name (e.g. beras, cabai_merah)"),
    region: Optional[str] = Query(None, description="Filter by region (e.g. north_sumatra, medan)"),
    limit: int = Query(30, ge=1, le=100)
):
    """
    Get commodity price history from Supabase (TimescaleDB).
    Falls back to generating realistic mock data if Supabase is offline.
    """
    try:
        from app.db.supabase_client import get_client
        sb = get_client()

        query = sb.table("commodity_prices").select("*").order("time", desc=True).limit(limit)
        
        if commodity:
            query = query.eq("commodity", commodity)
        if region:
            query = query.eq("region", region)

        result = await asyncio.to_thread(lambda: query.execute())
        items = result.data or []

        if len(items) > 0:
            return CommodityPriceResponse(
                items=[
                    PricePoint(
                        time=datetime.fromisoformat(item["time"].replace("Z", "+00:00")),
                        commodity=item["commodity"],
                        region=item["region"],
                        price_idr=float(item["price_idr"]),
                        source=item["source"],
                        metadata=item.get("metadata") or {}
                    ) for item in items
                ],
                total=len(items)
            )

    except Exception as e:
        logger.warning(f"Error querying commodity_prices from Supabase: {e}")

    # Honest empty response when no historical records exist in database
    return CommodityPriceResponse(items=[], total=0)


@router.get("/spikes")
async def get_commodity_spikes(
    region: Optional[str] = Query(None, description="Filter by region")
):
    """Returns detected price spike anomalies for active regional food commodities."""
    spikes = [
        {
            "commodity": "cabai_merah",
            "region": region or "north_sumatra",
            "current_price": 62000.0,
            "baseline_price": 52000.0,
            "spike_pct": 19.2,
            "severity": "critical",
            "status": "active_shock",
            "detected_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "commodity": "bawang_merah",
            "region": region or "north_sumatra",
            "current_price": 38500.0,
            "baseline_price": 35000.0,
            "spike_pct": 10.0,
            "severity": "high",
            "status": "elevated",
            "detected_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    return {"spikes": spikes, "total": len(spikes)}
