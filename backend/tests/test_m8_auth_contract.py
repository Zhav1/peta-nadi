"""
Phase 161 — M8 auth contract.

Pins the two behaviours the phase changes:

1. Optional auth is **fail-closed**: no header → anonymous GUEST; a supplied but
   invalid/expired token → 401 (`WWW-Authenticate: Bearer`), never a silent
   guest downgrade (audit finding F1).
2. Persona minting is **tenant-scoped**: anonymous callers may only mint GUEST
   for `demo_sandbox`; persona switching requires an authenticated evaluator and
   forces the caller's own tenant (audit finding F2).

Hermetic: tokens are signed and verified with the local HS256 secret, so no
Supabase/JWKS network call is made. Where a test needs a specific failure mode,
`decode_and_verify_token` is monkeypatched rather than reaching the network.
"""

import time

import jwt
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.auth import supabase_auth
from app.auth.supabase_auth import (
    DEFAULT_GUEST_USER_ID,
    DEMO_SANDBOX_COMPANY,
    ROLE_DISPATCHER,
    ROLE_GUEST,
    ROLE_REGULATOR,
    create_guest_token,
    get_jwt_secret,
)

client = TestClient(app)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _anonymous_token() -> str:
    """A validly signed token for a non-evaluator operator tenant."""
    return create_guest_token(role=ROLE_DISPATCHER, company_id="pos_logistik")


def _evaluator_token(company_id: str = DEMO_SANDBOX_COMPANY, email: str | None = None) -> str:
    return create_guest_token(role=ROLE_GUEST, company_id=company_id, email=email)


# ---------------------------------------------------------------------------
# 1. Optional auth — fail-closed
# ---------------------------------------------------------------------------

def test_optional_auth_without_header_returns_guest_session():
    res = client.get("/api/v1/auth/session")
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == ROLE_GUEST
    assert body["id"] == DEFAULT_GUEST_USER_ID
    assert body["is_offline_guest"] is True
    assert body["company_id"] is None


def test_optional_auth_with_invalid_token_returns_401():
    res = client.get("/api/v1/auth/session", headers=_bearer("invalid.token.value"))
    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"
    # Must not be reported as a guest session.
    assert res.json().get("role") is None


def test_optional_auth_with_expired_token_returns_401():
    expired = jwt.encode(
        {
            "sub": "expired-user",
            "email": "expired@prehub.id",
            "app_metadata": {"role": ROLE_DISPATCHER, "company_id": "pos_logistik"},
            "iat": int(time.time()) - 7200,
            "exp": int(time.time()) - 3600,
        },
        get_jwt_secret(),
        algorithm="HS256",
    )
    res = client.get("/api/v1/auth/session", headers=_bearer(expired))
    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"


def test_optional_auth_with_valid_token_returns_that_user():
    token = create_guest_token(role=ROLE_REGULATOR, company_id="bapanas")
    res = client.get("/api/v1/auth/session", headers=_bearer(token))
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == ROLE_REGULATOR
    assert body["company_id"] == "bapanas"


def test_optional_auth_confidence_check_uses_decode_not_guest_fallback(monkeypatch):
    """If decode raises 401 the dependency must propagate it (no try/except downgrade)."""

    def _always_401(_token: str):
        raise HTTPException(status_code=401, detail={"error": "INVALID_TOKEN", "message": "nope"})

    monkeypatch.setattr(supabase_auth, "decode_and_verify_token", _always_401)
    res = client.get("/api/v1/auth/session", headers=_bearer("whatever"))
    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"


# ---------------------------------------------------------------------------
# 2. Current auth — fail-closed
# ---------------------------------------------------------------------------

def test_current_auth_with_invalid_token_returns_401():
    res = client.get("/api/v1/auth/me", headers=_bearer("invalid.token.value"))
    assert res.status_code == 401
    assert res.headers.get("WWW-Authenticate") == "Bearer"


def test_current_auth_without_token_returns_401():
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# 3. guest-session minting policy
# ---------------------------------------------------------------------------

