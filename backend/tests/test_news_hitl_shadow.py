"""Hermetic regression tests for the news HITL shadow guard."""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock

from fastapi.testclient import TestClient

from app.auth.supabase_auth import ROLE_DISPATCHER, ROLE_REGULATOR, create_guest_token
from app.main import app


APPROVAL_ID = "49fd73bc-02a8-4fd1-9e8c-d521ca13b09c"


def _headers(role: str = ROLE_DISPATCHER) -> dict[str, str]:
    token = create_guest_token(role=role, company_id="research-tenant")
    return {"Authorization": f"Bearer {token}"}


def test_shadow_hitl_returns_candidate_preview_without_database_access(monkeypatch):
    from app.db import supabase_client
    from app.services import pilot_safety

    monkeypatch.setattr(
        pilot_safety,
        "get_settings",
        lambda: SimpleNamespace(pilot_shadow_mode=True),
    )
    get_service_client = Mock(side_effect=AssertionError("shadow preview must not read or write DB"))
    get_write_client = Mock(side_effect=AssertionError("shadow preview must not write DB"))
    monkeypatch.setattr(supabase_client, "get_service_client", get_service_client)
    monkeypatch.setattr(supabase_client, "get_write_client", get_write_client)

    response = TestClient(app).post(
        "/api/v1/news/hitl-action",
        headers=_headers(),
        json={"approval_id": APPROVAL_ID, "decision": "APPROVE"},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == body["application_status"] == "shadow_preview"
    assert body["decision_scope"] == "news_hitl_candidate_research_preview"
    assert body["applied"] is False
    assert body["recorded"] is False
    assert body["persistence_status"] == "not_persisted"
    assert body["external_dispatch_status"] == "disabled"
    assert body["preview"]["approval_id"] == APPROVAL_ID
    assert body["preview"]["candidate_only"] is True
    assert body["preview"]["existing_approval_validation"] == "not_performed"
    assert body["preview"]["tenant_record_ownership"] == "not_checked"
    assert "no existing approval was read" in body["preview"]["message"]
    get_service_client.assert_not_called()
    get_write_client.assert_not_called()


def test_unauthorized_hitl_request_fails_before_database_access(monkeypatch):
    from app.db import supabase_client
    from app.services import pilot_safety

    monkeypatch.setattr(
        pilot_safety,
        "get_settings",
        lambda: SimpleNamespace(pilot_shadow_mode=True),
    )
    get_service_client = Mock(side_effect=AssertionError("unauthorized request reached DB"))
    get_write_client = Mock(side_effect=AssertionError("unauthorized request reached DB"))
    monkeypatch.setattr(supabase_client, "get_service_client", get_service_client)
    monkeypatch.setattr(supabase_client, "get_write_client", get_write_client)

    response = TestClient(app).post(
        "/api/v1/news/hitl-action",
        headers=_headers(ROLE_REGULATOR),
        json={"approval_id": APPROVAL_ID, "decision": "APPROVE"},
    )

    assert response.status_code == 403, response.text
    get_service_client.assert_not_called()
    get_write_client.assert_not_called()
