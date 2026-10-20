"""
PreHub: Multi-Modal Fleet Vehicles Router
Provides real-time AISstream vessel positions, OpenSky ADS-B flights,
and dynamic ground food logistics fleet telemetry with GeoJSON route_geometry.
"""
from fastapi import APIRouter, Query, Depends
from datetime import timezone, datetime
from typing import Optional, Dict, Any
import logging

from app.schemas.fleet import FleetTelemetryListResponse
from app.services.telemetry_service import telemetry_service, MASTER_FLEET_DEFINITIONS, matches_tenant
from app.auth.supabase_auth import get_optional_user, UserSession, ROLE_DISPATCHER

router = APIRouter(tags=["fleet"])
logger = logging.getLogger(__name__)

# Preserved for backward compatibility
BASE_FLEET = MASTER_FLEET_DEFINITIONS


@router.get("/vehicles", response_model=FleetTelemetryListResponse)
@router.get("/api/v1/fleet/vehicles", response_model=FleetTelemetryListResponse)
async def get_active_fleet(
    modality: Optional[str] = Query(None, description="Filter modality: truck, maritime, air"),
    status: Optional[str] = Query(None, description="Filter status: moving, anchored, rerouting"),
    company_id: Optional[str] = Query(None, description="Filter by company / tenant ID (e.g. pos_logistik, pelindo_belawan)"),
    user: UserSession = Depends(get_optional_user)
) -> FleetTelemetryListResponse:
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
        return FleetTelemetryListResponse(
            status="success",
            total_vehicles=0,
            modality_counts=empty_counts,
            updated_at=datetime.now(timezone.utc).isoformat(),
            vehicles=[],
        )

    org_name = user.org_name if is_dispatcher and user else None

    vehicles = telemetry_service.get_unified_fleet(
        modality=modality,
        status=status,
        company_id=effective_company,
        org_name=org_name,
        tenant_only=tenant_only,
    )
    all_units = telemetry_service.get_unified_fleet(
        company_id=effective_company,
        org_name=org_name,
        tenant_only=tenant_only,
    )

    # Tag tenant-owned assets vs macro situational awareness assets
    for v in vehicles:
        if effective_company:
            v["is_tenant_asset"] = matches_tenant(v, effective_company, org_name)
        else:
            v["is_tenant_asset"] = True

    modality_counts = {
        "all": len(all_units),
        "truck": len([v for v in all_units if v.get("modality") == "truck"]),
        "maritime": len([v for v in all_units if v.get("modality") == "maritime"]),
        "air": len([v for v in all_units if v.get("modality") == "air"]),
    }

    return FleetTelemetryListResponse(
        status="success",
        total_vehicles=len(vehicles),
        modality_counts=modality_counts,
        updated_at=datetime.now(timezone.utc).isoformat(),
        vehicles=vehicles
    )
