# Phase 45: Pilot Verification, Scenario Drills & Final End-to-End Packaging - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 45 delivers the final capstone pilot verification, deployment packaging, and operator enablement for Milestone M3 (PreHub MVP Pilot Operations & Multi-Persona Dispatcher Platform):
1. **Automated End-to-End Pilot Test Suite (`backend/tests/test_pilot_e2e.py`)**: A comprehensive automated test suite exercising 3 distinct, semantically grounded Pan-Sumatra operational crisis drills using 100% real data (zero synthetic dummy data):
   - Belawan to Pekanbaru ultra-perishable cabai merah spoilage hedging detour.
   - Bakauheni ferry strait crossing cold-chain beef/dairy with BKHIT quarantine hard block and release.
   - Padang to Solok via Sitinjau Lauik Class III mountain pass with MST axle-load warning and operator override.
2. **Production Docker Compose & Deployment Packaging (`docker-compose.yml` & `docker-compose.override.yml`)**: Multi-container production deployment topology featuring multi-stage Next.js standalone container build, FastAPI production server, Redis 7 Alpine, native container health check probes, persistent volumes, and standardized `prehub-*` container branding.
3. **Official Multi-Persona Pilot Onboarding & User Manual (`docs/PreHub_Pilot_Onboarding_Manual.md`)**: Comprehensive operational runbook structured into 4 dedicated persona sections: Fleet Dispatcher, Port/Terminal Coordinator, Government Regulator, and DevOps/System Administrator.
4. **Exhaustive Test Matrix & Verification Inventory (`docs/test_matrix.md`)**: Complete inventory mapping 130+ automated tests across FR-1 through FR-20 and NFR-11, detailing scenario inputs, assertions, and single-command local reproduction instructions.

</domain>

<decisions>
## Implementation Decisions

### 1. E2E Scenario Drills Scope & Real Data Invariant
- **D-01 (3 Distinct Semantic Drills in `test_pilot_e2e.py`):** Rather than a single monolithic or purely synthetic test, implement 3 realistic operational drill scenarios:
  - **Drill 1 (Belawan $\to$ Pekanbaru Perishable Spoilage Detour):**
    - Vehicle: `BK 8812 XL` (Golongan II Fuso) carrying Cabai Merah Keriting (tonnage: 4.5 Ton, spot value based on PIHPS Berastagi/Medan rates).
    - Disruption: Flash flood warning at Tebing Tinggi interchange.
    - Lifecycle: Hazard detection $\to$ Consensus Gate evaluation $\to$ 4-tier perishability decay ($\delta = 0.025/\text{hr}$) $\to$ Spoilage Hedging solver compares Continue vs Reroute vs Hold $\to$ Recommendation: Reroute via Tol Medan-Kualanamu-Tebing Tinggi $\to$ WhatsApp dispatch link generated $\to$ Operator ACCEPT decision logged in SQLite $\to$ T+12h outcome verification.
  - **Drill 2 (Bakauheni Ferry Strait Crossing BKHIT Quarantine Block & Release):**
    - Vehicle: `BE 9123 QP` (Golongan IV Tronton) carrying cold-chain frozen beef/dairy across Sunda Strait (Bakauheni $\leftrightarrow$ Merak).
    - Compliance Check: Missing BKHIT phytosanitary quarantine certificate immediately triggers `HARD_BLOCK` (`can_dispatch: False`).
    - Resolution: Certificate `BKHIT-SUM-2026-9921` attached $\to$ Re-verification passes $\to$ Intermodal gate proximity delay multiplier ($M_{\text{intermodal}} \in [1.0, 3.5]$) dynamically applied based on Bakauheni ferry roadstead queue $\to$ Dispatch approved.
  - **Drill 3 (Padang $\to$ Solok via Sitinjau Lauik MST Axle-Load Warning & Operator Override):**
    - Vehicle: `BA 8452 NM` (Golongan V heavy multi-axle trailer, gross weight: 14.2 Ton).
    - Compliance Check: Path traverses Class III collector road (Sitinjau Lauik pass, max axle limit: 8.0 Ton) $\to$ Generates tactical `WARNING` advisory (`requires_override: True`).
    - Resolution: Operator issues OVERRIDE with mandatory logged justification note (`"Satgas Pangan emergency grain relief convoy with escort"`) $\to$ Decision persisted with liability audit trail $\to$ Deterministic CPU route recalculated.
