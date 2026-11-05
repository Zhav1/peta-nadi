# SUMMARY — Phase 178: Mainland Sumatra Shadow Pilot (Execution Summary)

**Window:** 2026-11-05  
**Status:** COMPLETE ✅  
**Canonical Phase Directory:** `.planning/phases/178-mainland-sumatra-shadow-pilot/`  
**Artifacts Generated:** `178-SPEC.md`, `178-01-PLAN.md`, `178-01-SUMMARY.md`  

---

## 1. Executive Summary

Phase 178 establishes the **Mainland Sumatra Shadow Pilot** architecture, transitioning PreHub from a single-process prototype to a distributed, enterprise-grade logistics resilience system. The implementation solves the critical challenges of distributed multi-worker concurrency, external API budget exhaustion, spatial hazard veracity, and research pilot safety for mainland Sumatra freight corridors (Aceh through Lampung).

### Key Accomplishments:
1. **Fenced Distributed Coordination:** Replaced naive process-local locks with PostgreSQL-backed monotonic fencing leases (`private.refresh_leases`), guaranteeing single-writer consistency across distributed Render and background worker instances.
2. **Deterministic Public Projection:** Built `public.public_dashboard_snapshots` (singleton `sumatra_mainland`), decoupling public/anonymous web clients from heavy database fusions and external third-party API calls.
3. **Daily Provider Budget Governance:** Implemented atomic, fail-closed quota reservations (`private.provider_budget_counters`) to prevent catastrophic billing runaway on external services (BMKG, TomTom, Open-Meteo, FIRMS, PetaBencana).
4. **Conservative Hazard Evidence Contract (`hazard-evidence-v1`):** Completely eradicated hallucinatory circular buffer expansions around point hazards. Enforced strict distinction between physical road blockages (`CONFIRMED_BLOCKAGE`) and atmospheric advisories (`PRECAUTIONARY_RISK`).
5. **Server-Enforced Shadow Pilot Isolation:** Hardened `pilot_safety.py` to ensure research shadow pilots return non-mutating preview responses with zero side effects on production operational tables (`route_approvals`, `travels`).

---

## 2. Changes Delivered by Architecture Layer

### A. Database Layer (`infra/supabase/migrations/20261105060029_public_snapshot_coordination.sql`)
- Created `public.public_dashboard_snapshots` table with row-level security allowing `anon` and `authenticated` roles to read the curated `sumatra_mainland` singleton.
- Created `public.public_operational_source_cache` table for retaining raw upstream provider responses with service-role-only access.
- Created `private.refresh_leases`, `private.public_snapshot_sections`, `private.provider_budget_counters`, and `private.provider_budget_reservations` tables in a secure non-public schema.
- Added 6 atomic PL/pgSQL stored procedures:
  - `acquire_refresh_lease(p_lease_name, p_owner_id, p_ttl_seconds)`: Monotonic fence increment (`fence + 1`) and TTL renewal.
  - `release_refresh_lease(p_lease_name, p_owner_id, p_fence)`: Validated release of active worker locks.
  - `read_public_snapshot_sections()`: Stable internal reader for independently fresh snapshot sections.
  - `publish_public_dashboard_snapshot(p_lease_name, p_owner_id, p_fence, p_snapshot)`: Atomic check-and-publish validating owner, fence, and lease expiration.
  - `complete_scheduled_job(p_job_name, p_owner_id, p_fence, p_status, p_error, p_retry_after_seconds)`: Fenced execution status tracker for `public.scheduler_jobs`.
  - `reserve_provider_budget(p_source, p_units, p_request_id, p_daily_limit)`: Atomic, idempotent daily provider unit consumption tracking.

### B. Coordination & Operational Cache (`backend/app/services/`)
- `refresh_coordinator.py`: Implemented `acquire_refresh_lease`, `release_refresh_lease`, `publish_public_snapshot`, and `read_public_snapshot_sections` with fail-closed semantics raising `CoordinationUnavailable` on DB errors.
- `public_snapshot_service.py`: Orchestrated the 12-section mainland Sumatra snapshot assembly across 8 provinces; enforced `PUBLIC_FIELDS` projection allowlist to strictly eliminate tenant or PII leakage.
- `provider_budget.py`: Provided `reserve_provider_budget` with idempotent UUID request tracking and fail-closed denial on unconfigured or depleted sources.
- `public_operational_cache.py`: Maintained raw source caching with distinct TTLs (BMKG 300s, Open-Meteo 6h, FIRMS 3h, TomTom 30m) and stale-while-revalidate serving.

