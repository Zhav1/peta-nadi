"""
PreHub: Multi-Modal Fleet Vehicles Router
Provides real-time AISstream vessel positions, OpenSky ADS-B flights,
and dynamic ground food logistics fleet telemetry with GeoJSON route_geometry.
"""
from fastapi import APIRouter, Query, Depends, Response
from datetime import timezone, datetime
from typing import Optional, Dict, Any, Tuple, List
import logging
import time
import orjson

from app.schemas.fleet import FleetTelemetryListResponse
from app.services.telemetry_service import telemetry_service, MASTER_FLEET_DEFINITIONS, matches_tenant
from app.auth.supabase_auth import get_optional_user, UserSession, ROLE_DISPATCHER

router = APIRouter(tags=["fleet"])
logger = logging.getLogger(__name__)

# Preserved for backward compatibility
BASE_FLEET = MASTER_FLEET_DEFINITIONS

# In-process sliding TTL cache for macro and tenant fleet queries (5-10s TTL)
FLEET_CACHE_TTL_SECONDS = 8.0
_fleet_cache: Dict[str, Tuple[float, List[Dict[str, Any]]]] = {}
_response_cache: Dict[Tuple[str, Optional[str], Optional[str], bool], Tuple[float, bytes]] = {}


def clear_fleet_cache() -> None:
    """Helper to invalidate in-process fleet cache during tests or state resets."""
    _fleet_cache.clear()
    _response_cache.clear()


@router.get("/vehicles", response_model=FleetTelemetryListResponse)
@router.get("/api/v1/fleet/vehicles", response_model=FleetTelemetryListResponse)
async def get_active_fleet(
    modality: Optional[str] = Query(None, description="Filter modality: truck, maritime, air"),
    status: Optional[str] = Query(None, description="Filter status: moving, anchored, rerouting"),
    company_id: Optional[str] = Query(None, description="Filter by company / tenant ID (e.g. pos_logistik, pelindo_belawan)"),
    include_geometry: bool = Query(True, description="Whether to include dense road coordinates. Set False for lightweight polling."),
    user: UserSession = Depends(get_optional_user)
) -> Response:
    """
    Returns active food logistics fleet with dynamic positions, transponder metadata,
    and route geometries across Pan-Sumatra strategic corridors.

    Tenancy contract:
      - DISPATCHER: strictly scoped to the JWT ``company_id`` claim and only to
        assets that belong to that tenant. The ?company_id= query can never widen
        the claim. A dispatcher with no claim gets an honest empty fleet instead of
        the macro/demo corridor view.
      - REGULATOR / GUEST: full macro corridor view (situational awareness).
    """
    is_dispatcher = bool(user and user.role == ROLE_DISPATCHER)

    if is_dispatcher:
        # Never trust a query param to widen a tenant boundary.
        effective_company = user.company_id
        tenant_only = True
    else:
        effective_company = company_id
        tenant_only = False

    if is_dispatcher and not effective_company:
        logger.warning(
            "Dispatcher session without company_id claim requested fleet; returning honest empty fleet."
        )
        empty_counts = {"all": 0, "truck": 0, "maritime": 0, "air": 0}
        empty_payload = {
            "status": "success",
            "total_vehicles": 0,
            "modality_counts": empty_counts,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "vehicles": [],
        }
        return Response(content=orjson.dumps(empty_payload), media_type="application/json")

    org_name = user.org_name if is_dispatcher and user else None

    # Normalize filters: 'all' or empty strings hit the exact same cache keys
    norm_modality = None if (not modality or modality.lower() == "all") else modality.lower()
    norm_status = None if (not status or status.lower() == "all") else status

    # Check fast serialized response cache (sliding TTL)
    now = time.monotonic()
    cache_key = f"{effective_company}:{org_name}:{tenant_only}"
    resp_key = (cache_key, norm_modality, norm_status, include_geometry)

    cached_resp = _response_cache.get(resp_key)
    if cached_resp and (now - cached_resp[0]) < FLEET_CACHE_TTL_SECONDS:
        return Response(content=cached_resp[1], media_type="application/json")

    # Check base fleet object cache
    cached_base = _fleet_cache.get(cache_key)
    if cached_base and (now - cached_base[0]) < FLEET_CACHE_TTL_SECONDS:
        base_fleet = cached_base[1]
    else:
        base_fleet = telemetry_service.get_unified_fleet(
            company_id=effective_company,
            org_name=org_name,
            tenant_only=tenant_only,
            include_geometry=True,
        )
        if len(_fleet_cache) > 50:
            _fleet_cache.clear()
        _fleet_cache[cache_key] = (now, base_fleet)

    # Single-pass computation:
    # 1. Modality counts across the entire fleet scope (truck, maritime, air, all)
    # 2. In-memory filtering (modality, status)
    # 3. Tenant asset tagging (is_tenant_asset)
    # 4. Zero-overhead geometry stripping when include_geometry=False
    modality_counts = {
        "all": 0,
        "truck": 0,
        "maritime": 0,
        "air": 0,
    }
    vehicles: List[Dict[str, Any]] = []

    for item in base_fleet:
        m = item.get("modality")
        modality_counts["all"] += 1
        if m in modality_counts:
            modality_counts[m] += 1

        if norm_modality and m != norm_modality:
            continue
        if norm_status and item.get("status") != norm_status:
            continue

        # Shallow copy to allow non-destructive per-request mutation
        v = dict(item)

        if effective_company:
            v["is_tenant_asset"] = matches_tenant(v, effective_company, org_name)
        else:
            v["is_tenant_asset"] = True

        if not include_geometry:
            v["path"] = []
            v["route_geometry"] = None

        vehicles.append(v)

    payload = {
        "status": "success",
        "total_vehicles": len(vehicles),
        "modality_counts": modality_counts,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "vehicles": vehicles,
    }
    serialized = orjson.dumps(payload)
    if len(_response_cache) > 200:
        _response_cache.clear()
    _response_cache[resp_key] = (now, serialized)

    return Response(content=serialized, media_type="application/json")


@router.get("/vehicles/{vehicle_id}/geometry")
@router.get("/api/v1/fleet/vehicles/{vehicle_id}/geometry")
async def get_vehicle_geometry(
    vehicle_id: str,
    user: UserSession = Depends(get_optional_user)
) -> Dict[str, Any]:
    """
    Returns high-precision route geometry and coordinate waypoints for an individual fleet vehicle.
    """
    now = time.monotonic()
    target = None

    # Check if target vehicle is already present in any active cached fleet
    for ts, cached_fleet in _fleet_cache.values():
        if (now - ts) < FLEET_CACHE_TTL_SECONDS:
            found = next((v for v in cached_fleet if v.get("vehicle_id") == vehicle_id), None)
            if found and (found.get("path") or found.get("route_geometry")):
                target = found
                break

    if not target:
        macro_key = "None:None:False"
        cached = _fleet_cache.get(macro_key)
        if cached and (now - cached[0]) < FLEET_CACHE_TTL_SECONDS:
            vehicles = cached[1]
        else:
            vehicles = telemetry_service.get_unified_fleet(include_geometry=True)
            _fleet_cache[macro_key] = (now, vehicles)
        target = next((v for v in vehicles if v.get("vehicle_id") == vehicle_id), None)

    if not target:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Vehicle {vehicle_id} not found")

    return {
        "status": "success",
        "vehicle_id": vehicle_id,
        "modality": target.get("modality"),
        "origin": target.get("origin"),
        "destination": target.get("destination"),
        "route_geometry": target.get("route_geometry"),
        "path": target.get("path", []),
    }
