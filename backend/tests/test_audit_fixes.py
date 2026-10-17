import os
import sys
import pytest
import asyncio
from pathlib import Path

# Ensure backend directory is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from starlette.testclient import TestClient
from app.main import app
from app.routers.news_router import get_live_news

client = TestClient(app, raise_server_exceptions=False)

def test_root_endpoint():
    """Verify GET / returns 200 OK with service metadata."""
    res = client.get("/")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert data["status"] == "ok"
    assert data["service"] == "prehub-api"
    assert "version" in data
    assert data["docs"] == "/docs"
    assert data["health"] == "/health"
    print("PASS: test_root_endpoint")

def test_cors_preflight():
    """Verify OPTIONS /health with Vercel origins returns 200 OK with CORS headers."""
    origins = [
        "https://pre-hub.vercel.app",
        "https://preview-xyz.vercel.app",
        "https://peta-nadi.onrender.com",
        "http://localhost:3000"
    ]
    for origin in origins:
        res = client.options(
            "/health",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "content-type"
            }
        )
        assert res.status_code == 200, f"Failed OPTIONS for {origin}: {res.status_code}"
        assert res.headers.get("access-control-allow-origin") == origin, f"Missing CORS header for {origin}: {res.headers}"
    print("PASS: test_cors_preflight")

def test_demo_start():
    """Verify POST /api/demo/start returns 200 OK with mock fixtures or clean fallback."""
    # Test with mock_agents=True and offline=True
    res = client.post("/api/demo/start", json={"mock_agents": True, "offline": True})
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()
    assert "crisis_id" in data
    assert data["stage"] == 0
    assert "crisis_state" in data
    assert data["crisis_state"].get("status") in ["active", "ACTIVE", "validated"]
    print("PASS: test_demo_start (mock_agents=True)")

def test_get_live_news_background_tasks_none():
    """Verify get_live_news does not throw AttributeError when background_tasks is None."""
    async def _run():
        res = await get_live_news(background_tasks=None)
        assert res is not None
        assert "status" in res
        assert "articles" in res or "items" in res
    asyncio.run(_run())
    print("PASS: test_get_live_news_background_tasks_none")

def test_hitl_action_uuid_validation():
    """Verify POST /api/v1/news/hitl-action returns 422 for invalid non-UUID approval_id."""
    res = client.post(
        "/api/v1/news/hitl-action",
        json={
            "approval_id": "APPR-INVALID-NOT-UUID",
            "decision": "HOLD",
            "notes": "Testing invalid UUID validation"
        }
    )
    assert res.status_code == 422, f"Expected 422 for non-UUID, got {res.status_code}: {res.text}"
    detail = res.json().get("detail")
    assert "UUID" in str(detail), f"Expected UUID error message, got {detail}"
    print("PASS: test_hitl_action_uuid_validation")

if __name__ == "__main__":
    test_root_endpoint()
    test_cors_preflight()
    test_demo_start()
    test_get_live_news_background_tasks_none()
    test_hitl_action_uuid_validation()
    print("\nALL 5 TEST ASSERTIONS PASSED SUCCESSFULLY!")
