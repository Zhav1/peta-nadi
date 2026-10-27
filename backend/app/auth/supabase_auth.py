"""
Supabase Authentication & Role-Based Access Control (RBAC) Middleware.

Complies with Supabase Security Guidelines:
- Validates JWT tokens using PyJWT.
- Authorization decisions read strictly from app_metadata.role (server-controlled),
  never mutable user_metadata.
- Provides resilient offline guest session generation for competition evaluators.
"""

import asyncio
import hashlib
import json
import logging
import threading
import time
from typing import Callable, Optional
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

security_scheme = HTTPBearer(auto_error=False)

# Standard Role Definitions
ROLE_DISPATCHER = "DISPATCHER"
ROLE_REGULATOR = "REGULATOR"
ROLE_GUEST = "GUEST"

VALID_ROLES = [ROLE_DISPATCHER, ROLE_REGULATOR, ROLE_GUEST]

ROLE_PERMISSIONS: dict[str, list[str]] = {
    # Wave 3 RBAC verification (Phase 77): sandbox contract locked.
    # - GUEST (demo_sandbox) is strictly read-only preview: benchmark:read +
    #   reports:read ONLY. MUST NEVER contain approvals:write, fleet:write,
    #   routes:plan, or manifests:upload. Guest selects open a watermarked
    #   local preview with zero POST to /approvals, /news/hitl-action, or
    #   /fleet/telemetry/*. Server enforces via approvals:write gate in
    #   approvals.py (403 for GUEST + REGULATOR).
    # - REGULATOR (bapanas) is read-mostly + HOLD-flag via HITL drawer only:
    #   heatmap/prices/reports/audit/scenarios. MUST NEVER contain
    #   approvals:write (APPROVE dispatch is Dispatcher-only). HOLD is a
    #   HITL advisory flag, not an approvals:write commit.
    # - DISPATCHER alone holds approvals:write + fleet:write + routes:plan.
    # Any future permission change must keep the two invariants above;
    # test_auth_rbac.py::test_create_and_decode_guest_token and
    # ::test_rbac_approval_rejected_for_regulator pin them.
    ROLE_DISPATCHER: [
        "fleet:read",
        "fleet:write",
        "routes:plan",
        "approvals:write",
        "manifests:upload",
        "scenarios:run",
    ],
    ROLE_REGULATOR: [
        "heatmap:read",
        "prices:read",
        "reports:read",
        "reports:export",
        "audit:read",
        "scenarios:run",
    ],
    ROLE_GUEST: [
        "benchmark:read",
        "reports:read",
    ],
}

DEFAULT_ROLE_COMPANIES: dict[str, str] = {
    ROLE_DISPATCHER: "pos_logistik",
    ROLE_REGULATOR: "bapanas",
    ROLE_GUEST: "demo_sandbox",
}

DEFAULT_ROLE_ORGS: dict[str, str] = {
    ROLE_DISPATCHER: "PT Samudera Logistik Sumatra",
    ROLE_REGULATOR: "Badan Pangan Nasional / Kemenhub",
    ROLE_GUEST: "Kompetisi LRIP Demo Sandbox",
}

DEFAULT_ROLE_NAMES: dict[str, str] = {
    ROLE_DISPATCHER: "Budi Santoso (Lead Dispatcher)",
    ROLE_REGULATOR: "Dr. Hendra Wijaya (Analis Ketahanan Pangan)",
    ROLE_GUEST: "Evaluator Sandbox (Guest)",
}

DEFAULT_ROLE_EMAILS: dict[str, str] = {
    ROLE_DISPATCHER: "dispatcher@samudera-logistik.co.id",
    ROLE_REGULATOR: "hendra.wijaya@bapanas.go.id",
    ROLE_GUEST: "evaluator@kompetisi-lrip.id",
}

# Demo/evaluator sandbox tenant. Signed guest tokens are only ever minted for
# this tenant (or an explicitly allowlisted one) — see `is_evaluator` below.
DEMO_SANDBOX_COMPANY = "demo_sandbox"

