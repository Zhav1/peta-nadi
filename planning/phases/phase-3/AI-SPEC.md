# AI-SPEC — Phase 3: LangGraph Agent Swarm (Core Reasoning)

**Phase:** 3 — LangGraph Agent Swarm — Core Reasoning
**Status:** DESIGN CONTRACT (pre-PLAN.md)
**Author:** gsd-ai-integration-phase
**Created:** 2026-07-07
**Consumes:** Phase 1 (Redis Streams data), Phase 2 (NER pipeline, geocoding, OSINT worker)
**Produces:** Validated crisis alerts, route recommendations, inflation forecasts

---

## 1. Scope

Phase 3 wires the 6-agent cognitive swarm using LangGraph. Agents share state via a single
`CrisisState` TypedDict (skeleton already in `agents/state.py`). The system must:

1. Consume events from Redis Streams (published by Phase 1 adapters and Phase 2 OSINT worker)
2. Route events through all 6 agents in a fan-out/fan-in topology
3. Aggregate per-agent confidence scores through a weighted Consensus Gate (threshold: 85%)
4. On gate pass: invoke DecisionSupportCopilot, write validated alert to Supabase, trigger WhatsApp
5. Expose GraphRAG causal chains (supply-chain dependency traversal) for the sidebar UI
6. Support `run_demo.py` deterministic replay via synthetic Redis events

---

## 2. Framework Selection

### Selected: LangGraph (langchain-ai/langgraph)

**Rationale:**
- **Native StateGraph**: `TypedDict` state contracts map directly to `CrisisState` — no
  impedance mismatch between the design schema and the implementation API.
- **Conditional edges**: The Consensus Gate is expressed as a native `conditional_edge` —
  clean branching without manual if-else wiring.
- **Fan-out/fan-in (Send API)**: LangGraph's `Send` primitive allows true parallel execution of
  Agents 2–5 over the same state, then aggregation before Agent 6.
- **MemorySaver + checkpointing**: Per-thread (per-crisis) persistence in Redis without
  custom serialization boilerplate. Threads keyed by `crisis_id`.
- **Streaming**: `.stream()` lets the FastAPI backend push intermediate agent findings to the
  frontend WebSocket as they complete, enabling the "live thinking" UX.
- **Observability**: LangSmith integration is drop-in for debugging agent traces during
  development.

**Rejected alternatives:**
- **CrewAI**: Role-based abstraction adds unnecessary indirection; state management is implicit;
  no native conditional gate support.
- **AutoGen**: Conversation-loop pattern doesn't match the deterministic sequential-then-parallel
  topology we need; poor LangSmith/tracing ecosystem.
- **Raw asyncio + Redis pub/sub**: Maximum control, but re-implements everything LangGraph
  provides; too risky for a 4-week solo build.

### Selected LLM Routing

| Agent | LLM | Justification |
|-------|-----|---------------|
| Agent 1 — Data Collection | **None** (deterministic) | Schema validation + rule-based normalization. No LLM needed; adds latency for no gain. |
| Agent 2 — OSINT & Hazard | **Gemini Flash** (via Phase 2 NER pipeline) | NER already implemented. Flash for vision/image analysis if CCTV footage attached. |
| Agent 3 — Prediction | **None** (statistical model) | TFT/regression from `src/04_modeling.py` research. LLM-generated narrative summary only on final output. |
| Agent 4 — Route Optimization | **None** (NetworkX algorithm) | Dijkstra/A* with hazard-weighted edges. Gemini Flash for route narrative only. |
| Agent 5 — Economic Intelligence | **Gemini Flash** | LTM retrieval + anomaly detection logic is deterministic; Flash generates the inflation narrative + confidence explanation. |
| Agent 6 — Decision Support Copilot | **Gemini 1.5 Flash** (primary) / **DeepSeek V3** (fallback) | Full synthesis task. Flash is sufficient and faster for MVP. DeepSeek V3 fallback for complex multi-hazard scenarios. |

**Model routing rule:** Route to Gemini Flash by default. Escalate to DeepSeek V3 only when
`len(active_hazards) >= 3` or `overall_confidence < 0.7` (uncertain multi-threat scenario).

---

## 3. Graph Topology

