"""
PreHub : Pan-Sumatra Intermodal Choke-Point, Spoilage Hedging & Compliance Router.
Exposes endpoints for intermodal terminal queues, operational hedging cost matrix solvers,
and digital Surat Jalan / BKHIT / MST compliance inspections.
"""
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.intermodal import (
    ChokePointItem,
    ChokePointsListResponse,
    HedgingSolveRequest,
    HedgingSolveResponse,
    ComplianceVerifyRequest,
    ComplianceVerifyResponse
)
from app.services.intermodal_sync_service import intermodal_sync_service
from app.services.spoilage_hedging_service import (
    spoilage_hedging_service,
    BPJT_SUMATRA_TOLL_SEGMENTS,
    PERTAMINA_FUEL_BASE_RATES,
    GOLONGAN_DEFAULT_KMPL,
    PERISHABILITY_TIERS
)
from app.services.compliance_service import compliance_service

router = APIRouter(prefix="/intermodal", tags=["Intermodal & Compliance"])


@router.get(
    "/chokepoints",
    response_model=ChokePointsListResponse,
    summary="List all Pan-Sumatra transport choke-points and terminals"
)
async def list_chokepoints(
    status_filter: Optional[str] = Query(None, description="Filter by status: NORMAL, CONGESTED, RESTRICTED, BLOCKED"),
    chokepoint_type: Optional[str] = Query(None, description="Filter by type: SEAPORT, FERRY_TERMINAL, MOUNTAIN_PASS, etc.")
) -> ChokePointsListResponse:
    """Returns the 18+ registered Pan-Sumatra sea ports, ferry terminals, and mountain bottlenecks."""
    all_points = intermodal_sync_service.get_all_chokepoints()

    if status_filter:
        all_points = [p for p in all_points if p.get("status") == status_filter.upper()]
    if chokepoint_type:
        all_points = [p for p in all_points if p.get("type") == chokepoint_type.upper()]

    items = [ChokePointItem(**p) for p in all_points]
    congested_count = sum(1 for p in items if p.status == "CONGESTED")
    restricted_count = sum(1 for p in items if p.status in ("RESTRICTED", "BLOCKED"))

    return ChokePointsListResponse(
        items=items,
        total=len(items),
        congested_count=congested_count,
        restricted_count=restricted_count
    )


@router.get(
    "/chokepoints/{chokepoint_id}",
    response_model=ChokePointItem,
    summary="Get single choke-point telemetry"
)
async def get_chokepoint(chokepoint_id: str) -> ChokePointItem:
    """Returns detailed status and queue metrics for a specific choke-point."""
    cp = intermodal_sync_service.get_chokepoint_by_id(chokepoint_id.upper())
    if not cp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Choke-point '{chokepoint_id}' not found in Pan-Sumatra registry."
        )
    return ChokePointItem(**cp)


@router.post(
    "/hedging/solve",
    response_model=HedgingSolveResponse,
    summary="Solve operational spoilage hedging cost-benefit matrix"
)
async def solve_spoilage_hedging(
    req: HedgingSolveRequest,
    inflation_shock_factor: float = Query(0.05, ge=0.0, le=1.0, description="Pertamina fuel market inflation adjustment")
) -> HedgingSolveResponse:
    """
    Evaluates Continue vs Reroute vs Hold tactical policies factoring commodity perishability decay,
    real BPJT toll tariffs, and Pertamina fuel consumption.
    """
    return spoilage_hedging_service.solve_hedging_matrix(
        req=req,
        inflation_shock_factor=inflation_shock_factor
    )


@router.post(
    "/compliance/verify",
    response_model=ComplianceVerifyResponse,
    summary="Inspect digital manifest, BKHIT quarantine, and MST axle-load compliance"
)
async def verify_compliance(req: ComplianceVerifyRequest) -> ComplianceVerifyResponse:
    """
    Validates regulatory requirements:
    - BKHIT agricultural quarantine certificates (Hard Block for inter-island routes)
    - MST axle-load limits (>8 Ton on Class III roads produces tactical warning & reroute advisory)
    - Surat Jalan digital integrity
    """
    return compliance_service.verify_compliance(req)


