"""
PreHub : ERP Savings Summary Router (dispatcher detail + regulator aggregate).

All figures come from the persisted travel/rit ledger, which derives cost from
BPJT toll tariffs, Pertamina fuel rates, and 4-tier spoilage decay. This router
never invents a savings percentage.
"""
import asyncio
import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query

from app.auth.supabase_auth import get_optional_user, UserSession
from app.schemas.travel import ERPSummaryResponse
from app.services.travel_ledger_service import build_erp_summary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/erp", tags=["ERP Savings & Travel Ledger"])


@router.get("/summary", response_model=ERPSummaryResponse)
async def get_erp_summary(
    company_id: Optional[str] = Query(None, description="Filter tenant perusahaan (kosong = sesuai peran/agregat)"),
    limit: int = Query(500, ge=1, le=1000, description="Jendela baris detail (agregat SQL selalu penuh)"),
    user: UserSession = Depends(get_optional_user),
):
    """
    Aggregate travel/rit savings for the ERP view.

    - DISPATCHER / logistics operator: per-rit detail + tenant totals.
    - REGULATOR: macro aggregate only (no per-rit commercial detail).
    - GUEST: aggregate only (read-only sandbox).
    """
    role = (user.role or "").upper()
    effective_company = company_id
    if not effective_company and role == "DISPATCHER":
        effective_company = user.company_id

    include_trips = role not in ("REGULATOR", "GUEST")

    return await asyncio.to_thread(
        build_erp_summary,
        company_id=effective_company,
        include_trips=include_trips,
        limit=limit,
    )
