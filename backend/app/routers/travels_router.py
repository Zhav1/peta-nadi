"""
PreHub : Truck Asset Master & Travel (Rit) Ledger REST Router.

Step 1 of onboarding registers the truck asset once:
    POST /api/v1/fleet/trucks

Step 2 creates transactional travels/rits against that asset:
    POST /api/v1/fleet/travels

Legacy `custom_fleet_vehicles` rows stay readable and are accepted as truck_id
references, so existing fleet API consumers are unaffected.
"""
import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas.travel import (
    TruckAssetCreate,
    TruckAssetResponse,
    TravelCreate,
    TravelUpdate,
    TravelResponse,
    TravelListResponse,
    TravelHedgingRequest,
)
from app.auth.supabase_auth import get_optional_user, UserSession
from app.db import local_storage
from app.services import travel_ledger_service
from app.services.travel_ledger_service import (
    TruckNotFoundError,
    TravelNotFoundError,
)
from app.routers.vehicles_router import clear_fleet_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fleet", tags=["Fleet Truck Assets & Travel Ledger"])


def _require_fleet_write(user: UserSession) -> None:
    if "fleet:write" not in (user.permissions or []):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": (
                    "Akses ditolak: hanya operator dengan wewenang 'fleet:write' (Dispatcher) "
                    f"yang dapat menulis aset truk atau rit. Peran Anda saat ini adalah {user.role}."
                ),
                "current_role": user.role,
                "required_permissions": ["fleet:write"],
            },
        )


def _effective_company_filter(user: UserSession, requested: Optional[str]) -> Optional[str]:
    """Explicit ?company_id= wins; dispatchers default to their tenant claim."""
    if requested:
        return requested
    if (user.role or "").upper() == "DISPATCHER" and user.company_id:
        return user.company_id
    return None


# ==========================================
# STEP 1 — TRUCK ASSET MASTER
# ==========================================

@router.post("/trucks", response_model=TruckAssetResponse, status_code=status.HTTP_201_CREATED)
async def create_truck_asset(
    payload: TruckAssetCreate,
    user: UserSession = Depends(get_optional_user),
):
    """Register a master truck asset (nopol, VIN, golongan, driver, company) once."""
    _require_fleet_write(user)

    data = payload.model_dump()
    data["company_id"] = data.get("company_id") or user.company_id or "org-prehub-pilot"
    data["company_name"] = data.get("company_name") or user.org_name
    data["created_by"] = user.name
    data["sync_status"] = "pending"

    existing = local_storage.get_truck_asset(payload.truck_id)
    if existing and existing.get("company_id") != data["company_id"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Nomor polisi '{payload.truck_id}' sudah terdaftar untuk tenant lain. "
                "Gunakan ID armada yang berbeda."
            ),
        )

    saved = local_storage.save_truck_asset(data)
    saved["source"] = "master"
    clear_fleet_cache()
    return TruckAssetResponse(**saved)


@router.get("/trucks", response_model=List[TruckAssetResponse])
async def list_truck_assets(
    company_id: Optional[str] = Query(None, description="Filter tenant perusahaan"),
):
    """List master truck assets, including legacy onboarded trucks (backward compat)."""
    items = travel_ledger_service.list_truck_assets_with_legacy(company_id=company_id)
    return [TruckAssetResponse(**item) for item in items]


@router.get("/trucks/{truck_id}", response_model=TruckAssetResponse)
async def get_truck_asset(truck_id: str):
    """Read one master truck asset (falls back to legacy custom fleet)."""
    asset = travel_ledger_service.resolve_truck_asset(truck_id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Aset truk '{truck_id}' tidak ditemukan.",
        )
    return TruckAssetResponse(**asset)


@router.delete("/trucks/{truck_id}")
async def delete_truck_asset(
    truck_id: str,
    user: UserSession = Depends(get_optional_user),
):
    """Delete a master truck asset. Historical travels keep their snapshot."""
    _require_fleet_write(user)
    deleted = local_storage.delete_truck_asset(truck_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"Aset truk master '{truck_id}' tidak ditemukan. "
                "Aset legacy hanya dapat dihapus melalui DELETE /api/v1/fleet/custom/{vehicle_id}."
            ),
        )
    clear_fleet_cache()
    return {"status": "success", "message": f"Aset truk '{truck_id}' berhasil dihapus.", "truck_id": truck_id}


# ==========================================
# STEP 2 — TRAVEL / RIT LEDGER
# ==========================================

@router.post("/travels", response_model=TravelResponse, status_code=status.HTTP_201_CREATED)
async def create_travel(
    payload: TravelCreate,
    user: UserSession = Depends(get_optional_user),
):
    """
    Create one travel/rit. Baseline and actual costs are computed server-side
    from BPJT tariffs, Pertamina rates, and 4-tier spoilage decay.
    """
    _require_fleet_write(user)
    try:
        created = travel_ledger_service.create_travel(payload, actor=user.name)
        clear_fleet_cache()
    except TruckNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return TravelResponse(**created)


@router.get("/travels", response_model=TravelListResponse)
async def list_travels(
    company_id: Optional[str] = Query(None, description="Filter tenant perusahaan"),
    status_filter: Optional[str] = Query(None, alias="status", description="planned|moving|rerouted|delivered|failed"),
    truck_id: Optional[str] = Query(None, description="Filter satu aset truk"),
    limit: int = Query(200, ge=1, le=2000),
    user: UserSession = Depends(get_optional_user),
):
    """List travels/rits newest first, scoped to the caller's tenant when known."""
    effective_company = _effective_company_filter(user, company_id)
    items = local_storage.list_travels(
        company_id=effective_company,
        status=status_filter,
        truck_id=truck_id,
        limit=limit,
    )
    return TravelListResponse(
        total=len(items),
        items=[TravelResponse(**item) for item in items],
    )


@router.get("/travels/{travel_id}", response_model=TravelResponse)
async def get_travel(travel_id: str):
    """Read one travel/rit with its persisted hedging decision."""
    travel = local_storage.get_travel(travel_id)
    if not travel:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rit '{travel_id}' tidak ditemukan.",
        )
    return TravelResponse(**travel)


@router.patch("/travels/{travel_id}", response_model=TravelResponse)
async def update_travel(
    travel_id: str,
    payload: TravelUpdate,
    user: UserSession = Depends(get_optional_user),
):
    """Record realised time/fuel/toll/status and recompute the savings split."""
    _require_fleet_write(user)
    try:
        updated = travel_ledger_service.update_travel(travel_id, payload)
        clear_fleet_cache()
    except TravelNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return TravelResponse(**updated)


@router.post("/travels/{travel_id}/hedging", response_model=Dict[str, Any])
async def solve_travel_hedging(
    travel_id: str,
    payload: TravelHedgingRequest,
    user: UserSession = Depends(get_optional_user),
):
    """
    Solve Continue/Reroute/Hold for one rit using BPJT tolls, Pertamina fuel,
    and the 4-tier spoilage model, then persist the decision on that rit.
    """
    _require_fleet_write(user)
    try:
        solved = travel_ledger_service.solve_and_persist_hedging(travel_id, payload)
    except TravelNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return {
        "status": "success",
        "travel_id": travel_id,
        "hedging": solved,
    }
