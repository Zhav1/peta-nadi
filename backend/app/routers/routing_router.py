"""
FastAPI Router for CPU Routing Optimization, Weather Fusion Polygons & TomTom Traffic Flow
"""
import asyncio
import logging
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from app.services.weather_fusion_service import get_fused_spatial_weather
from app.services.cpu_routing_service import optimize_fleet_routes_cpu, CORRIDOR_JUNCTION_NODES
from app.adapters.cpu_routing_adapter import get_cpu_router
from app.adapters.tomtom_adapter import TomTomAdapter
from app.auth.supabase_auth import UserSession, get_optional_user
from app.config import get_settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Routing Optimization & Spatial Telemetry"])

PROOF_FETCH_TIMEOUT_S = 8.0


async def _fetch_proof_context() -> Dict[str, Any]:
    """
    Fetches weather + TomTom + news in parallel with an 8s timeout each.
    Any failure degrades to seed_fallback instead of failing the route call.
    """
    weather: Dict[str, Any] = {}
    tomtom_raw: Dict[str, Any] = {"flow": [], "incidents": []}
    news_articles: List[Dict[str, Any]] = []
    reasons: List[str] = []

    try:
        weather = await asyncio.wait_for(get_fused_spatial_weather(), timeout=PROOF_FETCH_TIMEOUT_S)
    except asyncio.TimeoutError:
        reasons.append("weather_timeout_8s")
        logger.warning("Proof context: weather fusion timed out after 8s, using fallback")
    except Exception as e:
        reasons.append(f"weather_error: {e}")
        logger.warning(f"Proof context: weather fusion failed: {e}")

    try:
        tomtom_raw = await asyncio.wait_for(TomTomAdapter().fetch(), timeout=PROOF_FETCH_TIMEOUT_S)
    except asyncio.TimeoutError:
        reasons.append("tomtom_timeout_8s")
        logger.warning("Proof context: TomTom fetch timed out after 8s, using seed_fallback")
    except Exception as e:
        reasons.append(f"tomtom_error: {e}")
        logger.warning(f"Proof context: TomTom fetch failed: {e}")

    try:
        from app.services.news_aggregator import fetch_news_from_supabase

        news_articles = await asyncio.wait_for(
            fetch_news_from_supabase(limit=20), timeout=PROOF_FETCH_TIMEOUT_S
        )
    except asyncio.TimeoutError:
        reasons.append("news_timeout_8s")
        logger.warning("Proof context: news fetch timed out after 8s, using fallback")
    except Exception as e:
        reasons.append(f"news_error: {e}")
        logger.warning(f"Proof context: news fetch failed: {e}")

    # Normalize TomTom flow into congestion_segments for proof enrichment
    congestion_segments: List[Dict[str, Any]] = []
    try:
        for flow in (tomtom_raw or {}).get("flow", []):
            seg = flow.get("flowSegmentData", {})
            curr = seg.get("currentSpeed", 30)
            free = seg.get("freeFlowSpeed", 60)
            score = max(0.0, 1.0 - (curr / free)) if free > 0 else 0.0
            level = "heavy" if score >= 0.6 else "moderate" if score >= 0.3 else "low"
            congestion_segments.append({
                "checkpoint": flow.get("_checkpoint_name"),
                "lat": flow.get("_lat"),
                "lon": flow.get("_lon"),
                "congestion_level": level,
                "level": level,
                "current_speed_kmh": curr,
                "free_flow_speed_kmh": free,
            })
    except Exception as e:
        reasons.append(f"congestion_parse_error: {e}")

    live_flow = bool((tomtom_raw or {}).get("flow"))
    is_fallback = (not live_flow) or bool(reasons)
    return {
        "weather": weather,
        "tomtom_raw": tomtom_raw,
        "news_context": news_articles or [],
        "congestion_segments": congestion_segments,
        "is_fallback": is_fallback,
        "fallback_reasons": reasons,
        "speed_source": "tomtom_live" if live_flow else "seed_fallback",
    }


