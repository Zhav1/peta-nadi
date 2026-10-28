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
    DEMO_SANDBOX_COMPANY,
    ROLE_DISPATCHER,
    ROLE_GUEST,
    ROLE_PERMISSIONS,
    ROLE_REGULATOR,
    VALID_ROLES,
    UserSession,
    create_guest_token,
    evaluator_companies,
    get_current_user,
    get_optional_user,
    is_anonymous_guest,
    is_evaluator,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication & RBAC"])


def _forbidden(message: str, **extra: object) -> HTTPException:
    """403 helper keeping the existing error envelope shape."""
    detail: dict[str, object] = {"error": "FORBIDDEN", "message": message}
    detail.update(extra)
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


class GuestSessionRequest(BaseModel):
    """Payload to generate an offline/evaluator guest session."""
    role: str = Field(default=ROLE_GUEST, description="Role to assign: DISPATCHER | REGULATOR | GUEST")
    company_id: Optional[str] = Field(default=None, description="Tenant company ID (e.g. pos_logistik, pelindo_belawan)")
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
    Return the current session, or an anonymous Guest session when no Bearer token
    is sent.

    Contract (Phase 161 — fail-closed):
    - No `Authorization` header → 200 with the anonymous GUEST session
      (`id = "default-guest-user"`, no tenant claim). Safe for a first paint that
      happens before the client knows whether it has a session.
    - A supplied token that is invalid, expired or unverifiable → **401** with
      `WWW-Authenticate: Bearer`. It is never reported as a guest session, so the
      client can clear the stale token and ask the user to sign in again instead
      of silently losing the operator view.
    """
    return user


@router.post("/guest-session", response_model=AuthTokenResponse, summary="Create offline / evaluator session token")
async def create_guest_session(
    request: GuestSessionRequest,
    caller: UserSession = Depends(get_optional_user),
):
    """
    Mint a signed demo session token.

    Policy (Phase 161 — closes audit finding F2, "anonymous token minting"):

    - **Anonymous caller** (no `Authorization` header): may mint `GUEST` only,
      always for `demo_sandbox`. Any other role or tenant → 403.
    - **Authenticated evaluator** (`company_id == "demo_sandbox"` or email in
      `M8_EVALUATOR_EMAILS`): may mint any role, but the tenant must stay inside
      `M8_EVALUATOR_COMPANIES` (default: `demo_sandbox` only).
    - **Any other authenticated account** → 403.

    The endpoint is a demo/evaluation affordance, not a tenant-provisioning API:
    it can no longer hand a dispatcher token for `pos_logistik`/`bapanas` to an
    unauthenticated visitor.
    """
    target_role = request.role.upper()
    if target_role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_ROLE", "message": f"Peran '{request.role}' tidak valid. Pilihan: {VALID_ROLES}"},
        )

    anonymous = is_anonymous_guest(caller)
    if anonymous:
        if target_role != ROLE_GUEST:
            raise _forbidden(
                "Sesi anonim hanya dapat membuat persona GUEST pada tenant demo_sandbox. "
                "Masuk dengan akun evaluator untuk menguji persona operasional.",
                requested_role=target_role,
                allowed_roles=[ROLE_GUEST],
            )
        requested_company = (request.company_id or "").strip()
        if requested_company and requested_company.lower() != DEMO_SANDBOX_COMPANY:
            raise _forbidden(
                f"Sesi anonim hanya dapat memakai tenant {DEMO_SANDBOX_COMPANY}.",
                requested_company=requested_company,
                allowed_companies=[DEMO_SANDBOX_COMPANY],
            )
        target_company = DEMO_SANDBOX_COMPANY
        # Anonymous callers cannot claim an arbitrary identity; use the persona defaults.
        org_name = DEFAULT_ROLE_ORGS[ROLE_GUEST]
        name = DEFAULT_ROLE_NAMES[ROLE_GUEST]
        email = DEFAULT_ROLE_EMAILS[ROLE_GUEST]
    else:
        if not is_evaluator(caller):
            raise _forbidden(
                "Pembuatan sesi persona hanya tersedia untuk akun evaluator sandbox. "
                "Akun organisasi memakai peran tetap dari klaim tokennya.",
                current_role=caller.role,
                company_id=caller.company_id,
            )
        allowed_companies = evaluator_companies()
        requested_company = (request.company_id or caller.company_id or DEMO_SANDBOX_COMPANY).strip().lower()
        if requested_company not in allowed_companies:
            raise _forbidden(
                "Tenant di luar allowlist evaluator.",
                requested_company=requested_company,
                allowed_companies=sorted(allowed_companies),
            )
        target_company = requested_company
        org_name = request.org_name
        name = request.name
        email = request.email

    token = create_guest_token(
        role=target_role,
        company_id=target_company,
        org_name=org_name,
        email=email,
        name=name,
    )

    from app.auth.supabase_auth import decode_and_verify_token
    user_session = decode_and_verify_token(token)

    logger.info(
        "Generated guest session token for persona: %s (tenant=%s, anonymous=%s)",
        target_role,
        user_session.company_id,
        anonymous,
    )

    return AuthTokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=172800,
        user=user_session,
    )


@router.post("/switch-role", response_model=AuthTokenResponse, summary="Switch active user persona")
async def switch_role(request: RoleSwitchRequest, current_user: UserSession = Depends(get_current_user)):
    """
    Switch the active persona to DISPATCHER, REGULATOR, or GUEST.

    Requires an authenticated **evaluator** session:
    `company_id == "demo_sandbox"` or the email is in `M8_EVALUATOR_EMAILS`.
    Every other authenticated account is rejected with 403.

    The tenant is forced from the caller's verified `company_id` (falling back to
    `demo_sandbox`) and is never taken from the request body, so persona switching
    cannot be used to obtain a token for a different tenant.

    Wave 3 verification: this endpoint MUST stay behind get_current_user (never
    get_optional_user); client-side AuthModal.tsx isSandboxAccount gate is UX-only
    and never replaces this server check.
    """
    target_role = request.role.upper()
    if target_role not in VALID_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "INVALID_ROLE", "message": f"Peran '{request.role}' tidak valid. Pilihan: {VALID_ROLES}"},
        )

    if not is_evaluator(current_user):
        raise _forbidden(
            "Pergantian persona hanya tersedia untuk akun evaluator sandbox.",
            current_role=current_user.role,
            company_id=current_user.company_id,
        )

    # Server-authoritative tenant: caller claim only, never the request body.
    target_company = (current_user.company_id or DEMO_SANDBOX_COMPANY).strip().lower()

    token = create_guest_token(
        role=target_role,
        company_id=target_company,
        org_name=DEFAULT_ROLE_ORGS.get(target_role),
        name=DEFAULT_ROLE_NAMES.get(target_role),
        email=DEFAULT_ROLE_EMAILS.get(target_role),
    )

    from app.auth.supabase_auth import decode_and_verify_token
    updated_user = decode_and_verify_token(token)

    logger.info(
        "Evaluator switched role: %s -> %s (tenant=%s)",
        current_user.role,
        target_role,
        target_company,
    )

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
