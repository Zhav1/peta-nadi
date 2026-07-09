# PLAN — Phase 3: LangGraph Agent Swarm (Core Reasoning)

**Phase:** 3
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)
**Design Contract:** `.planning/phases/phase-3/AI-SPEC.md`
**Status:** READY TO EXECUTE
**Estimated effort:** 3–4 days (solo, AI-assisted)

---

## Goal

Wire 6 LangGraph agents into a fan-out/fan-in StateGraph with shared `CrisisState`. Implement
STM (Redis), LTM (pgvector), GraphRAG (NetworkX + Supabase), and Consensus Gate. Full pipeline
validated by `run_demo.py` injecting the Belawan Port closure synthetic scenario.

---

## Prerequisites Check

- [x] Phase 1 complete — Redis Streams publishing events on `lrip:stream:events`
- [x] Phase 2 complete — `ner_pipeline.py`, `geocoding_service.py`, `osint_worker.py` exist
- [x] `agents/state.py` skeleton exists with `CrisisState` TypedDict
- [x] AI-SPEC.md written — all design decisions resolved
- [ ] Supabase project has `pgvector` extension enabled (verify before Plan 3.2)
- [ ] `langgraph`, `networkx`, `numpy`, `scipy` added to `requirements.txt`

---

## Wave 1 — Foundation (do these first, everything else depends on them)

### Task 1.1 — Extend `agents/state.py` with new types

**File:** `agents/state.py`
**Action:** MODIFY (extend existing skeleton)

Add the following TypedDicts and extend `CrisisState` with the new fields defined in
AI-SPEC Section 4:

```python
class NormalizedEvent(TypedDict):
    source: str         # 'bmkg', 'tomtom', 'aisstream', 'nasa_firms', 'osint'
    event_type: str     # 'flood', 'congestion', 'port_closure', 'fire', 'price_spike'
    severity: str       # 'low', 'medium', 'high', 'critical'
    raw_payload: Dict[str, Any]
    validated: bool
    validation_errors: List[str]

class LTMEpisode(TypedDict):
    episode_id: str
    description: str
    crisis_type: str
    inflation_multiplier: float
    recovery_days: int
    similarity_score: float

class GraphRAGNode(TypedDict):
    entity_id: str
    entity_type: str    # 'port', 'route', 'warehouse', 'commodity', 'supplier'
    name: str
    relation: str       # 'DEPENDS_ON', 'SHIPS_VIA', 'SUPPLIES', 'LOCATED_IN'
    impact_score: float
```

Extend `CrisisState` with:
```python
# Add to CrisisState TypedDict:
normalized_event: Optional[NormalizedEvent]
hazard_polygons: Optional[List[Dict]]
congestion_forecast: Optional[Dict[str, Any]]
ltm_episodes: Optional[List[LTMEpisode]]
graphrag_chain: Optional[List[GraphRAGNode]]
consensus_breakdown: Optional[Dict[str, float]]
validated: bool
```

**Verification:** `python -c "from agents.state import CrisisState, NormalizedEvent, LTMEpisode, GraphRAGNode; print('OK')"` — no import errors.

---

### Task 1.2 — Update `requirements.txt` with Phase 3 dependencies

**File:** `backend/requirements.txt`
**Action:** MODIFY

Add:
```
langgraph==0.2.28
langgraph-checkpoint==1.0.12
networkx==3.3
numpy==1.26.4
scipy==1.13.1
```

**Notes:**
- `langgraph==0.2.28` is the latest stable release with `Send` API support and `MemorySaver`.
- `networkx==3.3` for GraphRAG BFS traversal.
- `numpy` + `scipy` for Agent 3 statistical forecasting and Agent 5 anomaly detection.
- Do NOT add `prophet` — too much dependency overhead for MVP. Linear regression is sufficient.

**Verification:** `pip install -r requirements.txt` completes without errors.

---

### Task 1.3 — Supabase migrations (run against your Supabase project)

**Action:** Apply 3 SQL migrations via Supabase Dashboard SQL editor or `supabase db push`.

