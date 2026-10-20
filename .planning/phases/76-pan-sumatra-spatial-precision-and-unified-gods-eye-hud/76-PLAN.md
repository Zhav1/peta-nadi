---
phase: 76-pan-sumatra-spatial-precision-and-unified-gods-eye-hud
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - backend/app/nlp/gazetteer_data.py
  - backend/app/nlp/geocoding_service.py
  - backend/app/services/adm_boundary_service.py
  - backend/app/services/incident_geometry_service.py
  - backend/app/nlp/news_extractor.py
  - backend/app/services/unified_news_ingestor.py
  - backend/scripts/remediate_panjang_incidents.py
  - backend/tests/test_phase76_news_spatial_consensus.py
  - frontend/components/dashboard/DashboardClient.tsx
  - frontend/components/dashboard/TopNavTelemetry.tsx
  - frontend/components/dashboard/IntermodalTerminalPopover.tsx
  - frontend/components/dashboard/mapDockLayout.ts
  - frontend/components/dashboard/DispatcherAlertQueue.tsx
  - frontend/components/map/CrisisMap.tsx
  - frontend/components/map/CrisisSimulatorBar.tsx
  - frontend/components/map/FleetVehicleLayer.tsx
  - frontend/components/sidebar/CrisisSidebar.tsx
  - frontend/components/sidebar/EvidenceTab.tsx
autonomous: true
requirements:
  - M4-SPATIAL-01
  - M4-CONSENSUS-02
  - M4-UI-DECLUTTER-03
user_setup: []

estimate:
  tokens: 60000
  raw_tokens: 30000
  tasks: 4
  confidence: high

must_haves:
  truths:
    - Common adjective "panjang" never geocodes to Pelabuhan Panjang Lampung
    - Localized road incidents generate tight 0.6-1.2 km corridor ellipses leaving bypass routes open
    - Regency-wide reports without physical chokepoints are strictly capped at YELLOW_CLARIFY
    - Live news ingestion validates candidate disruptions against 4-channel Consensus Gate
    - Map controls never render behind or underneath the Left OSINT Berita Sidebar
  artifacts:
    - backend/app/nlp/gazetteer_data.py
    - backend/app/nlp/geocoding_service.py
    - backend/app/services/incident_geometry_service.py
    - backend/app/services/unified_news_ingestor.py
    - backend/scripts/remediate_panjang_incidents.py
    - backend/tests/test_phase76_news_spatial_consensus.py
    - frontend/components/dashboard/DashboardClient.tsx
    - frontend/components/map/CrisisMap.tsx
    - frontend/components/dashboard/TopNavTelemetry.tsx
---

# PLAN: Phase 76 - Pan-Sumatra Spatial Precision, Multi-Agent Consensus Escalation & Unified God's-Eye HUD

## Tasks

### Task 1: NLP Gazetteer & Geocoding Remediation
- Purge standalone `"panjang"` entry from `PAN_SUMATRA_GAZETTEER`; retain compound `"pelabuhan panjang"` and `"pelabuhan samudera panjang"`.
- Implement longest-key matching with strict word-boundary regex (`\b...\b`) in `geocoding_service.py`.
- Add all 13 missing Aceh regencies and 34+ strategic Kecamatan nodes across North Sumatra and Aceh.
- Add bureau/dateline stripping for `detik sumut`, `detik aceh`, `detik sumbagsel`.

### Task 2: Hybrid 3-Tier Micro-Spatial Bounding
- Upgrade `incident_geometry_service.py` to support:
  - Tier A (`corridor_point`): 0.6–1.2 km anisotropic highway ellipse (`semi_minor <= 0.5 km`).
  - Tier B (`kecamatan_kelurahan`): 1.5–2.2 km ADM3 subdistrict boundary polygon via `adm_boundary_service.py`.
  - Tier C (`kabupaten_kota` / `province_only`): 3.2–4.5 km subtle advisory zone; hard invariant: capped at `YELLOW_CLARIFY`.

### Task 3: Multi-Sensor Consensus Gate Escalation
- Wire `agents/tools/consensus_gate.py` (`compute_consensus`) into `unified_news_ingestor.py`.
- Evaluate 4 channels: $W$ (BMKG Radar/Precipitation), $T$ (TomTom Flow Delay), $I$ (OSINT Press Tier), $E$ (PIHPS Food Commodity Sensitivity).
- Attach structured verification audit and channel badges to synthesized incidents.
- Bump `EXTRACTION_SCHEMA_VERSION = 5` and implement automated startup DB remediation.

### Task 4: True Bounded Flexbox Viewport Shell & Unified HUD
- Refactor `Peta Operasi` in `DashboardClient.tsx` into a two-column Flexbox layout (`Left OSINT Sidebar` + `Bounded Center Map Viewport`).
- Unify top command bar in `CrisisMap.tsx`: Universal Search Bar + `TopNavTelemetry` pills side-by-side with mutual-exclusion popovers at `z-50`.
- Delete floating `FILTER ZONA PETA` card and move filter pills into Left Drawer header and top ribbon.
- Move Mapbox native controls to `'bottom-right'` and add canvas resize observer pulses.
