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
from app.services.telemetry_service import telemetry_service, MASTER_FLEET_DEFINITIONS
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
    Enforces company tenancy for dispatchers while allowing macro overview for regulators and guests.
    """
    # Determine effective company filter: explicit query overrides, otherwise fallback to dispatcher claim
    effective_company = company_id
    if not effective_company and user and user.role == ROLE_DISPATCHER and user.company_id:
        effective_company = user.company_id

    vehicles = telemetry_service.get_unified_fleet(
        modality=modality,
        status=status,
        company_id=effective_company
    )
    all_units = telemetry_service.get_unified_fleet(company_id=effective_company)

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
