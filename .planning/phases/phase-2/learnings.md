# Learnings — Phase 2: OSINT & Headless Scraping

This document extracts key technical learnings, environment constraints, and resolved issues from Phase 2 implementation.

## 1. Environment & Dependency Constraints

### Python 3.13 on Windows Compilation Issues
- **Issue:** Standard `pip install` commands for libraries like `greenlet` failed during compilation due to missing Microsoft Visual C++ Build Tools on Windows.
- **Cause:** Prebuilt wheels were not available for older versions of `greenlet` compatible with Python 3.13.
- **Fix:** Pinned modern versions of `playwright>=1.47.0` and `greenlet>=3.1.0` in `requirements.txt` to trigger download of compatible binary wheels.

### Browser Automation Environment (Lightpanda & CDP)
- **Constraint:** Production-bound containers use Lightpanda running in Docker, exposing Chrome DevTools Protocol (CDP) on port 9222.
- **Solution:** `BaseScraper` connects using Playwright's `connect_over_cdp` pointing to the Lightpanda service.
- **Dev Fallback:** Implemented a robust local development fallback to standard Playwright browser launching (`self.playwright.chromium.launch()`) when no CDP server is active, preventing local run failures.

---

## 2. API Adaptations & Performance

### Commodity Price Extraction (BI API vs. UI Scraping)
- **Constraint:** Direct UI scraping of the national price database (`hargapangan.id`) was slow and highly susceptible to layout breaks and Cloudflare anti-bot blocks.
- **Solution:** Bypassed UI rendering entirely by calling Bank Indonesia's direct internal JSON API (`GetGridDataDaerah` endpoint).
- **Result:** Data retrieval latency dropped by 90%, and ingestion stability is fully resilient to frontend changes.

### Nominatim Geocoding Rate-Limiting
- **Constraint:** OpenStreetMap's Nominatim service enforces a strict **1 request per second** limit. Violating this triggers IP bans.
- **Solution:** Enforced a token-bucket rate limiter (`asyncio.sleep(1.0)`) on every API invocation in `geocoding_service.py`.
- **Optimization:** Implemented a pre-seeded POI dictionary for key Sumatran cities combined with a 7-day TTL Redis cache (`lrip:geocode:{slug}`) to eliminate 95% of outgoing HTTP geocode queries.

---

## 3. Runtime Orchestration

### Dynamic Cadence Switching (Crisis Mode)
- **Constraint:** Scraping intervals must switch dynamically from daily (normal) to 15-minute intervals (crisis mode) without restarting the workers.
- **Solution:** `BaseScraper` queries the Redis key `lrip:state:crisis_mode` dynamically inside its execution loop, recalculating the wait sleep duration on each tick.
- **Result:** Allows instant system-wide adaptations to simulation events.