```
Redis Streams (Events)
        │
        ▼
┌──────────────────────┐
│  Agent 1             │  ← Deterministic validation node
│  DataCollectionAgent │    Input: raw Redis event
│                      │    Output: normalized_event, data_collection_finding
└──────────┬───────────┘
           │
     ┌─────┴──────────────────────────────────────────────────┐
     │ FAN-OUT (parallel via LangGraph Send API)               │
     │                                                          │
     ▼              ▼               ▼              ▼           │
┌────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    │
│Agent 2 │    │ Agent 3  │    │ Agent 4  │    │ Agent 5  │    │
│OSINT & │    │Prediction│    │ Route    │    │Economic  │    │
│Hazard  │    │  Agent   │    │Optim.    │    │Intellig. │    │
└────┬───┘    └────┬─────┘    └────┬─────┘    └────┬─────┘    │
     │             │               │                │           │
     └─────────────┴───────────────┴────────────────┘           │
                           │                                     │
                           ▼ FAN-IN                              │
                 ┌──────────────────┐                            │
                 │  CONSENSUS GATE  │                            │
                 │  (weighted score │                            │
                 │   threshold 85%) │                            │
                 └────────┬─────────┘                            │
                          │                                      │
            ┌─────────────┴────────────────┐
            │                              │
       confidence < 85%            confidence ≥ 85%
            │                              │
            ▼                              ▼
   ┌─────────────────┐          ┌──────────────────────┐
   │ Archive to      │          │ Agent 6              │
   │ Supabase as     │          │ DecisionSupportCopilot│
   │ "Unconfirmed"   │          └──────────┬───────────┘
   └─────────────────┘                     │
                                ┌──────────┴──────────┐
                                │                     │
                                ▼                     ▼
                       Supabase write           WhatsApp
                       (validated alert)        notification
```

**Key LangGraph constructs used:**
- `StateGraph(CrisisState)` — main graph
- `graph.add_node(name, fn)` for each of the 6 agents
- `graph.add_edge("data_collection", ["osint_hazard", "prediction", "route_optimization", "economic_intelligence"])` — fan-out
- `graph.add_node("consensus_gate", gate_fn)` — aggregator
- `graph.add_conditional_edges("consensus_gate", route_after_gate, {"validated": "decision_support", "unconfirmed": "archive"})` — conditional routing
- `MemorySaver` checkpoint store, keyed by `thread_id=crisis_id`

---

## 4. State Schema (Authoritative)

The existing `agents/state.py` skeleton is extended with the following fields. The Phase 3
implementation must make these changes to `CrisisState`:

```python
# ADDITIONS TO agents/state.py

class NormalizedEvent(TypedDict):
    """Produced by Agent 1; consumed by Agents 2–5."""
    source: str              # 'bmkg', 'tomtom', 'aisstream', 'nasa_firms', 'osint'
    event_type: str          # 'flood', 'congestion', 'port_closure', 'fire', 'price_spike'
    severity: str            # 'low', 'medium', 'high', 'critical'
    raw_payload: Dict[str, Any]
    validated: bool
    validation_errors: List[str]

class LTMEpisode(TypedDict):
    """Retrieved from pgvector by Agent 5."""
    episode_id: str
    description: str
    crisis_type: str
    inflation_multiplier: float    # e.g., 1.4 = 40% price increase
    recovery_days: int
    similarity_score: float

class GraphRAGNode(TypedDict):
    """Node in the causal dependency chain."""
    entity_id: str
    entity_type: str          # 'port', 'route', 'warehouse', 'commodity', 'supplier'
    name: str
    relation: str             # 'DEPENDS_ON', 'SHIPS_VIA', 'SUPPLIES'
    impact_score: float       # 0.0–1.0

# CrisisState ADDITIONS (add these fields to the existing TypedDict):
#   normalized_event: Optional[NormalizedEvent]
#   hazard_polygons: Optional[List[Dict]]      # GeoJSON features from PostGIS
#   congestion_forecast: Optional[Dict]        # {segment_id, delay_min, confidence} per horizon
#   ltm_episodes: Optional[List[LTMEpisode]]  # top-k similar historical events
#   graphrag_chain: Optional[List[GraphRAGNode]]  # ordered causal dependency chain
#   consensus_breakdown: Optional[Dict[str, float]]  # {signal_name: weighted_contribution}
#   validated: bool                            # True when consensus gate passes
```

---

## 5. Agent Node Specifications

