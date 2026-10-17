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