- **D-02 (Strict Real Data Policy):** Per explicit user instruction ("make it as real as possible with no mockup data"), all test inputs, coordinates, road nodes, toll segments, fuel prices, and commodities must match ground-truth Pan-Sumatra logistics realities:
  - Real 54-node road cache and 18 Pan-Sumatra strategic gateways.
  - Official BPJT Sumatra toll tariffs for Golongan I–V.
  - Pertamina base fuel rates (Biosolar IDR 6,800/L, Dexlite IDR 14,550/L, Pertamina Dex IDR 15,100/L).
  - Real PIHPS commodity items and LKBN ANTARA news feeds.

### 2. Docker Compose & Deployment Architecture
- **D-03 (Dual-Profile Container Orchestration):**
  - **Production (`docker-compose.yml`):**
    - `prehub-backend`: Built from `backend/Dockerfile`, running uvicorn with production worker configuration, depending on healthy `prehub-redis`.
    - `prehub-frontend`: Built from a multi-stage production Dockerfile (`output: 'standalone'`), using lightweight `node:20-alpine`, serving compiled assets without dev dependencies.
    - `prehub-redis`: Running `redis:7-alpine` with persistent volume `redis_data`.
    - Standardized container naming (`container_name: prehub-*`).
    - Persistent volumes: `prehub_data` (for SQLite database `prehub_local.db` and telemetry caches) and `redis_data`.
  - **Development (`docker-compose.override.yml`):**
    - Mounts `./backend` and `./frontend` for hot reloading, watchpack polling, and debug logging.
- **D-04 (Container Health Checks):**
  - Redis: `test: ["CMD", "redis-cli", "ping"]`, interval 10s, timeout 5s, retries 3.
  - Backend: `test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/health"]`, interval 15s, timeout 5s, retries 3.
  - Frontend: `test: ["CMD", "wget", "-qO-", "http://localhost:3000/"]`, interval 15s, timeout 5s, retries 3.

### 3. Pilot Onboarding Manual Structure & Personas
- **D-05 (4 Persona-Based Runbooks in `docs/PreHub_Pilot_Onboarding_Manual.md`):**
  - **Chapter 1: Fleet Dispatcher Runbook** — Ingesting vehicle fleets (Single Form, CSV template, TMS webhook), interpreting live WebGL map telemetry, evaluating Spoilage Hedging policies, generating driver WhatsApp dispatch links, and executing operator decisions (ACCEPT, REJECT, OVERRIDE).
  - **Chapter 2: Port & Terminal Coordinator Runbook** — Monitoring 18+ Pan-Sumatra choke-points, assessing intermodal delay multipliers ($M_{\text{intermodal}}$), roadstead vessel queues, ferry dwelling times, and inspecting BKHIT agricultural quarantine certificates.
  - **Chapter 3: Government Regulator Runbook (Satgas Pangan & Dishub)** — Monitoring provincial inflation indices (PIHPS), LKBN Antara market regime sentiment, corridor route efficiency benchmarks, reliability calibration curves, and MST axle-load enforcement on secondary roads.
  - **Chapter 4: DevOps & Infrastructure Admin Runbook** — Docker Compose production deployment, environment variables (`.env.example`), container health check verification, SQLite database backup, Supabase cloud synchronization, and live API diagnostics console.

### 4. Test Matrix & Verification Inventory
- **D-06 (Complete Exhaustive Inventory in `docs/test_matrix.md`):**
  - Update `docs/test_matrix.md` to cover all requirements from FR-1 through FR-20 and NFR-11.
  - Full inventory of all 130+ passing tests (including Phase 44 choke-points, spoilage hedging, compliance, and Phase 45 E2E scenario drills).
  - Clear, reproducible shell commands for running unit, integration, and E2E test suites locally and in CI.

