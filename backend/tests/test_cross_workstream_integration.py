"""
Cross-Workstream Integration Smoke Tests
Verifies that:
- GET /api/v1/fleet/vehicles returns canonical Pydantic telemetry models with tracking fields
- GET /api/v1/geocode/nodes returns Sumatra gazetteer nodes and boundaries
- GET /api/v1/geocode/search?q=Berastagi handles live/cached search
- POST /api/v1/routing/solve-path solves routing paths
- resolve_canonical_article_url correctly normalizes Google News RSS and raw article URLs
"""
import pytest
from urllib.parse import urlparse
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.fleet import FleetVehicleTelemetry, SignalStatus
from app.services.news_aggregator import resolve_canonical_article_url

client = TestClient(app)


def test_fleet_vehicles_canonical_schema():
    """Validates /api/v1/fleet/vehicles with first-class tracking fields."""
    response = client.get("/api/v1/fleet/vehicles")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["total_vehicles"] > 0
    assert len(data["vehicles"]) > 0

    # Validate first vehicle conforms to FleetVehicleTelemetry
    first_v = data["vehicles"][0]
    telemetry = FleetVehicleTelemetry(**first_v)
    assert telemetry.tracking_mode is not None
    assert hasattr(telemetry, "origin_coords")
    assert hasattr(telemetry, "dest_coords")
    assert hasattr(telemetry, "departure_time")
    assert hasattr(telemetry, "current_coords")


def test_geocode_nodes():
    """Validates /api/v1/geocode/nodes endpoint."""
    response = client.get("/api/v1/geocode/nodes")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "nodes" in data
    assert len(data["nodes"]) >= 50
    assert "boundaries" in data


def test_geocode_search_berastagi():
    """Validates /api/v1/geocode/search with query 'Berastagi'."""
    response = client.get("/api/v1/geocode/search?q=Berastagi")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "results" in data
    assert len(data["results"]) > 0
    # At least one result should contain coordinates near Berastagi / Karo
    top = data["results"][0]
    assert "lat" in top and "lon" in top
    assert 2.0 <= top["lat"] <= 4.0
    assert 97.0 <= top["lon"] <= 100.0


def test_routing_solve_path():
    """Validates POST /api/v1/routing/solve-path."""
    payload = {
        "origin_id": "belawan_port",
        "dest_id": "tebing_tinggi",
        "k_alternatives": 2
    }
    response = client.post("/api/v1/routing/solve-path", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "routes" in data
    assert len(data["routes"]) >= 1
    primary_route = data["routes"][0]
    assert primary_route["distance_km"] > 0
    assert len(primary_route["coordinates"]) >= 2


def test_resolve_canonical_article_url():
    """Validates resolve_canonical_article_url handles direct, search, redirect and syndicated URLs."""
    direct = "https://sumut.antaranews.com/berita/123456/kondisi-jalan-medan"
    assert resolve_canonical_article_url(direct) == direct
    assert resolve_canonical_article_url(direct, "Kondisi Jalan Medan", "ANTARA Sumut") == direct

    # Google News RSS fallback URL (undecodable token) must land on the publisher host,
    # never on a Google search/landing host (news_router treats news.google.com/search as legacy).
    gn_url = "https://news.google.com/rss/articles/opaque_sample_test"
    resolved = resolve_canonical_article_url(
        gn_url,
        title="Banjir Jalinsum Tebing Tinggi",
        source="Antara News"
    )
    assert resolved.startswith("http")
    assert "google." not in urlparse(resolved).netloc
    assert "antaranews.com/search" in resolved

    # Legacy Google News search links are rewritten to the publisher host
    goog_search = "https://news.google.com/search?q=Banjir%20Medan&hl=id-ID&gl=ID&ceid=ID:id"
    rewritten = resolve_canonical_article_url(goog_search, title="Banjir Medan", source="ANTARA")
    assert "google." not in urlparse(rewritten).netloc
    assert rewritten.startswith("https://www.antaranews.com/search?q=")

    # Google redirect wrappers unwrap to the real publisher host
    wrapped = "https://www.google.com/url?q=https%3A%2F%2Fwww.detik.com%2Fsumut%2Fberita%2Fd-123%2Fjudul&sa=D"
    assert resolve_canonical_article_url(wrapped, "Judul", "Detik") == \
        "https://www.detik.com/sumut/berita/d-123/judul"

