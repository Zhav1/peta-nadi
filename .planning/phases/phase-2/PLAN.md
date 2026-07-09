# PLAN — Phase 2: OSINT & Headless Scraping (Lightpanda)

**Phase:** 2
**Goal:** PIHPS commodity prices and social OSINT feeding the agent pipeline via
Redis Streams. NER + geocoding converts free-text crisis reports into structured
geospatial events. Crisis Mode interval switching functional. Synthetic PIHPS
dataset ready for `run_demo.py`.
**Estimated Time:** 2–3 days
**Status:** TODO

---

## Context & Constraints

**What Phase 1 built (upstream contract):**
- `BaseAdapter` abstract class at `backend/app/adapters/base.py` — all scrapers extend this
- Redis stream key constants in `backend/app/services/redis_client.py`
  - `STREAM_PIHPS = "lrip:events:pihps"` — already defined ✅
  - `STREAM_SOCIAL = "lrip:events:social"` — already defined ✅
- Normalized event schema that Phase 3 agents expect (source, event_type, severity,
  lat, lon, title, raw, ts, dedup_key)

**Lightpanda deployment:**
- Lightpanda is only needed for marketplace + social scraping — **NOT for PIHPS**
- PIHPS is served via BI's internal JSON API (already reverse-engineered in `scripts/fetch_pihps_api.py`)
- Lightpanda runs as a Docker Compose service exposing CDP on port 9222
- Python connects via Playwright's `connect_over_cdp("http://lightpanda:9222")`
- For local dev without Docker, fall back to standard Playwright with Chromium

**Crisis Mode trigger:**
- Phase 3 agents will write `lrip:state:crisis_mode = "active"` to Redis KV
- OSINT scrapers must poll this key every cycle and shift intervals accordingly
- Phase 2 must implement the *interval-switching logic*; Phase 3 will write the key

**Synthetic fallback priority:**
- For the hackathon demo, `run_demo.py` must work 100% offline
- All live scrapers must gracefully degrade to cached/synthetic data when live sources fail

---

## API & Integration Reference