@router.get(
    "/toll-tariffs",
    summary="Get official BPJT Sumatra toll tariffs and Pertamina benchmark fuel rates"
)
async def get_toll_tariffs() -> Dict[str, Any]:
    """Returns authoritative BPJT Sumatra toll tables, vehicle Golongan I-V rates, and fuel benchmarks."""
    from datetime import date as _date

    # Fuel-spec contract (Phase 2): expose the versioned fuel_prices rows (SK
    # provenance) alongside the legacy constant map. Backward-compat keys
    # (`bpjt_segments`, `pertamina_fuel_base_rates`, `perishability_tiers`)
    # are unchanged.
    fuel_rates: List[Dict[str, Any]] = []
    try:
        from app.db import travel_supabase

        if travel_supabase.is_configured():
            from app.db.supabase_client import get_client, get_write_client

            try:
                _sb = get_client()
            except RuntimeError:
                _sb = get_write_client()
            _resp = (
                _sb.table("fuel_prices")
                .select("*")
                .order("effective_date", desc=True)
                .limit(100)
                .execute()
            )
            for _r in (_resp.data or []):
                fuel_rates.append({
                    "fuel_type": _r.get("fuel_type"),
                    "region": _r.get("region"),
                    "price_idr": float(_r.get("price_idr") or 0.0),
                    "sk_number": _r.get("sk_number"),
                    "effective_date": str(_r.get("effective_date")),
                    "source_url": _r.get("source_url"),
                    "is_fallback": bool(_r.get("is_fallback", True)),
                })
    except Exception:
        fuel_rates = []
    if not fuel_rates:
        # No SK table reachable: provenance is the code-constant fallback.
        for _ft, _rate in PERTAMINA_FUEL_BASE_RATES.items():
            fuel_rates.append({
                "fuel_type": _ft,
                "region": "NASIONAL",
                "price_idr": float(_rate),
                "sk_number": None,
                "effective_date": _date.today().isoformat(),
                "source_url": "internal:backend/app/services/spoilage_hedging_service.py#PERTAMINA_FUEL_BASE_RATES",
                "is_fallback": True,
            })

    _provenance: Dict[str, Any] = {}
    for _row in fuel_rates:
        _ft = str(_row.get("fuel_type"))
        # Prefer the newest non-fallback SK row per fuel type.
        if _ft not in _provenance or (
            _provenance[_ft].get("is_fallback") and not _row.get("is_fallback")
        ):
            _provenance[_ft] = {
                "sk_number": _row.get("sk_number"),
                "effective_date": _row.get("effective_date"),
                "region": _row.get("region"),
                "is_fallback": _row.get("is_fallback"),
            }
    _effective_dates = sorted(
        {str(_r.get("effective_date")) for _r in fuel_rates if _r.get("effective_date")}
    )

    return {
        "bpjt_segments": BPJT_SUMATRA_TOLL_SEGMENTS,
        "pertamina_fuel_base_rates": PERTAMINA_FUEL_BASE_RATES,
        "fuel_rates": fuel_rates,
        "fuel_sk_provenance": _provenance,
        "effective_date": _effective_dates[-1] if _effective_dates else _date.today().isoformat(),
        "golongan_default_kmpl": dict(GOLONGAN_DEFAULT_KMPL),
        "golongan_defaults": dict(GOLONGAN_DEFAULT_KMPL),
        "perishability_tiers": {
            k: {
                "name": v["name"],
                "delta": v["delta"],
                "requires_reefer": v["requires_reefer"],
                "default_price_per_kg": v["default_price_per_kg"]
            }
            for k, v in PERISHABILITY_TIERS.items()
        }
    }
