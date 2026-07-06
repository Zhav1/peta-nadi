# PLAN — Phase 1: Data Ingestion Pipeline & API Adapters

**Phase:** 1
**Goal:** Four real-time data streams flowing into Redis Streams. Each adapter is independently runnable, fault-tolerant, and writes to `data_sources` health table. The LangGraph agents in Phase 3 consume these streams — so the interface contract matters most here.
**Estimated Time:** 2-3 days
**Status:** TODO

---

## Context & Constraints

**Available credentials (already provisioned):**
- TomTom API Key: `WTTzRq2Ta8ePqH5OAjOz5mSL10TaAywr`
- AISstream API Key: `07caf41281cc2f2ac75591927858dbe6794a27ea`
- BMKG: Free public API — no key required
- NASA FIRMS: Free public API — no key required (no MAP_KEY needed for the basic endpoint)

**Geographic scope:**
- Primary corridor: North Sumatra (Belawan Port + Trans-Sumatra Highway)
- Belawan Port bounding box: lat 3.7–3.9, lon 98.6–98.8
- North Sumatra bounding box: lat 1.0–5.5, lon 97.5–100.5
- Full Sumatra (wildfire): lat -6.0–6.0, lon 95.0–109.0

**Integration constraint:** All adapters publish to Redis Streams using the key constants defined in `backend/app/services/redis_client.py`. They must not write directly to Supabase — the agent pipeline handles DB persistence.

---

## API Reference Sheet

### BMKG (Earthquakes + Weather)
| Endpoint | URL | Format | Auth |
|----------|-----|--------|------|
| Latest earthquake | `https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json` | JSON | None |
| Recent M5.0+ quakes | `https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json` | JSON | None |
| Felt earthquakes | `https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json` | JSON | None |
| Weather forecast | `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4={code}` | JSON | None (60 req/min) |

Key fields from earthquake JSON: `Gempa.Tanggal`, `Gempa.Jam`, `Gempa.Magnitude`, `Gempa.Kedalaman`, `Gempa.Wilayah`, `Gempa.Coordinates` (lat,lon string), `Gempa.Potensi` (tsunami potential)

**Polling strategy:** Poll `autogempa.json` every 60s. Deduplicate by `Tanggal+Jam+Magnitude` composite key stored in Redis.

---

### TomTom Traffic
| Endpoint | URL | Auth |
|----------|-----|------|
| Flow Segment Data | `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json` | `?key={KEY}&point={lat},{lon}` |
| Incident Details | `https://api.tomtom.com/traffic/services/5/incidentDetails` | `?key={KEY}&bbox={minLon},{minLat},{maxLon},{maxLat}` |

**Key response fields (flowSegmentData):**
```json
{
  "flowSegmentData": {
    "freeFlowSpeed": 90,
    "currentSpeed": 12,
    "currentTravelTime": 420,
    "freeFlowTravelTime": 58,
    "confidence": 0.95,
    "roadClosure": false
  }
}
```

**Congestion score** = `1 - (currentSpeed / freeFlowSpeed)` → 0.0 = free flow, 1.0 = standstill

**Target segments (Trans-Sumatra Highway checkpoints):**
```python
TOMTOM_SEGMENTS = [
    {"name": "Belawan Toll Gate",     "lat": 3.8012, "lon": 98.6890},
    {"name": "Tanjung Mulia Interchange", "lat": 3.7558, "lon": 98.6742},
    {"name": "Binjai Km 18",          "lat": 3.6789, "lon": 98.5123},
    {"name": "Pematangsiantar Km 128","lat": 2.9595, "lon": 99.0687},
]
```

**Polling strategy:** Poll all 4 segments every 5 minutes. On `currentSpeed < 20 km/h` OR `roadClosure == true`, publish HIGH severity event.

---

### AISstream (Vessel Tracking)
| Field | Value |
|-------|-------|
| WebSocket URL | `wss://stream.aisstream.io/v0/stream` |
| Auth | JSON field `APIKey` in subscription message |
| Bounding box | `BoundingBoxes: [[[3.7, 98.6], [3.9, 98.8]]]` (Belawan Port area) |
| Message filter | `FilterMessageTypes: ["PositionReport", "ShipStaticData"]` |

