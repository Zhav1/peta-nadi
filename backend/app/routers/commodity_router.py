import logging
from fastapi import APIRouter, Query, status
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
from datetime import datetime, timedelta, timezone
import asyncio

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
    """
    Returns detected price spike anomalies for active regional food commodities.
    Per D5: computes percent change vs 30-day baseline from Supabase commodity_prices
    with a minimum-records guard (>= 3 records in 30-day window per commodity),
    returning an honest empty list if data is insufficient.
    """
    MIN_RECORDS_GUARD = 3
    spikes: List[Dict[str, Any]] = []

    try:
        from app.db.supabase_client import get_client
        sb = get_client()

        now = datetime.now(timezone.utc)
        thirty_days_ago = (now - timedelta(days=30)).isoformat()

        query = sb.table("commodity_prices").select("*").gte("time", thirty_days_ago).order("time", desc=True).limit(500)
        if region:
            query = query.eq("region", region)

        result = await asyncio.to_thread(lambda: query.execute())
        items = result.data or []

        # Group by commodity (and region if not explicitly filtered)
        grouped: Dict[tuple, List[Dict[str, Any]]] = {}
        for item in items:
            key = (item["commodity"], item.get("region", "north_sumatra"))
            if key not in grouped:
                grouped[key] = []
            grouped[key].append(item)

        for (commodity_name, reg), records in grouped.items():
            if len(records) < MIN_RECORDS_GUARD:
                continue

            # First record is latest because of order("time", desc=True)
            current_record = records[0]
            try:
                current_price = float(current_record["price_idr"])
            except (ValueError, TypeError):
                continue

            baseline_prices = []
            for r in records:
                try:
                    p = float(r.get("price_idr", 0))
                    if p > 0:
                        baseline_prices.append(p)
                except (ValueError, TypeError):
                    continue

            if len(baseline_prices) < MIN_RECORDS_GUARD:
                continue

            baseline_price = sum(baseline_prices) / len(baseline_prices)
            if baseline_price <= 0:
                continue

            spike_pct = ((current_price - baseline_price) / baseline_price) * 100.0

            if spike_pct >= 5.0:
                if spike_pct >= 15.0:
                    severity = "critical"
                    status = "active_shock"
                elif spike_pct >= 10.0:
                    severity = "high"
                    status = "elevated"
                else:
                    severity = "medium"
                    status = "warning"

                spikes.append({
                    "commodity": commodity_name,
                    "region": reg,
                    "current_price": round(current_price, 2),
                    "baseline_price": round(baseline_price, 2),
                    "spike_pct": round(spike_pct, 1),
                    "severity": severity,
                    "status": status,
                    "detected_at": current_record.get("time") or now.isoformat()
                })

    except Exception as e:
        logger.warning(f"Error querying commodity_prices for spikes: {e}")

    return {"spikes": spikes, "total": len(spikes)}
