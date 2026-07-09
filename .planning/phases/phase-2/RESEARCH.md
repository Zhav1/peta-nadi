# RESEARCH — Phase 2: OSINT & Headless Scraping (Lightpanda)

**Phase:** 2
**Researched:** 2026-07-06
**Researcher:** Antigravity (gsd-plan-phase --research 2)

---

## Summary

Phase 2 builds the OSINT data layer that feeds into the agent pipeline. The three
core concerns are: (1) scraping PIHPS commodity price data reliably, (2) extracting
location entities from Indonesian-language social text (NER + geocoding), and (3)
running all of this through Lightpanda with a Crisis Mode interval trigger.

---

## 1. Lightpanda Integration

**Architecture:** Lightpanda is a Zig-native headless browser exposing the Chrome
DevTools Protocol (CDP). It is **not** a Python library — it runs as a standalone
server binary that Playwright connects to over CDP.

**Deployment pattern for this project:**
```bash
# Docker Compose service addition:
lightpanda:
  image: ghcr.io/lightpanda-io/lightpanda:latest
  ports:
    - "9222:9222"
  command: serve --host 0.0.0.0 --port 9222
```

**Python integration (Playwright + CDP):**
```python
from playwright.async_api import async_playwright

async with async_playwright() as p:
    browser = await p.chromium.connect_over_cdp("http://lightpanda:9222")
    context = browser.contexts[0]
    page = context.pages[0]
    await page.goto("https://hargapangan.id")
    # ... scrape ...
    await browser.close()
```

**Key tradeoffs vs. headless Chromium:**
- ~10x faster, ~10x lower RAM (~24MB vs. ~200MB per session)
- CDP-compatible: existing Playwright scripts work as-is
- Limitation: may not handle complex SPAs or certain IndexedDB features perfectly
- Risk for marketplace scraping (Tokopedia/Shopee): these are heavy SPAs; test
  early and maintain synthetic fallback if Lightpanda can't render them

**Decision:** Use Lightpanda as primary headless engine. If a target site fails,
fall back to standard `httpx` requests (PIHPS can work with plain HTTP requests
since the data loads via XHR endpoints that can be replicated directly).

---

## 2. PIHPS Data Source — BI Internal JSON API

**Correction from initial research:** hargapangan.id is NOT the right target.
The real authoritative source is the **Bank Indonesia portal** at
`bi.go.id/hargapangan`, and it exposes a working internal JSON API that was
already reverse-engineered in `scripts/fetch_pihps_api.py`.

**Confirmed API endpoint:**
```
GET https://www.bi.go.id/hargapangan/WebSite/TabelHarga/GetGridDataDaerah
```
Params: `price_type_id`, `comcat_id`, `province_id`, `tipe_laporan=2` (weekly),
`start_date`, `end_date`, `_` (cache-busting timestamp).

**Commodity IDs already mapped (from `scripts/fetch_pihps_api.py`):**
- Beras Kualitas Medium I → `com_3`
- Cabai Merah Besar → `com_13`
- Cabai Rawit Merah → `com_16`
- Bawang Merah → `com_11`
- Bawang Putih → `com_12`
- Minyak Goreng Curah → `com_17`
- Telur Ayam Ras → `com_10`

**Province IDs also mapped:** Sumatera Utara = `2`, all 34 provinces mapped.

**Three existing scripts (in `scripts/`):**
| Script | Role |
|--------|------|
| `fetch_pihps_api.py` | Direct JSON API client — **primary** approach for live ingestion |
| `fetch_pihps_bi.py` | Playwright scraper for bulk Excel download (historical backfill only) |
| `fetch_pihps.py` | Hybrid: tries Playwright, falls back to local Excel `Tabel Harga Berdasarkan Komoditas (2).xlsx` |

**Response structure:** returns `{"data": [...rows]}`. Rows with `level==2` are
the commodity data rows. Period columns are named `"Jan 2026 (I)"`, `"Jan 2026 (II)""`
etc. (weekly periods). `parse_period_to_dates()` already converts these.