### Agent 1 — DataCollectionAgent

**Trigger:** Invoked as the graph entry point when a new Redis Streams event arrives.

**Inputs:** Raw Redis Streams event dict

**Logic (deterministic — no LLM):**
1. Schema validation: check required fields (event_type, lat/lon or region, severity, source)
2. Deduplication: check Redis SET `lrip:seen:{event_hash}` — skip if seen within 5 min
3. Normalize units: convert severity strings to a standard enum; normalize timestamps to ISO 8601
4. Tag the normalized event with data source quality flag from `source_health` Supabase table
5. Emit `data_collection_finding` with confidence derived from source health:
   - `source_health = green` → confidence 0.9
   - `source_health = yellow` → confidence 0.6
   - `source_health = red` → confidence 0.3

**Output fields set in CrisisState:** `normalized_event`, `data_collection_finding`

**Confidence:** Deterministic, based on source health. Not weighted in Consensus Gate directly —
feeds as input quality signal to Agents 2–5.

---

### Agent 2 — OSINTHazardAgent

**Inputs:** `normalized_event`, OSINT events from Redis Stream `lrip:stream:osint`

**Logic:**
1. **Hazard fusion:** Query Supabase PostGIS for hazard polygons overlapping the event location
   (`ST_Intersects(event_point, hazard_polygon)`)
2. **Social corroboration:** Read recent OSINT events from last 2 hours for same region; count
   corroborating reports (TikTok/Twitter mentioning crisis keywords)
3. **NER cross-reference:** If social events have extracted locations (from Phase 2 NER), verify
   they overlap with the hazard polygon (adds +0.15 to confidence if they do)
4. **Gemini Flash call** (conditional): Only if `normalized_event.source == 'social'` — run
   sentiment/severity classification on raw transcript text

**Confidence formula:**
```
hazard_conf = 0.6 (base) 
            + 0.2 if PostGIS hazard polygon confirmed
            + 0.15 if ≥ 2 social corroborations
            + 0.05 if NER location overlap confirmed
```
Capped at 1.0. Final confidence stored in `osint_hazard_finding.confidence`.

**Output fields:** `osint_hazard_finding`, `hazard_polygons`

---

### Agent 3 — PredictionAgent

**Inputs:** `normalized_event`, TomTom segment data from Redis, historical averages from TimescaleDB

**Logic:**
1. Pull last 24h of TomTom congestion data for affected highway segments
2. Query TimescaleDB for historical congestion patterns for same corridor + event type
3. Run lightweight statistical forecast (Prophet or linear extrapolation from `src/04_modeling.py`
   patterns — no heavy TFT model for MVP) for 6h/12h/24h/48h horizons
4. Cross-reference NASA FIRMS fire polygons if `event_type == 'wildfire'` for spread estimate
5. Generate `congestion_forecast` dict with delay minutes and confidence intervals per horizon

**Confidence formula:**
```
prediction_conf = 0.5 (base — statistical model baseline)
               + 0.2 if historical TimescaleDB data covers ≥ 30 similar events
               + 0.2 if TomTom live data confirms current delay already ≥ 50% of predicted
               + 0.1 if NASA polygon confirms physical blockage
```

**No LLM call** in this node — a brief narrative summary is generated in Agent 6.

**Output fields:** `prediction_finding`, `congestion_forecast`

---

### Agent 4 — RouteOptimizationAgent

**Inputs:** `normalized_event`, `hazard_polygons`, `congestion_forecast`

**Logic:**
1. Load Trans-Sumatra corridor road graph from Supabase (static edge list + weights)
2. Apply hazard penalties: for each hazard polygon that intersects a road edge, multiply edge
   weight by `1 + severity_factor` (low=1.5x, medium=3x, high=10x, critical=blocked)
3. Run NetworkX Dijkstra (primary) from origin to destination with modified weights
4. Generate up to 3 alternative routes with: distance_km, eta_minutes, fuel_increase_pct, risk_score
5. Risk score = `(hazard_intersections × severity_weight) / route_length` normalized to 0–1
6. Gemini Flash call (optional, async): Generate a 1-sentence route narrative for each alternative

**Confidence formula:**
```
route_conf = 0.7 (base — routing algorithm is deterministic)
           + 0.2 if ≥ 2 viable alternative routes found (reduces "no good route" uncertainty)
           + 0.1 if alternative route risk_score < 0.3 (high-quality detour exists)
```