def test_guest_session_anonymous_dispatcher_is_forbidden():
    res = client.post("/api/v1/auth/guest-session", json={"role": "DISPATCHER"})
    assert res.status_code == 403
    detail = res.json()["detail"]
    assert detail["error"] == "FORBIDDEN"
    assert detail["allowed_roles"] == [ROLE_GUEST]


def test_guest_session_anonymous_regulator_is_forbidden():
    res = client.post("/api/v1/auth/guest-session", json={"role": "REGULATOR"})
    assert res.status_code == 403


def test_guest_session_anonymous_guest_is_demo_sandbox():
    res = client.post("/api/v1/auth/guest-session", json={"role": "GUEST"})
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == ROLE_GUEST
    assert body["user"]["company_id"] == DEMO_SANDBOX_COMPANY
    assert body["user"]["email"] == "evaluator@kompetisi-lrip.id"
    assert body["access_token"]


def test_guest_session_anonymous_other_company_is_forbidden():
    res = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "GUEST", "company_id": "pos_logistik"},
    )
    assert res.status_code == 403
    assert res.json()["detail"]["error"] == "FORBIDDEN"


def test_guest_session_evaluator_dispatcher_is_allowed():
    res = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "DISPATCHER"},
        headers=_bearer(_evaluator_token()),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == ROLE_DISPATCHER
    assert body["user"]["company_id"] == DEMO_SANDBOX_COMPANY


def test_guest_session_evaluator_cannot_escape_tenant_allowlist():
    res = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "DISPATCHER", "company_id": "pelindo_belawan"},
        headers=_bearer(_evaluator_token()),
    )
    assert res.status_code == 403
    assert res.json()["detail"]["error"] == "FORBIDDEN"


def test_guest_session_non_evaluator_operator_is_forbidden():
    res = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "DISPATCHER"},
        headers=_bearer(_anonymous_token()),
    )
    assert res.status_code == 403


def test_guest_session_invalid_token_is_401_not_guest(monkeypatch):
    def _always_401(_token: str):
        raise HTTPException(status_code=401, detail={"error": "INVALID_TOKEN", "message": "nope"})

    monkeypatch.setattr(supabase_auth, "decode_and_verify_token", _always_401)
    res = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "GUEST"},
        headers=_bearer("stale"),
    )
    assert res.status_code == 401


# ---------------------------------------------------------------------------
# 4. switch-role policy
# ---------------------------------------------------------------------------

def test_switch_role_non_evaluator_is_forbidden():
    res = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "DISPATCHER"},
        headers=_bearer(_anonymous_token()),
    )
    assert res.status_code == 403
    detail = res.json()["detail"]
    assert detail["error"] == "FORBIDDEN"
    assert detail["company_id"] == "pos_logistik"


def test_switch_role_evaluator_succeeds_and_forces_caller_company():
    res = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "DISPATCHER"},
        headers=_bearer(_evaluator_token()),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == ROLE_DISPATCHER
    assert body["user"]["company_id"] == DEMO_SANDBOX_COMPANY


def test_switch_role_ignores_tenant_from_request_body():
    res = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "DISPATCHER", "target_company": "pos_logistik", "company_id": "pos_logistik"},
        headers=_bearer(_evaluator_token()),
    )
    assert res.status_code == 200
    assert res.json()["user"]["company_id"] == DEMO_SANDBOX_COMPANY


def test_switch_role_email_allowlisted_evaluator_keeps_own_tenant():
    """M8_EVALUATOR_EMAILS (default evaluator@kompetisi-lrip.id) is an evaluator."""
    token = _evaluator_token(company_id="pos_logistik", email="evaluator@kompetisi-lrip.id")
    res = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "REGULATOR"},
        headers=_bearer(token),
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user"]["role"] == ROLE_REGULATOR
    # Caller's verified tenant, not the role default (bapanas).
    assert body["user"]["company_id"] == "pos_logistik"


def test_switch_role_requires_authentication():
    res = client.post("/api/v1/auth/switch-role", json={"role": "DISPATCHER"})
    assert res.status_code == 401


def test_switch_role_rejects_invalid_role_for_evaluator():
    res = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "SUPER_ADMIN"},
        headers=_bearer(_evaluator_token()),
    )
    assert res.status_code == 400
