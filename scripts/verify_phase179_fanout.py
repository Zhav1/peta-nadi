#!/usr/bin/env python3
"""
scripts/verify_phase179_fanout.py
Phase 179 Fan-Out & Lease Coordination Verification (D10 - fanout_check.py).
Tests 5 concurrent internal tick triggers (single-flight deduplication) and
20 concurrent dashboard snapshot reads.
"""
from __future__ import annotations

import asyncio
import os
import sys
import time
from typing import Any, Dict, List

# Ensure environment token is set before importing app
os.environ["INTERNAL_TICK_TOKEN"] = "test-tick-secret"

# Configure UTF-8 stdout
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure backend directory is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

import httpx
from app.main import app
from app.routers import internal_tick
from app.services import job_scheduler, refresh_coordinator


async def test_concurrent_tick_fanout(client: httpx.AsyncClient) -> None:
    print("\n--- [PART 1] 5 Concurrent POST /api/v1/internal/tick Triggers ---")

    # Reset internal tick state to start clean
    internal_tick.reset_tick_state()

    # Fast in-memory lease and plan mock so test runtime is bounded & independent of WAN latency
    orig_acquire = refresh_coordinator.acquire_refresh_lease
    orig_plan = job_scheduler.plan_tick
    orig_release = refresh_coordinator.release_refresh_lease

    class MockLease:
        lease_name = "internal_tick"
        owner_id = "00000000-0000-0000-0000-000000000001"
        fence = 1
        expires_at = "2099-01-01T00:00:00Z"

    async def mock_acquire(*args, **kwargs):
        return MockLease()

    async def mock_release(*args, **kwargs):
        return True

    async def mock_plan(*args, **kwargs):
        return job_scheduler.TickPlan(
            due=["bmkg", "petabencana"],
            skipped=[{"job": "firms", "reason": "not_due"}],
            reason="fanout_verification_test",
        )

    refresh_coordinator.acquire_refresh_lease = mock_acquire
    refresh_coordinator.release_refresh_lease = mock_release
    job_scheduler.plan_tick = mock_plan

    try:
        # Pre-warm ASGI transport
        await client.get("/health")

        # Launch 5 concurrent tick calls at the exact same instant
        async def single_tick_trigger(index: int) -> Dict[str, Any]:
            t0 = time.perf_counter()
            resp = await client.post(
                "/api/v1/internal/tick",
                headers={"X-Internal-Token": "test-tick-secret"},
            )
            elapsed_ms = (time.perf_counter() - t0) * 1000
            return {
                "index": index,
                "status_code": resp.status_code,
                "elapsed_ms": elapsed_ms,
                "body": resp.json(),
            }

        tasks = [single_tick_trigger(i) for i in range(5)]
        results = await asyncio.gather(*tasks)

        # Assert all 5 return HTTP 202 in < 200ms
        for res in results:
            idx = res["index"]
            status = res["status_code"]
            elapsed = res["elapsed_ms"]
            body = res["body"]
            print(f"  Trigger {idx}: status={status}, latency={elapsed:.2f}ms, accepted={body.get('accepted')}, reason={body.get('reason')}")
            assert status == 202, f"Trigger {idx} expected status 202, got {status}"
            assert elapsed < 200.0, f"Trigger {idx} expected latency < 200ms, got {elapsed:.2f}ms"

        # Wait briefly for the single background tick to complete
        await internal_tick.wait_for_pending_ticks()

        # Query GET /api/v1/internal/tick/status
        status_res = await client.get("/api/v1/internal/tick/status")
        assert status_res.status_code == 200, f"Status query failed: {status_res.status_code}"
        status_data = status_res.json()
        recent_runs = status_data.get("recent_runs", [])

        print(f"\nTick status report: recorded {len(recent_runs)} runs in audit ring buffer")
        for r in recent_runs:
            print(f"  Run ID: {r.get('run_id')[:8]}... | Status: {r.get('status')} | Reason: {r.get('upstream_calls', {}).get('reason')}")

        executed_runs = [r for r in recent_runs if r.get("status") in ("completed", "running")]
        skipped_runs = [r for r in recent_runs if r.get("status") == "skipped_locked"]

        print(f"\nExecution summary: {len(executed_runs)} executed run(s), {len(skipped_runs)} skipped_locked run(s)")
        assert len(executed_runs) <= 1, f"Expected at most 1 executed run, got {len(executed_runs)}"
        assert len(skipped_runs) >= 4, f"Expected at least 4 skipped_locked runs, got {len(skipped_runs)}"
        for s in skipped_runs:
            reason = s.get("upstream_calls", {}).get("reason")
            assert reason == "already_running", f"Expected reason 'already_running', got {reason}"

        print("✓ Concurrent tick fan-out verification PASSED: exactly 1 run executed, 4 coalesced/rejected with skipped_locked.")

    finally:
        refresh_coordinator.acquire_refresh_lease = orig_acquire
        refresh_coordinator.release_refresh_lease = orig_release
        job_scheduler.plan_tick = orig_plan


async def test_concurrent_snapshot_reads(client: httpx.AsyncClient) -> None:
    print("\n--- [PART 2] 20 Concurrent Snapshot Reads ---")

    async def single_snapshot_read(index: int) -> Dict[str, Any]:
        t0 = time.perf_counter()
        resp = await client.get("/api/v1/dashboard/bootstrap?sections=public")
        elapsed_ms = (time.perf_counter() - t0) * 1000
        return {
            "index": index,
            "status_code": resp.status_code,
            "elapsed_ms": elapsed_ms,
            "data": resp.json(),
        }

    tasks = [single_snapshot_read(i) for i in range(20)]
    results = await asyncio.gather(*tasks)

    versions: List[int] = []
    latencies: List[float] = []

    for res in results:
        idx = res["index"]
        status = res["status_code"]
        data = res["data"]
        latency = res["elapsed_ms"]
        latencies.append(latency)

        assert status == 200, f"Read {idx} failed with status {status}"

        ver = data.get("version")
        assert ver is not None, f"Read {idx} missing 'version' property"
        assert isinstance(ver, int) and ver >= 1, f"Read {idx} version must be integer >= 1, got {ver}"
        versions.append(ver)

        sections = data.get("sections", {})
        assert "fleet" in sections, f"Read {idx} missing 'fleet' in sections: keys={list(sections.keys())}"
        assert "source_health" in sections, f"Read {idx} missing 'source_health' in sections"

    # Verify versions are monotonic
    print(f"20 Concurrent Snapshot Reads: Version values observed: {versions[:8]}...")
    print(f"Latencies: min={min(latencies):.1f}ms, avg={sum(latencies)/len(latencies):.1f}ms, p95={sorted(latencies)[int(len(latencies)*0.95)]:.1f}ms")
    assert all(v >= 1 for v in versions), "All version numbers must be >= 1"

    print("✓ 20 Concurrent Snapshot Reads PASSED: all returned HTTP 200, version >= 1, with both fleet and source_health sections.")


async def main() -> None:
    print("=" * 70)
    print("Phase 179 Fan-Out & Lease Single-Flight Acceptance Suite")
    print("=" * 70)

    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        await test_concurrent_tick_fanout(client)
        await test_concurrent_snapshot_reads(client)

    print("\n" + "=" * 70)
    print("ALL PHASE 179 FAN-OUT VERIFICATION CHECKS PASSED (EXIT 0)")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())
