"""
PetaNadi / LRIP : Corridor Data Aggregator Service
Aggregates real-time & cached telemetry from BMKG, TomTom, and PIHPS for corridor resilience analysis.
"""
import logging
import json
import asyncio
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.tomtom_adapter import TomTomAdapter
from app.scrapers.pihps_scraper import PIHPSScraper
from app.services.redis_client import get_redis
from app.db.supabase_client import get_client

logger = logging.getLogger(__name__)


CORRIDOR_NAMES = {
    "sumatra_belawan_medan": "Koridor Arteri Utama Belawan–Medan–Tebing Tinggi",
    "sumatra_riau_pekanbaru": "Koridor Logistik Riau–Dumai–Pekanbaru",
    "sumatra_sumbar_padang": "Koridor Maritim & Arteri Teluk Bayur–Padang–Bukittinggi",
    "sumatra_sumsel_palembang": "Koridor Lintas Timur Palembang–Boom Baru",
    "sumatra_lampung_bakauheni": "Koridor Gerbang Selat Sunda Bakauheni–Panjang–Terbanggi Besar",
    "sumatra_aceh_malahayati": "Koridor Pintu Masuk Aceh–Malahayati–Banda Aceh",
}

# In-memory cache for ultra-low latency (<5ms) repetitive reads
_CORRIDOR_CACHE: Dict[str, Dict[str, Any]] = {}
CORRIDOR_CACHE_TTL_SECONDS = 180.0


async def _sync_data_sources_status(bmkg_live: bool, tomtom_live: bool, pihps_live: bool):
    """Fire-and-forget sync of data source health in Supabase."""
    try:
        from app.db.supabase_client import get_write_client
        sb = get_write_client()
        now_iso = datetime.now(timezone.utc).isoformat()
        sb.table("data_sources").upsert([
            {"name": "bmkg", "status": "ok" if bmkg_live else "degraded", "updated_at": now_iso},
            {"name": "tomtom", "status": "ok" if tomtom_live else "degraded", "updated_at": now_iso},
            {"name": "pihps", "status": "ok" if pihps_live else "degraded", "updated_at": now_iso}
        ], on_conflict="name").execute()
    except Exception as e:
        logger.debug(f"Async data_sources sync suppressed: {e}")