**Subscription message:**
```json
{
  "APIKey": "07caf41281cc2f2ac75591927858dbe6794a27ea",
  "BoundingBoxes": [[[3.7, 98.6], [3.9, 98.8]]],
  "FilterMessageTypes": ["PositionReport"]
}
```

**Key fields in PositionReport:**
- `MetaData.MMSI` — unique vessel ID
- `MetaData.ShipName`
- `MetaData.latitude`, `MetaData.longitude`
- `MetaData.time_utc`
- `Message.PositionReport.Sog` — Speed Over Ground (knots); < 0.5 = anchored/waiting
- `Message.PositionReport.Cog` — Course Over Ground

**Port congestion logic:** Count vessels with SOG < 0.5 in Belawan bounding box. If count > 8, publish port congestion event.

**Architecture note:** AISstream is a persistent WebSocket — run as a background `asyncio` task, not a polling loop.

---

### NASA FIRMS (Active Wildfire/Hotspots)
| Field | Value |
|-------|-------|
| Base URL | `https://firms.modaps.eosdis.nasa.gov/api/area/csv/{MAP_KEY}/VIIRS_SNPP_NRT/{bbox}/{days}` |
| Sumatra bbox | `94,-6,108,6` (lon_west,lat_south,lon_east,lat_north — lon first, GIS order) |
| Belawan/N.Sumatra | `97.5,1.0,100.5,5.5` |
| Format | CSV (lat, lon, brightness, frp, acq_date, acq_time, confidence) |
| Refresh cadence | ~3h (NRT = near-real-time; satellite pass every ~3h over any location) |
| Auth | Free MAP_KEY from https://firms.modaps.eosdis.nasa.gov/api/ |

**Key CSV columns:** `latitude`, `longitude`, `bright_ti4`, `frp` (Fire Radiative Power — MW), `confidence` (low/nominal/high), `acq_date`, `acq_time`

**Fire alert logic:** Any hotspot within 50km of Trans-Sumatra Highway with `confidence != low` triggers event. Use PostGIS `ST_DWithin` in Phase 3 for proximity; use bounding box filter here.

**Polling strategy:** Poll every 3 hours (matches satellite refresh cadence). No need for dedup beyond `acq_date+acq_time+latitude+longitude`.

---

## Architecture

```
Polling Loop (60s)          Redis Streams                  Consumers (Phase 3)
┌────────────────┐          ┌─────────────────────┐        ┌───────────────────┐
│ bmkg_adapter   │─────────>│ lrip:events:bmkg    │        │                   │
│ (earthquake +  │          └─────────────────────┘        │  DataCollection   │
│  weather)      │                                          │  Agent            │
└────────────────┘          ┌─────────────────────┐        │  (Phase 3)        │
                            │                     │        │                   │
┌────────────────┐          │ lrip:events:tomtom  │        │  - normalizes     │
│ tomtom_adapter │─────────>│                     │─────>  │  - validates      │
│ (flow + alerts)│          └─────────────────────┘        │  - routes to      │
└────────────────┘                                          │    other agents   │
                            ┌─────────────────────┐        └───────────────────┘
┌────────────────┐          │ lrip:events:        │
│ aisstream_     │─────────>│ aisstream           │
│ adapter (WS)   │          └─────────────────────┘
└────────────────┘
                            ┌─────────────────────┐
┌────────────────┐          │ lrip:events:        │
│ nasa_firms_    │─────────>│ nasa_firms          │
│ adapter (3h)   │          └─────────────────────┘
└────────────────┘

All adapters also update:
  Supabase: data_sources table (status, last_ok_at, cached_at)
  Redis KV: lrip:state:source:{name} (last-known-good cache)
```

---

## Directory Structure to Create