@router.get("/weather/spatial-polygons")
async def fetch_spatial_weather_polygons(
    current_user: UserSession = Depends(get_optional_user),
    min_severity: str = Query(default="high", description="Minimum severity rank: low|medium|high|critical. Default high = disruption-only (BMKG 60/medium excluded). Use medium for full-fidelity advisory."),
    min_precip: float = Query(default=50.0, description="Minimum 24h precipitation mm for disruption gate (OR with min_flood). Use 0 to disable."),
    min_flood: float = Query(default=80.0, description="Minimum flood risk pct for disruption gate (OR with min_precip). Use 0 to disable."),
) -> Dict[str, Any]:
    """
    Returns GeoJSON multi-polygons combining BMKG station warnings + Open-Meteo Global NWP
    spatial weather predictions with data-driven rainfall_mm and flood_risk_pct.
    Read endpoint: optional auth (guest-safe), user attached for telemetry only.

    Full-Sumatra coverage: Open-Meteo bulk grid (23 land points, 95-106E/-6..6N)
    fused per-point with BMKG hub warnings; features capped at 24 (severity +
    magnitude + corridor proximity priority, ~30KB max).

    Disruption-only default (min_severity=high, min_precip=50, min_flood=80):
    only high/critical heavy rain that can cause disruptions is returned.
    Advisory path: ?min_severity=medium&min_precip=0&min_flood=0 returns all as before.
    """
    try:
        # Advisory full-fidelity path: min_severity=medium/low disables numeric gates
        # unless the caller explicitly set non-default numeric thresholds.
        sev = (min_severity or "high").lower()
        if sev in ("medium", "low", "all"):
            eff_precip = None if min_precip == 50.0 else (None if min_precip is None else float(min_precip))
            eff_flood = None if min_flood == 80.0 else (None if min_flood is None else float(min_flood))
            if eff_precip == 0:
                eff_precip = None
            if eff_flood == 0:
                eff_flood = None
            return await get_fused_spatial_weather(min_severity=sev, min_precip=eff_precip, min_flood=eff_flood)
        eff_precip_h = None if min_precip == 0 else float(min_precip)
        eff_flood_h = None if min_flood == 0 else float(min_flood)
        return await get_fused_spatial_weather(min_severity=sev, min_precip=eff_precip_h, min_flood=eff_flood_h)
    except Exception as e:
        logger.error(f"Error fetching spatial weather polygons: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/fire/hotspots")
