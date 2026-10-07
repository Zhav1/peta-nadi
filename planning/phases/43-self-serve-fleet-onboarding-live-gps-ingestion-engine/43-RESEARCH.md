# Phase 43 Research: Self-Serve Fleet Onboarding & Live GPS Ingestion Engine

**Phase:** 43
**Milestone:** M3 - PreHub MVP Pilot Operations & Multi-Persona Dispatcher Platform
**Goal:** Enable logistics dispatchers to onboard custom vehicle fleets and delivery manifests via single-vehicle manual input, drag-and-drop CSV/Excel manifest parsing, and live TMS GPS telematics webhooks.

---

## 1. Domain & Technical Landscape

### 1.1 Existing Telemetry & Fleet Architecture
- **Backend Service (`backend/app/services/telemetry_service.py`)**:
  - Maintains `MASTER_FLEET_DEFINITIONS` (45 baseline units: 14 maritime, 24 trucks, 7 air cargo).
  - Enriches assets with kinematics (`calculate_bearing()`, `evaluate_cold_chain_status()`, heading, speeds, and signal status).
  - Provides `get_unified_fleet(modality, status)` querying active assets.
- **Frontend WebGL Layer (`frontend/components/map/FleetVehicleLayer.tsx`)**:
  - WebGL Native Symbol Layer in Mapbox (`truck-icon`, `vessel-icon`, `plane-icon`) running at 60 FPS.
  - Interactive Target Reticle (`TargetLockReticle.tsx`) and monospaced Tactical HUD overlay (`selectedVehicle`).
  - Route-bound `@turf/along` path interpolation and bearing projection.
- **Role-Based Access Control (Phase 42)**:
  - `DISPATCHER` & `GUEST`: Permitted to onboard vehicles, upload manifests, and trigger rerouting.
  - `REGULATOR`: Read-only macro view, blocked from operational dispatch actions.

### 1.2 Required Extensions for Phase 43
1. **Dynamic Custom Fleet Storage & Ingestion**:
   - We need persistent SQLite storage (`custom_fleet_vehicles` and `fleet_telemetry_logs` in `backend/app/db/local_storage.py`) so custom vehicles survive restarts and work air-gapped.
   - `TelemetryService` must dynamically merge SQLite-backed custom vehicles with `MASTER_FLEET_DEFINITIONS` in `get_unified_fleet()`.
2. **Standardized Ingestion Endpoints (`backend/app/routers/fleet_ingest_router.py`)**:
   - `POST /api/v1/fleet/register`: Single-vehicle registration with automatic or custom waypoint path generation between Sumatra hubs.
   - `POST /api/v1/fleet/upload-manifest`: CSV/Excel manifest parser with coordinate interpolation and batch validation.
   - `POST /api/v1/fleet/telemetry/ingest`: Standard webhook ingestion for TMS platforms (Traccar, EasyGo, McEasy) streaming real-time GPS pings `(lat, lon, speed, heading, temp)`.
   - `GET /api/v1/fleet/custom`: List user-registered custom fleet units.
   - `DELETE /api/v1/fleet/custom/{vehicle_id}`: Remove a custom registered vehicle.
   - `GET /api/v1/fleet/manifest/template`: Downloadable CSV template headers.
   - `POST /api/v1/fleet/telemetry/simulate-ping`: Evaluator/demo helper for instantaneous live map GPS ping simulation.
3. **Frontend Self-Serve Onboarding Modal (`FleetOnboardingModal.tsx`)**:
   - Dark glassmorphism modal (`backdrop-blur-xl bg-[#0c0e12]/95 border border-white/10`).
   - 3 Tabs:
     1. **Pendaftaran Manual (Single Asset)**: Plate, Name, Driver Contact, Modality, Cargo, Cold-Chain Temp, Origin Hub, Destination Hub, Speed.
     2. **Unggah Massal Manifest (CSV / Excel)**: Drag-and-drop uploader with CSV parser, downloadable sample template, preview table, validation check, and batch import.
     3. **Integrasi Webhook TMS**: Copyable webhook endpoint, sample payload schema, and interactive 1-click Test Ping GPS simulator.