# Sentinel identity for the dependency-produced anonymous session. It is the
# only way to distinguish "no Authorization header was sent" from "a real GUEST
# token was verified" once the request reaches a handler.
DEFAULT_GUEST_USER_ID = "default-guest-user"

# Every fail-closed 401 carries the RFC 6750 challenge so clients can tell
# "re-authenticate" apart from "you are not allowed".
UNAUTHORIZED_HEADERS: dict[str, str] = {"WWW-Authenticate": "Bearer"}


class UserSession(BaseModel):
    """Authenticated user session payload."""
    id: str
    email: str
    role: str = Field(default=ROLE_GUEST)
    company_id: Optional[str] = Field(default=None)
    org_name: str = Field(default=DEFAULT_ROLE_ORGS[ROLE_GUEST])
    name: str = Field(default=DEFAULT_ROLE_NAMES[ROLE_GUEST])
    permissions: list[str] = Field(default_factory=list)
    is_offline_guest: bool = False
    exp: Optional[int] = None


def get_jwt_secret() -> str:
    """Return JWT secret with fallback."""
    return settings.supabase_jwt_secret or "prehub-dev-jwt-secret-key-32-chars-minimum-length-2026"


def _csv_setting(name: str, default: str) -> set[str]:
    """Read a comma-separated setting as a lowercase set (never raises)."""
    raw = getattr(settings, name, None)
    if raw is None or str(raw).strip() == "":
        raw = default
    return {part.strip().lower() for part in str(raw).split(",") if part.strip()}


def evaluator_emails() -> set[str]:
    """Emails allowed to mint/switch personas (Phase 161 allowlist)."""
    return _csv_setting("m8_evaluator_emails", DEFAULT_ROLE_EMAILS[ROLE_GUEST])


def evaluator_companies() -> set[str]:
    """Tenants an evaluator may mint tokens for. Defaults to demo_sandbox only."""
    return _csv_setting("m8_evaluator_companies", DEMO_SANDBOX_COMPANY)


def is_anonymous_guest(user: Optional["UserSession"]) -> bool:
    """True only for the sentinel session produced when no Authorization header was sent."""
    return bool(user) and getattr(user, "id", None) == DEFAULT_GUEST_USER_ID


def is_evaluator(user: Optional["UserSession"]) -> bool:
    """
    Authenticated evaluator policy (Phase 161):
    - tenant claim is demo_sandbox, OR
    - email is in M8_EVALUATOR_EMAILS (comma-separated, default evaluator@kompetisi-lrip.id).
    Anonymous callers are never evaluators.
    """
    if not user or is_anonymous_guest(user):
        return False
    if (user.company_id or "").strip().lower() == DEMO_SANDBOX_COMPANY:
        return True
    email = (user.email or "").strip().lower()
    return bool(email) and email in evaluator_emails()


def default_guest_session() -> "UserSession":
    """Anonymous request session: GUEST with no tenant claim and no permissions."""
    return UserSession(
        id=DEFAULT_GUEST_USER_ID,
        email=DEFAULT_ROLE_EMAILS[ROLE_GUEST],
        role=ROLE_GUEST,
        org_name=DEFAULT_ROLE_ORGS[ROLE_GUEST],
        name=DEFAULT_ROLE_NAMES[ROLE_GUEST],
        permissions=ROLE_PERMISSIONS[ROLE_GUEST],
        is_offline_guest=True,
    )