**For `pihps_scraper.py` in Phase 2:** port `fetch_pihps_api.py` into async
`httpx` (it currently uses sync `requests`). Re-use `COMCAT_IDS`, `PROV_IDS`,
and `parse_period_to_dates()` directly.

**No Lightpanda needed for PIHPS.** The Excel download via Playwright
(`fetch_pihps_bi.py`) is only useful for historical bulk backfill, not for
daily live ingestion.

---

## 3. Marketplace Scraping (Tokopedia / Shopee)

**Risk level:** HIGH. Both platforms aggressively detect bots. Lightpanda reduces
fingerprint vs. Chromium but does not eliminate detection risk.

**Mitigation strategy:**
1. Keep scraping scope narrow: only 3–5 specific product search queries
   (e.g., "minyak goreng 2L Sumatra") with human-like delays (2–5s jitter)
2. Do not scrape product pages — scrape search result cards only (less JS-heavy)
3. Maintain a synthetic fallback JSON dataset for `run_demo.py` that replaces
   live Tokopedia/Shopee data entirely for the hackathon demo
4. Treat marketplace scraping as "best-effort enrichment" — system must function
   without it; this data is a comparison signal, not a core alert source

**Implementation note:** If live marketplace scraping proves unreliable within
the 4-week timeline, ship synthetic data + defer live scraping to v2. The
blueprint explicitly lists Tokopedia/Shopee as aspirational for MVP.

---

## 4. Social OSINT (TikTok + Twitter/X)

**TikTok:** TikTok embeds iFrame-accessible video metadata on the web (without
login for public content). Target: TikTok search for disaster/bencana keywords
related to North Sumatra. Extract caption text for NER processing.

**Twitter/X:** X now aggressively blocks unauthenticated API access. The free
tier API allows very limited search. Options:
- Use the free-tier v2 API (`GET /2/tweets/search/recent`) with bearer token
  and keyword filters (bahasa Indonesia disaster terms + geolocation)
- Fall back to `nitter.net` (open-source Twitter frontend) if API is unavailable
- Synthetic transcript injection via `run_demo.py` is the demo reliability anchor

**Keywords to monitor:**
```python
SOCIAL_KEYWORDS = [
    "banjir", "bencana", "kemacetan", "macet total", "jalan putus",
    "longsor", "kebakaran", "pelabuhan", "belawan", "trans sumatra",
    "harga naik", "kelangkaan", "langka", "pasokan terganggu"
]
```

---

## 5. NER Pipeline (Indonesian Location Extraction)

**Problem:** spaCy has no official Indonesian model. Options:

| Option | Pros | Cons |
|--------|------|------|
| `asmud/ner-spacy-indonesian` (HuggingFace) | Pre-trained, 19 entity types incl. LOC/GPE | External dependency; quality varies |
| LLM-based extraction (Gemini Flash) | Zero training needed, handles informal text | Latency + cost per call |
| Keyword + regex dictionary | Zero infra; fast; deterministic | Brittle; misses novel mentions |

**Recommended approach (hybrid):**
1. **Fast path:** regex gazetteer of known North Sumatra locations (kecamatan,
   kabupaten, jalan, pasar names). Covers 90% of cases with zero latency.
2. **Fallback:** For text not matched by gazetteer, call Gemini Flash with a
   simple extraction prompt. This handles informal abbreviations and novel terms.
3. **Skip spaCy community models** for MVP — training/evaluation overhead is
   too high for the hackathon timeline.

**Gazetteer seed (North Sumatra corridor):**
```python
SUMATRA_LOCATIONS = [
    "Belawan", "Medan", "Binjai", "Pematangsiantar", "Simalungun",
    "Toba", "Danau Toba", "Trans Sumatra", "Sibolga", "Dumai",
    "Tanjung Mulia", "Tanjung Balai", "Rantau Prapat", "Kisaran",
    "Lubuk Pakam", "Stabat", "Langkat", "Karo", "Dairi",
]
```

---

## 6. Geocoding Service

**Chosen approach:** OpenStreetMap Nominatim (public, free, no key required)
via `httpx` async client.

