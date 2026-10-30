import asyncio
import json
import logging
from collections.abc import Callable, Coroutine
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, TypeVar

from fastapi import APIRouter, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/commodities", tags=["commodities"])

# Phase 5 perf: short-lived caches so the 60s-window dashboard polling
# (prices + spikes) rarely re-scans commodity_prices.
_COMMODITY_CACHE_TTL_SECONDS = 60
_PRICES_CACHE_PREFIX = "lrip:cache:commodity:prices:"
_SPIKES_CACHE_PREFIX = "lrip:cache:commodity:spikes:"
_T = TypeVar("_T")
_INFLIGHT_CACHE_LOADS: Dict[tuple[int, str], asyncio.Task] = {}


async def _singleflight(
    cache_key: str, loader: Callable[[], Coroutine[Any, Any, _T]]
) -> _T:
    """Share one cache-miss load among concurrent requests in this event loop."""
    loop = asyncio.get_running_loop()
    flight_key = (id(loop), cache_key)
    task = _INFLIGHT_CACHE_LOADS.get(flight_key)
    if task is None or task.done():
        task = loop.create_task(loader())
        _INFLIGHT_CACHE_LOADS[flight_key] = task

        def _cleanup(
            completed: asyncio.Task[Any], key: tuple[int, str] = flight_key
        ) -> None:
            if _INFLIGHT_CACHE_LOADS.get(key) is completed:
                _INFLIGHT_CACHE_LOADS.pop(key, None)
            if not completed.cancelled():
                completed.exception()

        task.add_done_callback(_cleanup)
    return await asyncio.shield(task)


def _resolve_default(value: Any) -> Any:
    return getattr(value, "default", value)


def _prices_cache_key(commodity: Any, region: Any, limit: Any) -> str:
    clean_commodity = commodity.strip() if isinstance(commodity, str) and commodity.strip() else None
    clean_region = region.strip() if isinstance(region, str) and region.strip() else None
    try:
        clean_limit = int(limit)
    except (TypeError, ValueError):
        clean_limit = 30
    return f"{_PRICES_CACHE_PREFIX}{clean_commodity or 'all'}:{clean_region or 'agg'}:{clean_limit}"


def _spikes_cache_key(region: Any) -> str:
    clean_region = region.strip() if isinstance(region, str) and region.strip() else None
    return f"{_SPIKES_CACHE_PREFIX}{clean_region or 'all'}"


def _cache_read(key: str) -> Optional[str]:
    try:
        from app.services.redis_client import cache_get

        return cache_get(key)
    except Exception as exc:
        logger.debug(f"Commodity cache read skipped: {exc}")
        return None


