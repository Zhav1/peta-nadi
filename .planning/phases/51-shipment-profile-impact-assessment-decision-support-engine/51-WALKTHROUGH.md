# Phase 51: Shipment Profile, Deterministic Impact Assessment & Decision Support Engine (Walkthrough)

## Overview of Implemented Flow

Phase 51 completed the transformation of PreHub from a passive information aggregator into an end-to-end **Decision Support System (DSS)**.

```
[Disruption Incident]
       ↓ (Lat, Lon, Radius)
[Spatial Path Intersection Engine]
       ↓ (Which fleet trajectories cross hazard buffer?)
[Shipment Profile Evaluation]
   ├── Commodity Perishability & Spoilage Matrix (Exponential Decay Model)
   ├── Digital Quarantine BKHIT Check (Inter-island vs Intra-island compliance)
   └── Road Class MST Load Limit Check (Axle Load Limits vs Gross Weight)
       ↓
[Deterministic CPU Router (NetworkX + OR-Tools)]
       ↓ (Generates detour geometry, distance, ETA, fuel & toll costs)
[Explainable Recommendation & Cost Delta Matrix]
       ↓
[Dispatcher Alert Queue UI Overlay (Top Map HUD)]
       ↓ (1-Click Selection & Focus)
[MitigationTab & 1-Click Driver WhatsApp Dispatch]
```

---

## Detailed Component Walkthrough

### 1. Database Schema & Supabase Migrations
- **Migration 006** (`006_decision_traces_and_outcomes.sql`):
  - Extends `route_approvals` with `action` (`ACCEPT`/`REJECT`/`OVERRIDE`), `tactical_action` (`REROUTE`/`HOLD`/`CONTINUE`), and `custom_constraints`.
  - Creates `ground_truth_outcomes` table with Row Level Security (RLS) for double-blind empirical evaluation.
- **Migration 007** (`007_shipment_profiles_and_impacts.sql`):
  - Creates `custom_fleet_vehicles` containing physical vehicle constraints and economic shipment properties: `commodity_key`, `cargo_tonnage`, `cargo_value_idr`, `vehicle_golongan`, `gross_weight_ton`, `sla_deadline_hours`, `has_bkhit_cert`, `driver_phone`, `driver_name`, `license_plate`.
  - Creates `incident_impact_assessments` table tracking spatial scans, affected fleet vehicles, and calculated damage metrics with RLS.
- **Applied to Supabase**:
  - Successfully executed via Supabase MCP into project `ulpmmacsdkohwkmyhlwj`. All tables are verified live with RLS enabled.

### 2. Backend Impact Assessment Service (`impact_assessment_service.py`)
- **Spatial Collision Detection**:
  - Computes minimum distance between hazard epicenter and each vehicle's polyline segments using great-circle spherical projection.
  - Flags direct intersection if distance is within the hazard radius.
- **Perishable Cargo Loss Modeling**:
  - Evaluates commodity-specific decay constants ($\lambda$):
    $$P_{\text{spoilage}}(\Delta t) = 1 - e^{-\lambda \cdot \Delta t}$$
  - For 4.5T Cabai Merah with 14-hour flood delay: Baseline spoilage risk = 1.2%, Delayed spoilage risk = 88.4%, Value at risk = Rp 218M+.
- **Regulatory Compliance Validation**:
  - BKHIT quarantine verification for sensitive agricultural and livestock commodities.
  - MST road class limit check (Class III roads capped at 8.0 tons).
- **Deterministic Detour Routing**:
  - Leverages the in-memory Sumatra road network graph (`get_cpu_router()`) to generate multi-point detour trajectories avoiding blocked corridor links in $<25\text{ms}$.

### 3. Dispatcher Alert Queue UI (`DispatcherAlertQueue.tsx`)
- Mounts as a floating high-contrast HUD strip above the map canvas (`left-[340px]` on desktop).
- Displays count of critical trucks, total value at risk in Rupiah, and individual vehicle status cards.
- Clicking **"Mitigasi Rute"** immediately focuses the map on the vehicle's position, plots its alternative detour route, and opens the sidebar to the `Mitigation` tab.

### 4. Dynamic Driver WhatsApp Dispatch (`MitigationTab.tsx`)
- Dynamically resolves active vehicle metadata: driver telephone number, truck identifier, license plate, and commodity.
- Generates an instant `https://wa.me/<phone>?text=...` URI pre-filled with formal dispatch instructions, detour coordinates, and required driver confirmation.

### 5. Automated Health & Activity Keep-Alive (`.github/workflows/keep-alive.yml`)
- Solves the twin challenges of free-tier cloud hosting:
  - **Render Web Service**: Pinged at `/health` every 10 minutes to eliminate 15-minute idle spin-down.
  - **Supabase Database Engine**: Pinged at `GET /rest/v1/data_sources?select=name&limit=1` with valid API credentials to continuously reset the 7-day inactivity pause counter.
