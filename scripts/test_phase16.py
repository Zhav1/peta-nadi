"""
Standalone verification script for Phase 16 Corridor Service & AI CoT logic.
"""
import sys
import os
import asyncio
import json

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.corridor_service import get_corridor_context
from agents.nodes.decision_support import decision_support_copilot
from agents.state import CrisisState

async def test_corridor_service():
    print("\n--- 1. Testing get_corridor_context() ---")
    ctx = await get_corridor_context("sumatra_belawan_medan")
    print("Corridor ID:", ctx.get("corridor_id"))
    print("Weather Status:", ctx.get("weather", {}).get("status"))
    print("Traffic Congestion:", ctx.get("traffic", {}).get("congestion_level_pct"), "%")
    print("PIHPS Chili Price: Rp", ctx.get("commodity_prices", {}).get("chili_price"))
    assert "weather" in ctx
    assert "traffic" in ctx
    assert "commodity_prices" in ctx
    print("✓ get_corridor_context() PASSED")

async def test_ai_cot_reasoning():
    print("\n--- 2. Testing AI Copilot CoT Prompt Injection ---")
    mock_state: CrisisState = {
        "crisis_id": "test-crisis-16",
        "title": "Belawan Port Flood & Highway Congestion",
        "type": "flood",
        "is_simulated": True,
        "lat": 3.78,
        "lon": 98.67,
        "region": "north_sumatra",
        "status": "validating",
        "overall_confidence": 0.88,
        "validated": True,
        "created_at": "2026-07-22T16:00:00Z",
        "updated_at": "2026-07-22T16:00:00Z",
        "messages": []
    }
    res = await decision_support_copilot(mock_state)
    output = res.get("decision_support_output", "")
    print("\nAI Copilot Decision Support Output:")
    print("--------------------------------------------------")
    print(output)
    print("--------------------------------------------------")
    assert "RINGKASAN ANCAMAN FISIK" in output or "Physical Threat" in output or "Cuaca" in output or "ANALSIS" in output or "CRISIS" in output
    print("✓ AI Copilot CoT Reasoning PASSED")

async def main():
    await test_corridor_service()
    await test_ai_cot_reasoning()
    print("\n✅ PHASE 16 BACKEND VERIFICATION COMPLETE")

if __name__ == "__main__":
    asyncio.run(main())