### C. Grounded Ingestion & Routing Adapters (`backend/app/adapters/`)
- `bmkg_cap_adapter.py`: Implemented `BMKGCAPAdapter` for BMKG's Common Alerting Protocol (CAP) nowcast warnings, strictly parsing native polygon geometries without synthesizing arbitrary circles.
- `petabencana_adapter.py`: Implemented `PetaBencanaAdapter` for crowdsourced flood/disaster reports, restricted to verified mainland Sumatra ISO 3166-2 admin codes (`ID-AC`, `ID-SU`, `ID-SB`, `ID-RI`, `ID-JA`, `ID-SS`, `ID-BE`, `ID-LA`) under CC BY-NC 4.0 license.
- `cpu_routing_adapter.py`: Integrated `hazard-evidence-v1` into the deterministic NetworkX + OR-Tools / 2-Opt CPU routing solver.
- `hazard_evidence.py`: Normalized multi-source evidence into 4 explicit states (`CONFIRMED_BLOCKAGE`, `PRECAUTIONARY_RISK`, `UNKNOWN`, `CLEAR`) with 0.1 km point matching tolerance.

### D. Pilot Safety & Router Isolation (`backend/app/services/pilot_safety.py`, `backend/app/routers/`)
- `pilot_safety.py`: Server-side enforcement of `pilot_shadow_mode`. Intercepts approval routes to return shadow preview payloads without writing to `route_approvals` or `travels`.
- `approvals.py`: Gated approval execution requiring Dispatcher role with `fleet:write` permissions and tenant ownership validation (`assert_tenant_owns_record`).
- `travels_router.py`: Secured trip queries to authenticated tenant scopes.
- `news_router.py`: Prevented draft/unverified leakages into public news endpoints.
- `dashboard_bootstrap.py`: Unified bootstrap serving public-first snapshot data while lazily hydrating tenant fleets.
- `internal_tick.py`: Integrated fenced leases into the scheduled background refresh runner.

### E. Frontend Edge Route & Hydration (`frontend/`)
- `frontend/app/api/public/dashboard/route.ts`: Built high-performance Next.js Route Handler querying Supabase PostgREST singleton read (`/rest/v1/public_dashboard_snapshots?snapshot_key=eq.sumatra_mainland`) with 30s cache revalidation and 1.8s timeout fallback.
- `frontend/lib/publicSnapshot.ts`: Defined TypeScript interfaces for `PUBLIC_DASHBOARD_SNAPSHOT_KEY` (`sumatra_mainland`), 8 mainland provinces, and `createUnknownPublicSnapshot` fallback.
- `frontend/hooks/useDashboardBootstrap.ts`: Hook orchestrating public-first immediate paint before authenticating tenant fleet state.
- `frontend/components/dashboard/DashboardClient.tsx`: Master view integrating public snapshot data and displaying shadow pilot status banners.

---

## 3. Empirical Verification Evidence

### A. Phase 178 Targeted Test Suite (55/55 Passed)
Ran `rtk pytest` across all 7 dedicated Phase 178 test files:
```text
backend/tests/test_hazard_routing_evidence.py .......... [18%]
backend/tests/test_news_hitl_shadow.py ............      [40%]
backend/tests/test_observed_disaster_service.py ......  [50%]
backend/tests/test_pilot_shadow_safety.py .........      [67%]
backend/tests/test_public_operational_cache.py ........ [81%]
backend/tests/test_public_snapshot_coordination.py .... [89%]
backend/tests/test_shared_news_reads.py ......          [100%]
============================== 55 passed in 3.42s ==============================
```

### B. Affected Backend Regression Suites (68/68 Passed)
Ran `rtk pytest` across all modified backend router and service test suites:
```text
backend/tests/test_dashboard_bootstrap.py ............  [17%]
backend/tests/test_dashboard_snapshot.py .............  [36%]
backend/tests/test_internal_tick.py ..................  [63%]
backend/tests/test_news_read_path.py .................  [88%]
backend/tests/test_trip_linked_approvals.py ........    [100%]
============================== 68 passed in 5.11s ==============================
```

### C. Total Backend Verification
**123 backend tests passed** with 100% success rate and zero regressions.

---

## 4. Architectural Invariants Preserved

In strict compliance with `.agents/AGENTS.md` and Phase 178 requirements:
1. **Source of Truth Integrity:** Canonical documentation maintained exclusively in `.planning/`. Undotted `planning/` and outdated hackathon materials in `docs/` ignored.
2. **Deterministic CPU Routing Invariant:** All routing operations remain on deterministic CPU solvers (`NetworkX + OR-Tools / 2-Opt`) in `cpu_routing_adapter.py`. No GPU solvers reintroduced.
3. **Realistic Grounding & Honest Metrics:** Verified that shadow preview modes explicitly acknowledge research bounds and do not display fabricated "100% solved" claims.
4. **Scope Lock Compliance:** All code changes were executed in backend, frontend, and infra layers prior to documentation synthesis; this subagent modified and created files solely within `.planning/`.