**Migration 001 — historical_episodes (LTM table):**
```sql
-- Enable pgvector if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS historical_episodes (
    episode_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title               TEXT NOT NULL,
    description         TEXT NOT NULL,
    crisis_type         TEXT,
    affected_region     TEXT,
    affected_commodities TEXT[],
    inflation_multiplier FLOAT,
    recovery_days       INTEGER,
    sources             TEXT[],
    embedding           VECTOR(768),
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS historical_episodes_embedding_idx
    ON historical_episodes
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- Stored procedure for similarity search (used by Agent 5)
CREATE OR REPLACE FUNCTION match_episodes(
    query_embedding VECTOR(768),
    match_threshold FLOAT DEFAULT 0.6,
    match_count     INT DEFAULT 5
)
RETURNS TABLE (
    episode_id UUID, title TEXT, description TEXT, crisis_type TEXT,
    affected_region TEXT, affected_commodities TEXT[],
    inflation_multiplier FLOAT, recovery_days INTEGER,
    similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        he.episode_id, he.title, he.description, he.crisis_type,
        he.affected_region, he.affected_commodities,
        he.inflation_multiplier, he.recovery_days,
        1 - (he.embedding <=> query_embedding) AS similarity
    FROM historical_episodes he
    WHERE 1 - (he.embedding <=> query_embedding) > match_threshold
    ORDER BY he.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

**Migration 002 — entities + entity_relations (GraphRAG tables):**
```sql
CREATE TABLE IF NOT EXISTS entities (
    entity_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    lat         FLOAT,
    lon         FLOAT,
    region      TEXT,
    metadata    JSONB DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entity_relations (
    relation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_entity   UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    to_entity     UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    relation_type TEXT NOT NULL,
    weight        FLOAT DEFAULT 1.0,
    metadata      JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entity_relations_from_idx ON entity_relations(from_entity);
CREATE INDEX IF NOT EXISTS entity_relations_to_idx   ON entity_relations(to_entity);
```

**Migration 003 — road_graph (for Agent 4 NetworkX seeding):**
```sql
CREATE TABLE IF NOT EXISTS road_graph_edges (
    edge_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_node    TEXT NOT NULL,
    to_node      TEXT NOT NULL,
    distance_km  FLOAT NOT NULL,
    base_weight  FLOAT NOT NULL DEFAULT 1.0,
    corridor     TEXT,            -- 'trans_sumatra', 'belawan_access', etc.
    geometry     JSONB            -- optional: GeoJSON LineString for future PostGIS
);
```

**Verification:** All 3 tables appear in Supabase Table Editor. `match_episodes()` function
appears in Database → Functions.

---

## Wave 2 — Memory Layer (STM + LTM)

### Task 2.1 — `agents/memory/stm.py` — Redis Short-Term Memory helpers

**File:** `agents/memory/stm.py` (NEW)

Implement:
- `async save_crisis_state(crisis_id: str, state: CrisisState, ttl_seconds: int = 86400)` — serializes state to Redis JSON key `lrip:crisis:{crisis_id}`
- `async load_crisis_state(crisis_id: str) -> Optional[CrisisState]` — deserializes from Redis
- `async mark_seen(event_hash: str, ttl_seconds: int = 300)` — SET member for deduplication
- `async is_seen(event_hash: str) -> bool` — dedup check
- Use `redis.asyncio` client from the existing `backend/app/config.py` settings
- Serialize `CrisisState` as JSON using `json.dumps` with `default=str` for datetime fields

**Verification:** Unit test — save a mock `CrisisState`, load it back, assert fields match.

---

### Task 2.2 — `agents/memory/ltm.py` — pgvector Long-Term Memory

**File:** `agents/memory/ltm.py` (NEW)

Implement:
- `async embed_text(text: str) -> List[float]` — calls Gemini `text-embedding-004` API
  via `google.generativeai`; returns 768-dim vector
- `async query_ltm(query_text: str, top_k: int = 5) -> List[LTMEpisode]` — embeds query,
  calls Supabase `match_episodes` RPC, returns typed results
- `async cache_ltm_result(query_hash: str, results: List[LTMEpisode], ttl: int = 3600)` — caches results in Redis to avoid repeated embedding calls
- `async load_ltm_cached(query_hash: str) -> Optional[List[LTMEpisode]]` — Redis cache read

**Error handling:** If Gemini embedding API fails, log warning and return empty list (graceful degradation — Agent 5 runs with lower confidence).

**Verification:**
- Unit test with mocked Gemini SDK: confirm correct vector dimensions passed to Supabase RPC
- Unit test: verify cache hit returns same results as direct query

---

### Task 2.3 — Seed `agents/seeds/historical_episodes.json`

**File:** `agents/seeds/historical_episodes.json` (NEW)

Write 15 North Sumatra historical episodes as JSON. Each entry:
```json
{
  "title": "Belawan Port Flooding — January 2021",
  "description": "Severe flooding closed Belawan Port for 8 days in January 2021. Caused by upstream Deli River overflow. Cooking oil supply to Medan disrupted; prices rose 38% in 2 weeks.",
  "crisis_type": "port_closure",
  "affected_region": "north_sumatra",
  "affected_commodities": ["cooking_oil", "rice"],
  "inflation_multiplier": 1.38,
  "recovery_days": 12,
  "sources": ["BPS North Sumatra 2021", "Kompas 2021-01-15"]
}
```

Required episodes (minimum 15):
1. Belawan Port flooding (Jan 2021) — cooking oil +38%
2. Trans-Sumatra Hwy landslide (2022, km 147) — fuel +22%, rice +15%
3. Belawan Port congestion pre-Lebaran (2023) — all commodities +12%
4. Dumai Port strike disruption (2020) — palm oil +18%
5. Trans-Sumatra Hwy flooding Rantau Prapat (2019) — fuel +30%
6. Tanjung Balai port closure cyclone (2021) — rice +20%
7. Medan Distribution Hub fire (2022) — cooking oil +25%
8. Trans-Sumatra Hwy bridge collapse Binjai (2018) — fuel +35%, 15-day recovery
9. Belawan Port crane malfunction (2023) — minor disruption, cooking oil +5%
10. North Sumatra drought + wildfire (2023 El Niño) — rice +28%
11. Pematangsiantar access road flood (2020) — local fuel +18%
12. Stabat Junction congestion (flooding, 2022) — 3-day disruption
13. Lubuk Pakam toll closure maintenance (2023) — minor, fuel +3%
14. Kuala Tanjung new port disruption (transition period 2021) — cooking oil +8%
15. Trans-Sumatra Hwy rockslide near Sibolga (2019) — fish/seafood supply shock +40%

**Verification:** JSON validates with `python -m json.tool agents/seeds/historical_episodes.json`.

---

### Task 2.4 — `agents/seeds/seed_ltm.py` — LTM seeder script

**File:** `agents/seeds/seed_ltm.py` (NEW)

Script that:
1. Reads `historical_episodes.json`
2. Embeds each episode's `description` + `title` concatenation via `embed_text()`
3. Upserts each row into Supabase `historical_episodes` table with the embedding vector
4. Prints progress and final count

Run once before any agent execution: `python agents/seeds/seed_ltm.py`

**Verification:** After running, Supabase `historical_episodes` table has 15 rows. Query:
`SELECT COUNT(*) FROM historical_episodes WHERE embedding IS NOT NULL;` returns 15.

---

## Wave 3 — GraphRAG Infrastructure

### Task 3.1 — `agents/seeds/entities.json` + `relations.json`

**File:** `agents/seeds/entities.json` (NEW)

North Sumatra corridor entity seed data (minimum 20 entities):

Entities to include:
- **Ports:** Belawan Port, Dumai Port, Tanjung Balai Port, Kuala Tanjung Port
- **Routes:** Trans-Sumatra Hwy (Medan–Rantau Prapat), Trans-Sumatra Hwy (Rantau Prapat–Padang), Belawan Access Road, Binjai Bypass
- **Warehouses:** Medan Distribution Hub (BULOG), Pematangsiantar Warehouse, Rantau Prapat Depot, Stabat Warehouse
- **Commodities:** Beras (rice), Minyak Goreng (cooking oil), BBM Solar (diesel), BBM Pertalite (petrol), Gula (sugar), Tepung Terigu (flour)
- **Suppliers:** PT Wilmar International (palm oil), BULOG North Sumatra, Pertamina Depot Medan

**File:** `agents/seeds/relations.json` (NEW)

Key relations:
- Belawan Port `SHIPS_VIA` Trans-Sumatra Hwy
- Trans-Sumatra Hwy `SUPPLIES` Medan Distribution Hub
- Medan Distribution Hub `SUPPLIES` [Pematangsiantar Warehouse, Rantau Prapat Depot, Stabat Warehouse]
- Belawan Port `DEPENDS_ON` Belawan Access Road
- Medan Distribution Hub `DISTRIBUTES` [rice, cooking oil, diesel, petrol]
- PT Wilmar International `SUPPLIES` cooking oil via Belawan Port
- Pertamina Depot `SUPPLIES` BBM via Trans-Sumatra Hwy
- BULOG `SUPPLIES` rice via Belawan Port

---

### Task 3.2 — `agents/seeds/seed_graphrag.py` — Entity + relation seeder

**File:** `agents/seeds/seed_graphrag.py` (NEW)

Script that:
1. Reads `entities.json` and inserts all entities into Supabase `entities` table
2. Reads `relations.json`, resolves entity names to UUIDs, inserts into `entity_relations`
3. Also seeds `road_graph_edges` with the Trans-Sumatra corridor road network:
   - Medan → Binjai (22 km, base_weight=1.0, corridor='trans_sumatra')
   - Binjai → Stabat (18 km, base_weight=1.0)
   - Stabat → Rantau Prapat (178 km, base_weight=1.0)
   - Rantau Prapat → Kisaran (65 km, base_weight=1.0)
   - Belawan → Medan (26 km, base_weight=1.0, corridor='belawan_access')
   - (+ 10 more secondary road segments with estimated distances)

**Verification:** After run:
- `SELECT COUNT(*) FROM entities;` ≥ 20
- `SELECT COUNT(*) FROM entity_relations;` ≥ 15
- `SELECT COUNT(*) FROM road_graph_edges;` ≥ 15

---

### Task 3.3 — `agents/tools/graphrag.py` — NetworkX graph + BFS traversal

**File:** `agents/tools/graphrag.py` (NEW)

Implement:
- `async load_entity_graph() -> nx.DiGraph` — loads entities + relations from Supabase,
  builds directed NetworkX graph; caches serialized bytes in Redis `lrip:graph:entity` for 1h
- `def get_causal_chain(G: nx.DiGraph, disrupted_entity_id: str, max_depth: int = 4) -> List[GraphRAGNode]`
  — BFS from disrupted node following DEPENDS_ON/SHIPS_VIA edges; returns ordered list of
  affected entities sorted by traversal depth
- `async query_graphrag(disrupted_entity_name: str) -> List[GraphRAGNode]` — top-level
  convenience: resolves name → UUID, loads graph, runs BFS, returns chain

**Note on graph caching:** Use `pickle.dumps(G)` → Redis bytes → `pickle.loads()` on read.
Rebuild trigger: set `lrip:graph:dirty = 1` when entity tables are modified; check on load.

**Verification:** Unit test with in-memory NetworkX graph:
- Seed: Belawan Port → Trans-Sumatra Hwy → Medan Hub → [rice, oil, fuel]
- Assert `get_causal_chain(G, belawan_id, max_depth=3)` returns ≥ 3 nodes in correct order

---

### Task 3.4 — `agents/tools/supabase_tools.py` — DB read/write tools

**File:** `agents/tools/supabase_tools.py` (NEW)

Implement typed wrappers:
- `async write_incident(state: CrisisState) -> str` — inserts validated alert into `incidents`
  table; returns incident UUID
- `async get_hazard_polygons(lat: float, lon: float, radius_km: float = 50) -> List[Dict]` —
  queries Supabase for active hazard records near the event location (simple bounding box for
  MVP; upgrade to `ST_DWithin` PostGIS if PostGIS is enabled)
- `async get_source_health(source_name: str) -> str` — queries `source_health` table for
  current status ('green', 'yellow', 'red'); defaults to 'yellow' if row not found
- `async load_entities_and_relations() -> Tuple[List[Dict], List[Dict]]` — returns raw entity
  and relation rows for graph building

---

### Task 3.5 — `agents/tools/consensus_gate.py` — Confidence aggregation

**File:** `agents/tools/consensus_gate.py` (NEW)

Implement exactly as specified in AI-SPEC Section 5 (Consensus Gate):

```python
from agents.state import CrisisState

def compute_consensus(state: CrisisState) -> dict:
    """
    Computes weighted consensus score and returns routing decision.
    Weights: Hazard 30%, Social 20%, Geospatial 30%, Economics 20%.
    """
    hazard_conf  = state["osint_hazard_finding"]["confidence"]
    social_conf  = state["data_collection_finding"]["confidence"]
    geo_conf     = (
        state["prediction_finding"]["confidence"] * 0.5 +
        state["route_optimization_finding"]["confidence"] * 0.5
    )
    econ_conf    = state["economic_intelligence_finding"]["confidence"]

    breakdown = {
        "hazard":     0.30 * hazard_conf,
        "social":     0.20 * social_conf,
        "geospatial": 0.30 * geo_conf,
        "economics":  0.20 * econ_conf,
    }
    overall = sum(breakdown.values())
    return {
        "overall_confidence": overall,
        "consensus_breakdown": breakdown,
        "route": "validated" if overall >= 0.85 else "unconfirmed",
    }
```

**Verification:** Unit tests:
- Inputs all at 1.0 → overall = 1.0 → "validated"
- Inputs all at 0.8 → overall = 0.8 → "unconfirmed"
- Inputs: hazard=1.0, social=1.0, geo=0.9, econ=0.9 → overall = 0.97 → "validated"
- Inputs: hazard=0.6, social=0.5, geo=0.7, econ=0.4 → overall ~0.6 → "unconfirmed"

---

## Wave 4 — The 6 Agent Nodes

### Task 4.1 — `agents/nodes/data_collection.py` — Agent 1

**File:** `agents/nodes/data_collection.py` (NEW)

```python
async def data_collection_agent(state: CrisisState) -> dict:
    """Agent 1: Validates, deduplicates, and normalizes raw Redis events."""
```

Logic (from AI-SPEC Section 5, Agent 1):
1. Validate required fields: `event_type`, `severity`, `source`, and either (`lat` + `lon`) or `region`
2. Dedup: hash event payload → check Redis `lrip:seen:{hash}` → if seen, set `status = "duplicate"` and return early
3. Mark as seen: `await mark_seen(event_hash)`
4. Normalize severity to enum: accept `['low', 'medium', 'high', 'critical']`; unknown → 'medium'
5. Lookup source health from Supabase `source_health` table → derive confidence:
   - green → 0.9, yellow → 0.6, red → 0.3, not found → 0.7 (default)
6. Build `NormalizedEvent` TypedDict
7. Build `AgentFinding` with `confidence` from source health lookup
8. Return state updates: `{normalized_event: ..., data_collection_finding: ...}`

**Verification:**
- Unit test: valid event → returns `normalized_event` with correct fields
- Unit test: duplicate event → returns early with duplicate flag
- Unit test: malformed event → sets `validation_errors` list; confidence stays at 0.3

---

### Task 4.2 — `agents/nodes/osint_hazard.py` — Agent 2

**File:** `agents/nodes/osint_hazard.py` (NEW)

```python
async def osint_hazard_agent(state: CrisisState) -> dict:
    """Agent 2: PostGIS hazard fusion + social OSINT corroboration."""
```

Logic (from AI-SPEC Section 5, Agent 2):
1. Read `normalized_event` from state
2. Call `get_hazard_polygons(lat, lon)` → store in `hazard_polygons`
3. Read recent OSINT events from Redis Stream `lrip:stream:osint` (last 2h, same region key)
4. Count social corroborations mentioning crisis keywords from the `normalized_event.event_type`
5. If any social events have NER-extracted locations: import `extract_locations` from Phase 2
   NER pipeline; verify overlap with event location (within 50km)
6. Conditional Gemini Flash call: only if `normalized_event.source == 'social'`
   — classify severity from raw text transcript
7. Compute confidence per formula in AI-SPEC Section 5

**Verification:**
- Unit test with mock PostGIS response (1 polygon): confidence ≥ 0.8
- Unit test with no hazard polygon + no social: confidence = 0.6 (base only)
- Unit test: 2 social corroborations → confidence += 0.15

---

### Task 4.3 — `agents/nodes/prediction.py` — Agent 3

**File:** `agents/nodes/prediction.py` (NEW)

```python
async def prediction_agent(state: CrisisState) -> dict:
    """Agent 3: Multi-horizon congestion forecast (6h/12h/24h/48h)."""
```

Logic (from AI-SPEC Section 5, Agent 3):
1. Pull last 24h TomTom data from Redis (key pattern `lrip:tomtom:segment:*`)
2. Query TimescaleDB `traffic_history` view (or `raw_events` table) for same corridor
3. Linear extrapolation forecast per horizon:
   - Fit `numpy.polyfit(timestamps, delay_values, deg=1)` on last 24h data
   - Project forward: 6h, 12h, 24h, 48h delay estimates in minutes
   - Confidence interval: ±20% of estimate (MVP simplification)
4. If `event_type == 'wildfire'` → read NASA polygon from state; estimate spread factor
5. Build `congestion_forecast` dict:
   ```python
   {
     "6h":  {"delay_min": 45, "confidence_interval": [36, 54]},
     "12h": {"delay_min": 90, "confidence_interval": [72, 108]},
     "24h": {"delay_min": 60, "confidence_interval": [48, 72]},
     "48h": {"delay_min": 20, "confidence_interval": [16, 24]},
   }
   ```
6. Compute confidence per AI-SPEC formula

**Verification:**
- Unit test with 24 mock TomTom readings: forecast returns all 4 horizons
- Unit test: empty TomTom data → base confidence 0.5, returns zero-delay forecast
- Assert confidence ≤ 1.0 in all cases

---

### Task 4.4 — `agents/nodes/route_optimization.py` — Agent 4

**File:** `agents/nodes/route_optimization.py` (NEW)

```python
async def route_optimization_agent(state: CrisisState) -> dict:
    """Agent 4: NetworkX Dijkstra with hazard-weighted edges."""
```

Logic (from AI-SPEC Section 5, Agent 4):
1. Load road graph from Supabase `road_graph_edges` using `supabase_tools.load_road_graph()`
2. Build `nx.DiGraph` from edge list
3. Apply hazard penalties to edges intersecting with `state["hazard_polygons"]`:
   - Match by corridor name or geographic proximity (MVP: simple name match on corridor field)
   - Multiply edge weight: low=1.5x, medium=3x, high=10x, critical=∞ (remove edge)
4. Find primary route: Dijkstra from `origin` to `destination` (origin/destination derived from
   `normalized_event.region` → mapped to known node names)
5. Find up to 3 alternative routes using `nx.shortest_simple_paths()` (k-shortest)
6. For each route, compute: total distance_km, eta_minutes (based on avg 60 km/h), fuel_increase_pct
   (distance delta from primary × 0.1), risk_score
7. Store as `List[RouteRecommendation]` in state
8. Compute confidence per AI-SPEC formula

**Key helpers to add to `supabase_tools.py`:**
- `async load_road_graph() -> List[Dict]` — reads `road_graph_edges` table

**Verification:**
- Unit test: block primary Belawan–Medan edge → returns ≥ 2 alternative routes
- Unit test: no hazards → primary route is same as Dijkstra result; confidence = 0.7
- Assert all RouteRecommendation fields are populated

---

### Task 4.5 — `agents/nodes/economic_intelligence.py` — Agent 5

**File:** `agents/nodes/economic_intelligence.py` (NEW)

```python
async def economic_intelligence_agent(state: CrisisState) -> dict:
    """Agent 5: PIHPS anomaly detection + pgvector LTM retrieval."""
```

Logic (from AI-SPEC Section 5, Agent 5):
1. Read latest PIHPS data from Redis (key `lrip:pihps:latest` — written by Phase 2 scraper)
2. Read 30-day rolling average from Redis or Supabase TimescaleDB
3. Compute z-score per commodity: `z = (current_price - mean) / std_dev`
4. Flag commodities where `|z| > 1.5` as anomalous
5. LTM query: build query text from `"{event_type} in {region}, {severity} severity"`;
   call `query_ltm()` from `agents/memory/ltm.py`
6. Compute inflation multiplier: weighted average of `inflation_multiplier` from top-3 episodes
7. Build `inflation_forecast` dict per AI-SPEC schema
8. Gemini Flash call: generate 3-sentence narrative
9. Compute confidence per AI-SPEC formula

**Verification:**
- Unit test: inject rice price 2 std deviations above mean → anomaly detected, econ_conf ≥ 0.7
- Unit test: mock LTM returning Belawan 2021 episode → inflation_multiplier applied correctly
- Unit test: LTM empty → graceful degradation, confidence = 0.4 (base only)

---

### Task 4.6 — `agents/nodes/decision_support.py` — Agent 6

**File:** `agents/nodes/decision_support.py` (NEW)

```python
async def decision_support_copilot(state: CrisisState) -> dict:
    """Agent 6: Synthesize all findings → executive summary + publish validated alert."""
```

Logic (from AI-SPEC Section 5, Agent 6):
1. Build structured JSON payload from all agent findings (findings, forecast, routes, LTM episodes)
2. Determine LLM: if `len([h for h in hazard_polygons if h.get("severity") == "critical"]) >= 2`
   → use DeepSeek V3 API; else → Gemini Flash
3. Call LLM with system prompt:
   ```
   You are a crisis intelligence analyst for Indonesia's logistics network.
   Produce an executive summary with exactly these 5 sections:
   1. Crisis Overview (2 sentences)
   2. Key Evidence (bullet points from each data source)
   3. Recommended Immediate Action
   4. Economic Risk Assessment (48h outlook)
   5. Confidence Assessment
   Use Indonesian context. Be factual and specific. < 500 tokens.
   ```
4. Call `query_graphrag()` from `agents/tools/graphrag.py` with the disrupted entity name
5. Append GraphRAG chain to response
6. Write to Supabase: call `write_incident(state)` from `supabase_tools.py`
7. Publish to Redis: `XADD lrip:stream:validated_alerts * crisis_id {id} summary {text}`
8. POST to FastAPI `/api/notify` endpoint (async, non-blocking, best-effort)
9. Return: `{decision_support_output: summary_text, causal_chain: chain, status: "validated"}`

**Verification:**
- Unit test with mocked LLM response: output contains all 5 required sections
- Unit test: Supabase write called once with correct `status = "validated"`
- Unit test: Redis XADD called with correct stream name
- Integration test (Tier 3): full state → output mentions "Belawan" and "cooking oil"

---

## Wave 5 — LangGraph Graph Assembly

### Task 5.1 — `agents/graph.py` — StateGraph definition

**File:** `agents/graph.py` (NEW)

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from agents.state import CrisisState
from agents.nodes.data_collection import data_collection_agent
from agents.nodes.osint_hazard import osint_hazard_agent
from agents.nodes.prediction import prediction_agent
from agents.nodes.route_optimization import route_optimization_agent
from agents.nodes.economic_intelligence import economic_intelligence_agent
from agents.nodes.decision_support import decision_support_copilot
from agents.tools.consensus_gate import compute_consensus


def archive_unconfirmed(state: CrisisState) -> dict:
    """Terminal node for events that don't pass the consensus gate."""
    return {"status": "unconfirmed"}


def consensus_gate_node(state: CrisisState) -> dict:
    """Fan-in aggregation node that computes weighted confidence."""
    result = compute_consensus(state)
    return {
        "overall_confidence": result["overall_confidence"],
        "consensus_breakdown": result["consensus_breakdown"],
        "validated": result["route"] == "validated",
    }


def route_after_gate(state: CrisisState) -> str:
    return "validated" if state.get("validated") else "unconfirmed"


def build_crisis_graph() -> StateGraph:
    graph = StateGraph(CrisisState)

    # Add all nodes
    graph.add_node("data_collection",        data_collection_agent)
    graph.add_node("osint_hazard",           osint_hazard_agent)
    graph.add_node("prediction",             prediction_agent)
    graph.add_node("route_optimization",     route_optimization_agent)
    graph.add_node("economic_intelligence",  economic_intelligence_agent)
    graph.add_node("consensus_gate",         consensus_gate_node)
    graph.add_node("decision_support",       decision_support_copilot)
    graph.add_node("archive",                archive_unconfirmed)

    # Entry point
    graph.set_entry_point("data_collection")

    # Fan-out: data_collection → all 4 parallel agents
    graph.add_edge("data_collection",       "osint_hazard")
    graph.add_edge("data_collection",       "prediction")
    graph.add_edge("data_collection",       "route_optimization")
    graph.add_edge("data_collection",       "economic_intelligence")

    # Fan-in: all 4 → consensus_gate
    graph.add_edge("osint_hazard",          "consensus_gate")
    graph.add_edge("prediction",            "consensus_gate")
    graph.add_edge("route_optimization",    "consensus_gate")
    graph.add_edge("economic_intelligence", "consensus_gate")

    # Conditional routing from gate
    graph.add_conditional_edges(
        "consensus_gate",
        route_after_gate,
        {"validated": "decision_support", "unconfirmed": "archive"},
    )

    # Terminal edges
    graph.add_edge("decision_support", END)
    graph.add_edge("archive",          END)

    return graph
```

**Note on fan-out:** LangGraph's default `add_edge` from one node to multiple nodes creates
sequential execution in LangGraph 0.2.x. For true parallelism, use `Send` API or ensure
agents are structured to be independent. For MVP: sequential fan-out is functionally equivalent;
parallelism can be added in Phase 6 polish. Document this tradeoff in the README.

**Verification:**
- `python -c "from agents.graph import build_crisis_graph; g = build_crisis_graph(); print('Graph OK')"` — no import errors
- `g.compile()` compiles without validation errors

---

### Task 5.2 — `backend/app/workers/agent_worker.py` — FastAPI integration

**File:** `backend/app/workers/agent_worker.py` (NEW)

```python
"""
agent_worker.py — LangGraph crisis pipeline runner.

Exposes:
  - process_crisis_event(event: dict) → AsyncIterator[dict]  (for streaming)
  - run_crisis_event(event: dict) → CrisisState              (for one-shot invocation)
"""
import hashlib, json
from typing import AsyncIterator
from langgraph.checkpoint.memory import MemorySaver
from agents.graph import build_crisis_graph
from agents.state import CrisisState

_graph = build_crisis_graph()
_memory = MemorySaver()
_compiled = _graph.compile(checkpointer=_memory)


def generate_crisis_id(event: dict) -> str:
    payload = json.dumps(event, sort_keys=True, default=str)
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


async def process_crisis_event(event: dict) -> AsyncIterator[dict]:
    """Stream intermediate states as each agent completes."""
    crisis_id = generate_crisis_id(event)
    config = {"configurable": {"thread_id": crisis_id}}
    initial_state = {**event, "crisis_id": crisis_id, "messages": [], "route_recommendations": []}
    async for chunk in _compiled.astream(initial_state, config=config):
        yield chunk


async def run_crisis_event(event: dict) -> CrisisState:
    """One-shot invocation — returns final state after all agents complete."""
    crisis_id = generate_crisis_id(event)
    config = {"configurable": {"thread_id": crisis_id}}
    initial_state = {**event, "crisis_id": crisis_id, "messages": [], "route_recommendations": []}
    result = await _compiled.ainvoke(initial_state, config=config)
    return result
```

Add a FastAPI route to `backend/app/routers/` (new file: `agent_router.py`):
```python
@router.post("/api/crisis/process")
async def process_event(event: dict):
    """Trigger the agent pipeline for a crisis event."""
    result = await run_crisis_event(event)
    return {"crisis_id": result["crisis_id"], "status": result["status"],
            "confidence": result.get("overall_confidence")}

@router.websocket("/ws/crisis/{crisis_id}")
async def crisis_stream(websocket: WebSocket, crisis_id: str):
    """Stream agent progress to frontend in real-time."""
    ...  # relay chunks from process_crisis_event() over WebSocket
```

**Verification:**
- `uvicorn backend.app.main:app --reload` starts without errors
- POST `/api/crisis/process` with synthetic Belawan event → returns `status` field

---

## Wave 6 — Tests

### Task 6.1 — `backend/tests/test_agents.py` — Agent unit tests

**File:** `backend/tests/test_agents.py` (NEW)

Cover all 6 agents + consensus gate + graph compilation.

Test matrix:
```
test_data_collection_valid_event()
test_data_collection_duplicate_event()
test_data_collection_malformed_event()
test_osint_hazard_with_polygon()
test_osint_hazard_no_polygon()
test_osint_hazard_social_corroboration()
test_prediction_with_tomtom_data()
test_prediction_no_data_fallback()
test_route_optimization_blocked_primary()
test_route_optimization_no_hazards()
test_economic_intelligence_anomaly_detected()
test_economic_intelligence_ltm_fallback()
test_consensus_gate_validates_at_85pct()
test_consensus_gate_rejects_below_85pct()
test_decision_support_output_format()
test_graph_compiles()
test_graph_end_to_end_synthetic()  ← runs full pipeline on mock state
```

Use `pytest-asyncio` (already in `requirements.txt`) for async tests.
Mock external calls: Supabase, Redis, Gemini API — use `unittest.mock.AsyncMock`.

**Verification:** `pytest backend/tests/test_agents.py -v` — all tests pass.

---

### Task 6.2 — `agents/seeds/eval_scenarios.json` — GraphRAG reference answers

**File:** `agents/seeds/eval_scenarios.json` (NEW)

3 reference answer scenarios for Eval Tier 4 (GraphRAG correctness):
```json
[
  {
    "scenario": "belawan_port_closure",
    "disrupted_entity": "Belawan Port",
    "expected_chain": ["Trans-Sumatra Hwy", "Medan Distribution Hub", "cooking_oil", "rice"],
    "min_chain_length": 3
  },
  {
    "scenario": "trans_sumatra_hwy_blocked",
    "disrupted_entity": "Trans-Sumatra Hwy (Medan–Rantau Prapat)",
    "expected_chain": ["Medan Distribution Hub", "Pematangsiantar Warehouse", "Rantau Prapat Depot"],
    "min_chain_length": 3
  },
  {
    "scenario": "wildfire_riau_port_approach",
    "disrupted_entity": "Belawan Access Road",
    "expected_chain": ["Belawan Port", "Trans-Sumatra Hwy", "Medan Distribution Hub"],
    "min_chain_length": 3
  }
]
```

---

### Task 6.3 — `run_demo.py` update — add agent pipeline trigger

**File:** `backend/run_demo.py` (MODIFY — extend existing file)

After existing PIHPS synthetic injection block, add:

```python
# Phase 3: Trigger agent pipeline with synthetic Belawan crisis event
print("\n[DEMO] Triggering LangGraph agent swarm with Belawan Port closure scenario...")

import asyncio
from backend.app.workers.agent_worker import run_crisis_event

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
```

**Verification:**
- `python backend/run_demo.py` runs without error
- Output shows `Status: validated` and `Confidence: ≥ 85.00%`
- Executive summary text is printed to console

---

## Verification Checklist (Tier 3 Integration — from AI-SPEC Section 11)

Run these manually after all waves complete:

- [ ] All 6 agents execute in correct sequence; state passes through each node
- [ ] `python backend/run_demo.py` exits 0, prints validated status
- [ ] Consensus gate fires (overall_confidence ≥ 0.85) for Belawan synthetic scenario
- [ ] `decision_support_output` contains "Belawan" and "cooking oil"
- [ ] GraphRAG traversal from "Belawan Port" returns ≥ 3 downstream nodes
- [ ] LTM retrieval returns ≥ 1 episode with `similarity_score > 0.7`
- [ ] Supabase `incidents` table has ≥ 1 new "validated" row
- [ ] Redis `lrip:stream:validated_alerts` receives the alert event (check with `XLEN`)
- [ ] `pytest backend/tests/test_agents.py -v` — 100% pass rate
- [ ] Full pipeline completes in < 30 seconds (time `python backend/run_demo.py`)

---

## File Creation Summary

| File | Action | Wave |
|------|--------|------|
| `agents/state.py` | MODIFY | 1 |
| `backend/requirements.txt` | MODIFY | 1 |
| Supabase SQL migrations (3) | RUN | 1 |
| `agents/memory/__init__.py` | NEW | 2 |
| `agents/memory/stm.py` | NEW | 2 |
| `agents/memory/ltm.py` | NEW | 2 |
| `agents/seeds/historical_episodes.json` | NEW | 2 |
| `agents/seeds/seed_ltm.py` | NEW | 2 |
| `agents/seeds/entities.json` | NEW | 3 |
| `agents/seeds/relations.json` | NEW | 3 |
| `agents/seeds/seed_graphrag.py` | NEW | 3 |
| `agents/tools/__init__.py` | NEW | 3 |
| `agents/tools/graphrag.py` | NEW | 3 |
| `agents/tools/supabase_tools.py` | NEW | 3 |
| `agents/tools/consensus_gate.py` | NEW | 3 |
| `agents/nodes/__init__.py` | NEW | 4 |
| `agents/nodes/data_collection.py` | NEW | 4 |
| `agents/nodes/osint_hazard.py` | NEW | 4 |
| `agents/nodes/prediction.py` | NEW | 4 |
| `agents/nodes/route_optimization.py` | NEW | 4 |
| `agents/nodes/economic_intelligence.py` | NEW | 4 |
| `agents/nodes/decision_support.py` | NEW | 4 |
| `agents/graph.py` | NEW | 5 |
| `backend/app/workers/agent_worker.py` | NEW | 5 |
| `backend/app/routers/agent_router.py` | NEW | 5 |
| `backend/tests/test_agents.py` | NEW | 6 |
| `agents/seeds/eval_scenarios.json` | NEW | 6 |
| `backend/run_demo.py` | MODIFY | 6 |

**Total new files:** 26 | **Modified files:** 3

---

*PLAN.md complete. Ready for `/gsd-execute-phase 3`.*
