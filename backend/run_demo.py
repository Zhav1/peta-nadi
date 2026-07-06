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

    scenario = SCENARIOS[args.scenario]
    print_scenario_info(scenario)

    if args.dry_run:
        print("[DRY RUN] No events injected. Remove --dry-run to execute.")
        return

    if len(scenario["events"]) == 0:
        print("[STUB] run_demo.py is a Phase 0 skeleton.")
        print("       Full synthetic event injection is implemented in Phase 6.")
        print("       Run with --dry-run to confirm the script loads correctly.")
        return

    # Phase 6: inject events into Redis Streams
    from dotenv import load_dotenv
    load_dotenv()

    from app.services.redis_client import get_redis, publish_event, STREAM_BMKG

    r = get_redis()
    print(f"[Redis] Connected. Injecting {len(scenario['events'])} events...\n")

    for i, event in enumerate(scenario["events"], 1):
        stream = event.pop("_stream", STREAM_BMKG)
        event_id = publish_event(stream, event)
        print(f"  [{i}/{len(scenario['events'])}] → {stream} | id={event_id}")

    print(f"\n[DONE] All events injected. Check the dashboard at http://localhost:3000")


if __name__ == "__main__":
    main()
