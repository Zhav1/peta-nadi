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
        logger.warning(f"Supabase unavailable for commodity prices query, generating mock response: {e}")

    # Offline/fallback mode: Generate realistic mock prices
    mock_items = []
    base_prices = {
        "beras": 14000.0,
        "minyak_goreng": 17000.0,
        "cabai_merah": 55000.0,
        "cabai_rawit": 60000.0,
        "bawang_merah": 35000.0,
        "bawang_putih": 40000.0,
        "telur_ayam": 28000.0,
        "gula_pasir": 18000.0
    }
    
    target_commodity = commodity or "beras"
    target_region = region or "north_sumatra"
    base_price = base_prices.get(target_commodity, 20000.0)
    
    now = datetime.now(timezone.utc)
    for i in range(limit):
        day_offset = limit - 1 - i
        timestamp = now - timedelta(days=day_offset)
        random.seed(day_offset + hash(target_commodity))
        fluctuation = (random.random() - 0.5) * (base_price * 0.05) # max 5% volatility
        price = round(base_price + fluctuation, 2)
        
        mock_items.append(
            PricePoint(
                time=timestamp,
                commodity=target_commodity,
                region=target_region,
                price_idr=price,
                source="pihps_mock",
                metadata={"status": "mocked_fallback"}
            )
        )

    # Sort descending (newest first)
    mock_items.reverse()

    return CommodityPriceResponse(items=mock_items, total=len(mock_items))
