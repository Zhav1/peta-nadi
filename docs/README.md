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

1. **Deterministic CPU Solvers Only (No GPU/cuOpt)**:
   - Route optimization uses **NetworkX + Heuristic OR-Tools/2-Opt** running on CPU in `<150ms` latency ([`cpu_routing_adapter.py`](file:///d:/College/Pidi.id/backend/app/adapters/cpu_routing_adapter.py)).
   - NVIDIA cuOpt is fully superseded. Any remaining `/routing/optimize-cuopt` paths are backwards compatibility aliases only.
2. **Atmospheric Weather Fusion (No FourCastNet)**:
   - Weather and flood polygons are fused from **BMKG weather radar + Open-Meteo NWP forecasts** ([`weather_fusion_service.py`](file:///d:/College/Pidi.id/backend/app/services/weather_fusion_service.py)). NVIDIA FourCastNet and Earth-2 are deprecated.
3. **Pilot Product with Real Sumatra Logistics Partners**:
   - The product scope is a **live operational pilot** (Pelindo Belawan, BKHIT Tanjung Kalian / Merak quarantine, BPJT toll tariffs, real-time PIHPS market prices), **NOT** a synthetic pitch demo.
4. **Honest Metric Transparency (No Boasting/Unbacked Claims)**:
   - Do NOT display synthetic "100% match" or "100% guarantee" assertions in documentation or UI unless backed by automated empirical evaluation numbers from [EvaluationSection.tsx](file:///d:/College/Pidi.id/frontend/components/dashboard/EvaluationSection.tsx).
