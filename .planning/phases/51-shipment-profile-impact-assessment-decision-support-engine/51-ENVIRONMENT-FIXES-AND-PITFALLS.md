# Phase 51: Environment Fixes, Pitfalls & Inconsistencies Audited

## Critical Issues Diagnosed and Resolved

### 1. Supabase Project Pause & DNS Resolution Failure
- **Issue**: Probing `ulpmmacsdkohwkmyhlwj.supabase.co` locally returned `DNS_ERROR_RCODE_NAME_ERROR` (`NXDOMAIN`).
- **Diagnosis**: Supabase free-tier projects automatically pause after 7 consecutive days of no database/API activity. Even though the Render backend had ping traffic hitting `/health`, the `/health` endpoint only checked in-memory FastAPI status without querying Supabase, allowing Supabase's pause timer to expire.
- **Resolution**:
  - Restored the project in the Supabase console (`ACTIVE_HEALTHY`).
  - Executed pending migrations `006` and `007` via Supabase MCP directly.
  - Implemented `.github/workflows/keep-alive.yml` with direct authenticated PostgREST queries hitting Supabase every 10 minutes (`select=name&limit=1`).

### 2. Variable Name Mismatches & Dictionary Passing in Fleet Telemetry
- **Issue**: `telemetry_service.get_unified_fleet()` returned raw Python `dict` instances rather than Pydantic model objects. Calling `.model_dump()` in `impact_assessment_service.py` resulted in an `AttributeError`.
- **Resolution**:
  - Refactored `impact_assessment_service.py` to handle both `dict` and Pydantic models cleanly using `.get()` accessor patterns with defaults.
  - Ensured snake_case consistency across:
    - Backend: `commodity_key`, `cargo_tonnage`, `cargo_value_idr`, `vehicle_golongan`, `gross_weight_ton`, `sla_deadline_hours`, `has_bkhit_cert`, `driver_phone`.
    - SQLite / Supabase: Column names identically mapped.
    - Frontend TypeScript: Matching optional properties on `FleetVehicle` and `ImpactedVehicleAssessment`.

### 3. Missing React `useEffect` Dependencies in `SpoilageHedgingCard`
- **Issue**: `SpoilageHedgingCard` was initialized with static dependencies `[commodity, vehicleId, detourDistanceKm]`. When an operator selected a different impacted vehicle from `DispatcherAlertQueue`, the cargo tonnage and detour hours did not trigger a recalculation.
- **Resolution**:
  - Added `cargoTonnage`, `origin`, `destination`, and `detourTimeHours` to the dependency array. Selecting any truck from the queue now recomputes the spoilage cost matrix in real time.

### 4. Hardcoded WhatsApp Dispatch Metadata
- **Issue**: The WhatsApp dispatch action in `RouteCard` contained hardcoded strings (`TRK-003-BELAWAN-TEBING`, `BK 8812 XL`, `+6281234567891`).
- **Resolution**:
  - Wired `selectedImpactedVehicle` through `CrisisSidebar` and `MitigationTab` to `RouteCard`.
  - Sanitized the telephone number by stripping leading `+` and spaces.
  - Dynamically populated vehicle ID, license plate, cargo weight, and detour waypoints.

### 5. Design System Compliance & Typography Floor
- **Issue**: Minor padding typo (`px-1.5 py-0.2`) in the `DispatcherAlertQueue` badge.
- **Resolution**:
  - Standardized to `px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-500/40 font-bold font-mono`.
  - Strictly respected "The Strategic Sentinel" design rules: zero emojis (monochrome SVG Lucide icons only), `cursor-pointer` on all interactive cards, and high-contrast `#0c1017` / `#121822` panels.