def create_guest_token(
    role: str = ROLE_GUEST,
    company_id: Optional[str] = None,
    org_name: Optional[str] = None,
    email: Optional[str] = None,
    name: Optional[str] = None,
    expires_delta_hours: int = 48,
) -> str:
    """
    Generate a signed JWT token for a specific role/persona.
    Used for local evaluation, guest testing, and offline fallback mode.
    """
    normalized_role = role.upper() if role.upper() in VALID_ROLES else ROLE_GUEST
    assigned_company = company_id or DEFAULT_ROLE_COMPANIES.get(normalized_role, DEFAULT_ROLE_COMPANIES[ROLE_GUEST])
    assigned_org = org_name or DEFAULT_ROLE_ORGS.get(normalized_role, DEFAULT_ROLE_ORGS[ROLE_GUEST])
    assigned_name = name or DEFAULT_ROLE_NAMES.get(normalized_role, DEFAULT_ROLE_NAMES[ROLE_GUEST])
    assigned_email = email or DEFAULT_ROLE_EMAILS.get(normalized_role, DEFAULT_ROLE_EMAILS[ROLE_GUEST])

    now = int(time.time())
    exp = now + (expires_delta_hours * 3600)
    user_id = f"guest-{normalized_role.lower()}-{now}"

    payload = {
        "sub": user_id,
        "email": assigned_email,
        "aud": "authenticated",
        "role": "authenticated",
        "app_metadata": {
            "provider": "guest_session",
            "role": normalized_role,
            "company_id": assigned_company,
            "org_name": assigned_org,
            "permissions": ROLE_PERMISSIONS.get(normalized_role, []),
        },
        "user_metadata": {
            "name": assigned_name,
            "company_id": assigned_company,
            "org_name": assigned_org,
        },
        "iat": now,
        "exp": exp,
        "iss": "prehub-auth-engine",
    }

    return jwt.encode(payload, get_jwt_secret(), algorithm="HS256")


_jwks_clients: dict[str, PyJWKClient] = {}


def get_jwks_url() -> str:
    """Resolve the Supabase JWKS endpoint from settings (empty when unconfigured)."""
    jwks_url = getattr(settings, "supabase_jwks_key", "") or ""
    if not jwks_url and getattr(settings, "supabase_url", ""):
        jwks_url = f"{settings.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"
    return jwks_url


def get_jwks_client(jwks_url: str) -> PyJWKClient:
    """Returns cached PyJWKClient instance for given JWKS endpoint."""
    global _jwks_clients
    if jwks_url not in _jwks_clients:
        _jwks_clients[jwks_url] = PyJWKClient(jwks_url, cache_keys=True, max_cached_keys=16)
    return _jwks_clients[jwks_url]


def prewarm_jwks() -> bool:
    """
    Best-effort JWKS pre-warm (blocking; call via `asyncio.to_thread`).

    The first asymmetric token verification otherwise pays the full TLS fetch of
    the JWKS document inside the auth dependency, i.e. on the login SLO. This
    fetches and caches the key set once after boot. Failures are logged and
    swallowed: a cold JWKS must never make the process fail to start.
    """
    jwks_url = get_jwks_url()
    if not jwks_url:
        logger.debug("JWKS pre-warm skipped: no supabase_jwks_key / supabase_url configured")
        return False
    try:
        client = get_jwks_client(jwks_url)
        # PyJWT >= 2.5 exposes get_signing_keys(); older builds only have fetch_data().
        get_keys = getattr(client, "get_signing_keys", None)
        if callable(get_keys):
            keys = get_keys()
        else:  # pragma: no cover - compatibility with older PyJWT
            client.fetch_data()
            keys = None
        logger.info("JWKS pre-warm complete: %s (%s keys)", jwks_url, len(keys) if keys is not None else "?")
        return True
    except Exception as exc:
        logger.warning(f"JWKS pre-warm failed (non-fatal, will retry on first verify): {exc}")
        return False


# ==========================================
# AUTH SESSION CACHE (Phase 5 perf)
# Verified UserSessions are cached 60s by token hash: process-local dict
# first, Redis (`lrip:cache:auth:*`) second. Cache NEVER bypasses signature
# verification — only a fully verified session is stored, and entries are
# time-boxed so revocation/expiry still takes effect within 60s. 403
# behavior in `require_roles` is untouched (it runs after this returns).
# ==========================================
_AUTH_CACHE_TTL_SECONDS = 60
_AUTH_CACHE_PREFIX = "lrip:cache:auth:"
_auth_session_mem: dict[str, tuple[float, dict]] = {}

