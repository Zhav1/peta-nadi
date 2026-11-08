"""
Regression: the fleet endpoints must not block the asyncio event loop.

`get_unified_fleet` does blocking SQLite reads and Supabase HTTP round-trips.
If it runs inline in an async handler it stalls every other request — notably
/api/v1/health, which external keepalive crons poll — so it is offloaded with
run_in_threadpool.

Measurement note: httpx's ASGITransport dispatches in-process, so a request
that only *starts* after the loop is released still looks fast by its own
duration. The reliable signal is whether other coroutines make progress *while*
the fleet query is in flight, so we tick a heartbeat alongside it.

`asyncio.gather` is not used to start the fleet request: on some builds it runs
the coroutines sequentially, which would hide the stall entirely. Instead the
request is submitted with `asyncio.run_coroutine_threadsafe` (a real concurrent
driver, the same way uvicorn serves overlapping requests).
"""
import asyncio
import time

import httpx
import pytest

from app.main import app
from app.routers import vehicles_router
from app.services.telemetry_service import telemetry_service

SLEEP_SECONDS = 0.4
HEARTBEAT_INTERVAL = 0.01
# A blocked loop produces zero heartbeats until the sleep ends. Generous
# margin so a slow CI box cannot flake the assertion.
MIN_HEARTBEATS_DURING_SLEEP = 5


def _slow_fleet(*args, **kwargs):
    time.sleep(SLEEP_SECONDS)
    return []


async def _drive_fleet_request(client, url, beats):
    """Start `url` concurrently, then heartbeat the loop while it is in flight."""
    loop = asyncio.get_running_loop()
    future = asyncio.run_coroutine_threadsafe(client.get(url), loop)
    try:
        started = time.monotonic()
        while not future.done() and (time.monotonic() - started) < (SLEEP_SECONDS * 3):
            await asyncio.sleep(HEARTBEAT_INTERVAL)
            beats[0] += 1
        return await asyncio.wrap_future(future)
    finally:
        if not future.done():
            future.cancel()


@pytest.mark.asyncio
async def test_health_stays_responsive_while_fleet_query_runs(monkeypatch):
    monkeypatch.setattr(telemetry_service, "get_unified_fleet", _slow_fleet)
    vehicles_router.clear_fleet_cache()

    beats = [0]
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        fleet_response = await _drive_fleet_request(
            client, "/api/v1/fleet/vehicles", beats
        )
        health_started = time.monotonic()
        health_response = await client.get("/api/v1/health")
        health_elapsed = time.monotonic() - health_started

    assert fleet_response.status_code == 200
    assert fleet_response.json()["vehicles"] == []
    assert health_response.status_code == 200
    assert health_elapsed < 0.25, (
        f"/health took {health_elapsed:.3f}s — the event loop is blocked"
    )
    assert beats[0] >= MIN_HEARTBEATS_DURING_SLEEP, (
        f"event loop only ticked {beats[0]} time(s) during the "
        f"{SLEEP_SECONDS}s fleet query — blocking call still on the loop"
    )
    vehicles_router.clear_fleet_cache()


@pytest.mark.asyncio
async def test_vehicle_geometry_offloads_fleet_query(monkeypatch):
    monkeypatch.setattr(telemetry_service, "get_unified_fleet", _slow_fleet)
    vehicles_router.clear_fleet_cache()

    beats = [0]
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        geometry_response = await _drive_fleet_request(
            client, "/api/v1/fleet/vehicles/NOPE-404/geometry", beats
        )

    assert geometry_response.status_code == 404
    assert beats[0] >= MIN_HEARTBEATS_DURING_SLEEP, (
        f"event loop only ticked {beats[0]} time(s) during the "
        f"{SLEEP_SECONDS}s fleet query — blocking call still on the loop"
    )
    vehicles_router.clear_fleet_cache()