```
backend/
├── app/
│   ├── adapters/           ← NEW (all adapter modules)
│   │   ├── __init__.py
│   │   ├── base.py         ← BaseAdapter abstract class
│   │   ├── bmkg_adapter.py
│   │   ├── tomtom_adapter.py
│   │   ├── aisstream_adapter.py
│   │   └── nasa_firms_adapter.py
│   └── workers/            ← NEW (orchestration runners)
│       ├── __init__.py
│       └── ingestion_worker.py  ← asyncio event loop running all adapters
```

---

## Tasks

### Task 1.1 — Base Adapter Class

Create `backend/app/adapters/base.py` — abstract base class all adapters inherit from.

**Interface contract:**
```python
class BaseAdapter(ABC):
    source_name: str          # e.g. 'bmkg', 'tomtom'
    stream_key: str           # Redis stream key
    poll_interval_seconds: int

    async def fetch(self) -> list[dict]   # Raw data from API
    async def parse(self, raw) -> list[dict]  # Normalize to event schema
    async def run(self)                    # Poll loop: fetch → parse → publish → cache
    async def health_check(self) -> bool  # Returns True if API is reachable

    # Provided by base (not overridden):
    def publish(self, events: list[dict])      # Calls redis_client.publish_event()
    def update_source_health(self, status: str)  # Updates Supabase data_sources + Redis KV
    def get_cached_events(self) -> list[dict]  # Returns last-known-good from Redis KV
```

**Normalized event schema** (all adapters must produce this structure):
```python
{
    "source": str,         # 'bmkg', 'tomtom', 'aisstream', 'nasa_firms'
    "event_type": str,     # 'earthquake', 'weather_warning', 'congestion',
                           # 'port_queue', 'wildfire', 'road_closure'
    "severity": str,       # 'low', 'medium', 'high', 'critical'
    "lat": str,            # decimal degrees string
    "lon": str,            # decimal degrees string
    "title": str,          # human-readable one-liner
    "raw": str,            # JSON-stringified raw API response
    "ts": str,             # ISO 8601 UTC timestamp
    "dedup_key": str,      # unique string for deduplication
}
```

**Acceptance:** `BaseAdapter` is importable with no errors.

---

### Task 1.2 — BMKG Adapter

**File:** `backend/app/adapters/bmkg_adapter.py`

**Logic:**
1. Poll `autogempa.json` every 60s
2. Check if `Gempa.Magnitude` >= 5.0 AND `Gempa.Wilayah` contains "Sumatra" or coordinates within North Sumatra bbox
3. Deduplicate by Redis key `lrip:dedup:bmkg:{Tanggal}:{Jam}:{Magnitude}`
4. Publish to `lrip:events:bmkg` stream

**Severity mapping:**
```python
M < 5.0:  "low"
M 5.0-5.9: "medium"
M 6.0-6.9: "high"
M >= 7.0:  "critical"
```

**Weather:** Poll `prakiraan-cuaca` for Medan (adm4=`12.71.01.1001`) every 30min. Publish if extreme rain forecast detected.

**Acceptance:**
- `python -m app.adapters.bmkg_adapter` runs for 120s without errors
- At least one event published to `lrip:events:bmkg` stream (or graceful no-event if none active)
- `data_sources` table row for `bmkg` shows `status='ok'`

---

### Task 1.3 — TomTom Adapter

**File:** `backend/app/adapters/tomtom_adapter.py`

**Logic:**
1. Poll all 4 Trans-Sumatra Highway segments every 5 minutes
2. Calculate congestion score for each: `score = 1 - (currentSpeed / freeFlowSpeed)`
3. Publish event if: `score > 0.7` OR `roadClosure == True` OR `currentSpeed < 20`
4. Deduplicate by `lrip:dedup:tomtom:{segment_name}:{hour}` — 1 alert per segment per hour max

**Severity mapping:**
```python
score < 0.3:  no event (normal)
score 0.3-0.5: "low"
score 0.5-0.7: "medium"
score 0.7-0.9: "high"
score >= 0.9 or roadClosure: "critical"
```