# Reused Supabase clients (Phase 5 perf, hardened in Phase 161): Path-3 relay
# and profiles lookups previously built a fresh client per request (~TLS +
# auth overhead each). Both are idempotent singletons guarded by a lock so
# concurrent first requests cannot race two clients into existence.
_supabase_relay_client = None
_supabase_admin_client = None
_supabase_client_lock = threading.Lock()


def _get_relay_client():
    """Singleton anon client for the get_user relay fallback."""
    global _supabase_relay_client
    if _supabase_relay_client is None:
        with _supabase_client_lock:
            if _supabase_relay_client is None:
                from app.db.supabase_client import get_client

                _supabase_relay_client = get_client()
    return _supabase_relay_client


def _get_admin_client():
    """Singleton service-role client for the profiles enrichment lookup."""
    global _supabase_admin_client
    if _supabase_admin_client is None:
        with _supabase_client_lock:
            if _supabase_admin_client is None:
                from app.db.supabase_client import get_service_client

                _supabase_admin_client = get_service_client()
    return _supabase_admin_client


def _token_cache_key(token: str) -> str:
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    return f"{_AUTH_CACHE_PREFIX}{digest}"


def _auth_cache_get(token: str) -> Optional[dict]:
    """Return cached session dict if fresh, else None. Never raises."""
    now = time.time()
    entry = _auth_session_mem.get(_token_cache_key(token))
    if entry and entry[0] > now:
        return entry[1]
    elif entry:
        _auth_session_mem.pop(_token_cache_key(token), None)
    try:
        from app.services.redis_client import cache_get

        raw = cache_get(_token_cache_key(token))
        if raw:
            data = json.loads(raw)
            if isinstance(data, dict) and float(data.get("exp") or 0) > now:
                _auth_session_mem[_token_cache_key(token)] = (now + _AUTH_CACHE_TTL_SECONDS, data)
                return data
    except Exception as exc:
        logger.debug(f"Auth session cache read skipped: {exc}")
    return None


def _auth_cache_set(token: str, session: "UserSession") -> None:
    """Store a verified session for 60s. Never raises."""
    try:
        data = session.model_dump()
        key = _token_cache_key(token)
        _auth_session_mem[key] = (time.time() + _AUTH_CACHE_TTL_SECONDS, data)
        from app.services.redis_client import cache_set

        cache_set(key, json.dumps(data, default=str), ex=_AUTH_CACHE_TTL_SECONDS)
    except Exception as exc:
        logger.debug(f"Auth session cache write skipped: {exc}")