**Output fields:** `route_optimization_finding`, `route_recommendations`

---

### Agent 5 — EconomicIntelligenceAgent

**Inputs:** `normalized_event`, PIHPS data from Redis (Phase 2), `ltm_episodes` (pgvector query)

**Logic:**
1. **Anomaly detection:** Compare current PIHPS prices to 30-day rolling average for affected
   commodities; flag if deviation > 1.5 standard deviations
2. **LTM retrieval:** Embed a query text describing the current event (event_type + region +
   severity) using `text-embedding-004`; query pgvector for top-5 similar historical episodes
   (`SELECT * FROM historical_episodes ORDER BY embedding <=> $query_embed LIMIT 5`)
3. **Inflation multiplier:** Weighted average of `inflation_multiplier` from top-3 LTM episodes
   (weighted by `similarity_score`); apply to current commodity baselines
4. **Gemini Flash call:** Generate a 3-sentence inflation forecast narrative including timeframe,
   most affected commodities, and LTM precedent cited

**Confidence formula:**
```
econ_conf = 0.4 (base)
          + 0.3 if current PIHPS anomaly already detected (empirical evidence)
          + 0.2 if top LTM episode similarity_score > 0.8 (strong historical precedent)
          + 0.1 if ≥ 3 LTM episodes agree on inflation direction
```

**Output fields:** `economic_intelligence_finding`, `ltm_episodes`, `inflation_forecast`

---

### Consensus Gate (not an agent — a conditional edge function)

**Inputs:** All four agent findings (`osint_hazard_finding`, `prediction_finding`,
`route_optimization_finding`, `economic_intelligence_finding`)

**Weighted scoring (FR-3.8):**

| Signal | Weight | Source |
|--------|--------|--------|
| Hazard Signal | 30% | `osint_hazard_finding.confidence` |
| Visual/Social | 20% | `data_collection_finding.confidence` (data quality signal) |
| Geospatial | 30% | `prediction_finding.confidence × 0.5 + route_optimization_finding.confidence × 0.5` |
| LTM Economics | 20% | `economic_intelligence_finding.confidence` |

```python
def consensus_gate(state: CrisisState) -> str:
    weights = {
        "hazard":    (0.30, state["osint_hazard_finding"]["confidence"]),
        "social":    (0.20, state["data_collection_finding"]["confidence"]),
        "geospatial":(0.30, (
            state["prediction_finding"]["confidence"] * 0.5 +
            state["route_optimization_finding"]["confidence"] * 0.5
        )),
        "economics": (0.20, state["economic_intelligence_finding"]["confidence"]),
    }
    overall = sum(w * c for _, (w, c) in weights.items())
    state["overall_confidence"] = overall
    state["consensus_breakdown"] = {k: w * c for k, (w, c) in weights.items()}
    state["validated"] = overall >= 0.85
    return "validated" if overall >= 0.85 else "unconfirmed"
```

**Output fields set:** `overall_confidence`, `consensus_breakdown`, `validated`

---

### Agent 6 — DecisionSupportCopilot

**Triggered only when:** `consensus_gate` returns `"validated"`

**Inputs:** Full `CrisisState` (all agent findings, forecasts, route recommendations, LTM episodes)

**Logic:**
1. **Primary LLM call (Gemini Flash):** Pass structured JSON of all findings + a system prompt
   that instructs the model to produce an executive summary in the format:
   - Crisis overview (2 sentences)
   - Key evidence (bullet points from each agent finding)
   - Recommended immediate action
   - Economic risk assessment (48h outlook)
   - Confidence level explanation
2. **Escalation routing:** If `len([h for h in hazards if h.severity == 'critical']) >= 2`,
   re-route to DeepSeek V3 for a more thorough multi-threat synthesis
3. **GraphRAG enrichment:** Query the causal chain (see Section 6) and append the supply-chain
   impact to the executive summary
4. **Write to Supabase:** Insert validated alert into `incidents` table with full evidence chain
5. **Write to Redis:** Publish to `lrip:stream:validated_alerts` for WebSocket delivery to frontend
6. **Trigger notification:** POST to FastAPI `/api/notify` endpoint → WhatsApp Business API

**Output fields:** `decision_support_output`, `causal_chain`, `status = "validated"`

---

## 6. Memory Architecture