async def get_corridor_context(corridor_id: str = "sumatra_belawan_medan", force_refresh: bool = False) -> Dict[str, Any]:
    """
    Aggregates real-time weather (BMKG), traffic congestion (TomTom), and commodity prices (PIHPS)
    for Sumatra logistics corridors with fast-path memory and Redis caching.
    """
    now_ts = datetime.now(timezone.utc).timestamp()
    cache_key = f"lrip:corridor:context:{corridor_id}"

    # 1. Fast-path: Check in-memory process cache first (<1ms)
    if not force_refresh and corridor_id in _CORRIDOR_CACHE:
        entry = _CORRIDOR_CACHE[corridor_id]
        if (now_ts - entry.get("timestamp_ts", 0)) < CORRIDOR_CACHE_TTL_SECONDS:
            logger.debug(f"Serving corridor context for '{corridor_id}' from in-memory cache")
            return entry["data"]

    # 2. Fast-path: Check distributed Redis cache (<10ms)
    if not force_refresh:
        try:
            r = get_redis()
            cached_json = r.get(cache_key) or r.get("lrip:corridor:context:latest")
            if cached_json:
                parsed = json.loads(cached_json)
                _CORRIDOR_CACHE[corridor_id] = {
                    "data": parsed,
                    "timestamp_ts": now_ts
                }
                logger.debug(f"Serving corridor context for '{corridor_id}' from Redis cache")
                return parsed
        except Exception as e:
            logger.debug(f"Redis cache check bypassed: {e}")

    logger.info(f"Aggregating corridor context for '{corridor_id}' from upstream adapters...")

    # Track whether each source delivered live data or fell back to seeds/cache
    fallback_reasons: List[str] = []
    bmkg_live = False
    tomtom_live = False
    pihps_live = False

    # Initialize default fallbacks
    weather_context = {
        "status": "MODERATE_RAIN",
        "rainfall_mm": 68.5,
        "visibility": "7 km",
        "alert_summary": "Peringatan Dini BMKG: Hujan Lebat Disertai Angin Kencang di Sektor Belawan-Medan",
        "code": 60,
        "location": "Medan-Belawan"
    }

    traffic_context = {
        "congestion_level_pct": 74.2,
        "delay_minutes": 35,
        "active_incidents": 2,
        "flow_speed_kmh": 22.5,
        "status": "HEAVY_CONGESTION",
        "checkpoints": [
            {"name": "Belawan Toll Gate", "speed": 18.0, "congestion_pct": 82.0, "status": "critical"},
            {"name": "Tanjung Mulia Interchange", "speed": 25.0, "congestion_pct": 65.0, "status": "medium"},
            {"name": "Binjai Km 18", "speed": 45.0, "congestion_pct": 30.0, "status": "low"}
        ]
    }

    commodity_context = {
        "chili_price": 48500,
        "rice_price": 14200,
        "cooking_oil_price": 18500,
        "price_anomaly_detected": True,
        "inflation_trend_pct": 12.8,
        "commodities": [
            {"name": "Cabai Merah", "price_idr": 48500, "deviation_pct": 18.2, "status": "spike"},
            {"name": "Beras Medium", "price_idr": 14200, "deviation_pct": 4.5, "status": "normal"},
            {"name": "Minyak Goreng", "price_idr": 18500, "deviation_pct": 6.8, "status": "elevated"}
        ]
    }

    # Parallel fetch: Run BMKG, TomTom, and PIHPS concurrently to cut latency
    async def _fetch_bmkg():
        bmkg = BMKGAdapter()
        raw = await bmkg.fetch()
        return await bmkg.parse(raw)

    async def _fetch_tomtom():
        tomtom = TomTomAdapter()
        return await tomtom.fetch()

    async def _fetch_pihps_db():
        sb = get_client()
        return await asyncio.to_thread(
            lambda: sb.table("commodity_prices").select("*").order("time", desc=True).limit(10).execute()
        )

    results = await asyncio.gather(
        _fetch_bmkg(),
        _fetch_tomtom(),
        _fetch_pihps_db(),
        return_exceptions=True
    )
    raw_bmkg_res, raw_tomtom_res, raw_pihps_res = results

    # 1. Process BMKG Weather Data
    if isinstance(raw_bmkg_res, Exception):
        fallback_reasons.append(f"bmkg: {raw_bmkg_res}")
        logger.warning(f"Failed to fetch live BMKG data for corridor context: {raw_bmkg_res}")
    else:
        events_weather = raw_bmkg_res
        bmkg_live = True
        if events_weather:
            latest_w = events_weather[0]
            weather_context["alert_summary"] = latest_w.get("title", weather_context["alert_summary"])
            weather_context["status"] = "SEVERE_WEATHER" if latest_w.get("severity") in ["high", "critical"] else "RAIN"
            weather_context["code"] = 95 if latest_w.get("severity") == "high" else 60

    weather_context["is_fallback"] = not bmkg_live
    if not bmkg_live:
        weather_context["status"] = "DEGRADED"
        weather_context["fallback_reason"] = "live BMKG fetch failed; seeded weather fallback in use"

    # 2. Process TomTom Traffic Data
    tomtom_degraded_reason = None
    if isinstance(raw_tomtom_res, Exception):
        tomtom_degraded_reason = str(raw_tomtom_res)
        logger.warning(f"Failed to fetch live TomTom data for corridor context: {raw_tomtom_res}")
    else:
        raw_traffic = raw_tomtom_res
        flow_items = raw_traffic.get("flow", []) if isinstance(raw_traffic, dict) else []
        incidents_items = raw_traffic.get("incidents", []) if isinstance(raw_traffic, dict) else []
        tomtom_degraded_reason = raw_traffic.get("degraded_reason") if isinstance(raw_traffic, dict) else None
        tomtom_live = bool(flow_items)

        if flow_items:
            total_congestion = 0.0
            total_speed = 0.0
            count = 0
            checkpoints = []

            for f in flow_items:
                seg = f.get("flowSegmentData", {})
                free_flow = seg.get("freeFlowSpeed", 60)
                curr = seg.get("currentSpeed", 30)
                name = f.get("_checkpoint_name", "Checkpoint")
                
                c_score = max(0.0, 1.0 - (curr / free_flow)) if free_flow > 0 else 0.0
                c_pct = round(c_score * 100, 1)
                
                status_cat = "low"
                if c_pct >= 70:
                    status_cat = "critical"
                elif c_pct >= 40:
                    status_cat = "medium"

                checkpoints.append({
                    "name": name,
                    "speed": curr,
                    "congestion_pct": c_pct,
                    "status": status_cat
                })
                total_congestion += c_pct
                total_speed += curr
                count += 1

            if count > 0:
                avg_cong = round(total_congestion / count, 1)
                avg_spd = round(total_speed / count, 1)
                traffic_context["congestion_level_pct"] = avg_cong
                traffic_context["flow_speed_kmh"] = avg_spd
                traffic_context["checkpoints"] = checkpoints
                traffic_context["active_incidents"] = len(incidents_items)
                traffic_context["delay_minutes"] = max(10, int(avg_cong * 0.5))
                traffic_context["status"] = "HEAVY_CONGESTION" if avg_cong > 60 else "MODERATE_CONGESTION"

    traffic_context["is_fallback"] = not tomtom_live
    if not tomtom_live:
        traffic_context["status"] = "DEGRADED"
        traffic_context["fallback_reason"] = tomtom_degraded_reason or "no live TomTom flow data; seeded speeds in use"
        fallback_reasons.append(f"tomtom: {traffic_context['fallback_reason']}")

    # 3. Process PIHPS Commodity Prices
    if isinstance(raw_pihps_res, Exception):
        logger.debug(f"Supabase commodity query fallback: {raw_pihps_res}")
    else:
        res = raw_pihps_res
        if hasattr(res, "data") and res.data and len(res.data) > 0:
            prices_by_comm = {}
            for item in res.data:
                c_name = item.get("commodity")
                price = float(item.get("price_idr", 0))
                if c_name and c_name not in prices_by_comm and price > 0:
                    prices_by_comm[c_name] = price
            
            if "cabai_merah" in prices_by_comm:
                commodity_context["chili_price"] = prices_by_comm["cabai_merah"]
            if "beras" in prices_by_comm:
                commodity_context["rice_price"] = prices_by_comm["beras"]
            if "minyak_goreng" in prices_by_comm:
                commodity_context["cooking_oil_price"] = prices_by_comm["minyak_goreng"]
            pihps_live = True

    commodity_context["is_fallback"] = not pihps_live
    if not pihps_live:
        commodity_context["fallback_reason"] = "commodity_prices query returned no rows; seeded price fallback in use"
        fallback_reasons.append("pihps: no live commodity price rows")

    # 4. Fire-and-forget sync of data source health in Supabase (non-blocking)
    try:
        asyncio.create_task(_sync_data_sources_status(bmkg_live, tomtom_live, pihps_live))
    except Exception as e:
        logger.debug(f"Failed to dispatch async status sync: {e}")

    live_sources = sum([bmkg_live, tomtom_live, pihps_live])

    result_payload = {
        "corridor_id": corridor_id,
        "corridor_name": CORRIDOR_NAMES.get(corridor_id, f"Koridor Logistik Terpadu Sumatera ({corridor_id})"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "is_fallback": bool(fallback_reasons),
        "fallback_reasons": fallback_reasons,
        "weather": weather_context,
        "traffic": traffic_context,
        "commodity_prices": commodity_context,
        "data_integrity": {
            "bmkg_status": "ONLINE" if bmkg_live else "DEGRADED",
            "tomtom_status": "ONLINE" if tomtom_live else "DEGRADED",
            "pihps_status": "ONLINE" if pihps_live else "DEGRADED",
            "consensus_confidence": round(0.92 * live_sources / 3.0, 2)
        }
    }

    # Store in memory process cache
    _CORRIDOR_CACHE[corridor_id] = {
        "data": result_payload,
        "timestamp_ts": now_ts
    }

    # Cache in Redis if available
    try:
        r = get_redis()
        r.set(cache_key, json.dumps(result_payload), ex=300)
        r.set("lrip:corridor:context:latest", json.dumps(result_payload), ex=300)
    except Exception:
        pass

    return result_payload