**Acceptance:**
- Segments polled successfully; `data_sources` shows `tomtom: ok`
- At least 1 test event published by calling with mock response (pytest)
- Rate limit respected: no more than 1 request per 10s (TomTom free tier limit)

---

### Task 1.4 — AISstream Adapter

**File:** `backend/app/adapters/aisstream_adapter.py`

**Logic (WebSocket, not polling):**
1. Connect to `wss://stream.aisstream.io/v0/stream`
2. Send subscription JSON within 3s (Belawan bounding box filter)
3. Maintain `vessel_registry: dict[mmsi, {lat, lon, sog, name, last_seen}]` in memory
4. On each `PositionReport`: update registry
5. Every 60s: count vessels with SOG < 0.5 in bbox → if count > 8, publish port congestion event
6. On disconnect: reconnect with exponential backoff (max 5 retries)

**Published event structure (addition):**
```python
{
    "vessel_count": str,         # total in bbox
    "anchored_count": str,       # SOG < 0.5
    "avg_sog": str,              # average speed in knots
}
```

**Acceptance:**
- WebSocket connects successfully; `data_sources` shows `aisstream: ok`
- 60s summary log shows vessel count (0 is valid — Belawan may be quiet)
- Reconnect logic tested: manually kill connection; adapter reconnects within 30s

---

### Task 1.5 — NASA FIRMS Adapter

**File:** `backend/app/adapters/nasa_firms_adapter.py`

**Logic:**
1. Poll Sumatra CSV endpoint every 3 hours
2. Parse CSV with `csv.DictReader`
3. Filter: `confidence != 'low'` AND lat/lon within North Sumatra bbox (1.0–5.5, 97.5–100.5)
4. Check proximity to Trans-Sumatra Highway: fire within ~0.5 degrees of highway spine
5. Deduplicate by `lrip:dedup:firms:{acq_date}:{acq_time}:{lat:.2f}:{lon:.2f}`
6. Publish to `lrip:events:nasa_firms` stream

**Highway spine checkpoints** (for proximity check):
```python
HIGHWAY_SPINE = [
    (3.80, 98.69),  # Belawan
    (3.58, 98.68),  # Medan
    (2.96, 99.07),  # Pematangsiantar
    (2.32, 99.15),  # Simalungun
    (1.75, 98.95),  # Toba Lake area
]
```

**Severity mapping:**
```python
frp < 100:   "low"
frp 100-500: "medium"
frp > 500:   "high"
# Any fire within 20km of port/highway AND high confidence: "critical"
```

**Acceptance:**
- Adapter fetches CSV and parses without errors
- `data_sources` shows `nasa_firms: ok`
- Test with historical date shows at least some Sumatra fire data (Sumatra burns regularly)

---

### Task 1.6 — Ingestion Worker (Orchestrator)

**File:** `backend/app/workers/ingestion_worker.py`

Run all adapters concurrently via `asyncio.gather()`. This is the single entrypoint for all ingestion.

```python
"""
ingestion_worker.py — Starts all data ingestion adapters concurrently.

Usage:
    python -m app.workers.ingestion_worker
"""
import asyncio
from app.adapters.bmkg_adapter import BMKGAdapter
from app.adapters.tomtom_adapter import TomTomAdapter
from app.adapters.aisstream_adapter import AISstreamAdapter
from app.adapters.nasa_firms_adapter import NASAFIRMSAdapter

async def main():
    adapters = [
        BMKGAdapter(),
        TomTomAdapter(),
        AISstreamAdapter(),
        NASAFIRMSAdapter(),
    ]
    await asyncio.gather(*[a.run() for a in adapters])

if __name__ == "__main__":
    asyncio.run(main())
```

**Acceptance:**
- `python -m app.workers.ingestion_worker` runs for 120s with all adapters active
- All 4 `data_sources` rows in Supabase show `status='ok'`
- Redis `XLEN lrip:events:bmkg` > 0 after 60s (or health-only event)

---

### Task 1.7 — Unit Tests

**File:** `backend/tests/test_adapters.py`

