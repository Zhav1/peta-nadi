"""
Unit & Integration Tests for Supabase JWT Auth & RBAC (Phase 42).
"""

import time
import pytest
import jwt
from fastapi.testclient import TestClient

from app.main import app
from app.auth.supabase_auth import (
    ROLE_DISPATCHER,
    ROLE_REGULATOR,
    ROLE_GUEST,
    create_guest_token,
    decode_and_verify_token,
    get_jwt_secret,
)

client = TestClient(app)


def test_create_and_decode_dispatcher_token():
    """Verify that a signed Dispatcher token decodes with correct role and permissions."""
    token = create_guest_token(
        role=ROLE_DISPATCHER,
        org_name="PT Samudera Logistik Sumatra",
        name="Budi Santoso",
        email="budi@samudera.co.id",
    )
    assert token is not None
    assert isinstance(token, str)

    session = decode_and_verify_token(token)
    assert session.role == ROLE_DISPATCHER
    assert session.org_name == "PT Samudera Logistik Sumatra"
    assert session.name == "Budi Santoso"
    assert session.email == "budi@samudera.co.id"
    assert "approvals:write" in session.permissions
    assert "fleet:write" in session.permissions
    assert session.is_offline_guest is True


def test_create_and_decode_regulator_token():
    """Verify that a signed Regulator token decodes with correct role and permissions."""
    token = create_guest_token(role=ROLE_REGULATOR)
    session = decode_and_verify_token(token)

    assert session.role == ROLE_REGULATOR
    assert "reports:export" in session.permissions
    assert "prices:read" in session.permissions
    assert "approvals:write" not in session.permissions


def test_create_and_decode_guest_token():
    """Verify that a signed Guest token decodes with sandbox permissions."""
    token = create_guest_token(role=ROLE_GUEST)
    session = decode_and_verify_token(token)

    assert session.role == ROLE_GUEST
    assert "all:sandbox" in session.permissions


def test_invalid_token_rejected():
    """Verify that malformed or gibberish tokens raise 401."""
    with pytest.raises(Exception):
        decode_and_verify_token("not-a-real-jwt-token")


def test_expired_token_rejected():
    """Verify that an expired token raises 401."""
    now = int(time.time()) - 3600
    expired_payload = {
        "sub": "expired-user",
        "email": "test@prehub.id",
        "app_metadata": {"role": "DISPATCHER"},
        "iat": now - 7200,
        "exp": now - 3600,
    }
    expired_token = jwt.encode(expired_payload, get_jwt_secret(), algorithm="HS256")

    with pytest.raises(Exception) as exc_info:
        decode_and_verify_token(expired_token)
    assert "401" in str(exc_info.value) or "kedaluwarsa" in str(exc_info.value).lower() or "expired" in str(exc_info.value).lower()


def test_api_auth_me_endpoint():
    """Verify GET /api/v1/auth/me with valid Bearer token."""
    token = create_guest_token(role=ROLE_DISPATCHER, name="Operator Alpha")
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == ROLE_DISPATCHER
    assert data["name"] == "Operator Alpha"


def test_api_auth_me_unauthorized():
    """Verify GET /api/v1/auth/me without token returns 401."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_api_auth_session_fallback():
    """Verify GET /api/v1/auth/session without token returns default Guest session (200)."""
    response = client.get("/api/v1/auth/session")
    assert response.status_code == 200
    data = response.json()
    assert data["role"] == ROLE_GUEST
    assert data["is_offline_guest"] is True


def test_api_create_guest_session():
    """Verify POST /api/v1/auth/guest-session generates valid token for specified persona."""
    response = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "REGULATOR", "org_name": "Dinas Perhubungan Sumut"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["user"]["role"] == ROLE_REGULATOR
    assert data["user"]["org_name"] == "Dinas Perhubungan Sumut"


def test_api_create_guest_session_invalid_role():
    """Verify POST /api/v1/auth/guest-session with invalid role returns 400."""
    response = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "SUPER_ADMIN_HACK"},
    )
    assert response.status_code == 400


def test_api_switch_role():
    """Verify POST /api/v1/auth/switch-role dynamically switches active persona."""
    response = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "DISPATCHER"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == ROLE_DISPATCHER
    assert "access_token" in data


def test_api_roles_catalog():
    """Verify GET /api/v1/auth/roles returns 3 operational personas."""
    response = client.get("/api/v1/auth/roles")
    assert response.status_code == 200
    roles = response.json()
    assert len(roles) == 3
    role_ids = [r["id"] for r in roles]
    assert ROLE_DISPATCHER in role_ids
    assert ROLE_REGULATOR in role_ids
    assert ROLE_GUEST in role_ids


def test_rbac_approval_allowed_for_dispatcher():
    """Verify that DISPATCHER can submit an approval (201 Created)."""
    token = create_guest_token(role=ROLE_DISPATCHER, name="Dispatcher Budi")
    approval_payload = {
        "incident_id": "test-inc-42-disp",
        "route_id": "route-bypass-01",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "notes": "Disetujui oleh Dispatcher armada."
    }
    response = client.post(
        "/api/v1/approvals",
        json=approval_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["action"] == "ACCEPT"


def test_rbac_approval_rejected_for_regulator():
    """Verify that REGULATOR is forbidden from submitting an approval (403 Forbidden)."""
    token = create_guest_token(role=ROLE_REGULATOR, name="Pengawas Hendra")
    approval_payload = {
        "incident_id": "test-inc-42-reg",
        "route_id": "route-bypass-02",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "notes": "Upaya approval oleh regulator."
    }
    response = client.post(
        "/api/v1/approvals",
        json=approval_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
    data = response.json()
    assert "detail" in data
    assert "Akses ditolak" in str(data["detail"])


def test_rbac_approval_allowed_for_guest():
    """Verify that GUEST in sandbox mode can submit an approval (201 Created)."""
    token = create_guest_token(role=ROLE_GUEST, name="Evaluator Guest")
    approval_payload = {
        "incident_id": "test-inc-42-guest",
        "route_id": "route-bypass-03",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "notes": "Sandbox approval test."
    }
    response = client.post(
        "/api/v1/approvals",
        json=approval_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code in [200, 201]