### the agent's Discretion
- Parametrization of helper functions and assert timeouts in `backend/tests/test_pilot_e2e.py`.
- Exact Docker multi-stage build caching optimizations.
- Specific ASCII system architecture diagrams and operational decision trees in `docs/PreHub_Pilot_Onboarding_Manual.md`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & Roadmap
- `.planning/PROJECT.md` — Core platform architecture and Pan-Sumatra operational boundary
- `.planning/REQUIREMENTS.md` §FR-20 & §NFR-11 — Pilot verification, scenario drills, production packaging, and operator-first UI ergonomics
- `.planning/ROADMAP.md` §Phase 45 — Deliverables and verification criteria for Phase 45

### Backend Services & Schemas to Drill
- `backend/app/routers/pilot_router.py` (or existing routes) & `backend/app/services/`
- `backend/app/services/spoilage_hedging_service.py` — 4-tier perishable decay, BPJT tolls, Pertamina fuel rates
- `backend/app/services/compliance_service.py` — BKHIT quarantine hard block and MST axle-load warning
- `backend/app/services/intermodal_sync_service.py` — 18 Pan-Sumatra choke-point registry and delay multiplier
- `backend/app/services/outcomes_service.py` — Operator decision trace and T+12h / T+24h outcomes
- `backend/app/services/cpu_routing_service.py` — NetworkX Dijkstra 54-node Sumatra road cache
- `backend/app/db/local_storage.py` — SQLite thread-safe offline storage and audit trails

### Existing Deployment Configurations
- `docker-compose.yml` — Current development docker compose configuration
- `backend/Dockerfile` — Backend Dockerfile
- `frontend/Dockerfile.dev` — Frontend development Dockerfile

### Verification Documentation
- `docs/test_matrix.md` — Existing 103-test inventory to be expanded to 130+ tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/tests/conftest.py`: Test fixtures and FastAPI test client setup.
- `backend/tests/test_intermodal_hedging_compliance.py`: 16 comprehensive unit tests for Phase 44 features ready to be leveraged in E2E drill assertions.
- `backend/app/services/telemetry_service.py`: Real coordinates for Pan-Sumatra strategic hubs and vehicles.
- `backend/app/schemas/intermodal.py`: Authoritative Pydantic schemas for choke-points, hedging, and compliance.

### Established Patterns
- Fast deterministic execution: Backend unit and integration tests execute in <60 seconds without hanging.
- Clean Next.js build: Production build completes with zero TypeScript or ESLint errors.
- SQLite persistence: Local database `prehub_local.db` initialized with WAL mode and ACID transaction isolation.

### Integration Points
- `backend/tests/test_pilot_e2e.py` connects `auth`, `fleet_ingest`, `hazard_detection`, `consensus_gate`, `intermodal_sync`, `spoilage_hedging`, `compliance`, `approvals`, and `outcomes`.
- `docker-compose.yml` orchestrates backend, frontend, redis, and persistent volumes.
- `docs/PreHub_Pilot_Onboarding_Manual.md` references implemented UI components in `frontend/components/`.

</code_context>

<specifics>
## Specific Ideas

- **Strict Real Data Mandate:** The user explicitly commanded: *"make it as real as possible with no mockup data."* Every test scenario, license plate, commodity pricing, toll tariff, and coordinate must correspond to actual Pan-Sumatra logistics realities.
- **Operator Runbook Depth:** The onboarding manual should read like a professional operations manual for actual government and enterprise stakeholders, complete with failure scenarios, error resolution, and exact button clicks.

</specifics>

<deferred>
## Deferred Ideas

- Driver Native Mobile Application (React Native + WatermelonDB + CRDT offline sync) — planned for v2 / post-hackathon.
- Private Enterprise GraphRAG self-hosted cluster — deferred to post-pilot cloud migration.

</deferred>

---

*Phase: 45-pilot-verification-scenario-drills-final-end-to-end-packagin*  
*Context gathered: 2026-10-03*