### Short-Term Memory (STM) — Redis

| Key Pattern | Type | TTL | Contents |
|-------------|------|-----|----------|
| `lrip:crisis:{crisis_id}` | JSON (Redis JSON module) | 24h | Full `CrisisState` snapshot |
| `lrip:seen:{event_hash}` | SET member | 5 min | Deduplication registry |
| `lrip:state:crisis_mode` | String | — | Global crisis mode flag (from Phase 2) |
| `lrip:ltm:cache:{query_hash}` | JSON | 1h | Cached pgvector query results |

**LangGraph integration:** Use `MemorySaver` as the checkpointer. Each graph run uses
`config = {"configurable": {"thread_id": crisis_id}}`. LangGraph serializes the full
`CrisisState` at every node checkpoint and stores it in the provided checkpointer.

For production: swap `MemorySaver` (in-memory) with a Redis-backed `AsyncRedisSaver` using the
`langgraph-checkpoint-redis` package. MVP can use `MemorySaver` with periodic manual dumps to
Redis JSON.

### Long-Term Memory (LTM) — pgvector (Supabase)

**Table: `historical_episodes`**

```sql
CREATE TABLE historical_episodes (
    episode_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title          TEXT NOT NULL,
    description    TEXT NOT NULL,
    crisis_type    TEXT,          -- 'flood', 'port_closure', 'wildfire', etc.
    affected_region TEXT,
    affected_commodities TEXT[],  -- ['rice', 'cooking_oil', 'fuel']
    inflation_multiplier FLOAT,   -- price change ratio (1.4 = +40%)
    recovery_days  INTEGER,
    sources        TEXT[],
    embedding      VECTOR(768),   -- text-embedding-004 embedding of description
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ON historical_episodes
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);
```

**Seed data (manual, pre-Phase 3):** 15 North Sumatra historical events including:
- Belawan Port closure (Jan 2021, flooding) — cooking oil +38%, recovery 12 days
- Trans-Sumatra Highway blocked (2022 landslide) — fuel +22%, rice +15%, recovery 7 days
- Multiple smaller port congestion and weather disruption events from public records

**Retrieval query (Agent 5):**
```python
async def query_ltm(query_text: str, top_k: int = 5) -> List[LTMEpisode]:
    embedding = await embed(query_text)  # text-embedding-004
    results = await supabase.rpc("match_episodes", {
        "query_embedding": embedding,
        "match_threshold": 0.6,
        "match_count": top_k
    }).execute()
    return results.data
```

---

## 7. GraphRAG Architecture

**Design choice:** NetworkX in-memory graph built from Supabase entity tables.
Neo4j is explicitly **rejected** for MVP (operational overhead, solo dev timeline).

### Entity Tables (Supabase)

```sql
CREATE TABLE entities (
    entity_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       TEXT NOT NULL,
    entity_type TEXT NOT NULL,   -- 'port', 'route', 'warehouse', 'commodity', 'supplier'
    lat        FLOAT,
    lon        FLOAT,
    region     TEXT,
    metadata   JSONB
);

CREATE TABLE entity_relations (
    relation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_entity UUID REFERENCES entities(entity_id),
    to_entity   UUID REFERENCES entities(entity_id),
    relation_type TEXT NOT NULL,  -- 'DEPENDS_ON', 'SHIPS_VIA', 'SUPPLIES', 'LOCATED_IN'
    weight      FLOAT DEFAULT 1.0,  -- importance weight for traversal
    metadata    JSONB
);
```

**Seed entities (North Sumatra corridor):**
- Belawan Port, Dumai Port, Tanjung Balai Port
- Trans-Sumatra Highway (Medan–Rantau Prapat segment)
- Medan Distribution Hub (warehouse)
- Minyak Goreng (cooking oil), Beras (rice), BBM (fuel) — commodity nodes
- Key BULOG warehouses + major supplier entities

**Traversal (GraphRAG query):**
```python
def get_causal_chain(disrupted_entity_id: str, max_depth: int = 4) -> List[GraphRAGNode]:
    # Load graph from Supabase (cached in Redis for 1h to avoid repeated DB calls)
    G = load_entity_graph()
    # BFS from disrupted node, following DEPENDS_ON and SHIPS_VIA edges downstream
    affected = nx.descendants(G, disrupted_entity_id)
    # Sort by topological order + weight
    chain = sorted(
        [G.nodes[n] for n in affected],
        key=lambda n: nx.shortest_path_length(G, disrupted_entity_id, n["entity_id"])
    )
    return chain[:max_depth * 3]  # cap at reasonable display length
```

