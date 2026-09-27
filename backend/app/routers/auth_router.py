"""
PreHub Authentication & User Management Router.

Provides endpoints for identity inspection (/me), 1-click evaluator persona switching,
guest session generation for offline evaluation, and role permission catalogs.
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.supabase_auth import (
    DEFAULT_ROLE_EMAILS,
    DEFAULT_ROLE_NAMES,
    DEFAULT_ROLE_ORGS,
    ROLE_DISPATCHER,
    ROLE_GUEST,
    ROLE_PERMISSIONS,
    ROLE_REGULATOR,
    VALID_ROLES,
    UserSession,
    create_guest_token,
    get_current_user,
    get_optional_user,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])


class GuestSessionRequest(BaseModel):
    """Payload to generate an offline/evaluator guest session."""
    role: str = Field(default=ROLE_GUEST, description="Role to assign: DISPATCHER | REGULATOR | GUEST")
    org_name: Optional[str] = Field(default=None, description="Custom organization name")
    name: Optional[str] = Field(default=None, description="Custom user name")
    email: Optional[str] = Field(default=None, description="Custom user email")


class RoleSwitchRequest(BaseModel):
    """Payload to switch active persona."""
    role: str = Field(..., description="Target role: DISPATCHER | REGULATOR | GUEST")


class AuthTokenResponse(BaseModel):
    """Token response payload."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int = 172800  # 48 hours
    user: UserSession


class RoleCatalogItem(BaseModel):
    """Metadata describing an operational persona."""
    id: str
    name: str
    title: str
    organization: str
    description: str
    primary_tabs: list[str]
    permissions: list[str]


@router.get("/me", response_model=UserSession, summary="Get current authenticated user session")
async def get_me(user: UserSession = Depends(get_current_user)):
    """
    Return the current authenticated user's profile, role, organization, and permissions.
    """
    return user


@router.get("/session", response_model=UserSession, summary="Get current or default guest session")
async def get_session(user: UserSession = Depends(get_optional_user)):
    """
    Return the current session, or a default Guest session if not authenticated.
    Never fails with 401, useful for initial frontend load.
    """
    return user


@router.post("/guest-session", response_model=AuthTokenResponse, summary="Create offline / evaluator session token")
async def create_guest_session(request: GuestSessionRequest):
    """
    Generate a valid signed JWT session for a specified role.
    Designed for fast 1-click evaluator persona switching and offline demonstrations.
    """
    target_role = request.role.upper()
    if target_role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_ROLE", "message": f"Peran '{request.role}' tidak valid. Pilihan: {VALID_ROLES}"},
        )

    token = create_guest_token(
        role=target_role,
        org_name=request.org_name,
        email=request.email,
        name=request.name,
    )

    from app.auth.supabase_auth import decode_and_verify_token
    user_session = decode_and_verify_token(token)

    logger.info(f"Generated guest session token for persona: {target_role} ({user_session.org_name})")

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=172800,
        user=user_session,
    )


@router.post("/switch-role", response_model=AuthTokenResponse, summary="Switch active user persona")
async def switch_role(request: RoleSwitchRequest, current_user: UserSession = Depends(get_optional_user)):
    """
    Switch the active persona to DISPATCHER, REGULATOR, or GUEST.
    Returns a freshly signed JWT and updated session context.
    """
    target_role = request.role.upper()
    if target_role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_ROLE", "message": f"Peran '{request.role}' tidak valid. Pilihan: {VALID_ROLES}"},
        )

    token = create_guest_token(
        role=target_role,
        org_name=DEFAULT_ROLE_ORGS.get(target_role),
        name=DEFAULT_ROLE_NAMES.get(target_role),
        email=DEFAULT_ROLE_EMAILS.get(target_role),
    )

    from app.auth.supabase_auth import decode_and_verify_token
    updated_user = decode_and_verify_token(token)

    logger.info(f"Evaluator switched role: {current_user.role} -> {target_role}")

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=172800,
        user=updated_user,
    )


@router.get("/roles", response_model=list[RoleCatalogItem], summary="Get role catalog & permission descriptions")
async def get_roles_catalog():
    """
    Return the comprehensive role catalog describing operational responsibilities,
    associated organizations, and permission lists for each persona.
    """
    return [
        RoleCatalogItem(
            id=ROLE_DISPATCHER,
            name="Dispatcher Logistik",
            title="Koordinator Operasional Armada & Rute",
            organization=DEFAULT_ROLE_ORGS[ROLE_DISPATCHER],
            description="Memantau pergerakan truk dan kapal, merencanakan rute bypass bencana, mengunggah manifest kargo, serta menyetujui pengalihan rute darurat.",
            primary_tabs=["PETA OPERASI", "SIMULATION", "EVALUATION"],
            permissions=ROLE_PERMISSIONS[ROLE_DISPATCHER],
        ),
        RoleCatalogItem(
            id=ROLE_REGULATOR,
            name="Regulator Pemerintah",
            title="Analis Ketahanan Pangan & Transportasi",
            organization=DEFAULT_ROLE_ORGS[ROLE_REGULATOR],
            description="Menganalisis heatmap kerentanan koridor pangan pulau, memantau disparitas harga komoditas PIHPS, serta mengunduh laporan eksekutif kabinet B2G.",
            primary_tabs=["PETA OPERASI", "ANALYTICS", "REPORTS", "EVALUATION"],
            permissions=ROLE_PERMISSIONS[ROLE_REGULATOR],
        ),
        RoleCatalogItem(
            id=ROLE_GUEST,
            name="Evaluator Sandbox",
            title="Penguji Independen Kompetisi LRIP",
            organization=DEFAULT_ROLE_ORGS[ROLE_GUEST],
            description="Mode eksplorasi bebas tanpa batasan untuk menguji keandalan algoritma, simulasi krisis interaktif, serta validasi benchmark empiris.",
            primary_tabs=["PETA OPERASI", "ANALYTICS", "SIMULATION", "REPORTS", "EVALUATION"],
            permissions=ROLE_PERMISSIONS[ROLE_GUEST],
        ),
    ]
