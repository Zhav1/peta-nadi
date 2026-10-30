"""
Unit & Integration Tests for Supabase JWT Auth & RBAC (Phase 42).
"""

import io
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
from app.db.local_storage import init_db, delete_custom_vehicle
from app.services.telemetry_service import telemetry_service

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
    """Verify that a signed Guest token decodes as strictly read-only."""
    token = create_guest_token(role=ROLE_GUEST)
    session = decode_and_verify_token(token)

    assert session.role == ROLE_GUEST
    assert session.permissions == ["benchmark:read", "reports:read"]


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


def test_forged_signature_token_rejected():
    """Verify that a token signed with an attacker-controlled secret is rejected (no unsigned fallback)."""
    forged_token = jwt.encode(
        {
            "sub": "forged-attacker",
            "email": "attacker@prehub.id",
            "app_metadata": {"role": "DISPATCHER"},
            "iat": int(time.time()),
            "exp": int(time.time()) + 3600,
        },
        "attacker-controlled-secret",
        algorithm="HS256",
    )

    with pytest.raises(Exception) as exc_info:
        decode_and_verify_token(forged_token)
    assert "401" in str(exc_info.value) or "signature" in str(exc_info.value).lower() or "tanda tangan" in str(exc_info.value).lower()


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
    """Phase 161: anonymous callers may not mint operator personas (403)."""
    response = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "REGULATOR", "org_name": "Dinas Perhubungan Sumut"},
    )
    assert response.status_code == 403
    detail = response.json()["detail"]
    assert detail["error"] == "FORBIDDEN"
    assert detail["allowed_roles"] == [ROLE_GUEST]


def test_api_create_guest_session_anonymous_guest_allowed():
    """Phase 161: anonymous callers may still mint a GUEST token for demo_sandbox."""
    response = client.post("/api/v1/auth/guest-session", json={"role": "GUEST"})
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == ROLE_GUEST
    assert data["user"]["company_id"] == "demo_sandbox"


def test_api_create_guest_session_invalid_role():
    """Verify POST /api/v1/auth/guest-session with invalid role returns 400."""
    response = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "SUPER_ADMIN_HACK"},
    )
    assert response.status_code == 400


def test_api_switch_role():
    """Verify POST /api/v1/auth/switch-role switches persona for an authenticated session."""
    token = create_guest_token(role=ROLE_GUEST)
    response = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "DISPATCHER"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["user"]["role"] == ROLE_DISPATCHER
    assert "access_token" in data


def test_api_switch_role_requires_authentication():
    """Verify POST /api/v1/auth/switch-role without a token is rejected (401)."""
    response = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "DISPATCHER"},
    )
    assert response.status_code == 401


def test_api_switch_role_rejects_forged_signature():
    """Verify POST /api/v1/auth/switch-role rejects a forged (unverifiable) Bearer token."""
    forged_token = jwt.encode(
        {
            "sub": "forged-attacker",
            "app_metadata": {"role": "DISPATCHER"},
            "exp": int(time.time()) + 3600,
        },
        "attacker-controlled-secret",
        algorithm="HS256",
    )
    response = client.post(
        "/api/v1/auth/switch-role",
        json={"role": "DISPATCHER"},
        headers={"Authorization": f"Bearer {forged_token}"},
    )
    assert response.status_code == 401


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


