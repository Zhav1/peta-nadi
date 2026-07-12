"""
perf_check.py — Performance Audit Script

Measures the end-to-end execution time of `run_crisis_event()` in offline mode.
Asserts that the total execution time is under 180 seconds.
"""
import sys
import os
import time
import asyncio
import hashlib

# Add parent directory to path
base_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(base_dir)
sys.path.insert(0, backend_dir)

# Import the mock classes from run_demo
from run_demo import MockRedis, MockAsyncRedis, MockSupabaseClient

def setup_mock_environment():
    # Pre-populate mock store
    mock_store = {}
    
    # Pre-seed PIHPS latest data
    pihps_latest = {
        "minyak_goreng": {"current": 18500.0, "mean": 15800.0, "std": 1000.0},
        "cabai_merah": {"current": 48000.0, "mean": 42666.67, "std": 2000.0},
        "beras": {"current": 13500.0, "mean": 13450.0, "std": 500.0}
    }
    mock_store["lrip:pihps:latest"] = pihps_latest

    # Pre-seed TomTom segments
    mock_store["lrip:tomtom:segment:medan_toll_gate"] = {"delay_min": 5.0, "currentTravelTime": 600, "timestamp": time.time()}
    mock_store["lrip:tomtom:segment:tanjung_mulia_interchange"] = {"delay_min": 25.0, "currentTravelTime": 1500, "timestamp": time.time()}
    mock_store["lrip:tomtom:segment:pematangsiantar_km_128"] = {"delay_min": 180.0, "currentTravelTime": 10800, "timestamp": time.time()}
    mock_store["lrip:tomtom:segment:binjai_km_18"] = {"delay_min": 15.0, "currentTravelTime": 900, "timestamp": time.time()}
    mock_store["lrip:tomtom:segment:medan_hub"] = {"delay_min": 10.0, "currentTravelTime": 600, "timestamp": time.time()}

    # Pre-seed LTM query cache hash to avoid calling Gemini embedding API offline
    query_text = "port_closure in north_sumatra, belawan, pematangsiantar, tanjung mulia, critical severity"
    query_hash = hashlib.sha256(query_text.encode()).hexdigest()
    
    mock_store[f"lrip:ltm:cache:{query_hash}"] = [
        {
            "episode_id": "ltm-1",
            "title": "2024 Trans-Sumatra Flooding (Minyak Goreng Price Spike)",
            "description": "Heavy rainfall in Deli Serdang caused severe flooding, blocking the highway. Minyak goreng prices spiked by 15% due to distribution delays.",
            "crisis_type": "flood",
            "inflation_multiplier": 1.15,
            "recovery_days": 10,
            "similarity_score": 0.85
        },
        {
            "episode_id": "ltm-2",
            "title": "2023 Belawan Port Strike",
            "description": "Port operations stopped for 48 hours, causing container pileups and a 10% price increase in red chili.",
            "crisis_type": "port_closure",
            "inflation_multiplier": 1.10,
            "recovery_days": 5,
            "similarity_score": 0.75
        },
        {
            "episode_id": "ltm-3",
            "title": "2022 Wildfire Near Toll Road",
            "description": "Wildfires caused highway closure for 12 hours, delaying food distribution trucks.",
            "crisis_type": "wildfire",
            "inflation_multiplier": 1.08,
            "recovery_days": 3,
            "similarity_score": 0.70
        }
    ]

    # Pre-seed 3 social corroborations in OSINT stream to get high OSINT agent confidence
    mock_store["lrip:stream:osint:0"] = {
        "platform": "twitter",
        "raw_text": "Pelabuhan Belawan tutup lumpuh total! Kapal antri sampai 3 hari and jalan macet parah. #bencana #Belawan",
        "extracted_location": "Pelabuhan Belawan"
    }
    mock_store["lrip:stream:osint:1"] = {
        "platform": "tiktok",
        "raw_text": "Info longsor parah dekat Pematangsiantar. Jalan tertutup batu besar, lalu lintas macet total dan ditutup.",
        "extracted_location": "Pematangsiantar"
    }
    mock_store["lrip:stream:osint:2"] = {
        "platform": "facebook",
        "raw_text": "Tanjung Mulia interchange banjir parah dan macet total arah Belawan.",
        "extracted_location": "Tanjung Mulia"
    }

    # Monkeypatch clients
    import app.services.redis_client as rc
    import agents.memory.stm as stm
    import app.db.supabase_client as sc

    mock_redis_client = MockRedis(mock_store)
    mock_async_redis_client = MockAsyncRedis(mock_store)
    mock_supabase_client = MockSupabaseClient()

    rc.get_redis = lambda: mock_redis_client
    stm.get_async_redis = lambda: mock_async_redis_client
    sc.get_client = lambda: mock_supabase_client
    sc.get_service_client = lambda: mock_supabase_client
    
    # Also add mock hazard incidents to Supabase to pass OSINT PostGIS queries
    for i in range(1, 4):
        mock_supabase_client.incidents_data.append({
            "incident_id": f"inc-{i}",
            "title": f"Incident {i}",
            "type": "flood",
            "lat": 3.7922,
            "lon": 98.6776,
            "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia",
            "affected_polygon": {"type": "Polygon", "coordinates": []}
        })


async def run_audit():
    print("="*60)
    print("  PetaNadi Swarm Performance Audit")
    print("="*60)

    setup_mock_environment()

    synthetic_crisis = {
        "event_type": "port_closure",
        "source": "aisstream",
        "severity": "critical",
        "lat": 3.7922,
        "lon": 98.6776,
        "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia",
        "title": "Belawan Port — Simulated Closure (Flooding)",
        "is_simulated": True,
    }

    from app.workers.agent_worker import run_crisis_event

    print("Executing run_crisis_event() end-to-end...")
    start_time = time.time()
    final_state = await run_crisis_event(synthetic_crisis)
    elapsed = time.time() - start_time

    print(f"Total Execution Time : {elapsed:.4f} seconds")
    print(f"Validation Status    : {'VALIDATED' if final_state.get('validated') else 'NOT VALIDATED'}")
    print(f"Overall Confidence   : {final_state.get('overall_confidence', 0):.2%}")
    print(f"Consensus Status     : {final_state.get('status')}")

    # Assertions
    MAX_ALLOWED_TIME = 180.0
    print(f"Asserting runtime is < {MAX_ALLOWED_TIME} seconds...")
    
    try:
        assert elapsed < MAX_ALLOWED_TIME, f"Performance check FAILED: runtime was {elapsed:.2f}s (max allowed: {MAX_ALLOWED_TIME}s)"
        assert final_state.get("validated") == True, "Performance check FAILED: crisis state did not validate under consensus"
        print("\n[SUCCESS] Performance audit passed successfully!")
        sys.exit(0)
    except AssertionError as ae:
        print(f"\n[FAILURE] {ae}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run_audit())
