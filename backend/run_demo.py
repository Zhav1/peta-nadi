"""
run_demo.py — PetaNadi Hackathon Demo Injector

Injects a synthetic Belawan Port closure + Trans-Sumatra Highway flood scenario
into Redis Streams, triggering the full agent pipeline.

Usage:
    python run_demo.py [--scenario belawan_flood] [--dry-run]

Scenarios:
    belawan_flood   — Belawan Port closure + Trans-Sumatra Highway flooding
                      (North Sumatra corridor, cooking oil supply shock)
"""
import argparse
import json
import sys
import os
from datetime import datetime, timezone

# Add backend to path so we can import app modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

SCENARIOS = {
    "belawan_flood": {
        "description": "Belawan Port closure + Trans-Sumatra Highway flooding — North Sumatra",
        "region": "north_sumatra",
        "corridor": "Belawan Port -> Trans-Sumatra Highway",
        "events": [
            # TODO: Phase 6 — populate with full synthetic event dataset:
            # - NASA FIRMS wildfire polygon (mocked)
            # - BMKG severe weather alert (mocked)
            # - TomTom congestion event: Trans-Sumatra velocity → 0 km/h
            # - PIHPS cooking oil price spike: +12%
            # - AISstream port queue depth: +8 vessels waiting
            # - Social OSINT transcript: TikTok flood video near Km 41
        ],
    }
}


def print_scenario_info(scenario: dict):
    print(f"\n{'='*60}")
    print(f"  PetaNadi Demo Injector")
    print(f"{'='*60}")
    print(f"  Scenario  : {scenario['description']}")
    print(f"  Corridor  : {scenario['corridor']}")
    print(f"  Events    : {len(scenario['events'])} (0 = Phase 6 stub)")
    print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(
        description="PetaNadi Demo Injector — injects synthetic crisis events into Redis Streams",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_demo.py --dry-run
  python run_demo.py --scenario belawan_flood
        """
    )
    parser.add_argument(
        "--scenario",
        default="belawan_flood",
        choices=list(SCENARIOS.keys()),
        help="Crisis scenario to inject (default: belawan_flood)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print scenario info without injecting any events into Redis"
    )
    args = parser.parse_args()

    # Load synthetic dataset from data/synthetic/pihps_sample.json
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    json_path = os.path.join(base_dir, "data", "synthetic", "pihps_sample.json")
    
    loaded_events = []
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            # We import here to avoid loading services during arg parsing
            from app.services.redis_client import STREAM_PIHPS, STREAM_SOCIAL
            
            for ev in data.get("events", []):
                ev_copy = ev.copy()
                ev_copy["_stream"] = STREAM_PIHPS
                loaded_events.append(ev_copy)
                
            for ev in data.get("social_events", []):
                ev_copy = ev.copy()
                ev_copy["_stream"] = STREAM_SOCIAL
                loaded_events.append(ev_copy)
                
        except Exception as e:
            print(f"Error loading synthetic dataset: {e}")
    else:
        print(f"Warning: Synthetic dataset not found at {json_path}")

    # Set events list on scenario
    scenario = SCENARIOS[args.scenario].copy()
    scenario["events"] = loaded_events

    print_scenario_info(scenario)

    if args.dry_run:
        print("[DRY RUN] No events injected. Remove --dry-run to execute.")
        return

    if len(scenario["events"]) == 0:
        print("[STUB] No events to inject. Check if data/synthetic/pihps_sample.json is populated.")
        return

    # Ingest events into Redis Streams
    from dotenv import load_dotenv
    load_dotenv()

    from app.services.redis_client import get_redis, publish_event, STREAM_BMKG

    r = get_redis()
    print(f"[Redis] Connected. Injecting {len(scenario['events'])} events...\n")

    for i, event in enumerate(scenario["events"], 1):
        # Pop the stream key so it doesn't pollute the raw event body
        event_to_publish = event.copy()
        stream = event_to_publish.pop("_stream", STREAM_BMKG)
        
        event_id = publish_event(stream, event_to_publish)
        print(f"  [{i}/{len(scenario['events'])}] -> {stream} | id={event_id} | {event_to_publish.get('title')}")


    print(f"\n[DONE] All events injected. Check the dashboard at http://localhost:3000")

    # Phase 3: Trigger agent pipeline with synthetic Belawan crisis event
    print("\n[DEMO] Triggering LangGraph agent swarm with Belawan Port closure scenario...")

    import asyncio
    from app.workers.agent_worker import run_crisis_event

    synthetic_crisis = {
        "event_type": "port_closure",
        "source": "aisstream",
        "severity": "high",
        "lat": 3.7956,
        "lon": 98.6722,
        "region": "north_sumatra",
        "title": "Belawan Port — Simulated Closure (Flooding)",
        "is_simulated": True,
    }

    final_state = asyncio.run(run_crisis_event(synthetic_crisis))
    print(f"[DEMO] Pipeline complete. Status: {final_state['status']}")
    print(f"[DEMO] Confidence: {final_state.get('overall_confidence', 0):.2%}")
    if final_state.get("decision_support_output"):
        print(f"\n[DEMO] Executive Summary:\n{final_state['decision_support_output']}")


if __name__ == "__main__":
    main()