**Implementation constraints:**
- Rate limit: 1 req/s on public Nominatim → cache all results in Redis KV
- Cache key: `lrip:geocode:{location_name_slug}` with TTL = 7 days
- `countrycodes=id` parameter restricts results to Indonesia
- For known North Sumatra POIs, pre-seed the cache at startup (no API calls
  needed for the 20 most common locations)

**Fallback:** If Nominatim returns no result, check the pre-seeded POI dictionary
with hardcoded lat/lon for key locations (Belawan Port, Medan city center, etc.).

---

## 7. Interface Contract with Phase 1 (Upstream) and Phase 3 (Downstream)

**Upstream (already exists from Phase 1):**
- `lrip:events:bmkg`, `lrip:events:tomtom`, etc. are readable Redis Streams
- Redis KV `lrip:state:crisis_mode` can be written by future Phase 3 agents

**Downstream (Phase 3 consumers expect):**
- `lrip:events:pihps` — PIHPS commodity price events (stream key already in `redis_client.py`)
- `lrip:events:social` — social OSINT events with extracted location + raw text
- Both streams must use the **same normalized event schema** as Phase 1 adapters

**PIHPS event schema additions:**
```python
{
    "source": "pihps",
    "event_type": "price_spike" | "price_baseline",
    "commodity": str,          # e.g. "minyak_goreng"
    "price_today": str,        # IDR
    "rolling_mean_7d": str,    # IDR
    "deviation_pct": str,      # e.g. "7.2"
    "market": str,             # e.g. "Pasar Sei Sikambing, Medan"
    "province": str,           # e.g. "Sumatera Utara"
    "lat": str, "lon": str,
    "severity": str,
    "ts": str,
    "dedup_key": str,
}
```

**Social OSINT event schema additions:**
```python
{
    "source": "social",
    "platform": str,           # "tiktok" | "twitter"
    "event_type": "osint_report",
    "raw_text": str,           # original caption/tweet (max 500 chars)
    "extracted_location": str, # raw string from NER
    "lat": str, "lon": str,    # from geocoding
    "keywords_matched": str,   # comma-separated
    "severity": str,
    "ts": str,
    "dedup_key": str,
}
```

---

## 8. Key Risks Identified

| Risk | Severity | Mitigation |
|------|----------|------------|
| Lightpanda can't render hargapangan.id (JS-heavy SPA) | HIGH | Try XHR interception first; fallback to historical dataset |
| Tokopedia/Shopee bot detection blocks scraper | HIGH | Synthetic fallback JSON for demo; defer live scraping to v2 |
| Twitter/X API free tier too restrictive | MEDIUM | Use synthetic transcript + Nitter fallback |
| Nominatim rate limit (1 req/s) too slow for burst | LOW | Pre-seed cache at startup; 7-day TTL caching |
| Gemini Flash NER cost at 15-min crisis interval | MEDIUM | Gazetteer handles most hits; Gemini only for unmatched text |

---

## 9. Dependencies to Add

```
playwright==1.46.0            # Lightpanda CDP client
spacy>=3.8.0                  # Optional; only if community model used
geopy==2.4.1                  # Nominatim wrapper with RateLimiter
httpx>=0.27.0                 # Already in requirements.txt (confirm)
```

**Note:** Playwright also requires `playwright install` or the Docker image
`mcr.microsoft.com/playwright/python` to bundle browser drivers. When using
Lightpanda as the server, only the Playwright client package is needed (no
local browser download required if connecting over CDP).

---

## 10. Pre-existing Assets Relevant to Phase 2

| Asset | Relevance |
|-------|-----------|
| `src/01_data_prep.py` | PIHPS data schema; commodity column names to target |
| `src/02_lag_analysis.py` | Confirms 2-5 day lag; informs spike detection thresholds |
| `backend/app/services/redis_client.py` | `STREAM_PIHPS` and `STREAM_SOCIAL` already defined |
| `backend/app/adapters/base.py` | `BaseAdapter` exists; OSINT scrapers should extend it |
