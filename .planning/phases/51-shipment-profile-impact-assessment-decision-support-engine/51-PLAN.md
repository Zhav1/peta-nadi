# Phase 51: Shipment Profile, Deterministic Impact Assessment & Decision Support Engine (Plan)

## Objective
Transform PreHub from a general disaster/logistics information aggregator into an end-to-end **Decision Support System (DSS)**. Shift the core product value from "broad crisis alerts" to **shipment-specific operational decisions**:
`Disruption Event Detected → Spatial Path Intersection → Deterministic Business Logic (Spoilage Decay + Compliance BKHIT/MST) → Deterministic CPU Detour Routing → Explainable Recommendation → Dispatcher Alert Queue & 1-Click WhatsApp Driver Dispatch`.

## Context & User Directives
- **Directives from Review**:
  1. *Business logic is more important than multi-agent architecture*: Judges and dispatchers evaluate whether the system answers "What should THIS shipment do?", not merely "What disaster happened?".
  2. *Shipment context is mandatory*: A flood warning for an empty pickup truck means "continue/monitor", but for 4.5T perishable Cabai Merah means "reroute immediately".
  3. *Separate AI judgment from deterministic policy*: AI agents extract events, interpret weather, and structure news. Deterministic algorithms calculate vehicle weight restrictions (MST), quarantine laws (BKHIT), spoilage decay functions, and detour cost matrices.
  4. *Explainable trade-offs*: Instead of opaque "alternative route recommended", provide explicit cost vs. risk deltas:
     - Late arrival risk: 71% -> 14%
     - Spoilage risk: 88% -> 2%
     - Delta cost: +Rp 90k vs. cargo value at risk Rp 247M.
  5. *Live Supabase Persistence*: Schema migrations for `custom_fleet_vehicles` and `incident_impact_assessments` with Row Level Security (RLS) enabled, maintaining local SQLite WAL offline fallback.
  6. *Automated Uptime Keep-Alive*: Establish a GitHub Actions scheduled workflow to prevent Render free-tier spin-down (15 min idle rule) and Supabase database pausing (7 day inactivity rule) simultaneously.

## Scope of Work & Affected Components

| Layer / Component | File Path | Scope of Implementation |
|---|---|---|
| **Supabase Migrations** | `infra/supabase/migrations/006_decision_traces_and_outcomes.sql` | Sync `route_approvals` taxonomy (`action`, `tactical_action`) and `ground_truth_outcomes` with RLS. |
| **Supabase Migrations** | `infra/supabase/migrations/007_shipment_profiles_and_impacts.sql` | Table definitions for `custom_fleet_vehicles` and `incident_impact_assessments` with RLS. |
| **Backend Schemas** | `backend/app/schemas/fleet.py` | Add shipment profile attributes (`commodity_key`, `cargo_tonnage`, `cargo_value_idr`, `vehicle_golongan`, `gross_weight_ton`, `sla_deadline_hours`, `has_bkhit_cert`, `driver_phone`). |
| **Backend Schemas** | `backend/app/schemas/fleet_ingest.py` | Expose shipment attributes on `SingleVehicleRegisterRequest`. |
| **Backend Schemas** | `backend/app/schemas/impact_schemas.py` | Define `DisruptionImpactRequest`, `ImpactedVehicleAssessment`, and `DisruptionImpactResponse`. |
| **Local Storage Engine** | `backend/app/db/local_storage.py` | SQLite schema migration, `save_impact_assessment`, `list_impact_assessments`. |
| **Fleet Telemetry Fixtures** | `backend/app/services/telemetry_service.py` | Seed strategic trucks with shipment profiles, add `get_all_vehicles` async wrapper. |
| **Impact Assessment Engine** | `backend/app/services/impact_assessment_service.py` | Spherical segment-projection spatial intersection, spoilage hedging solver, compliance checks, CPU router detour solver. |
| **FastAPI REST Router** | `backend/app/routers/incidents.py` | Add `POST /api/v1/incidents/impact-assessment`. |
| **Frontend Type Contracts** | `frontend/lib/types.ts` | Export `DisruptionImpactRequest`, `ImpactedVehicleAssessment`, `DisruptionImpactResponse`, extend `FleetVehicle`. |
| **Frontend API Client** | `frontend/lib/api.ts` | Add `api.incidents.assessImpact`. |
| **Dispatcher Alert Queue** | `frontend/components/dashboard/DispatcherAlertQueue.tsx` | High-contrast HUD alert ribbon displaying critical impacted trucks and value at risk. |
| **Dynamic Sidebar Binding** | `frontend/components/sidebar/MitigationTab.tsx` | Pass live truck parameters to `SpoilageHedgingCard` and `ComplianceInspectorCard`; dynamic WhatsApp driver dispatch link. |
| **Dashboard Orchestration** | `frontend/components/dashboard/DashboardClient.tsx` | Mount `DispatcherAlertQueue` on map canvas; trigger `assessImpact` on incident selection. |
| **Automated Keep-Alive CI** | `.github/workflows/keep-alive.yml` | 10-minute cron pinging Render `/health`, `/api/v1/health/sources`, and Supabase REST API directly. |

## Verification Criteria
- [x] Pytest suite passes cleanly (`test_impact_assessment.py`, `test_pilot_e2e.py`, `test_intermodal_hedging_compliance.py`).
- [x] Supabase MCP executes migrations 006 and 007 into production project (`ulpmmacsdkohwkmyhlwj`).
- [x] Next.js production build passes with 0 type errors across all 7 routes (`npm run build`).
- [x] Direct Supabase REST curl test returns `200 OK`.