### PIHPS — BI Internal JSON API
| Detail | Value |
|--------|-------|
| Portal | `https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah` |
| **Live API** | `GET https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah` |
| Auth | None (uses session cookies + XHR headers — already tested in `scripts/fetch_pihps_api.py`) |
| Data | Weekly prices per commodity, per province, 34 provinces |
| Scraping needed | **No** — direct JSON API, no Playwright required |
| Normal cadence | Once daily (data is weekly; pull latest week's reading) |
| Crisis cadence | Every 15 minutes (re-fetches latest, detects fresh update) |
| Dedup key | `pihps:{commodity}:{province}:{tanggal}` |

**Key API params (from `scripts/fetch_pihps_api.py`):**
```python
BI_API_BASE = "https://www.bi.go.id/hargapangan/WebSite/TabelHarga"

# Commodity IDs (already reverse-engineered)
COMCAT_IDS = {
    "beras":         "com_3",
    "cabai_merah":   "com_13",
    "cabai_rawit":   "com_16",
    "bawang_merah":  "com_11",
    "bawang_putih":  "com_12",
    "minyak_goreng": "com_17",
    "telur_ayam":    "com_10",
}

# Province ID for Sumatera Utara
SUMATERA_UTARA_ID = 2

params = {
    "price_type_id": 1,
    "comcat_id": "com_17",     # Minyak Goreng
    "province_id": 2,          # Sumatera Utara
    "regency_id": "",
    "market_id": "",
    "tipe_laporan": 2,         # Weekly
    "start_date": "2026-07-01",
    "end_date": "2026-07-06",
    "_": int(time.time() * 1000)
}
```

**Spike detection:**
```python
SPIKE_THRESHOLD_PCT = 0.05     # 5% above rolling mean
CRITICAL_THRESHOLD_PCT = 0.15  # 15% = critical

def detect_spike(prices_7d: list[float], today: float) -> str | None:
    mean = sum(prices_7d) / len(prices_7d)
    dev = (today - mean) / mean
    if dev >= CRITICAL_THRESHOLD_PCT: return "critical"
    if dev >= SPIKE_THRESHOLD_PCT:    return "high"
    return None
```

---

### Nominatim Geocoding (OpenStreetMap)
| Detail | Value |
|--------|-------|
| Endpoint | `https://nominatim.openstreetmap.org/search` |
| Auth | None |
| Rate limit | 1 req/s (must cache aggressively) |
| Cache key | `lrip:geocode:{slug}` with 7-day TTL |
| Restriction | `countrycodes=id` parameter |

**Pre-seeded POIs (startup cache):**
```python
KNOWN_POIS = {
    "Belawan":        (3.7944, 98.6913),
    "Medan":          (3.5952, 98.6722),
    "Binjai":         (3.5997, 98.4885),
    "Pematangsiantar":(2.9595, 99.0687),
    "Danau Toba":     (2.6845, 98.8756),
    "Dumai":          (1.6784, 101.4503),
    "Trans Sumatra":  (3.7000, 98.6500),  # centroid proxy
}
```

---

### Twitter/X API (free tier)
| Detail | Value |
|--------|-------|
| Endpoint | `GET https://api.twitter.com/2/tweets/search/recent` |
| Auth | Bearer token (env: `TWITTER_BEARER_TOKEN`) |
| Rate limit | 1 request / 15 min window on free tier |
| Query | Bahasa Indonesia keywords + geolocation `point_radius:98.69,3.79,100km` |
| Fallback | Synthetic transcript via `run_demo.py` |

---

## Architecture

```
                        Lightpanda (CDP :9222)
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
  pihps_scraper.py    marketplace_scraper.py  social_scraper.py
   (daily / 15min)       (daily / best-effort)   (hourly / 15min)
          │                    │                    │
          ▼                    ▼                    ▼
   NER not needed       NER not needed       ner_pipeline.py
                                                    │
                                            geocoding_service.py
                                         (Nominatim + Redis cache)
          │                    │                    │
          ▼                    ▼                    ▼
   lrip:events:pihps    lrip:events:pihps   lrip:events:social
                        (price comparison)

Crisis Mode trigger:
   All scrapers check Redis KV "lrip:state:crisis_mode" every cycle
   normal → interval as above
   crisis → 15-minute interval for all scrapers
```

---

## Directory Structure to Create

```
backend/
├── app/
│   ├── scrapers/                    ← NEW (all OSINT scraper modules)
│   │   ├── __init__.py
│   │   ├── base_scraper.py          ← BaseScraper (extends BaseAdapter pattern)
│   │   ├── pihps_scraper.py         ← PIHPS commodity prices
│   │   ├── marketplace_scraper.py   ← Tokopedia/Shopee comparison
│   │   └── social_scraper.py        ← TikTok + Twitter/X OSINT
│   ├── nlp/                         ← NEW (NER + geocoding)
│   │   ├── __init__.py
│   │   ├── ner_pipeline.py          ← Gazetteer + Gemini Flash fallback
│   │   └── geocoding_service.py     ← Nominatim + Redis cache
│   └── workers/
│       └── osint_worker.py          ← NEW (orchestrates all scrapers)
backend/
└── tests/
    └── test_scrapers.py             ← NEW (unit tests for Phase 2)

run_demo.py (existing) — extend with synthetic PIHPS injection
data/
└── synthetic/
    └── pihps_sample.json            ← NEW (synthetic PIHPS dataset)
```

---

## Tasks

### Task 2.1 — Add Lightpanda to Docker Compose

**File:** `docker-compose.yml` (root or infra/)

Add Lightpanda service and `playwright` to `requirements.txt`.

```yaml
# docker-compose.yml addition:
lightpanda:
  image: ghcr.io/lightpanda-io/lightpanda:latest
  ports:
    - "9222:9222"
  command: ["serve", "--host", "0.0.0.0", "--port", "9222"]
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9222"]
    interval: 10s
    timeout: 5s
    retries: 3
```

```
# requirements.txt additions:
playwright==1.46.0
geopy==2.4.1
```

**Note for local dev:** If Lightpanda binary isn't available (Windows), scrapers
must fall back to `playwright.chromium.launch(headless=True)` for local testing.
This is handled via env var `LIGHTPANDA_URL` — if set, connect via CDP; if
unset, launch local Chromium.

**Acceptance:** `docker compose up lightpanda` starts service; CDP responds on
port 9222; Playwright can connect and load `https://example.com`.

---

### Task 2.2 — BaseScraper Class

**File:** `backend/app/scrapers/base_scraper.py`

Mirrors `BaseAdapter` but designed for Playwright-based scrapers. Key differences:
- `fetch()` receives a Playwright `Page` object instead of making HTTP calls directly
- `crisis_mode_check()` reads `lrip:state:crisis_mode` from Redis KV
- `get_interval()` returns `900` (15 min) if crisis mode active, else `normal_interval_seconds`

```python
class BaseScraper(ABC):
    source_name: str
    stream_key: str
    normal_interval_seconds: int   # e.g. 86400 (daily)

    async def scrape(self, page: Page) -> list[dict]  # Main scrape logic
    async def run(self)                                # Run loop with interval mgmt
    def is_crisis_mode(self) -> bool                  # Checks Redis KV
    def get_interval(self) -> int                     # Returns 900 or normal_interval_seconds

    # Inherited from BaseAdapter pattern:
    def publish(self, events: list[dict])
    def update_source_health(self, status: str)
    def get_cached_events(self) -> list[dict]
```

**Acceptance:** `BaseScraper` importable with no errors; `is_crisis_mode()` returns
`False` with empty Redis (correct default).

---

### Task 2.3 — PIHPS Scraper

**File:** `backend/app/scrapers/pihps_scraper.py`

**No Playwright / Lightpanda needed.** The BI portal exposes an internal JSON API
already reverse-engineered in `scripts/fetch_pihps_api.py`. Port that logic
directly into the scraper as a clean async `httpx` client.

**Implementation — direct API fetch:**
```python
async def fetch_pihps_province(comcat_id: str, province_id: int, days: int = 7) -> list[dict]:
    """Fetch latest weekly prices for one commodity+province from BI API."""
    end_date = datetime.utcnow().date()
    start_date = end_date - timedelta(days=days)
    params = {
        "price_type_id": 1,
        "comcat_id": comcat_id,
        "province_id": province_id,
        "regency_id": "",
        "market_id": "",
        "tipe_laporan": 2,      # Weekly
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "_": int(time.time() * 1000)
    }
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah",
            params=params, headers=headers, timeout=45
        )
    return resp.json().get("data", []) if resp.status_code == 200 else []
```

**Logic:**
1. For each commodity × Sumatera Utara (province_id=2): call `fetch_pihps_province()`
2. Parse response rows with `level==2` (commodity rows, same logic as `fetch_pihps_api.py`)
3. Extract latest weekly price; convert `parse_period_to_dates()` (already written)
4. Compare to 7-day rolling mean stored in Redis KV `lrip:pihps:rolling:{commodity}`
5. On spike detected: publish to `lrip:events:pihps` with severity
6. Always publish `price_baseline` event (used for LTM seeding in Phase 3)
7. Update `data_sources` health table

**Re-use from existing scripts:**
- `COMCAT_IDS` dict → copy from `fetch_pihps_api.py`
- `parse_period_to_dates()` → copy/import the period-to-date parser
- `PROV_IDS` → only need Sumatera Utara (id=2) for MVP

**Rolling mean storage:**
```python
key = f"lrip:pihps:rolling:{commodity}"
r.set(key, json.dumps(prices[-7:]), ex=86400 * 10)
```

**Historical seed (Day 1):** On first run, if Redis rolling mean is empty, call
the API with `start_date = today - 30d` to seed 4 weeks of weekly readings.

**Dedup key:** `pihps:{commodity}:sumut:{tanggal_YYYYMMDD}`

**Acceptance:**
- `python -m app.scrapers.pihps_scraper` fetches data without Playwright or Lightpanda
- At least one commodity price returned for Sumatera Utara
- `data_sources` table row for `pihps` shows `status='ok'`
- Spike detection fires on injected test price (+10% above rolling mean)
- No import of `playwright` in this file

---

### Task 2.4 — Marketplace Scraper (Best-Effort)

**File:** `backend/app/scrapers/marketplace_scraper.py`

**Scope:** Narrow comparison only — 3 fixed product searches on Tokopedia for
cooking oil and rice prices in "Sumatera Utara" region filter.

**Logic:**
1. Navigate to Tokopedia search for `"minyak goreng 2L"` with region filter
2. Extract top 5 product prices from search result cards (not product detail pages)
3. Calculate median market price; compare to PIHPS government price
4. Publish to `lrip:events:pihps` stream with `event_type = "market_comparison"`
5. On connection failure or bot detection: log warning, publish cached result,
   set `data_sources.pihps_market` to `status='degraded'`

**Hardcoded fallback:** `MARKETPLACE_SYNTHETIC_PRICES` dict at module level —
used if live scrape fails and no cache exists.

**Acceptance:**
- Scraper runs without crashing on anti-bot response (graceful degradation)
- Falls back to synthetic data correctly when Lightpanda can't render the page
- `data_sources` shows `degraded` (not `error`) on bot block

---

### Task 2.5 — NER Pipeline

**File:** `backend/app/nlp/ner_pipeline.py`

**Two-stage extraction:**

**Stage 1 — Gazetteer (fast path):**
```python
import re

LOCATION_GAZETTEER = [
    "Belawan", "Medan", "Binjai", "Pematangsiantar", "Simalungun",
    "Toba", "Danau Toba", "Trans Sumatra", "Sibolga", "Dumai",
    "Tanjung Mulia", "Tanjung Balai", "Rantau Prapat", "Kisaran",
    "Lubuk Pakam", "Stabat", "Langkat", "Karo", "Dairi", "Tebing Tinggi",
    # Roads + infrastructure
    "Jalan Lintas Sumatera", "Tol Belawan", "Pelabuhan Belawan",
]

def extract_locations_gazetteer(text: str) -> list[str]:
    found = []
    for loc in LOCATION_GAZETTEER:
        if re.search(r'\b' + re.escape(loc) + r'\b', text, re.IGNORECASE):
            found.append(loc)
    return found
```

**Stage 2 — Gemini Flash fallback (for unmatched text):**
```python
async def extract_locations_llm(text: str) -> list[str]:
    """Call Gemini Flash to extract location names from Indonesian text."""
    prompt = (
        "Ekstrak semua nama lokasi dari teks berikut. "
        "Kembalikan sebagai JSON array string. Teks:\n\n" + text
    )
    # Call Gemini Flash via google-generativeai SDK
    # Return parsed list or [] on failure
```

**Interface:**
```python
async def extract_locations(text: str) -> list[str]:
    """Return list of location strings, using gazetteer first then LLM."""
    results = extract_locations_gazetteer(text)
    if not results:
        results = await extract_locations_llm(text)
    return results
```

**Acceptance:**
- Gazetteer correctly finds "Belawan" and "Trans Sumatra" in test text
- LLM fallback called only when gazetteer returns empty list
- Returns `[]` gracefully on LLM failure (no exception raised)

---

### Task 2.6 — Geocoding Service

**File:** `backend/app/nlp/geocoding_service.py`

```python
import httpx
import json
from app.services.redis_client import get_redis

GEOCODE_CACHE_TTL = 7 * 24 * 3600   # 7 days

# Pre-seeded POIs (pre-loaded to Redis at startup to avoid API calls)
KNOWN_POIS = {
    "belawan":          (3.7944, 98.6913),
    "medan":            (3.5952, 98.6722),
    "binjai":           (3.5997, 98.4885),
    "pematangsiantar":  (2.9595, 99.0687),
    "danau toba":       (2.6845, 98.8756),
    "dumai":            (1.6784, 101.4503),
    "trans sumatra":    (3.7000, 98.6500),
    "sibolga":          (1.7455, 98.7875),
}

async def geocode(location_name: str) -> tuple[float, float] | None:
    """Returns (lat, lon) for a location name. None if not found."""
    slug = location_name.lower().strip()
    r = get_redis()
    cache_key = f"lrip:geocode:{slug}"

    # 1. Check Redis cache
    cached = r.get(cache_key)
    if cached:
        return tuple(json.loads(cached))

    # 2. Check pre-seeded POIs
    if slug in KNOWN_POIS:
        r.set(cache_key, json.dumps(KNOWN_POIS[slug]), ex=GEOCODE_CACHE_TTL)
        return KNOWN_POIS[slug]

    # 3. Call Nominatim (rate-limited: 1 req/s enforced by asyncio.sleep)
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": location_name, "format": "jsonv2", "countrycodes": "id", "limit": 1}
    headers = {"User-Agent": "PetaNadi/1.0 (lrip-project@example.com)"}
    async with httpx.AsyncClient() as client:
        await asyncio.sleep(1.1)  # Respect 1 req/s rate limit
        resp = await client.get(url, params=params, headers=headers, timeout=10)
    if resp.status_code == 200 and resp.json():
        data = resp.json()[0]
        coords = (float(data["lat"]), float(data["lon"]))
        r.set(cache_key, json.dumps(coords), ex=GEOCODE_CACHE_TTL)
        return coords

    return None  # Not found
```

**Acceptance:**
- `geocode("Belawan")` returns `(3.7944, 98.6913)` from pre-seeded cache (no API call)
- `geocode("unknown_place_xyz")` returns `None` without raising exception
- Cache TTL correctly set in Redis

---

### Task 2.7 — Social OSINT Scraper

**File:** `backend/app/scrapers/social_scraper.py`

**Two-channel pipeline:**

**Channel A — Twitter/X (API):**
```python
TWITTER_SEARCH_QUERY = (
    "(banjir OR longsor OR macet OR bencana OR pelabuhan OR harga naik) "
    "point_radius:98.69,3.79,100km lang:id"
)
```
- Poll `GET /2/tweets/search/recent` every 15 minutes
- Parse `data[].text`, run NER pipeline, geocode extracted locations
- Publish to `lrip:events:social`
- On API error / rate limit: set source to `degraded`, use last cached result

**Channel B — TikTok (web scrape via Lightpanda):**
- Navigate TikTok search for disaster keywords (Bahasa Indonesia)
- Extract video caption text from visible search result cards
- Run NER + geocoding on caption text
- Lower priority than Twitter; skip gracefully if blocked

**Social event schema:**
```python
{
    "source": "social",
    "platform": "twitter" | "tiktok",
    "event_type": "osint_report",
    "raw_text": str,             # max 500 chars, truncated
    "extracted_location": str,   # first extracted location name
    "lat": str, "lon": str,
    "keywords_matched": str,     # comma-sep
    "severity": "low" | "medium" | "high",
    "ts": str,                   # ISO 8601 UTC
    "dedup_key": str,            # platform:tweet_id or platform:video_id
    "title": str,                # f"[{platform.upper()}] {extracted_location}: {keywords_matched[:3]}"
    "raw": str,                  # JSON-stringified full response
}
```

**Severity mapping:**
```python
# Count of high-severity keywords in text
["longsor", "jalan putus", "banjir besar", "darurat", "evakuasi"] → high
["macet", "bencana", "terganggu", "harga naik", "kelangkaan"]     → medium
default → low
```

**Acceptance:**
- Twitter scraper connects and handles rate-limit response gracefully
- NER + geocoding pipeline called for each fetched tweet
- Geocoded event published to `lrip:events:social`
- Synthetic injection via `run_demo.py` still works (bypasses live scraper)

---

### Task 2.8 — OSINT Worker (Orchestrator)

**File:** `backend/app/workers/osint_worker.py`

```python
"""
osint_worker.py — Starts all OSINT scrapers concurrently.

Usage:
    python -m app.workers.osint_worker
"""
import asyncio
from app.scrapers.pihps_scraper import PIHPSScraper
from app.scrapers.marketplace_scraper import MarketplaceScraper
from app.scrapers.social_scraper import SocialScraper

async def main():
    scrapers = [
        PIHPSScraper(),
        MarketplaceScraper(),
        SocialScraper(),
    ]
    await asyncio.gather(*[s.run() for s in scrapers])

if __name__ == "__main__":
    asyncio.run(main())
```

**Acceptance:**
- `python -m app.workers.osint_worker` starts without errors
- All three scrapers initialize and begin their first polling cycle
- Crisis Mode flag change (manually set in Redis) causes all scrapers to shift
  to 15-minute interval within one polling cycle

---

### Task 2.9 — Synthetic PIHPS Dataset

**File:** `data/synthetic/pihps_sample.json`

Create a realistic synthetic dataset for `run_demo.py` covering the Belawan Port
closure + Trans-Sumatra flooding scenario.

```json
{
  "scenario": "belawan_closure_transumatra_flood",
  "generated_at": "2026-07-06T00:00:00Z",
  "events": [
    {
      "source": "pihps",
      "event_type": "price_spike",
      "commodity": "minyak_goreng",
      "price_today": "18500",
      "rolling_mean_7d": "15800",
      "deviation_pct": "17.1",
      "market": "Pasar Sei Sikambing",
      "province": "Sumatera Utara",
      "lat": "3.5952",
      "lon": "98.6722",
      "severity": "critical",
      "ts": "2026-07-06T06:00:00Z",
      "dedup_key": "pihps:minyak_goreng:pasar_sei_sikambing:20260706",
      "title": "Spike: minyak_goreng +17.1% above 7-day mean"
    }
    // ... additional commodities
  ],
  "social_events": [
    {
      "source": "social",
      "platform": "twitter",
      "event_type": "osint_report",
      "raw_text": "Pelabuhan Belawan lumpuh total! Kapal antri sampai 3 hari. Harga minyak goreng langka di Medan. #bencana #Belawan",
      "extracted_location": "Belawan",
      "lat": "3.7944",
      "lon": "98.6913",
      "keywords_matched": "pelabuhan,langka,bencana",
      "severity": "high",
      "ts": "2026-07-06T05:45:00Z",
      "dedup_key": "twitter:synthetic_001",
      "title": "[TWITTER] Belawan: pelabuhan, langka, bencana"
    }
  ]
}
```

**Acceptance:** `run_demo.py` reads and injects this file without errors; events
appear in `lrip:events:pihps` and `lrip:events:social` Redis streams.

---

### Task 2.10 — Extend run_demo.py with PIHPS + Social Injection

**File:** `backend/run_demo.py` (extend existing)

Add `inject_pihps_events()` and `inject_social_events()` functions that:
1. Read `data/synthetic/pihps_sample.json`
2. Publish each event to the appropriate Redis stream using `publish_event()`
3. Add a `time.sleep(1)` between events for realistic replay pacing

**Acceptance:** `python backend/run_demo.py` completes with PIHPS + social events
visible in Redis streams alongside Phase 1 events.

---

### Task 2.11 — Unit Tests

**File:** `backend/tests/test_scrapers.py`

```python
test_pihps_spike_detection_high()       # 7-day mean=15000, today=16000 → "high"
test_pihps_spike_detection_critical()   # 7-day mean=15000, today=18000 → "critical"
test_pihps_no_spike()                   # today within 4% of mean → None
test_pihps_dedup_key_format()           # dedup key matches expected pattern
test_ner_gazetteer_finds_belawan()      # "macet di Belawan" → ["Belawan"]
test_ner_gazetteer_finds_nothing()      # "macet di Jakarta" → [] (out of scope)
test_ner_llm_fallback_called()          # when gazetteer returns [], LLM mock called
test_geocode_known_poi_no_api_call()    # "Belawan" → coords from pre-seed, no HTTP
test_geocode_cache_hit()                # second call for same location hits Redis cache
test_geocode_unknown_returns_none()     # unknown location → None, no exception
test_social_severity_high()             # text with "jalan putus" → "high"
test_social_severity_low()             # generic text → "low"
test_crisis_mode_interval_switch()      # Redis key set → get_interval() returns 900
```

**Acceptance:** `pytest backend/tests/ -v` passes all 12 new tests (plus Phase 1's
11 existing tests = 23 total).

---

### Task 2.12 — Update requirements.txt

```
# Phase 2 additions
playwright==1.46.0           # Lightpanda CDP client + local Chromium fallback
geopy==2.4.1                 # Nominatim geocoding with RateLimiter
google-generativeai==0.8.0   # Gemini Flash NER fallback (check if already present)
```

Also add to `backend/app/config.py` Settings:
```python
lightpanda_url: str = ""             # e.g. "http://localhost:9222" — empty = use local Chromium
twitter_bearer_token: str = ""
```

---

## Verification Checklist

| # | Check | Command | Expected |
|---|-------|---------|----------|
| V1 | Unit tests pass (all) | `cd backend && pytest tests/ -v` | 23 tests green |
| V2 | PIHPS scraper runs | `python -m app.scrapers.pihps_scraper` | Prices extracted; `pihps: ok` in data_sources |
| V3 | Spike detection fires | Inject test price +10% above mean | `lrip:events:pihps` receives spike event |
| V4 | Crisis Mode trigger | `redis-cli SET lrip:state:crisis_mode active` | All scraper intervals shift to 900s within one cycle |
| V5 | NER + geocoding | Pass "banjir di Belawan" to `ner_pipeline.py` | Returns `[("Belawan", 3.7944, 98.6913)]` |
| V6 | Geocode cache hit | Call `geocode("Belawan")` twice | Second call logs cache hit; no HTTP request |
| V7 | Social scraper | `python -m app.scrapers.social_scraper` | Twitter attempt made; graceful on rate-limit |
| V8 | OSINT worker | `python -m app.workers.osint_worker` | All 3 scrapers active; no crash on startup |
| V9 | Synthetic injection | `python backend/run_demo.py` | PIHPS + social events in Redis streams |
| V10 | Lightpanda Docker | `docker compose up lightpanda` | CDP responds on port 9222 |
| V11 | Marketplace fallback | Kill Lightpanda; run marketplace_scraper | Logs `degraded`; returns synthetic cache |

---

## Sequencing

```
2.1 (Docker + deps)
       │
       ▼
2.2 (BaseScraper)
       │
       ├──────────────────────┬───────────────────────┐
       ▼                      ▼                       ▼
2.5 (NER pipeline)    2.6 (Geocoding)         2.3 (PIHPS scraper)
       │                      │
       └──────────┬───────────┘
                  ▼
           2.7 (Social scraper)
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
2.4 (Marketplace)    2.9 (Synthetic dataset)
       │                     │
       └──────────┬──────────┘
                  ▼
           2.10 (run_demo.py extension)
                  │
                  ▼
           2.8 (OSINT worker)
                  │
                  ▼
           2.11 (Tests) → 2.12 (requirements.txt)
```

**Parallelizable after 2.2:** Tasks 2.3, 2.4, 2.5, 2.6 can be built in parallel.
2.7 depends on 2.5 + 2.6. 2.8 depends on all scrapers.

---

## Phase 2 Complete → Next Step

After all verification checks pass:
1. Run `/gsd-ai-integration-phase 3` to generate the AI-SPEC design contract for
   the 6-agent LangGraph swarm before planning Phase 3.
2. Update `STATE.md` — Phase 2 status to **COMPLETE ✅**.

> **MANDATORY before Phase 3:** The LangGraph swarm consumes `lrip:events:pihps`
> and `lrip:events:social` — the interface contract established here. Run
> `/gsd-ai-integration-phase 3` to formally design the 6-agent interaction
> patterns before writing any agent code.
