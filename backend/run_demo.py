"""
run_demo.py — PetaNadi Hackathon Demo Injector

Injects a synthetic Belawan Port closure + Trans-Sumatra Highway flood scenario
into Redis Streams, triggering the full agent pipeline. Supports offline mode.

Usage:
    python run_demo.py [--scenario belawan_flood] [--dry-run] [--offline] [--speed fast|normal]
"""
import argparse
import json
import sys
import os
import time
import asyncio
from datetime import datetime, timezone
import fnmatch
import hashlib

# Add backend directory to path so we can import app modules
base_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, base_dir)

# Mock databases for offline/fallback mode
class MockRedis:
    def __init__(self, store=None):
        self.store = store if store is not None else {}

    def ping(self):
        return True

    def close(self):
        pass

    def xadd(self, stream, fields, maxlen=None, approximate=True):
        print(f"    [MockRedis Stream] Publish -> {stream} | {fields.get('title', 'Event')}")
        if stream == "lrip:events:social" or stream == "lrip:stream:osint":
            idx = len(self.store)
            self.store[f"lrip:stream:osint:{idx}"] = fields
        return f"mock-sync-stream-{time.time()}"

    def lpush(self, stream, val):
        print(f"    [MockRedis List] Push -> {stream}")
        if stream == "lrip:events:social" or stream == "lrip:stream:osint":
            idx = len(self.store)
            self.store[f"lrip:stream:osint:{idx}"] = val
        return 1

    def ltrim(self, stream, start, end):
        pass

    def hset(self, key, field, val=None, mapping=None):
        if key not in self.store:
            self.store[key] = {}
        if mapping:
            self.store[key].update(mapping)
        else:
            self.store[key][field] = val
        return 1

    def hget(self, key, field):
        return self.store.get(key, {}).get(field)

    def hgetall(self, key):
        return self.store.get(key, {})

    def get(self, key):
        val = self.store.get(key)
        if isinstance(val, (dict, list)):
            return json.dumps(val)
        return val

    def set(self, key, val, ex=None):
        self.store[key] = val
        return True

    def expire(self, key, seconds):
        pass


class MockAsyncRedis:
    def __init__(self, store):
        self.store = store

    async def aclose(self):
        pass

    async def ping(self):
        return True

    async def xadd(self, stream, fields, maxlen=None, approximate=True):
        print(f"    [MockAsyncRedis Stream] Publish -> {stream} | {fields.get('title', 'Event')}")
        if stream == "lrip:events:social" or stream == "lrip:stream:osint" or stream == "lrip:stream:validated_alerts":
            idx = len(self.store)
            self.store[f"lrip:stream:osint:{idx}"] = fields
        return f"mock-async-stream-{time.time()}"

    async def lpush(self, stream, val):
        if stream == "lrip:events:social" or stream == "lrip:stream:osint" or stream == "lrip:stream:validated_alerts":
            idx = len(self.store)
            self.store[f"lrip:stream:osint:{idx}"] = val
        return 1

    async def keys(self, pattern):
        return [k for k in self.store.keys() if fnmatch.fnmatch(k, pattern)]

    async def get(self, key):
        val = self.store.get(key)
        if isinstance(val, (dict, list)):
            return json.dumps(val)
        return val

    async def set(self, key, val, ex=None):
        self.store[key] = val
        return True

    async def hset(self, key, field, val=None, mapping=None):
        if key not in self.store:
            self.store[key] = {}
        if mapping:
            self.store[key].update(mapping)
        else:
            self.store[key][field] = val
        return 1

    async def hgetall(self, key):
        val = self.store.get(key, {})
        if isinstance(val, dict):
            return {k: str(v) for k, v in val.items()}
        return {}

    async def expire(self, key, seconds):
        pass

    async def delete(self, *keys):
        for k in keys:
            if k in self.store:
                del self.store[k]
        return len(keys)

    async def xrange(self, stream, min="-", max="+"):
        events = []
        for k, v in self.store.items():
            if k.startswith("lrip:stream:osint:"):
                payload = v
                if isinstance(payload, str):
                    try:
                        payload = json.loads(payload)
                    except Exception:
                        pass
                events.append((k.split(":")[-1], payload))
        return events

    async def lrange(self, stream, start, end):
        events = []
        for k, v in self.store.items():
            if k.startswith("lrip:stream:osint:"):
                payload = v
                if not isinstance(payload, str):
                    payload = json.dumps(payload)
                events.append(payload)
        return events