**Hybrid GraphRAG + pgvector (Agent 6):** After graph traversal identifies affected entity names,
query `historical_episodes` for episodes involving those same entities to provide historical
context alongside the structural causal chain.

---

## 8. Integration Points with Existing Phases

| Interface | Direction | Mechanism |
|-----------|-----------|-----------|
| Phase 1 adapters → Agent 1 | Inbound | Redis Streams `lrip:stream:events` |
| Phase 2 OSINT worker → Agent 2 | Inbound | Redis Streams `lrip:stream:osint` |
| Phase 2 NER pipeline | Used by Agent 2 | Direct import: `from app.nlp.ner_pipeline import extract_locations` |
| Phase 2 geocoding | Used by Agent 2 | Direct import: `from app.nlp.geocoding_service import geocode` |
| Agent 6 → Phase 4 frontend | Outbound | Redis Streams `lrip:stream:validated_alerts` (WebSocket relay) |
| Agent 6 → Phase 5 WhatsApp | Outbound | FastAPI internal POST `/api/notify` |
| Agent 6 → Supabase | Outbound | Supabase Python client write to `incidents` table |

---

## 9. File Structure (Phase 3 deliverables)

```
agents/
├── state.py                        ← EXTEND (add new fields per Section 4)
├── __init__.py                     ← EXISTS
├── graph.py                        ← NEW: StateGraph definition, node wiring, entry point
├── nodes/
│   ├── __init__.py
│   ├── data_collection.py          ← Agent 1: normalization, dedup, source quality
│   ├── osint_hazard.py             ← Agent 2: PostGIS fusion, social corroboration
│   ├── prediction.py               ← Agent 3: statistical forecast + congestion model
│   ├── route_optimization.py       ← Agent 4: NetworkX Dijkstra + hazard penalties
│   ├── economic_intelligence.py    ← Agent 5: PIHPS anomaly + LTM retrieval
│   └── decision_support.py         ← Agent 6: Gemini Flash synthesis + Supabase write
├── memory/
│   ├── __init__.py
│   ├── stm.py                      ← Redis STM helpers (read/write CrisisState JSON)
│   └── ltm.py                      ← pgvector retrieval + embedding generation
├── tools/
│   ├── __init__.py
│   ├── graphrag.py                 ← NetworkX graph build + BFS traversal
│   ├── consensus_gate.py           ← Weighted confidence aggregation function
│   └── supabase_tools.py           ← Supabase CRUD for incidents, entities, historical_episodes
├── seeds/
│   ├── entities.json               ← North Sumatra corridor seed entities
│   ├── relations.json              ← Entity relationship seed data
│   └── historical_episodes.json    ← 15 seed LTM episodes with embeddings pre-computed
└── README.md                       ← UPDATE: document Phase 3 API and usage
```

---

## 10. LangGraph Runner (FastAPI Integration)

The graph is exposed via FastAPI as both a webhook consumer and a streaming endpoint:

```python
# backend/app/workers/agent_worker.py

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from agents.graph import build_crisis_graph

graph = build_crisis_graph()
memory = MemorySaver()
app_graph = graph.compile(checkpointer=memory)

async def process_crisis_event(event: dict) -> AsyncIterator[CrisisState]:
    crisis_id = generate_crisis_id(event)
    config = {"configurable": {"thread_id": crisis_id}}
    async for state in app_graph.astream(event, config=config):
        yield state  # FastAPI WebSocket relays each intermediate state to frontend
```

**run_demo.py integration:** `process_crisis_event()` is called directly with synthetic event
dicts from `data/synthetic/pihps_sample.json` and new synthetic NASA/TomTom fixtures — bypasses
Redis Streams for deterministic demo replay.

---

## 11. Evaluation Strategy

### Eval Tier 1 — Unit Evals (per agent node)

Each agent is tested in isolation with mocked dependencies:

