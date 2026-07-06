# Domain Research: LRIP / PetaNadi

## Summary

Research conducted during project initialization. Key domain context gathered from:
- `LRIP Master Technical Blueprint (1).md` (v3.0)
- `ide-2-v2.md` (PetaNadi v3.0 PRD — TheoTown Dual-Mode Engine spec)
- Existing `src/` analysis scripts (economic correlation research)

---

## API & Integration Research

### BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)
- Open REST API for weather alerts and earthquake notifications
- Existing integration research in `src/01_data_prep.py` (PIHPS + BMKG data pipeline)
- Polygon-based severe weather zones supported → feed directly into PostGIS spatial queries
- Rate limits: relatively liberal for public data; no key required for basic endpoints

### PIHPS (Pusat Informasi Harga Pangan Strategis)
- Government commodity price database: rice, chili, shallot, garlic, cooking oil, eggs
- Existing data pipeline research in `src/` scripts (spline interpolation, lag analysis, PCA)
- The `src/` research validates that commodity price spikes lag disaster events by 2-5 days (key economic intelligence input)

### TomTom Traffic API
- Provides real-time congestion data including incident detection and flow data
- Key endpoint for monitoring Trans-Sumatra Highway corridor
- Requires API key (provision in Phase 0)

### AISstream.io
- WebSocket-based real-time AIS (Automatic Identification System) maritime data
- Monitors vessel positions, speeds, and port queue depth at Belawan
- Requires API key (provision in Phase 0)

### NASA FIRMS (Fire Information for Resource Management System)
- Active fire and thermal anomaly data via REST API
- Returns GeoJSON polygons of fire hotspots → ingest into PostGIS
- Free, no key required for basic access

### Lightpanda
- Headless browser optimized for LLM-based scraping
- Target: PIHPS web portal, Tokopedia, Shopee, TikTok
- Key risk: anti-bot measures on marketplace sites — maintain synthetic fallback

---

## Economic Correlation Findings (from src/ Research)
- Pearson correlation analysis (`src/01_data_prep.py`) shows measurable correlation between `curah_hujan_mm` (rainfall) and commodity prices
- Lag analysis (`src/02_lag_analysis.py`) identifies delay between physical hazard and price impact
- PCA/FSVI (`src/03_fsvi_pca.py`) identifies key predictive features
- These findings should seed the LTM (pgvector) historical episode database in Phase 3

---

## Architecture Decisions Researched

### LangGraph vs. AutoGen vs. CrewAI
- **LangGraph chosen** for deterministic state-machine routing, explicit state management, and production-grade reliability
- AutoGen/CrewAI introduce autonomous loops with unpredictable latency — unacceptable for real-time alert system
- LangGraph `MemorySaver` (Redis backend) handles STM perfectly

### pgRouting vs. Valhalla vs. NetworkX
- **pgRouting** (via PostGIS) for production corridor routing — integrates natively with Supabase spatial data
- **NetworkX** as lightweight alternative for demo/simulation mode — pure Python, no infra dependency
- Both can be used: pgRouting for production, NetworkX for `run_demo.py` synthetic scenarios

### GraphRAG Implementation
- Options: Neo4j (separate service) vs. pg-graphql + pgvector (Supabase native)
- **Recommendation:** Use Supabase native approach for MVP — reduces infra complexity; pg-graphql for graph traversal + pgvector for semantic similarity
- Neo4j is correct long-term choice; migrate post-hackathon if needed