class MockSupabaseQuery:
    def __init__(self, data_list):
        self.data_list = list(data_list)

    def select(self, *args, **kwargs):
        return self

    def insert(self, payload, *args, **kwargs):
        if isinstance(payload, dict):
            p = payload.copy()
            if "incident_id" not in p:
                import uuid
                p["incident_id"] = str(uuid.uuid4())[:16]
            self.data_list.append(p)
        return self

    def update(self, payload, *args, **kwargs):
        return self

    def eq(self, column, value, *args, **kwargs):
        self.data_list = [row for row in self.data_list if row.get(column) == value]
        return self

    def gte(self, column, value, *args, **kwargs):
        try:
            self.data_list = [row for row in self.data_list if float(row.get(column, 0)) >= float(value)]
        except Exception:
            pass
        return self

    def lte(self, column, value, *args, **kwargs):
        try:
            self.data_list = [row for row in self.data_list if float(row.get(column, 0)) <= float(value)]
        except Exception:
            pass
        return self

    def ilike(self, *args, **kwargs):
        return self

    def single(self, *args, **kwargs):
        return self

    def order(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def execute(self, *args, **kwargs):
        class Result:
            def __init__(self, data):
                self.data = data
        return Result(self.data_list)


class MockSupabaseClient:
    def __init__(self):
        # Pre-seed historical incidents to satisfy PredictionAgent history count
        self.incidents_data = [
            {"incident_id": "hist-1", "title": "Medan Flood", "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia", "lat": 3.5, "lon": 98.5},
            {"incident_id": "hist-2", "title": "Highway Blockage", "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia", "lat": 3.5, "lon": 98.5},
            {"incident_id": "hist-3", "title": "Wildfire Deli Serdang", "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia", "lat": 3.5, "lon": 98.5},
            {"incident_id": "hist-4", "title": "Port Delay", "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia", "lat": 3.5, "lon": 98.5},
            {"incident_id": "hist-5", "title": "Landslide Toba", "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia", "lat": 3.5, "lon": 98.5},
        ]
        self.entities_data = [
            {"entity_id": "e1", "name": "Belawan Port", "entity_type": "port"},
            {"entity_id": "e2", "name": "Medan Hub", "entity_type": "warehouse"},
            {"entity_id": "e3", "name": "Trans-Sumatra Hwy (Medan–Rantau Prapat)", "entity_type": "route"},
            {"entity_id": "e4", "name": "Dumai Port", "entity_type": "port"},
        ]
        self.relations_data = [
            {"relation_id": "r1", "from_entity": "e1", "to_entity": "e2", "relation_type": "SHIPS_VIA"},
            {"relation_id": "r2", "from_entity": "e2", "to_entity": "e3", "relation_type": "DEPENDS_ON"},
            {"relation_id": "r3", "from_entity": "e3", "to_entity": "e4", "relation_type": "SHIPS_VIA"},
        ]
        self.edges_data = [
            {"edge_id": "ed1", "from_node": "Belawan Port", "to_node": "Medan Hub", "distance_km": 25.0, "base_weight": 1.0, "corridor": "belawan_access"},
            {"edge_id": "ed2", "from_node": "Medan Hub", "to_node": "Tanjung Mulia", "distance_km": 10.0, "base_weight": 1.0, "corridor": "belawan_access"},
            {"edge_id": "ed3", "from_node": "Tanjung Mulia", "to_node": "Dumai Port", "distance_km": 450.0, "base_weight": 1.0, "corridor": "trans_sumatra"},
            {"edge_id": "ed4", "from_node": "Belawan Port", "to_node": "Binjai Route", "distance_km": 35.0, "base_weight": 1.0, "corridor": "alternative_detour"},
            {"edge_id": "ed5", "from_node": "Binjai Route", "to_node": "Dumai Port", "distance_km": 490.0, "base_weight": 1.0, "corridor": "alternative_detour"},
        ]
        self.source_health_data = [
            {"source_name": "bmkg", "status": "green"},
            {"source_name": "tomtom", "status": "green"},
            {"source_name": "aisstream", "status": "green"},
            {"source_name": "nasa_firms", "status": "green"},
        ]

    def table(self, name):
        if name == "incidents":
            return MockSupabaseQuery(self.incidents_data)
        elif name == "entities":
            return MockSupabaseQuery(self.entities_data)
        elif name == "entity_relations":
            return MockSupabaseQuery(self.relations_data)
        elif name == "road_graph_edges":
            return MockSupabaseQuery(self.edges_data)
        elif name == "source_health" or name == "data_sources":
            return MockSupabaseQuery(self.source_health_data)
        return MockSupabaseQuery([])

    def rpc(self, name, params):
        class RPCResult:
            def __init__(self, data):
                self.data = data
            def execute(self):
                return self
        if name == "match_episodes":
            return RPCResult([
                {
                    "episode_id": "ltm-1",
                    "title": "2024 Trans-Sumatra Flooding (Minyak Goreng Price Spike)",
                    "description": "Heavy rainfall in Deli Serdang caused severe flooding, blocking the highway. Minyak goreng prices spiked by 15% due to distribution delays.",
                    "crisis_type": "flood",
                    "inflation_multiplier": 1.15,
                    "recovery_days": 10,
                    "similarity": 0.85
                },
                {
                    "episode_id": "ltm-2",
                    "title": "2023 Belawan Port Strike",
                    "description": "Port operations stopped for 48 hours, causing container pileups and a 10% price increase in red chili.",
                    "crisis_type": "port_closure",
                    "inflation_multiplier": 1.10,
                    "recovery_days": 5,
                    "similarity": 0.75
                },
                {
                    "episode_id": "ltm-3",
                    "title": "2022 Wildfire Near Toll Road",
                    "description": "Wildfires caused highway closure for 12 hours, delaying food distribution trucks.",
                    "crisis_type": "wildfire",
                    "inflation_multiplier": 1.08,
                    "recovery_days": 3,
                    "similarity": 0.70
                }
            ])
        return RPCResult([])


SCENARIOS = {
    "belawan_flood": {
        "description": "Belawan Port closure + Trans-Sumatra Highway flooding — North Sumatra",
        "region": "north_sumatra",
        "corridor": "Belawan Port -> Trans-Sumatra Highway",
        "events": [],
    }
}


def print_step(step_num: int, title: str):
    print(f"\n[{step_num}/5] {title}...")


def print_scenario_info(scenario: dict, offline: bool):
    print(f"\n{'='*60}")
    print(f"  PetaNadi Demo Injector (Mode: {'OFFLINE' if offline else 'ONLINE'})")
    print(f"{'='*60}")
    print(f"  Scenario  : {scenario['description']}")
    print(f"  Corridor  : {scenario['corridor']}")
    print(f"  Events    : {len(scenario['events'])} events loaded")
    print(f"{'='*60}\n")


def main():
    parser = argparse.ArgumentParser(
        description="PetaNadi Demo Injector — injects synthetic crisis events into Redis Streams",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run_demo.py --dry-run
  python run_demo.py --scenario belawan_flood --offline
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
    parser.add_argument(
        "--offline",
        action="store_true",
        help="Skip Redis and Supabase connections, run entirely offline in memory"
    )
    parser.add_argument(
        "--speed",
        default="normal",
        choices=["fast", "normal"],
        help="Delay speed between synthetic events (default: normal)"
    )
    args = parser.parse_args()

    # Step 1: Parsing synthetic dataset
    print_step(1, "Parsing synthetic dataset")
    
    json_path = os.path.join(base_dir, "..", "data", "synthetic", "belawan_scenario.json")
    loaded_events = []
    
    if os.path.exists(json_path):
        try:
            with open(json_path, 'r') as f:
                data = json.load(f)
            loaded_events = data.get("events", [])
            print(f"  Loaded {len(loaded_events)} events from data/synthetic/belawan_scenario.json")
        except Exception as e:
            print(f"  Error loading synthetic dataset: {e}")
            sys.exit(1)
    else:
        print(f"  Error: Synthetic dataset not found at {json_path}")
        sys.exit(1)

    # Set events list on scenario
    scenario = SCENARIOS[args.scenario].copy()
    scenario["events"] = loaded_events

    # Perform Redis connection check for online mode
    offline_active = args.offline
    if not offline_active:
        from dotenv import load_dotenv
        load_dotenv()
        from app.services.redis_client import get_redis
        try:
            r = get_redis()
            r.ping()
            print("  Redis connection verified: OK")
        except Exception as e:
            print(f"  [WARNING] Redis connection failed: {e}")
            print("  --> Automatically falling back to OFFLINE mode.")
            offline_active = True

    print_scenario_info(scenario, offline_active)

    if args.dry_run:
        print("[DRY RUN] No events injected. Remove --dry-run to execute.")
        return

    # In-memory store for mocks
    mock_store = {}

    # Seed mock store with TomTom segments, PIHPS data, and Social events
    if offline_active:
        # Pre-seed PIHPS latest data
        pihps_latest = {
            "minyak_goreng": {"current": 18500.0, "mean": 15800.0, "std": 1000.0},
            "cabai_merah": {"current": 48000.0, "mean": 42666.67, "std": 2000.0},
            "beras": {"current": 13500.0, "mean": 13450.0, "std": 500.0}
        }
        mock_store["lrip:pihps:latest"] = pihps_latest

        # Pre-seed TomTom segments (at least 5 segments to pass PredictionAgent checks)
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

    # Step 2: Injecting events
    print_step(2, "Injecting synthetic events")
    delay = 0.1 if args.speed == "fast" else 1.0

    if offline_active:
        # Monkeypatch Redis and Supabase clients
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

        print("  Monkeypatched Redis and Supabase clients for offline execution.")

        for i, event in enumerate(scenario["events"], 1):
            event_to_publish = event.copy()
            stream = event_to_publish.pop("_stream", "lrip:events:bmkg")
            
            # Write to mock Redis stream or list
            if stream == "lrip:events:social" or stream == "lrip:stream:osint":
                mock_redis_client.xadd("lrip:stream:osint", event_to_publish)
            else:
                mock_redis_client.set(f"lrip:mock:event:{i}", event_to_publish)
            
            # If it's a physical/hazard event, also add to mock Supabase incidents
            # to simulate active PostGIS layers during OSINT hazard fusion
            if event_to_publish.get("event_type") in ["earthquake", "weather_warning", "wildfire", "flood", "road_closure"]:
                db_payload = {
                    "incident_id": f"inc-{i}",
                    "title": event_to_publish.get("title"),
                    "type": event_to_publish.get("event_type"),
                    "lat": float(event_to_publish.get("lat", 0)),
                    "lon": float(event_to_publish.get("lon", 0)),
                    "region": "north_sumatra, belawan, pematangsiantar, tanjung mulia",
                    "affected_polygon": {"type": "Polygon", "coordinates": []}
                }
                mock_supabase_client.incidents_data.append(db_payload)

            print(f"  [{i}/{len(scenario['events'])}] -> Simulated Ingested | {event_to_publish.get('title')}")
            time.sleep(delay)
    else:
        from app.services.redis_client import publish_event, STREAM_BMKG
        # Inject to live Redis Streams
        for i, event in enumerate(scenario["events"], 1):
            event_to_publish = event.copy()
            stream = event_to_publish.pop("_stream", STREAM_BMKG)
            event_id = publish_event(stream, event_to_publish)
            print(f"  [{i}/{len(scenario['events'])}] -> {stream} | id={event_id} | {event_to_publish.get('title')}")
            time.sleep(delay)

    # Step 3: Triggering LangGraph agent worker
    print_step(3, "Triggering LangGraph agent worker")
    
    # We use a broad region description to ensure NER location overlap succeeds
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

    # Step 4: Consensus Gate & Decision Support
    print_step(4, "Executing Swarm & Consensus reasoning")
    from app.workers.agent_worker import run_crisis_event
    
    start_time = time.time()
    final_state = asyncio.run(run_crisis_event(synthetic_crisis))
    elapsed = time.time() - start_time

    # Step 5: Verification
    print_step(5, "Verifying Swarm Outcomes")
    print(f"  Pipeline completed in {elapsed:.2f} seconds.")
    print(f"  Validation Status  : {'VALIDATED' if final_state.get('validated') else 'NOT VALIDATED'}")
    print(f"  Overall Confidence : {final_state.get('overall_confidence', 0):.2%}")
    print(f"  Status             : {final_state.get('status')}")
    print(f"  Data Collection Finding: {final_state.get('data_collection_finding')}")
    print(f"  Messages Log       : {final_state.get('messages')}")
    
    if final_state.get("decision_support_output"):
        print(f"\n{'='*60}")
        print("  EXECUTIVE SUMMARY (Decision Support Copilot)")
        print(f"{'='*60}")
        print(final_state["decision_support_output"])
        print(f"{'='*60}\n")
    else:
        print("  Warning: No decision support summary was generated.")


if __name__ == "__main__":
    main()
