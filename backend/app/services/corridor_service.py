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

async def get_corridor_context(corridor_id: str = "sumatra_belawan_medan") -> Dict[str, Any]:
    """
    Aggregates real-time weather (BMKG), traffic congestion (TomTom), and commodity prices (PIHPS)
    for Sumatra logistics corridors.
    """
    logger.info(f"Aggregating corridor context for '{corridor_id}'...")

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

    # 1. Gather BMKG Weather Data
    try:
        bmkg = BMKGAdapter()
        raw_weather = await bmkg.fetch()
        events_weather = await bmkg.parse(raw_weather)
        bmkg_live = True
        if events_weather:
            latest_w = events_weather[0]
            weather_context["alert_summary"] = latest_w.get("title", weather_context["alert_summary"])
            weather_context["status"] = "SEVERE_WEATHER" if latest_w.get("severity") in ["high", "critical"] else "RAIN"
            weather_context["code"] = 95 if latest_w.get("severity") == "high" else 60
    except Exception as e:
        fallback_reasons.append(f"bmkg: {e}")
        logger.warning(f"Failed to fetch live BMKG data for corridor context: {e}")
    weather_context["is_fallback"] = not bmkg_live
    if not bmkg_live:
        weather_context["status"] = "DEGRADED"
        weather_context["fallback_reason"] = "live BMKG fetch failed; seeded weather fallback in use"

    # 2. Gather TomTom Traffic Data
    tomtom_degraded_reason = None
    try:
        tomtom = TomTomAdapter()
        raw_traffic = await tomtom.fetch()
        events_traffic = await tomtom.parse(raw_traffic)
        
        flow_items = raw_traffic.get("flow", [])
        incidents_items = raw_traffic.get("incidents", [])
        tomtom_degraded_reason = raw_traffic.get("degraded_reason")
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
    except Exception as e:
        tomtom_degraded_reason = str(e)
        logger.warning(f"Failed to fetch live TomTom data for corridor context: {e}")

    traffic_context["is_fallback"] = not tomtom_live
    if not tomtom_live:
        traffic_context["status"] = "DEGRADED"
        traffic_context["fallback_reason"] = tomtom_degraded_reason or "no live TomTom flow data; seeded speeds in use"
        fallback_reasons.append(f"tomtom: {traffic_context['fallback_reason']}")

    # 3. Gather PIHPS Commodity Prices & Database Table Sync
    try:
        sb = get_client()
        res = sb.table("commodity_prices").select("*").order("time", desc=True).limit(10).execute()
        if res.data and len(res.data) > 0:
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
    except Exception as e:
        logger.debug(f"Supabase commodity query fallback: {e}")

    commodity_context["is_fallback"] = not pihps_live
    if not pihps_live:
        commodity_context["fallback_reason"] = "commodity_prices query returned no rows; seeded price fallback in use"
        fallback_reasons.append("pihps: no live commodity price rows")

    # 4. Sync Data Source Health in Supabase (actual per-source status, never static 'ok')
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
        logger.debug(f"Failed to sync data sources status: {e}")

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

    # Cache in Redis if available
    try:
        r = get_redis()
        r.set("lrip:corridor:context:latest", json.dumps(result_payload), ex=300)
    except Exception:
        pass

    return result_payload