4. **Header Trigger & Role Gating in `DashboardClient.tsx`**:
   - `[ + Onboard Armada ]` button in the top navigation bar.
   - Role-adaptive behavior: active for Dispatcher and Guest; disabled/informational for Regulator.
   - Immediate feedback: registers custom asset and updates Mapbox canvas reactively.

---

## 2. Data Schema & Contracts

### 2.1 Single Vehicle Registration Payload
```json
{
  "vehicle_id": "BK-8821-XA",
  "name": "Truk Cold-Chain Sayur Berastagi #4",
  "modality": "truck",
  "driver_name": "Budi Santoso",
  "driver_phone": "+6281234567890",
  "cargo": "12 Ton Cabai & Wortel Segar",
  "origin": "Kabanjahe (Karo)",
  "destination": "Pasar Induk Lau Cih Medan",
  "speed_kmh": 55.0,
  "temperature_c": 2.6,
  "status": "moving",
  "path": [[98.5067, 3.1833], [98.5800, 3.3500], [98.6722, 3.5952]]
}
```

### 2.2 Bulk Manifest CSV Schema
Headers:
`vehicle_id,name,modality,driver_phone,cargo,origin,destination,speed_kmh,temperature_c`

Sample Row:
`TRK-ONB-01,Truk Beras BULOG Tebing,truck,+628119876543,20 Ton Beras SPHP,Pelabuhan Belawan,Tebing Tinggi,65.0,`

### 2.3 TMS Telemetry GPS Ping Payload
```json
{
  "vehicle_id": "BK-8821-XA",
  "latitude": 3.3500,
  "longitude": 98.5800,
  "speed_kmh": 58.2,
  "heading_deg": 42.0,
  "altitude_m": 420.0,
  "temperature_c": 2.4,
  "timestamp": "2026-09-28T01:30:00Z"
}
```

---

## 3. Implementation Plan Decomposition

### Plan 43-01: Backend Fleet Ingestion Engine, Telemetry Webhook & SQLite Persistence
- **Deliverables**:
  - `backend/app/schemas/fleet_ingest.py`: Pydantic v2 schemas for registration, CSV manifests, and TMS GPS telemetry pings.
  - `backend/app/db/local_storage.py`: Tables `custom_fleet_vehicles` and `fleet_telemetry_logs`, CRUD helpers with ACID transactions.
  - `backend/app/services/telemetry_service.py`: Custom fleet registration, live GPS telemetry update handler, dynamic merging into `get_unified_fleet()`.
  - `backend/app/routers/fleet_ingest_router.py`: REST endpoints `/register`, `/upload-manifest`, `/telemetry/ingest`, `/custom`, `/custom/{vehicle_id}`, `/manifest/template`, `/telemetry/simulate-ping`.
  - `backend/app/main.py`: Register fleet ingest router under `/api/v1/fleet`.
  - `backend/tests/test_fleet_ingest.py`: Automated pytest suite covering single registration, bulk CSV parsing, live GPS webhook ingestion, telemetry updates, and RBAC security.

### Plan 43-02: Frontend Fleet Onboarding Modal, CSV Parser, Webhook Simulator & WebGL Dynamic Sync
- **Deliverables**:
  - `frontend/lib/api.ts` & `frontend/lib/types.ts`: Fleet onboarding API client methods and TypeScript types.
  - `frontend/hooks/useFleetVehicles.ts`: Hook enhancements with `refetch()` and optimistic state update helpers.
  - `frontend/components/fleet/FleetOnboardingModal.tsx`: Complete 3-tab modal (Manual Single Asset, Drag-and-drop CSV parser with sample download, TMS Webhook Guide & 1-Click GPS Ping Simulator).
  - `frontend/components/dashboard/DashboardClient.tsx`: Top header `[ + Onboard Armada ]` trigger with role-based accessibility.
  - Production build verification (`npm run build`).

---

## 4. Design System & Minimalist Verification
- 100% monochrome Lucide SVG icons (Zero emojis).
- Dark glassmorphism styling (`backdrop-blur-xl bg-[#0c0e12]/95 border border-white/10`).
- Clear honest technical terminology.
- Explicit `cursor-pointer` on all interactive buttons.