def test_rbac_incident_review_allowed_for_dispatcher():
    """A Dispatcher may review an incident without implying a trip was changed."""
    token = create_guest_token(role=ROLE_DISPATCHER, name="Dispatcher Budi")
    approval_payload = {
        "incident_id": "test-inc-42-disp",
        "route_id": "route-bypass-01",
        "action": "REJECT",
        "tactical_action": "REROUTE",
        "notes": "Review insiden saja; tidak ada trip yang diubah."
    }
    response = client.post(
        "/api/v1/approvals",
        json=approval_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["action"] == "REJECT"
    assert data["application_status"] in {"decision_recorded", "decision_recorded_locally"}


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


def test_rbac_approval_rejected_for_guest():
    """Verify that a GUEST token and the default guest profile are both denied approval writes (403)."""
    approval_payload = {
        "incident_id": "test-inc-42-guest",
        "route_id": "route-bypass-03",
        "action": "ACCEPT",
        "tactical_action": "REROUTE",
        "notes": "Sandbox approval test."
    }

    token = create_guest_token(role=ROLE_GUEST, name="Evaluator Guest")
    token_response = client.post(
        "/api/v1/approvals",
        json=approval_payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert token_response.status_code == 403
    assert token_response.json()["detail"]["current_role"] == ROLE_GUEST

    profile_response = client.post("/api/v1/approvals", json=approval_payload)
    assert profile_response.status_code == 403
    assert "Akses ditolak" in str(profile_response.json()["detail"])


RBAC_FLEET_VEHICLE_IDS = [
    "RBAC-GUEST-TRK-01",
    "RBAC-GUEST-CSV-01",
    "RBAC-DISP-TRK-01",
    "RBAC-DISP-JSON-01",
    "RBAC-DISP-CSV-01",
    "RBAC-DISP-DEL-01",
]


@pytest.fixture(autouse=True)
def cleanup_rbac_fleet_vehicles():
    """Ensure fleet units created by RBAC tests are removed before and after each test."""
    init_db()
    for vid in RBAC_FLEET_VEHICLE_IDS:
        delete_custom_vehicle(vid)
    yield
    for vid in RBAC_FLEET_VEHICLE_IDS:
        delete_custom_vehicle(vid)


def test_rbac_fleet_register_rejected_for_guest():
    """Verify that a GUEST token and the default guest profile cannot register fleet units (403)."""
    payload = {"vehicle_id": "RBAC-GUEST-TRK-01", "name": "Truk Guest Ilegal", "modality": "truck"}

    token = create_guest_token(role=ROLE_GUEST, name="Evaluator Guest")
    token_response = client.post(
        "/api/v1/fleet/register",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert token_response.status_code == 403
    assert token_response.json()["detail"]["current_role"] == ROLE_GUEST

    profile_response = client.post("/api/v1/fleet/register", json=payload)
    assert profile_response.status_code == 403
    assert "Akses ditolak" in str(profile_response.json()["detail"])


def test_rbac_fleet_register_allowed_for_dispatcher():
    """Verify that DISPATCHER can register a fleet unit (200)."""
    token = create_guest_token(role=ROLE_DISPATCHER, name="Dispatcher Budi")
    payload = {"vehicle_id": "RBAC-DISP-TRK-01", "name": "Truk Dispatcher RBAC", "modality": "truck"}

    response = client.post(
        "/api/v1/fleet/register",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["registered_count"] == 1
    assert data["vehicles"][0]["vehicle_id"] == "RBAC-DISP-TRK-01"


def test_rbac_fleet_upload_manifest_rejected_for_guest():
    """Verify that a GUEST token and the default guest profile cannot upload JSON manifests (403)."""
    payload = {
        "manifest_name": "Manifest Guest Ilegal",
        "vehicles": [{"vehicle_id": "RBAC-GUEST-CSV-01", "name": "Truk Manifest Guest", "modality": "truck"}],
    }

    token = create_guest_token(role=ROLE_GUEST, name="Evaluator Guest")
    token_response = client.post(
        "/api/v1/fleet/upload-manifest",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert token_response.status_code == 403
    assert token_response.json()["detail"]["current_role"] == ROLE_GUEST

    profile_response = client.post("/api/v1/fleet/upload-manifest", json=payload)
    assert profile_response.status_code == 403
    assert "Akses ditolak" in str(profile_response.json()["detail"])


def test_rbac_fleet_upload_manifest_allowed_for_dispatcher():
    """Verify that DISPATCHER can upload a JSON manifest (200)."""
    token = create_guest_token(role=ROLE_DISPATCHER, name="Dispatcher Budi")
    payload = {
        "manifest_name": "Manifest Dispatcher RBAC",
        "vehicles": [{"vehicle_id": "RBAC-DISP-JSON-01", "name": "Truk Manifest Dispatcher", "modality": "truck"}],
    }

    response = client.post(
        "/api/v1/fleet/upload-manifest",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["registered_count"] == 1


def test_rbac_fleet_upload_manifest_file_rejected_for_guest():
    """Verify that a GUEST token and the default guest profile cannot upload CSV manifests (403)."""
    csv_data = (
        "vehicle_id,name,modality\n"
        "RBAC-GUEST-CSV-01,Truk Guest CSV,truck\n"
    )

    def _files_payload():
        return {"file": ("manifest.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}

    token = create_guest_token(role=ROLE_GUEST, name="Evaluator Guest")
    token_response = client.post(
        "/api/v1/fleet/upload-manifest/file",
        files=_files_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    assert token_response.status_code == 403
    assert token_response.json()["detail"]["current_role"] == ROLE_GUEST

    profile_response = client.post("/api/v1/fleet/upload-manifest/file", files=_files_payload())
    assert profile_response.status_code == 403
    assert "Akses ditolak" in str(profile_response.json()["detail"])


def test_rbac_fleet_upload_manifest_file_allowed_for_dispatcher():
    """Verify that DISPATCHER can upload a CSV manifest file (200)."""
    csv_data = (
        "vehicle_id,name,modality\n"
        "RBAC-DISP-CSV-01,Truk Dispatcher CSV,truck\n"
    )
    files = {"file": ("manifest.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}

    token = create_guest_token(role=ROLE_DISPATCHER, name="Dispatcher Budi")
    response = client.post(
        "/api/v1/fleet/upload-manifest/file",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["registered_count"] == 1


def test_rbac_fleet_delete_rejected_for_guest():
    """Verify that a GUEST token and the default guest profile cannot delete fleet units (403)."""
    telemetry_service.register_custom_vehicle({
        "vehicle_id": "RBAC-DISP-DEL-01",
        "name": "Truk Hapus RBAC",
        "modality": "truck",
    })

    token = create_guest_token(role=ROLE_GUEST, name="Evaluator Guest")
    token_response = client.delete(
        "/api/v1/fleet/custom/RBAC-DISP-DEL-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert token_response.status_code == 403
    assert token_response.json()["detail"]["current_role"] == ROLE_GUEST

    profile_response = client.delete("/api/v1/fleet/custom/RBAC-DISP-DEL-01")
    assert profile_response.status_code == 403
    assert "Akses ditolak" in str(profile_response.json()["detail"])

    remaining = client.get("/api/v1/fleet/custom").json()
    assert any(u["vehicle_id"] == "RBAC-DISP-DEL-01" for u in remaining)


def test_rbac_fleet_delete_allowed_for_dispatcher():
    """Verify that DISPATCHER can delete a fleet unit (200)."""
    telemetry_service.register_custom_vehicle({
        "vehicle_id": "RBAC-DISP-DEL-01",
        "name": "Truk Hapus Dispatcher RBAC",
        "modality": "truck",
    })

    token = create_guest_token(role=ROLE_DISPATCHER, name="Dispatcher Budi")
    response = client.delete(
        "/api/v1/fleet/custom/RBAC-DISP-DEL-01",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "success"


def test_rbac_company_id_tenancy_propagation():
    """Verify that company_id is preserved and decoded in UserSession and /api/v1/auth/me."""
    token = create_guest_token(
        role=ROLE_DISPATCHER,
        company_id="pos_logistik",
        org_name="PT Pos Logistik Indonesia",
        name="Dispatcher Pos"
    )
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    profile = res.json()
    assert profile["company_id"] == "pos_logistik"
    assert profile["role"] == ROLE_DISPATCHER


def test_guest_session_endpoint_accepts_company_id():
    """
    Phase 161: an authenticated evaluator may mint any role, but only inside the
    evaluator tenant allowlist (default demo_sandbox). A real pilot tenant is 403.
    """
    evaluator_token = create_guest_token(role=ROLE_GUEST, company_id="demo_sandbox")
    payload = {
        "role": "DISPATCHER",
        "company_id": "pelindo_belawan",
        "org_name": "PT Pelabuhan Indonesia",
        "name": "Dispatcher Pelindo",
    }
    res = client.post(
        "/api/v1/auth/guest-session",
        json=payload,
        headers={"Authorization": f"Bearer {evaluator_token}"},
    )
    assert res.status_code == 403
    assert res.json()["detail"]["error"] == "FORBIDDEN"

    allowed = client.post(
        "/api/v1/auth/guest-session",
        json={"role": "DISPATCHER", "company_id": "demo_sandbox"},
        headers={"Authorization": f"Bearer {evaluator_token}"},
    )
    assert allowed.status_code == 200
    data = allowed.json()
    assert "access_token" in data
    assert data["user"]["company_id"] == "demo_sandbox"
    assert data["user"]["role"] == "DISPATCHER"


def test_asymmetric_es256_jwks_token_validation(monkeypatch):
    """
    Verify that decode_and_verify_token correctly validates asymmetrically
    signed ES256 Supabase JWTs via PyJWKClient.
    """
    from cryptography.hazmat.primitives.asymmetric import ec
    from unittest.mock import MagicMock
    from fastapi import HTTPException
    from app.auth.supabase_auth import decode_and_verify_token

    # 1. Generate EC key pair (P-256 for ES256)
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    # 2. Issue an ES256 token matching real Supabase token structure
    token_payload = {
        "sub": "44444444-4444-4444-8444-444444444444",
        "email": "pilot.es256@poslogistik.co.id",
        "exp": int(time.time()) + 3600,
        "app_metadata": {
            "provider": "email",
            "role": "DISPATCHER",
            "company_id": "pos_logistik",
        },
        "user_metadata": {
            "name": "Budi Santoso ES256",
            "company_id": "pos_logistik",
        },
    }
    es256_token = jwt.encode(
        token_payload,
        private_key,
        algorithm="ES256",
        headers={"kid": "mock-supabase-key-id"},
    )

    # 3. Mock PyJWKClient to return the matching public key
    mock_signing_key = MagicMock()
    mock_signing_key.key = public_key

    mock_jwks_client = MagicMock()
    mock_jwks_client.get_signing_key_from_jwt.return_value = mock_signing_key

    monkeypatch.setattr("app.auth.supabase_auth.get_jwks_client", lambda url: mock_jwks_client)

    # 4. Verify decoding succeeds and populates UserSession correctly
    session = decode_and_verify_token(es256_token)
    assert session.id == "44444444-4444-4444-8444-444444444444"
    assert session.email == "pilot.es256@poslogistik.co.id"
    assert session.role == "DISPATCHER"
    assert session.company_id == "pos_logistik"
    assert "fleet:write" in session.permissions

    # 5. Verify forged/mismatched signature is rejected
    tampered_key = ec.generate_private_key(ec.SECP256R1())
    forged_token = jwt.encode(
        token_payload,
        tampered_key,
        algorithm="ES256",
        headers={"kid": "mock-supabase-key-id"},
    )
    with pytest.raises(HTTPException) as exc_info:
        decode_and_verify_token(forged_token)
    assert exc_info.value.status_code == 401
    assert "INVALID_SIGNATURE" in str(exc_info.value.detail)
