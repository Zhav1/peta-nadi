# Phase 49: Pan-Sumatra Spatial Engine & Ingestion Adapter Generalization

**Phase:** 49  
**Goal:** Eliminate legacy North Sumatra (Belawan/Medan) hardcoded boundaries and expand the spatial engine, ingestion adapters, agent swarm, and frontend dashboards to full Pan-Sumatra scope (8 mainland provinces + ALKI I maritime corridors).  
**Status:** COMPLETE ✅  
**Date:** 2026-10-06  

---

## 1. Objectives & Scope
- **Backend Ingestion Adapters:**
  - Expand NASA FIRMS bounding box from North Sumatra (`1.0–5.5 lat, 97.5–100.5 lon`) to Pan-Sumatra (`lat: -6.0 to 6.0`, `lon: 94.0 to 108.0`), adding Trans-Sumatra highway spine nodes.
  - Expand AISstream adapter bounding boxes from Belawan alone to 8 strategic Sumatra seaports (Belawan, Kuala Tanjung, Dumai, Teluk Bayur, Boom Baru, Panjang, Bakauheni, Malahayati), generalizing port queue depth tracking per terminal.
  - Broaden TomTom adapter traffic incident bounding box to cover the entire island (`95.0, -6.0, 106.5, 6.0`) and add Trans-Sumatra Highway checkpoints across all provinces.
  - Generalize BMKG weather parsing to extract specific municipality names and coordinates dynamically from forecast payloads.
  - Generalize `corridor_service.py` to maintain dynamic multi-corridor aggregation.
- **Agent Swarm & Knowledge Base:**
  - Update Agent 4 (`route_optimization.py`) to detect and penalize any disrupted port dynamically (Dumai, Teluk Bayur, Panjang, Bakauheni, Boom Baru, Belawan) and derive authentic route waypoints from actual traversed graph nodes.
  - Generalize Agent 5 (`economic_intelligence.py`) LLM prompts to use dynamic `{region}` context instead of static "Sumatera Utara".
  - Broaden Agent 2 (`osint_hazard.py`) to detect location tokens across all 8 Sumatra provinces.
  - Enrich `agents/seeds/entities.json` and `agents/seeds/historical_episodes.json` with Pan-Sumatra hubs and historical disaster events (Sitinjau Lauik, Sunda Strait ferry halts, Musi River drought).
- **Frontend Routing & UI Telemetry:**
  - Upgrade `mapboxRoutingService.ts` to compute dynamic bezier-style interpolated waypoints and orthogonal tangent detours for any Sumatra origin/destination pair.
  - Add missing arterial highway nodes across Aceh, Bengkulu, and Trans-Sumatra links in `aiDynamicRouter.ts`.
  - Remove dead unused file `frontend/lib/dynamicRouteCalculator.ts`.
  - Sanitize hardcoded UI labels across `AnalyticsSection.tsx`, `ReportsSection.tsx`, `SimulationSection.tsx`, `DashboardClient.tsx`, `EvidenceTab.tsx`, `MitigationTab.tsx`, `EconomicTab.tsx`, `OnboardFooter.tsx`, and `KineticFeatureGrid.tsx`.