Use `pytest` with `unittest.mock` to test each adapter in isolation.

**Tests to write:**
```python
test_bmkg_parse_earthquake()        # Mock autogempa.json response → assert event schema
test_bmkg_severity_mapping()        # M4.9 → no event, M5.0 → medium, M7.0 → critical
test_bmkg_dedup()                   # Same quake published twice → only one Redis write
test_tomtom_congestion_score()      # freeFlow=90, current=10 → score=0.89 → "high"
test_tomtom_road_closure()          # roadClosure=True → "critical" event
test_tomtom_no_alert_normal()       # freeFlow=90, current=80 → no event
test_aisstream_port_queue()         # 10 vessels with SOG<0.5 → congestion event
test_aisstream_no_queue()           # 3 vessels with SOG<0.5 → no event
test_nasa_firms_parse_csv()         # Mock CSV → assert parsed hotspot dict
test_nasa_firms_proximity_filter()  # Hotspot near highway → published; distant → skipped
test_base_adapter_health_update()   # health_check() False → data_sources status = 'degraded'
```

**Acceptance:**
- `pytest backend/tests/ -v` passes all 11 tests
- Tests run without network access (all mocked)

---

### Task 1.8 — Updated requirements.txt

Add dependencies needed for Phase 1:

```
# Phase 1 additions
websockets==12.0          # AISstream WebSocket client
aiohttp==3.9.5            # Async HTTP for BMKG + NASA FIRMS polling
pytest==8.2.2             # Testing
pytest-asyncio==0.23.7    # Async test support
```

---

### Task 1.9 — Update Backend .env

Create actual `backend/.env` with real credentials (not in git):
```
TOMTOM_API_KEY=WTTzRq2Ta8ePqH5OAjOz5mSL10TaAywr
AISSTREAM_API_KEY=07caf41281cc2f2ac75591927858dbe6794a27ea
# NASA FIRMS MAP_KEY — get from https://firms.modaps.eosdis.nasa.gov/api/
NASA_FIRMS_MAP_KEY=
```

Add `NASA_FIRMS_MAP_KEY` to `config.py` Settings model.

---

## Verification Checklist

| # | Check | Command | Expected |
|---|-------|---------|----------|
| V1 | Unit tests pass | `cd backend && pytest tests/ -v` | All 11 tests green |
| V2 | BMKG adapter runs | `python -m app.adapters.bmkg_adapter` (120s) | At least 1 poll, no errors |
| V3 | TomTom adapter runs | `python -m app.adapters.tomtom_adapter` (120s) | 4 segments polled, Supabase updated |
| V4 | AISstream connects | `python -m app.adapters.aisstream_adapter` (120s) | WebSocket handshake OK, vessel log |
| V5 | NASA FIRMS adapter | `python -m app.adapters.nasa_firms_adapter` | CSV parsed, Supabase updated |
| V6 | All 4 streams populated | `redis-cli XLEN lrip:events:bmkg` (or Python) | > 0 (or health event) |
| V7 | data_sources table | Supabase dashboard | 4 rows with status='ok' |
| V8 | Worker starts | `python -m app.workers.ingestion_worker` | All 4 adapters running concurrently |
| V9 | Fallback cache works | Kill BMKG endpoint; adapter returns cached | Redis KV `lrip:state:source:bmkg` non-empty |

---

## Sequencing Note

```
1.1 (base) → 1.8 (deps) → 1.9 (env) → parallel: [1.2, 1.3, 1.4, 1.5] → 1.6 (worker) → 1.7 (tests)
```

The adapters (1.2–1.5) can be built in parallel once the base class is done.

---

## Phase 1 Complete → Next Step

After all verification checks pass, run `/gsd-plan-phase 2` to plan OSINT & Headless Scraping (Lightpanda + PIHPS).

> **Note:** Before Phase 3, you MUST run `/gsd-ai-integration-phase 3` to generate the AI-SPEC design contract for the 6-agent LangGraph swarm. That generates the formal agent interaction design that Phase 3 will implement.