| Agent | Test type | Pass criteria |
|-------|-----------|---------------|
| Agent 1 | Schema validation | Rejects malformed events; assigns correct source health scores |
| Agent 2 | Confidence calibration | Hazard fusion returns ≥ 0.75 confidence for known Belawan events |
| Agent 3 | Forecast accuracy | 24h forecast within 20% of historical actuals for 3 test corridors |
| Agent 4 | Route correctness | Returns ≥ 2 alternatives when primary route is blocked; correct distance calc |
| Agent 5 | LTM retrieval | Top-1 episode for "Belawan flood" = Belawan Port closure 2021 episode |
| Agent 6 | Output format | Executive summary contains all 5 required sections; < 500 tokens |

### Eval Tier 2 — Consensus Gate Calibration

Run 20 synthetic crisis scenarios (10 true positive, 10 true negative):
- **True positive scenarios:** Known events that should validate (Belawan closure, Trans-Sumatra flood)
- **True negative scenarios:** Weak single-source signals that should not validate

**Pass criteria:**
- True positive rate ≥ 0.9 (gate fires for 9 of 10 real crises)
- False positive rate ≤ 0.1 (gate fires for ≤ 1 of 10 non-events)

### Eval Tier 3 — Integration / End-to-End

Run `run_demo.py` synthetic crisis: Belawan Port closure + Trans-Sumatra flooding.

**Checklist:**
- [ ] All 6 agents execute in correct sequence; state passes through each node
- [ ] Consensus gate fires (overall_confidence ≥ 0.85) for the synthetic scenario
- [ ] `decision_support_output` contains "Belawan" and "cooking oil" in the summary
- [ ] GraphRAG traversal from "Belawan Port" returns ≥ 3 downstream supply chain nodes
- [ ] LTM retrieval returns ≥ 1 episode with similarity_score > 0.7
- [ ] Supabase `incidents` table contains a new "validated" row after run
- [ ] Redis `lrip:stream:validated_alerts` receives the alert event
- [ ] Full pipeline completes in < 30 seconds (demo timing requirement)

### Eval Tier 4 — GraphRAG Correctness

Manually verify causal chain for 3 seeded scenarios:
1. Belawan Port closure → cooking oil supply delayed → Medan warehouse depleted → price spike
2. Trans-Sumatra Highway blocked → fuel delivery delayed → 6 downstream warehouses affected
3. Wildfire (Riau) → port approach road blocked → secondary commodity impact

**Pass criteria:** Chain must include all known nodes for each scenario (reference answer manually
authored in `agents/seeds/eval_scenarios.json`).

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| LangGraph fan-out state merge conflicts | Medium | High | Use `Annotated[List, operator.add]` for list fields; document merge strategy per field |
| pgvector cold start (no seed data) | Low | High | Pre-embed and insert 15 episodes before any agent run; validate in Tier 3 eval |
| NetworkX graph too slow for large entity sets | Low | Medium | Cache graph in Redis as serialized bytes; rebuild only on entity table change |
| Gemini Flash rate limits during parallel agent execution | Medium | Medium | Add exponential backoff; Agents 2–5 use Flash at most once each = 4 parallel calls |
| DeepSeek V3 API latency (multi-hazard escalation) | Medium | Low | Only triggers on complex scenarios; not on demo critical path |
| Crisis state merge during fan-in | Medium | High | LangGraph `Send` API passes state copies; merge is explicit in `consensus_gate` fn |

---

## 13. Open Questions for PLAN.md

These design decisions are resolved enough for planning, but note the implementation choices:

1. **MemorySaver vs AsyncRedisSaver:** Use `MemorySaver` for Phase 3 MVP. Add Redis-backed
   checkpointer as a Phase 6 polish task if needed.

2. **Embedding model:** Use `text-embedding-004` (Gemini) via the `google-generativeai` SDK
   already used in Phase 2. Avoids adding a second embedding provider.

3. **Prophet vs linear regression for Agent 3:** Use linear extrapolation for MVP speed.
   Prophet requires more data than we have for the 15-event seed set.

4. **pgRouting vs NetworkX:** Use NetworkX for MVP. pgRouting adds PostGIS extension complexity
   that's not worth it for a single-corridor demo. pgRouting is a Phase 6+ upgrade.

5. **GraphRAG vs full Neo4j:** NetworkX + Supabase tables is the MVP choice. Document Neo4j
   upgrade path in README for post-hackathon v2.

---

*AI-SPEC complete. Proceed to `/gsd-plan-phase 3` to generate PLAN.md.*