async def fetch_fire_hotspots(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    Q3(B)/Q6: FIRMS VIIRS_SNPP_NRT active fire hotspots near the Trans-Sumatra corridor.

    Honest-degraded contract: when NASA_FIRMS_MAP_KEY is missing the endpoint
    returns 200 with status=degraded + empty hotspots (never 500, never fake
    points) so the frontend can render a gray toggle with a 'butuh MAP_KEY' tooltip.
    Severity mapping: FRP > 500 → critical, FRP > 100 (or <5km to corridor) → high.
    Radius-area mapping: critical → 5 km, high → 2.5 km, medium → 1 km
    (radius_km included per hotspot, additive — existing shape unchanged).
    """
    import json as _json
    from datetime import datetime, timezone as _tz

    settings = get_settings()
    if not getattr(settings, "nasa_firms_map_key", ""):
        return {
            "hotspots": [],
            "total": 0,
            "status": "degraded",
            "reason": "butuh MAP_KEY — set NASA_FIRMS_MAP_KEY di Render env / .env.local (never commit)",
            "source": "VIIRS_SNPP_NRT",
            "timestamp": datetime.now(_tz.utc).isoformat(),
        }
    try:
        from app.services.redis_client import get_redis, SOURCE_CACHE_PREFIX

        cached: List[Dict[str, Any]] = []
        try:
            r = get_redis()
            raw_cached = r.get(f"{SOURCE_CACHE_PREFIX}nasa_firms")
            if raw_cached:
                parsed = _json.loads(raw_cached)
                if isinstance(parsed, list):
                    cached = parsed
        except Exception as ce:
            logger.debug(f"FIRMS cache read failed: {ce}")

        # Live-fetch fallback when cache is cold (short timeout, never blocks UI long).
        if not cached:
            try:
                from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter

                adapter = NASAFIRMSAdapter()
                raw = await adapter.fetch()
                if raw:
                    cached = await adapter.parse(raw)
                    try:
                        r = get_redis()
                        r.set(f"{SOURCE_CACHE_PREFIX}nasa_firms", _json.dumps(cached), ex=10800)
                    except Exception:
                        pass
            except Exception as fe:
                logger.warning(f"FIRMS live fetch fallback failed: {fe}")

        hotspots: List[Dict[str, Any]] = []
        for ev in cached:
            try:
                lat = float(ev.get("lat", 0))
                lon = float(ev.get("lon", 0))
                frp = float(ev.get("frp", 0) or 0)
                # Raw FIRMS row may carry frp/confidence when event was cached pre-Q3.
                if frp == 0 and ev.get("raw"):
                    try:
                        row = _json.loads(ev["raw"]) if isinstance(ev["raw"], str) else {}
                        frp = float(row.get("frp", 0) or 0)
                    except Exception:
                        pass
                conf_raw = str(ev.get("conf", "") or "").lower()
                if not conf_raw and ev.get("raw"):
                    try:
                        row = _json.loads(ev["raw"]) if isinstance(ev["raw"], str) else {}
                        conf_raw = str(row.get("confidence", "nominal") or "nominal").lower()
                    except Exception:
                        conf_raw = "nominal"
                # Confidence 0–100 for heat weight: critical 95 / high 80 / medium 60.
                sev = str(ev.get("severity", "medium")).lower()
                confidence = 95 if sev == "critical" else 80 if sev == "high" else 60
                dist_km = ev.get("dist_to_corridor_km")
                try:
                    dist_km = float(dist_km) if dist_km is not None else None
                except Exception:
                    dist_km = None
                # Radius-area mapping (km, monotonic, mirrors severity):
                # FRP > 500 → critical → 5 km; FRP > 100 or <5 km to corridor
                # → high → 2.5 km; else medium → 1 km.
                if frp > 500:
                    radius_km = 5.0
                elif frp > 100 or (dist_km is not None and dist_km < 5.0):
                    radius_km = 2.5
                else:
                    radius_km = 1.0
                hotspots.append({
                    "coordinates": [lon, lat],
                    "lon": lon,
                    "lat": lat,
                    "confidence": confidence,
                    "frp": frp,
                    "conf": conf_raw or "nominal",
                    "dist_to_corridor_km": dist_km,
                    "severity": sev,
                    "radius_km": radius_km,
                    "title": ev.get("title", f"Hotspot VIIRS FRP {frp}MW"),
                    "source": "VIIRS_SNPP_NRT",
                    "near_segment": ev.get("near_segment"),
                    "ts": ev.get("ts"),
                })
            except Exception:
                continue

        return {
            "hotspots": hotspots,
            "total": len(hotspots),
            "status": "ok" if hotspots else "degraded",
            "reason": None if hotspots else "no active hotspots in corridor window",
            "source": "VIIRS_SNPP_NRT",
            "timestamp": datetime.now(_tz.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Error fetching FIRMS fire hotspots: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class RoutingRequestPayload(BaseModel):
    origin_id: Optional[str] = "belawan_port"
    dest_id: Optional[str] = "tebing_tinggi"
    fleet_size: Optional[int] = 3
    hazard_zones: Optional[List[Dict[str, Any]]] = []
    origin_coords: Optional[List[float]] = None
    dest_coords: Optional[List[float]] = None
    origin_name: Optional[str] = None
    dest_name: Optional[str] = None
    k_alternatives: Optional[int] = 3
    modality: Optional[str] = None
    include_proof: Optional[bool] = Field(default=True, description="Attach Route Detail Modal proof triple")
    # Optional grounded economics (BPJT + Pertamina + 4-tier decay). Absent => honest null, no invented Rp.
    commodity: Optional[str] = None
    cargo_tonnage: Optional[float] = None
    vehicle_golongan: Optional[str] = None
    fuel_type: Optional[str] = None
    toll_segments: Optional[List[str]] = None
    p_disruption: Optional[float] = None
    disruption_delay_hours: Optional[float] = None


@router.post("/routing/optimize")
async def optimize_routing(payload: RoutingRequestPayload = Body(...)) -> Dict[str, Any]:
    """
    Invokes deterministic CPU routing solver (NetworkX + OR-Tools) using dynamic travel time matrices
    weighted by TomTom live speeds and BMKG/Open-Meteo hazard avoidance penalties.
    Also supports point-to-point shortest path calculation when origin_coords/dest_coords are provided.
    """
    try:
        result = await optimize_fleet_routes_cpu(
            origin_id=payload.origin_id or "belawan_port",
            dest_id=payload.dest_id or "tebing_tinggi",
            fleet_size=payload.fleet_size or 3,
            hazard_zones=payload.hazard_zones
        )
        if payload.origin_coords or payload.dest_coords or payload.origin_name or payload.dest_name:
            proof_ctx: Dict[str, Any] = {"congestion_segments": [], "news_context": [], "is_fallback": True}
            if payload.include_proof:
                proof_ctx = await _fetch_proof_context()
            router_adapter = get_cpu_router()
            path_solution = router_adapter.solve_shortest_path(
                origin_id=payload.origin_id,
                dest_id=payload.dest_id,
                hazard_zones=payload.hazard_zones,
                k_alternatives=payload.k_alternatives or 3,
                origin_coords=payload.origin_coords,
                dest_coords=payload.dest_coords,
                origin_name=payload.origin_name,
                dest_name=payload.dest_name,
                modality=payload.modality,
                congestion_segments=proof_ctx.get("congestion_segments", []),
                news_context=proof_ctx.get("news_context", []),
                include_proof=bool(payload.include_proof),
                is_fallback=bool(proof_ctx.get("is_fallback", True)),
            )
            result["point_to_point_path"] = path_solution
            result["routes"] = path_solution.get("routes", [])
            _enrich_routes_with_hedging(path_solution, payload)
            result["routes"] = path_solution.get("routes", [])
            if payload.include_proof:
                result["proof_context"] = {
                    "is_fallback": proof_ctx.get("is_fallback"),
                    "speed_source": proof_ctx.get("speed_source"),
                    "fallback_reasons": proof_ctx.get("fallback_reasons", []),
                }
        return result
    except Exception as e:
        logger.error(f"Error executing CPU routing optimization: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _enrich_routes_with_hedging(result: Dict[str, Any], payload: "RoutingRequestPayload") -> None:
    """Attach grounded hedging (BPJT + Pertamina + 4-tier decay) to detour routes.

    Only runs when the caller supplies commodity; otherwise routes keep honest null
    economics (no invented Rp). Never raises — failures leave hedging absent.
    """
    try:
        if not payload.commodity:
            return
        routes = result.get("routes") or []
        if len(routes) < 1:
            return
        from app.services.spoilage_hedging_service import SpoilageHedgingService
        from app.schemas.intermodal import HedgingSolveRequest
        svc = SpoilageHedgingService()
        base = routes[0]
        base_dist = float(base.get("distance_km") or 0.0)
        base_eta = float(base.get("eta_minutes") or 0.0)
        for r in routes[1:]:
            try:
                detour_km = max(0.0, float(r.get("distance_km") or 0.0) - base_dist)
                detour_h = max(0.0, (float(r.get("eta_minutes") or 0.0) - base_eta) / 60.0)
                req = HedgingSolveRequest(
                    vehicle_id=str(r.get("route_index", "route")),
                    commodity=str(payload.commodity),
                    cargo_tonnage=float(payload.cargo_tonnage or 10.0),
                    origin=str(payload.origin_id or "origin"),
                    destination=str(payload.dest_id or "dest"),
                    vehicle_golongan=(payload.vehicle_golongan or "GOL_II"),  # type: ignore[arg-type]
                    fuel_type=(payload.fuel_type or "biosolar"),  # type: ignore[arg-type]
                    p_disruption=float(payload.p_disruption if payload.p_disruption is not None else 0.85),
                    disruption_delay_hours=float(payload.disruption_delay_hours if payload.disruption_delay_hours is not None else 12.0),
                    detour_distance_km=detour_km,
                    detour_time_hours=detour_h,
                    toll_segments=payload.toll_segments,
                )
                hedged = svc.solve_hedging_matrix(req)
                r["hedging"] = hedged.model_dump() if hasattr(hedged, "model_dump") else dict(hedged)
            except Exception as e:
                logger.warning(f"Hedging enrich skipped for route: {e}")
    except Exception as e:
        logger.warning(f"Hedging enrich disabled: {e}")


@router.post("/routing/solve-path")
async def solve_routing_path(payload: RoutingRequestPayload = Body(...)) -> Dict[str, Any]:
    """
    Computes deterministic point-to-point shortest paths with dynamic hazard avoidance,
    supporting universal village geocoding coordinates (snaps to nearest road network node
    and connects with last-mile road connectors).
    """
    try:
        proof_ctx: Dict[str, Any] = {"congestion_segments": [], "news_context": [], "is_fallback": True}
        if payload.include_proof:
            proof_ctx = await _fetch_proof_context()
        router_adapter = get_cpu_router()
        result = router_adapter.solve_shortest_path(
            origin_id=payload.origin_id,
            dest_id=payload.dest_id,
            hazard_zones=payload.hazard_zones,
            k_alternatives=payload.k_alternatives or 3,
            origin_coords=payload.origin_coords,
            dest_coords=payload.dest_coords,
            origin_name=payload.origin_name,
            dest_name=payload.dest_name,
            modality=payload.modality,
            congestion_segments=proof_ctx.get("congestion_segments", []),
            news_context=proof_ctx.get("news_context", []),
            include_proof=bool(payload.include_proof),
            is_fallback=bool(proof_ctx.get("is_fallback", True)),
        )
        if payload.include_proof:
            result["proof_context"] = {
                "is_fallback": proof_ctx.get("is_fallback"),
                "speed_source": proof_ctx.get("speed_source"),
                "fallback_reasons": proof_ctx.get("fallback_reasons", []),
            }
        _enrich_routes_with_hedging(result, payload)
        return result
    except Exception as e:
        logger.error(f"Error solving routing path: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/traffic/flow-segments")
async def fetch_tomtom_flow_segments(
    current_user: UserSession = Depends(get_optional_user),
) -> Dict[str, Any]:
    """
    Returns live TomTom traffic flow checkpoints & active incidents for Mapbox segment coloring.
    Read endpoint: optional auth (guest-safe), user attached for telemetry only.
    """
    try:
        tomtom = TomTomAdapter()
        raw = await tomtom.fetch()
        events = await tomtom.parse(raw)

        segments = []
        for flow in raw.get("flow", []):
            cp_name = flow.get("_checkpoint_name")
            lat = flow.get("_lat")
            lon = flow.get("_lon")
            seg = flow.get("flowSegmentData", {})
            curr_speed = seg.get("currentSpeed", 30)
            free_speed = seg.get("freeFlowSpeed", 60)

            c_score = max(0.0, 1.0 - (curr_speed / free_speed)) if free_speed > 0 else 0.0
            level = "heavy" if c_score >= 0.6 else "moderate" if c_score >= 0.3 else "low"

            segments.append({
                "checkpoint": cp_name,
                "lat": lat,
                "lon": lon,
                "current_speed_kmh": curr_speed,
                "free_flow_speed_kmh": free_speed,
                "congestion_level": level,
                "delay_seconds": max(0, int((1.0 / max(5, curr_speed) - 1.0 / max(10, free_speed)) * 3600))
            })

        return {
            "segments": segments,
            "incidents": raw.get("incidents", []),
            "total_segments": len(segments),
            "total_incidents": len(raw.get("incidents", []))
        }
    except Exception as e:
        logger.error(f"Error fetching TomTom traffic flow segments: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
