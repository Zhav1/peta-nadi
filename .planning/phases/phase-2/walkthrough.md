# Walkthrough — Phase 2: OSINT & Headless Scraping

Phase 2 is completed and verified. This phase introduces the real-time commodity prices and social media OSINT streams into the PetaNadi event bus.

## Changes Made

### Infrastructure & Configuration
- Updated [requirements.txt](file:///d:/College/Pidi.id/backend/requirements.txt) to upgrade `playwright>=1.47.0` and explicitly add `greenlet>=3.1.0` to resolve Python 3.13 Windows compilation.
- Added Settings variables for `lightpanda_url` and `twitter_bearer_token` to [app/config.py](file:///d:/College/Pidi.id/backend/app/config.py).

### Scrapers & Ingestion Worker
- **[base_scraper.py](file:///d:/College/Pidi.id/backend/app/scrapers/base_scraper.py):** Inherits from `BaseAdapter`. Evaluates the Redis key `lrip:state:crisis_mode` dynamically each loop to switch the polling cadence between normal (24h) and active crisis mode (15m).
- **[pihps_scraper.py](file:///d:/College/Pidi.id/backend/app/scrapers/pihps_scraper.py):** Uses Bank Indonesia's direct internal JSON API (`GetGridDataDaerah`) rather than browser simulation. Fetches weekly food prices, maintains a 7-day rolling baseline in Redis, and publishes baseline updates and price spike notifications.
- **[marketplace_scraper.py](file:///d:/College/Pidi.id/backend/app/scrapers/marketplace_scraper.py):** Playwright browser automation pointing to Tokopedia search. Degrades cleanly to local/synthetic comparison results if blocked by CDN/bot challenge.
- **[social_scraper.py](file:///d:/College/Pidi.id/backend/app/scrapers/social_scraper.py):** Polls recent tweets and TikTok captions. Integrates location extraction and geocoding to classify severity based on keywords.
- **[osint_worker.py](file:///d:/College/Pidi.id/backend/app/workers/osint_worker.py):** Concurrently runs the scrapers under an async loop.

### NLP & Geocoding Core
- **[ner_pipeline.py](file:///d:/College/Pidi.id/backend/app/nlp/ner_pipeline.py):** Location extraction via a local regex gazetteer (fast path) with fallback to Gemini Flash via the SDK when no gazetteer hits are made.
- **[geocoding_service.py](file:///d:/College/Pidi.id/backend/app/nlp/geocoding_service.py):** Geocoding resolver utilizing a local pre-seed cache (Medan, Belawan, Binjai, etc.), an active 7-day Redis cache (`lrip:geocode:{slug}`), and a rate-limited fallback to Nominatim (1 request/sec rate limiter enforced).

### Demo & Synthetic Data
- **[pihps_sample.json](file:///d:/College/Pidi.id/data/synthetic/pihps_sample.json):** Pre-packaged mock data representing price anomalies and social reports during a Belawan closure scenario.
- **[run_demo.py](file:///d:/College/Pidi.id/backend/run_demo.py):** Extended to parse and inject the synthetic PIHPS and social events into Redis Streams during demonstration or offline testing.

---

## Verification & Testing

### 1. Automated Tests
Ran the full test suite (`pytest`) successfully.
- **Phase 2 Scraper/NLP tests:** 11/11 tests passed.
- **Full Backend test suite:** 22/22 tests passed.

```powershell
tests/test_adapters.py::test_bmkg_parse_earthquake PASSED                [  4%]
tests/test_adapters.py::test_bmkg_severity_mapping PASSED                [  9%]
tests/test_adapters.py::test_bmkg_dedup PASSED                           [ 13%]
tests/test_adapters.py::test_tomtom_congestion_score PASSED              [ 18%]
...
tests/test_scrapers.py::test_pihps_no_spike PASSED                       [ 54%]
tests/test_scrapers.py::test_pihps_spike_detection_high PASSED           [ 59%]
tests/test_scrapers.py::test_pihps_spike_detection_critical PASSED       [ 63%]
tests/test_scrapers.py::test_ner_gazetteer_finds_belawan PASSED          [ 68%]
tests/test_scrapers.py::test_ner_gazetteer_finds_nothing PASSED          [ 72%]
tests/test_scrapers.py::test_ner_llm_fallback_called PASSED              [ 77%]
tests/test_scrapers.py::test_geocode_known_poi_no_api_call PASSED        [ 81%]
tests/test_scrapers.py::test_geocode_cache_hit PASSED                    [ 86%]
tests/test_scrapers.py::test_social_severity_critical PASSED             [ 90%]
tests/test_scrapers.py::test_social_severity_low PASSED                  [ 95%]
tests/test_scrapers.py::test_crisis_mode_interval_switch PASSED          [100%]
```

### 2. Live PIHPS Ingestion
Executed the live BI API parser (`python -m app.scrapers.pihps_scraper`) directly against the Bank Indonesia endpoint.
- Correctly parsed 6 commodity datasets for Sumatera Utara.
- Detected a real-world price spike in **cabai_rawit** (Rp 49,400, +27.5% above rolling baseline), spawning a `critical` severity event.
- Published baseline updates for the other 5 commodities to the Redis stream.

### 3. Demo Ingestion
Executed `python run_demo.py` to inject the synthetic event payload:
- Correctly read `pihps_sample.json`.
- Injected all 5 events successfully into `lrip:events:pihps` and `lrip:events:social` streams.