def _cache_write(key: str, value: str) -> None:
    try:
        from app.services.redis_client import cache_set

        cache_set(key, value, ex=_COMMODITY_CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.debug(f"Commodity cache write skipped: {exc}")


def clear_commodity_cache() -> None:
    """Drop all cached commodity prices/spikes entries (tests + admin use)."""
    try:
        import app.services.redis_client as _rc

        for prefix in (_PRICES_CACHE_PREFIX, _SPIKES_CACHE_PREFIX):
            for key in [k for k in list(_rc._mem_kv) if k.startswith(prefix)]:
                _rc._mem_kv.pop(key, None)
                _rc._mem_expire.pop(key, None)
    except Exception:
        pass
    try:
        from app.services.redis_client import get_redis

        r = get_redis()
        for prefix in (_PRICES_CACHE_PREFIX, _SPIKES_CACHE_PREFIX):
            cursor = 0
            while True:
                cursor, keys = r.scan(cursor=cursor, match=f"{prefix}*", count=100)
                if keys:
                    r.delete(*keys)
                if cursor == 0:
                    break
    except Exception as exc:
        logger.debug(f"Commodity cache clear skipped: {exc}")


def _rpc_window_means(sb, since_iso: str, region: Optional[str]) -> Optional[Dict[tuple, tuple]]:
    """One-call SQL baseline means via `commodity_baseline_means` (migration 022).

    Returns {(commodity, region): (mean_price, n)} or None when the RPC is
    unavailable — callers fall back to the Python mean over fetched rows.
    """
    try:
        params = {"p_since": since_iso, "p_region": region}
        resp = sb.rpc("commodity_baseline_means", params).execute()
        out: Dict[tuple, tuple] = {}
        for row in resp.data or []:
            try:
                out[(row["commodity"], row.get("region", "north_sumatra"))] = (
                    float(row["mean_price"]),
                    int(row["n"]),
                )
            except (KeyError, TypeError, ValueError):
                continue
        return out
    except Exception as exc:
        logger.debug(f"commodity_baseline_means RPC unavailable, using Python mean: {exc}")
        return None


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
    key = _prices_cache_key(
        _resolve_default(commodity), _resolve_default(region), _resolve_default(limit)
    )
    return await _singleflight(
        key,
        lambda: _get_commodity_prices(commodity=commodity, region=region, limit=limit),
    )


async def _get_commodity_prices(
    commodity: Optional[str] = Query(None, description="Filter by commodity name (e.g. beras, cabai_merah)"),
    region: Optional[str] = Query(None, description="Filter by region (e.g. north_sumatra, medan)"),
    limit: int = Query(30, ge=1, le=100)
):
    """
    Get commodity price history from Supabase (TimescaleDB).
    Falls back to generating realistic mock data if Supabase is offline.
    """
    # Resolve FastAPI Query defaults when invoked directly as a Python function
    commodity = _resolve_default(commodity)
    region = _resolve_default(region)
    limit = _resolve_default(limit)

    clean_commodity = commodity.strip() if isinstance(commodity, str) and commodity.strip() else None
    clean_region = region.strip() if isinstance(region, str) and region.strip() else None
    try:
        clean_limit = int(limit)
    except (TypeError, ValueError):
        clean_limit = 30

    # Phase 5 perf: cache the exact (commodity, region, limit) response 60s.
    cache_key = _prices_cache_key(clean_commodity, clean_region, clean_limit)
    cached_raw = await asyncio.to_thread(_cache_read, cache_key)
    if cached_raw:
        try:
            return CommodityPriceResponse(**json.loads(cached_raw))
        except Exception:
            pass

    try:
        from app.db.supabase_client import get_client
        sb = get_client()

        # Check if aggregate mode across Sumatra is requested (region is None or empty)
        is_aggregate = clean_region is None

        if is_aggregate:
            # Multi-region aggregation: fetch candidate rows (limit * 10 to cover 8 provinces,
            # capped at 300 — was 1000; the per-(date, commodity) top-K only needs a small window).
            fetch_limit = min(clean_limit * 10, 300)
            query = sb.table("commodity_prices").select("*").order("time", desc=True).limit(fetch_limit)
            if clean_commodity:
                query = query.eq("commodity", clean_commodity)

            result = await asyncio.to_thread(lambda: query.execute())
            items = result.data or []

            if len(items) > 0:
                from collections import defaultdict
                grouped: Dict[tuple, List[Dict[str, Any]]] = defaultdict(list)
                for item in items:
                    t_val = item.get("time")
                    if not t_val:
                        continue
                    try:
                        if isinstance(t_val, datetime):
                            dt = t_val if t_val.tzinfo else t_val.replace(tzinfo=timezone.utc)
                        else:
                            dt = datetime.fromisoformat(str(t_val).replace("Z", "+00:00"))
                        comm_key = item.get("commodity") or (clean_commodity or "beras")
                        grouped[(dt.date(), comm_key)].append((dt, item))
                    except Exception:
                        continue

                sorted_keys = sorted(grouped.keys(), key=lambda k: k[0], reverse=True)
                top_keys = sorted_keys[:clean_limit]

                aggregate_items: List[PricePoint] = []
                for (dt_date, comm_key) in top_keys:
                    records = grouped[(dt_date, comm_key)]

                    # Deduplicate by province/region for this date so each reporting province has equal weight
                    by_province: Dict[str, float] = {}
                    for r in records:
                        prov = r[1].get("region") or "unknown"
                        try:
                            val = float(r[1].get("price_idr", 0))
                            if val > 0:
                                by_province[prov] = val
                        except (ValueError, TypeError):
                            continue

                    if not by_province:
                        continue

                    prices = list(by_province.values())
                    avg_price = round(sum(prices) / len(prices), 2)
                    latest_dt = max(r[0] for r in records)
                    src = records[0][1].get("source") or "pihps"

                    aggregate_items.append(
                        PricePoint(
                            time=latest_dt,
                            commodity=comm_key,
                            region="sumatra_aggregate",
                            price_idr=avg_price,
                            source=src,
                            metadata={
                                "province": "Seluruh Sumatera (Agregat PIHPS)",
                                "market": "Pasar Tradisional 8 Provinsi",
                                "sample_count": len(prices),
                            }
                        )
                    )

                resp = CommodityPriceResponse(
                    items=aggregate_items,
                    total=len(aggregate_items)
                )
                await asyncio.to_thread(_cache_write, cache_key, resp.model_dump_json())
                return resp

        else:
            query = sb.table("commodity_prices").select("*").order("time", desc=True).limit(clean_limit)
            if clean_commodity:
                query = query.eq("commodity", clean_commodity)
            query = query.eq("region", clean_region)

            result = await asyncio.to_thread(lambda: query.execute())
            items = result.data or []

            if len(items) > 0:
                resp = CommodityPriceResponse(
                    items=[
                        PricePoint(
                            time=(
                                item["time"]
                                if isinstance(item["time"], datetime)
                                else datetime.fromisoformat(str(item["time"]).replace("Z", "+00:00"))
                            ),
                            commodity=item["commodity"],
                            region=item["region"],
                            price_idr=float(item["price_idr"]),
                            source=item["source"],
                            metadata=item.get("metadata") or {}
                        ) for item in items
                    ],
                    total=len(items)
                )
                await asyncio.to_thread(_cache_write, cache_key, resp.model_dump_json())
                return resp

    except Exception as e:
        logger.warning(f"Error querying commodity_prices from Supabase: {e}")

    # Honest empty response when no historical records exist in database
    return CommodityPriceResponse(items=[], total=0)


@router.get("/spikes")
async def get_commodity_spikes(
    region: Optional[str] = Query(None, description="Filter by region")
):
    key = _spikes_cache_key(_resolve_default(region))
    return await _singleflight(
        key, lambda: _get_commodity_spikes(region=region)
    )


async def _get_commodity_spikes(
    region: Optional[str] = Query(None, description="Filter by region")
):
    """
    Returns detected price spike anomalies for active regional food commodities.
    Per D5: computes percent change vs 30-day baseline from Supabase commodity_prices
    with a minimum-records guard (>= 3 records in 30-day window per commodity),
    returning an honest empty list if data is insufficient.
    """
    # Resolve FastAPI Query defaults when invoked directly as a Python function
    region = _resolve_default(region)
    clean_region = region.strip() if isinstance(region, str) and region.strip() else None

    MIN_RECORDS_GUARD = 3
    spikes: List[Dict[str, Any]] = []

    # Phase 5 perf: spikes response cached 60s per region filter.
    spikes_key = _spikes_cache_key(clean_region)
    cached_spikes = await asyncio.to_thread(_cache_read, spikes_key)
    if cached_spikes:
        try:
            return json.loads(cached_spikes)
        except Exception:
            pass

    try:
        from app.db.supabase_client import get_client
        sb = get_client()

        now = datetime.now(timezone.utc)
        thirty_days_ago = (now - timedelta(days=30)).isoformat()

        # Phase 5 perf: window capped at 300 rows (was 1000) — the grouped
        # baseline only needs a small recent window per commodity.
        query = sb.table("commodity_prices").select("*").gte("time", thirty_days_ago).order("time", desc=True).limit(300)
        if clean_region:
            query = query.eq("region", clean_region)

        result = await asyncio.to_thread(lambda: query.execute())
        items = result.data or []

        # SQL-first baseline means (one RPC for the whole 30-day window);
        # falls back to the Python mean over fetched rows when unavailable.
        sql_means = await asyncio.to_thread(
            _rpc_window_means, sb, thirty_days_ago, clean_region
        )

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

            baseline_price: Optional[float] = None
            if sql_means is not None and (commodity_name, reg) in sql_means:
                mean_val, mean_n = sql_means[(commodity_name, reg)]
                if mean_n >= MIN_RECORDS_GUARD and mean_val > 0:
                    baseline_price = mean_val

            if baseline_price is None:
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

    payload = {"spikes": spikes, "total": len(spikes)}
    await asyncio.to_thread(
        _cache_write, spikes_key, json.dumps(payload, default=str)
    )
    return payload
