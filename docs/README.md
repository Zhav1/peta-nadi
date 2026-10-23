# PreHub Documentation Hub

> [!WARNING]
> **ARCHIVE NOTICE & STRICT AGENT CONTEXT BOUNDARY**:
> All files inside `docs/legacy_hackathon_archive/` and `docs/archive/` are **historical competition submission documents from February 2026** (hackathon stage 2 proposals, slides, pitch scripts).
> 
> **THEY DO NOT REFLECT THE CURRENT ARCHITECTURE OR SYSTEM SPECIFICATIONS.**

---

## Authoritative System Sources of Truth

| Category | Authority Location | Purpose |
| :--- | :--- | :--- |
| **Active Roadmaps & Specs** | [`.planning/`](file:///d:/College/Pidi.id/.planning/) | Canonical M3 MVP Pilot plans, phases, architectural decisions, and tasks. |
| **Active System Architecture** | [`.planning/ROADMAP.md`](file:///d:/College/Pidi.id/.planning/ROADMAP.md) | Phased milestones, deliverables, and requirements (M1, M2, M3). |
| **Backend Implementation** | [`backend/`](file:///d:/College/Pidi.id/backend/) | FastAPI, Python deterministic solvers, Redis Streams, LangGraph agents. |
| **Frontend Implementation** | [`frontend/`](file:///d:/College/Pidi.id/frontend/) | Next.js 14, Tailwind CSS, Mapbox GL, Lucide UI components. |

---

## Architectural & Scope Invariants (2026 Updated)

1. **Deterministic CPU Solvers Only (No GPU)**:
   - Route optimization uses **NetworkX + Heuristic OR-Tools/2-Opt** running on CPU in `<150ms` latency ([`cpu_routing_adapter.py`](file:///d:/College/Pidi.id/backend/app/adapters/cpu_routing_adapter.py)).
   - Legacy GPU solver naming has been fully purged from the live pipeline (Phase 59). The routing endpoint is `POST /api/v1/routing/optimize` with no backwards-compatibility aliases.
2. **Atmospheric Weather Fusion (Open NWP)**:
   - Weather and flood polygons are fused from **BMKG weather radar + Open-Meteo NWP forecasts** ([`weather_fusion_service.py`](file:///d:/College/Pidi.id/backend/app/services/weather_fusion_service.py)). Legacy AI-forecast naming is fully removed from the live pipeline.
3. **Pilot Product with Real Sumatra Logistics Partners**:
   - The product scope is a **live operational pilot** (Pelindo Belawan, BKHIT Tanjung Kalian / Merak quarantine, BPJT toll tariffs, real-time PIHPS market prices), **NOT** a synthetic pitch demo.
4. **Honest Metric Transparency (No Boasting/Unbacked Claims)**:
   - Do NOT display synthetic "100% match" or "100% guarantee" assertions in documentation or UI unless backed by automated empirical evaluation numbers from [EvaluationSection.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/EvaluationSection.tsx).
5. **Single Canonical Simulator ("Simulasi Bencana")**:
   - The former macro-slider "Simulasi" tab (`SimulationSection.tsx`) and `/simulation/chat` endpoints have been decommissioned. The sole operational simulator is **Simulasi Bencana** on the map canvas ([`CrisisSimulatorBar.tsx`](file:///d:/College/Pidi.id/frontend/components/map/CrisisSimulatorBar.tsx) -> `POST /api/v1/simulate/stream`), directly executing deterministic OR-Tools detours, BKHIT quarantine verification, and calibrated exponential spoilage decay ($1 - e^{-\delta \cdot T}$).
6. **Laporan Audit Ledger & Non-Repudiation**:
   - The "Laporan" tab ([`ReportsSection.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/ReportsSection.tsx)) serves as the official operational audit ledger ("Catatan Audit Mitigasi Logistik Pangan"), logging real operator actions (`ACCEPT`, `REJECT`, `OVERRIDE`), live sync statuses (`SYNCED` / `PENDING`), full ISO date+timezone timestamps (`GMT+7`), interactive search/date filters, and dynamic filtered PDF/JSON exports. All mock fallback rows are eliminated.
7. **Analytics Honesty**:
   - The "Analitik" tab ([`AnalyticsSection.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/AnalyticsSection.tsx)) presents genuine PIHPS price series (`GET /api/v1/commodities/prices`). Static fabricated risk-ranking cards, static causal chains, and synthetic arcs/nodes have been removed in favor of honest `"Data tidak tersedia"` empty states.
8. **Purged Time Horizon Replays**:
   - Mock Past, Future, and Predict dock tabs, synthetic fallback fixtures, `TimelineScrubber.tsx`, and dead mock endpoints (`/historical/episodes`, `/predictive/risks`) have been purged from the platform.
9. **High-Density GPU Telemetry with Throttled Buffers (Phases 63 & 69)**:
   - Fleet visualization uses `@deck.gl/mapbox` `MapboxOverlay` (`IconLayer`, `PathLayer`, `ScatterplotLayer`, `TextLayer`) running at 60 FPS for 5,000+ units.
   - Deck.gl buffer uploads are decoupled and throttled to ~4 Hz (250ms interval) with array recycling in [`FleetVehicleLayer.tsx`](file:///d:/College/Pidi.id/frontend/components/map/FleetVehicleLayer.tsx), preventing V8 heap churn and browser OOM crashes.
   - Sprites and text use `billboard: true` to prevent tilt distortion during pitched 3D views, while macro-zoom labels follow balanced fair-share quotas (trucks: 8, maritime: 9, air: 7) in [`spatialHashArbiter.ts`](file:///d:/College/Pidi.id/frontend/lib/spatialHashArbiter.ts).
10. **100% Water-Path Coastal & Estuary Navigation (Phase 70)**:
   - Dedicated channel waypoints (`SUMATRA_PORT_CHANNELS`) in [`aiDynamicRouter.ts`](file:///d:/College/Pidi.id/frontend/lib/aiDynamicRouter.ts) and [`cpu_routing_adapter.py`](file:///d:/College/Pidi.id/backend/app/adapters/cpu_routing_adapter.py) connect river ports (Palembang Boom Baru / Musi River, Pekanbaru / Siak River, Jambi / Batanghari River) to the 16-point `SUMATRA_NAUTICAL_PERIMETER`.
   - Coastal and estuary maritime paths are guaranteed 100% water-bound with zero straight-line mainland or peninsula traversal.
11. **Modality-Specific Multi-Color Route Legs (Phase 70)**:
   - Route recommendations emit structured `legs` rendered with distinct modality colors: road haulage in emerald green `#10B981`, coastal and river maritime in royal blue `#3B82F6`, and air cargo in sky cyan `#00F0FF` ([`CrisisMap.tsx`](file:///d:/College/Pidi.id/frontend/components/map/CrisisMap.tsx) and [`route_optimization.py`](file:///d:/College/Pidi.id/agents/nodes/route_optimization.py)).
12. **Persistent AIS Vessel Continuity (Phase 70)**:
   - Persistent 96-vessel regional Sumatra baseline is merged with live WebSocket AISStream reports in [`aisstream_adapter.py`](file:///d:/College/Pidi.id/backend/app/adapters/aisstream_adapter.py) and protected by a 90-second sliding TTL cache in [`useFleetVehicles.ts`](file:///d:/College/Pidi.id/frontend/hooks/useFleetVehicles.ts), ensuring continuous tracking without dropouts during WebSocket reconnects.
13. **On-Map Contextual Corridor Popover & Immediate Node Glow Cleanup (Phases 69 & 70)**:
   - Bottom mode-selector buttons have been removed in favor of direct on-map clicks on route polylines, opening an interactive Glassmorphism popover with corridor metrics, selection, and hiding actions.
   - Hidden corridors are restored via a dynamic *"Tampilkan Semua Rute"* button in [`CrisisSimulatorBar.tsx`](file:///d:/College/Pidi.id/frontend/components/map/CrisisSimulatorBar.tsx).
   - Clearing route nodes immediately purges `customPinnedPoints` and resets `custom-pinned-source` GeoJSON, extinguishing lingering glow rings instantly.
14. **Deep Publisher Permalink Resolution (Phases 63 & 69)**:
   - Google News opaque wrappers are unmasked via `batchexecute` Fbv4je RPC in [`news_aggregator.py`](file:///d:/College/Pidi.id/backend/app/services/news_aggregator.py) and direct regional RSS feeds, linking directly to authentic articles (Antara, Detik, Kompas).
15. **Production Base URL Auto-Sanitization (Phase 71)**:
   - Frontend [`api.ts`](file:///d:/College/Pidi.id/frontend/lib/api.ts) automatically sanitizes `getBaseUrl()`, redirecting legacy backend URLs to `https://peta-nadi.onrender.com`.
16. **Economical 3-Tier News Gatekeeper & Red/Yellow Audit Zones (Phase 72)**: DB-first dedup before any LLM call; bureau/dateline headers stripped before gazetteer matching so misses yield is_geocoded=False with null coordinates, never a province centroid. Heuristic assigns RED_CONFIRMED / YELLOW_CLARIFY / DROPPED_IRRELEVANT with live LLM overlay only for unprocessed items; metadata in existing ground_truth_metrics JSONB. Map renders clickable Red (#ef4444) / Yellow (#eab308) zones with independent Zona Merah / Zona Kuning checkboxes; news Fokus and zone clicks open the stored Audit Trail at zero simulation cost. 10-hazard taxonomy with dynamic ImpactProfile; Penutupan Pelabuhan triggers alternate-port intermodal failover with per-route tradeoff analysis (Pros, Cons, time-delta, cost-delta).
17. **Toponym Specificity Hierarchy, Crisis Predicate Gate & Multi-Regency Fan-Out (Phase 73)**: 4-tier toponym ordering `(tier, -len)` with `Jalan Lintas A-B` endpoint masking preserves pinpoint accuracy (Sipirok over Jambi centroid; Sitinjau Lauik over Pekanbaru/Padang). Strict two-factor crisis gate (`STRICT_CRISIS_PREDICATES` + `ECONOMIC_OPINION_CEREMONIAL_EXCLUSIONS`; bare `tol`/`pelabuhan` nouns never trigger alone) eliminates false Yellow zones on opinion pieces. `resolve_all_sumatra_locations` + lead-paragraph meta scraping fans out N Red/Yellow zones per multi-daerah report (`affected_locations[]`, `Wilayah Terdampak` pills); `schema_version = 2` auto re-tiers legacy rows with zero new LLM cost.
18. **Agent Verification Gate, Hazard-Specific Geometry & 48h Freshness Lockdown (Phase 74)**: 4-check deterministic gate (`run_agent_verification_gate`: freshness ≤48h / discourse / spatial / impact-corroborated) with `NON_INCIDENT_DISCOURSE_MARKERS`; bare `banjir`/`longsor` removed from blockage predicates so academic articles (`Akademisi Unand ... Solusi Banjir ...`) drop instead of going RED. Agent-decided hazard radii (landslide 2.8–3.5 km wedge → earthquake 12.0 km) replace hardcoded circles via `compute_hazard_zone_geometry_and_radius` + `buildHazardSpecificZoneGeometry` (backend polygon first). `MAX_NEWS_AGE_HOURS = 48` with archival `/YYYY/MM/DD/` URL gate, true-`published_at` preservation, `when:2d` queries, and client mirror guard; `schema_version = 3` re-verifies legacy rows on read; Evidence tab renders the 4-check audit per item.
19. **Full-Body Scraping, Workhorse LLM Content Verifier & Post-Disaster Construction Guards (Phase 75)**: `enrich_article_description_if_needed` enriches short RSS teasers (< 450 chars) with scraped article body up to 2,500 chars (once per article, `body_scraped` guard); `extract_structured_news_batch` feeds up to 1,600 chars/article to the Workhorse LLM (`opencode_driver_model` / NVIDIA NIM) in 5-article chunks with content-grounded `tier_reason` + `verified_sumatra_locations`. Bare `darurat` removed from crisis/severity triggers; `pascabencana` + construction vocabulary in discourse markers; `other_disruption` without physical blockage cannot corroborate impact (`Pembangunan tanggul darurat pascabencana` → DROPPED). `schema_version = 4` re-verifies legacy rows; Evidence tab shows the `✓ Konten Artikel Dianalisis Workhorse LLM` badge.

---

## Integrity, Provenance & Degraded-Mode Contract (Phase 91)

- **Single idempotent write path.** Demo, simulation and production all call `write_incident()`; `incident_id` is the upsert key (UUID passthrough, UUIDv5 for other `crisis_id` values). Writes are refused and flagged (`lrip:health:supabase_write = disabled_no_service_key`) when only the anon key is configured.
- **Geometry is normalized at both boundaries.** PostGIS WKB/EWKB, WKT/EWKT, GeoJSON strings and bare rings become GeoJSON polygons; invalid/non-areal geometry is dropped instead of being rendered.
- **Health is telemetry-driven.** `/api/v1/health/sources` reads Redis health hashes, then the `data_sources` mirror, then the env capability gate. No telemetry = `unknown`; a missing required key can never be reported as `healthy`.
- **Provenance is explicit.** Synthetic weather is tagged, simulated evidence is discounted (`x0.90`), unknown sensor distance fails closed (`+inf`), and `degraded_sources` distinguishes a quiet network from a dead ingestion path.
- **One poller process.** Run `uvicorn --workers 1`; extra HTTP replicas must set `POLLERS_ENABLED=false` to avoid duplicate pollers and duplicate LLM spend.
- **No invented UI values.** Confidence, calibrated probability, ETA, distance, radius and cost render as "Belum tersedia" / "Belum terverifikasi" when the payload does not carry them.

Phase record: `.planning/phases/91-p0-p4-integrity-remediation/` (`LEARNINGS.md`, `DECISIONS.md`).