def decode_and_verify_token(token: str) -> UserSession:
    """
    Decode and verify a JWT token from Supabase Auth or offline session generator.
    Supports asymmetric Supabase JWTs (ES256 / RS256 via JWKS) and symmetric HMAC (HS256).
    Falls back to server-side Supabase get_user validation if available.
    """
    if not token or not isinstance(token, str):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "Token otentikasi tidak disediakan atau tidak valid."},
            headers=UNAUTHORIZED_HEADERS,
        )

    # Fast path: fully-verified session cached within the last 60s.
    # The cache key is the token hash (no raw tokens in keys) and entries
    # carry the original `exp`; expired entries are never returned.
    try:
        cached = _auth_cache_get(token)
        if cached:
            return UserSession(**cached)
    except Exception as exc:
        logger.debug(f"Auth cache fast-path skipped: {exc}")

    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "INVALID_TOKEN", "message": f"Header token tidak valid: {str(e)}"},
            headers=UNAUTHORIZED_HEADERS,
        )

    token_alg = unverified_header.get("alg", "HS256")
    payload = None
    verification_error = None

    # Path 1: Asymmetric Supabase Auth JWT (ES256 / RS256 or presence of kid)
    jwks_url = get_jwks_url()

    if (token_alg in ["ES256", "RS256"] or unverified_header.get("kid")) and jwks_url:
        try:
            jwks_client = get_jwks_client(jwks_url)
            signing_key = jwks_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256", "HS256"],
                options={"verify_aud": False, "verify_signature": True},
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "TOKEN_EXPIRED", "message": "Sesi token telah kedaluwarsa. Silakan masuk kembali."},
                headers=UNAUTHORIZED_HEADERS,
            )
        except jwt.InvalidSignatureError as e:
            verification_error = e
            logger.warning("Supabase token signature mismatch against JWKS key.")
        except Exception as e:
            verification_error = e
            logger.warning(f"JWKS verification encountered error ({e}); attempting alternate path.")

    # Path 2: Symmetric HMAC verification (HS256 for local dev / offline guest sessions / unit tests)
    if payload is None:
        try:
            secret = get_jwt_secret()
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256", "RS256"],
                options={"verify_aud": False, "verify_signature": True},
            )
        except jwt.ExpiredSignatureError:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": "TOKEN_EXPIRED", "message": "Sesi token telah kedaluwarsa. Silakan masuk kembali."},
                headers=UNAUTHORIZED_HEADERS,
            )
        except jwt.InvalidSignatureError as e:
            if verification_error is None:
                verification_error = e
        except Exception as e:
            if verification_error is None:
                verification_error = e

    # Path 3: Server-side relay fallback via Supabase client get_user (reused singleton client)
    if payload is None and settings.supabase_url and (settings.supabase_anon_key or settings.supabase_service_role_key):
        try:
            sb_client = _get_relay_client()
            user_response = sb_client.auth.get_user(token)
            if user_response and user_response.user:
                sb_user = user_response.user
                app_meta = getattr(sb_user, "app_metadata", {}) or {}
                user_meta = getattr(sb_user, "user_metadata", {}) or {}
                payload = {
                    "sub": str(sb_user.id),
                    "email": sb_user.email,
                    "app_metadata": app_meta,
                    "user_metadata": user_meta,
                    "iss": "supabase",
                }
        except Exception as relay_err:
            logger.warning(f"Server-side Supabase get_user relay fallback failed: {relay_err}")

    # If all verification paths failed, reject token
    if payload is None:
        if isinstance(verification_error, jwt.InvalidSignatureError):
            logger.warning("Rejected token with invalid signature: unverified decode fallback is disabled.")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": "INVALID_SIGNATURE",
                    "message": "Tanda tangan token tidak valid. Sesi ditolak; silakan masuk kembali.",
                },
                headers=UNAUTHORIZED_HEADERS,
            )
        err_msg = str(verification_error) if verification_error else "Verifikasi tanda tangan token gagal."
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "INVALID_TOKEN", "message": f"Token tidak valid: {err_msg}"},
            headers=UNAUTHORIZED_HEADERS,
        )

    # Supabase Security: Extract role strictly from app_metadata
    app_meta = payload.get("app_metadata", {})
    user_meta = payload.get("user_metadata", {})

    raw_role = app_meta.get("role") or payload.get("role_override") or ROLE_GUEST
    normalized_role = str(raw_role).upper()
    if normalized_role not in VALID_ROLES:
        normalized_role = ROLE_GUEST

    company_id = app_meta.get("company_id") or user_meta.get("company_id")
    user_id = payload.get("sub") or payload.get("id") or f"user-{normalized_role.lower()}"
    email = payload.get("email") or DEFAULT_ROLE_EMAILS.get(normalized_role, "")

    # Profile enrichment from public.profiles for registered Supabase accounts.
    # SKIPPED whenever company_id is already present in the JWT claims
    # (offline guest tokens + mirrored claims) — one fewer network round-trip
    # on the hot path. Only runs for UUID subjects missing a tenant claim.
    if not company_id and settings.supabase_url and settings.supabase_service_role_key and len(str(user_id)) == 36:
        try:
            sb_admin = _get_admin_client()
            prof_res = sb_admin.table("profiles").select("company_id, role, name").eq("id", user_id).limit(1).execute()
            if prof_res.data and len(prof_res.data) > 0:
                p_row = prof_res.data[0]
                if p_row.get("company_id"):
                    company_id = p_row["company_id"]
                if p_row.get("role") and normalized_role == ROLE_GUEST:
                    p_role = str(p_row["role"]).upper()
                    if p_role in VALID_ROLES:
                        normalized_role = p_role
        except Exception as profile_err:
            logger.debug(f"Profile lookup for user {user_id} skipped: {profile_err}")

    if not company_id:
        company_id = DEFAULT_ROLE_COMPANIES.get(normalized_role)

    org_name = app_meta.get("org_name") or user_meta.get("org_name") or DEFAULT_ROLE_ORGS.get(normalized_role, "")
    user_name = user_meta.get("name") or user_meta.get("full_name") or DEFAULT_ROLE_NAMES.get(normalized_role, "")
    permissions = app_meta.get("permissions") or ROLE_PERMISSIONS.get(normalized_role, [])
    is_offline = app_meta.get("provider") == "guest_session" or payload.get("iss") == "prehub-auth-engine"

    session = UserSession(
        id=user_id,
        email=email,
        role=normalized_role,
        company_id=company_id,
        org_name=org_name,
        name=user_name,
        permissions=permissions,
        is_offline_guest=is_offline,
        exp=payload.get("exp"),
    )
    # Cache the fully-verified session so repeat calls with the same token
    # skip JWKS/JWT verification for 60s. 403 semantics are unchanged:
    # `require_roles` still evaluates the (cached) role the same way.
    _auth_cache_set(token, session)
    return session


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> UserSession:
    """
    FastAPI dependency requiring a valid authenticated Bearer token.
    Raises 401 if missing or invalid.

    Verification is blocking (JWKS / Supabase relay / profile lookup), so it runs
    in a worker thread: a cold JWKS fetch or a slow PostgREST round-trip must not
    stall the single event loop (M8 root cause #1 / audit F4).
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": "UNAUTHORIZED", "message": "Autentikasi Bearer token diperlukan untuk mengakses endpoint ini."},
            headers=UNAUTHORIZED_HEADERS,
        )
    return await asyncio.to_thread(decode_and_verify_token, credentials.credentials)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
) -> UserSession:
    """
    FastAPI dependency for endpoints that are useful to anonymous visitors.

    Contract (Phase 161):
    - **No** `Authorization` header → anonymous GUEST session (sentinel id
      `default-guest-user`). This is an intentional guest visit.
    - Header **present** but the token is invalid/expired/unverifiable → HTTP 401
      with `WWW-Authenticate: Bearer`. A supplied credential is never silently
      downgraded to guest: that turned "session expired" into "read-only visitor"
      (audit F1) and hid the re-authentication signal from the client.
    """
    if credentials and credentials.credentials:
        try:
            return await asyncio.to_thread(decode_and_verify_token, credentials.credentials)
        except HTTPException as exc:
            # Fail closed, and guarantee the RFC 6750 challenge on every 401 path.
            if exc.status_code == status.HTTP_401_UNAUTHORIZED and not exc.headers:
                exc.headers = dict(UNAUTHORIZED_HEADERS)
            raise

    return default_guest_session()


def require_roles(allowed_roles: list[str]) -> Callable:
    """
    Dependency factory enforcing that the authenticated user possesses one of the allowed roles.
    Raises HTTP 403 Forbidden with detailed error message if role is unauthorized.
    """
    normalized_allowed = [r.upper() for r in allowed_roles]

    async def role_checker(user: UserSession = Depends(get_current_user)) -> UserSession:
        if user.role.upper() not in normalized_allowed:
            logger.warning(
                f"RBAC Denied: User '{user.email}' with role '{user.role}' attempted action requiring {normalized_allowed}"
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": "FORBIDDEN",
                    "message": f"Akses ditolak: Operasi ini memerlukan peran {', '.join(normalized_allowed)}. Peran Anda saat ini adalah {user.role}.",
                    "current_role": user.role,
                    "required_roles": normalized_allowed,
                },
            )
        return user

    return role_checker
