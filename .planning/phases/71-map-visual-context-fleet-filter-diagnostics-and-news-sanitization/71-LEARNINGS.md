# Phase 71 Learnings: Telemetry Visual Grounding, Content Ingestion Filters, and Production Resiliency

## Key Architectural & Operational Learnings

### 1. External Media CMS Idiosyncrasies (Antara & Regional Press)
- **Problem**: LKBN Antara URLs without numeric IDs in the path (e.g. `antaranews.com/berita/headline-text-only`) return 404 or fall back to completely unrelated news on modern Antara CMS. Furthermore, raw government portal domains (e.g. `*.bmkg.go.id`) employ Cloudflare/Fortinet WAF rules that return 403 Forbidden to automated HTTP clients.
- **Solution**: Always resolve ambiguous or ID-less news slugs to targeted search query parameters (`domain.com/search?q=...`), and route weather early warning alerts through verified press agency syndicated feeds that maintain open 200 OK accessibility.

### 2. Multi-Domain RSS Keyword Guardrails
- **Problem**: Ingesting regional RSS feeds (e.g., `terkini.xml`) without content domain classifiers invites irrelevant lifestyle, medical, and entertainment stories (such as varicose veins or celebrity news) into high-stakes logistics crisis dashboards.
- **Solution**: Enforce strict bidirectional keyword filters at ingestion time: positive matches for logistics/disaster/infrastructure terms, and immediate disqualification for lifestyle/health noise terms.

### 3. WebGL / Canvas Text Rendering Invariants
- **Problem**: Deck.gl `TextLayer` creates an internal font atlas that by default only packs standard 7-bit ASCII characters (0-127). Using typographical unicode symbols such as bullet `•` (char code 8226) triggers repeated console warnings (`Missing character: • (8226) in font atlas`) across every frame.
- **Solution**: Restrict dynamic WebGL text badges to pure ASCII characters (e.g. hyphens `-`, brackets `[]`, pipes `|`), ensuring zero font atlas thrashing or console warnings.

### 4. Visual Context & Legend Parity for Geospatial Layers
- **Problem**: Rendering tactical assets (e.g. 226 maritime AIS vessels in `#38bdf8` or baseline transit corridors in `#1e40af`) without corresponding entries in the UI map legend leads to user cognitive friction and false bug reports.
- **Solution**: Maintain a 1:1 mapping between every visible layer/color on the Mapbox/Deck.gl canvas and the interactive `LEGENDA RUTE` modal, accompanied by on-line symbol typography (`ALUR LAUT SELAT MALAKA (TSS)`) directly in the map style.

### 5. Production Host Migration Defense in Depth
- **Problem**: When backend services migrate (e.g. from `prehub-backend.onrender.com` to `peta-nadi.onrender.com`), stale environment variables baked into Vercel production deployments or Edge Proxies can silently break live API communication.
- **Solution**: Implement defensive hostname sanitization in client-side API clients and serverless proxy routes to detect known deprecated hostnames and auto-correct them to active production backends.
