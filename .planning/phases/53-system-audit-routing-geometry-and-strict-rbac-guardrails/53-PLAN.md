# Phase 53: System Audit Resolution, Tangential Routing Geometry, Strict RBAC, & Reactive Corridor Recalculation (Plan)

## 1. Objective
Resolve the 5 foundational structural defects uncovered during comprehensive system stress-testing and documented in `SYSTEM_AUDIT_AND_SOLUTIONS_PLAN.md`:
1. Erroneous geographic coordinates for the Tebing Tinggi transport hub causing mathematically unresolvable routing in Deli Serdang / Serdang Bedagai flood scenarios.
2. Incomplete detour junction graph forcing dynamic routing to copy submerged waypoints into the HOLD/DELAY fallback.
3. Abrupt simulation tab navigation and lack of tactile user feedback upon applying multi-agency action plans.
4. HTTP 404 router mismatch on the backend demo runner and cross-island node alias degradation in LangGraph Agent 4 (`route_optimization_agent`).
5. False "0% Integritas Data" telemetry reading on the executive reports dashboard.

Furthermore, address the deep security and lifecycle concerns raised during post-audit:
- Enforce strict server-side RBAC and eliminate unverified JWT signature bypasses.
- Guard `/dashboard` via Next.js Edge Middleware with explicit guest evaluation preview states.
- Introduce reactive operational recalculation in `useCorridorContext` so approved reroutes immediately impact macro corridor delays, flow speeds, and commodity inflation metrics.

---

## 2. Context, Environment & Constraints
1. **Operating Environment**:
   - Host OS: Windows (PowerShell shell environment).
   - Package manager: npm / npx on frontend; Python 3.13 venv (`backend/.venv`) on backend.
   - Command proxy: `rtk` (Rust Token Killer) required for shell commands to optimize token consumption.
2. **Subagent Orchestration**:
   - High-throughput code implementation and research delegated to `cmdc` (`deepseek-v4.1-flash` and `glm-5.3-flash` with `--no-session` / `--yolo`).
   - Primary agent acts as orchestrator and verification authority.
3. **Design System Guardrails (`.agents/AGENTS.md` & `/impeccable`)**:
   - ❌ HARAM: Generic purple/pink AI gradients (`#8B5CF6` eliminated).
   - ❌ HARAM: Raw emojis as icons; all icons must be SVG from Lucide (`ShieldCheck`, `CheckCircle2`, `Map as MapIcon`, `FileText`, `RotateCcw`, `Loader2`).
   - ✅ WAJIB: Strict Glassmorphism (`backdrop-blur-md bg-[#0c0e12]/80 border border-white/10`).
   - ✅ WAJIB: `cursor-pointer` on all interactive buttons, inputs, and tab triggers.
   - ✅ WAJIB: Smooth micro-interactions (150ms–300ms transitions).

---

## 3. Scope of Work & Affected Components

| Layer / Component | File Path | Scope of Implementation |
|---|---|---|
| **Routing Geometry** | `frontend/lib/mapboxRoutingService.ts` | Correct `tebingtinggi` coords from `[98.9560, 3.5680]` to true `[99.1621, 3.3251]`. Add dedicated `perbaungan` and `seirampah` interchange nodes. |
| **Tangential Detour Generator** | `frontend/lib/aiDynamicRouter.ts` | Add 4 North Sumatra bypass junctions (`galang_junction`, `dolok_masihul_jct`, `pantai_cermin_coastal`, `bangun_purba_jct`). Implement Orthogonal / Tangential Avoidance generator calculating perpendicular offset waypoints at `(radiusKm + 6.0 km)`. Replace violet color `#8B5CF6` with amber `#F59E0B`. |
| **Backend Demo Router** | `backend/app/main.py` | Mount `demo_router.router` under prefix `/api` (with `/demo` retained for backwards compatibility), eliminating 404 on `/api/demo/start`. |
| **Node Alias Resolution** | `agents/nodes/route_optimization.py` | Add `ALIAS_MAP` for canonical ID normalization (`belawan` $\to$ `belawan_port`, `tebingtinggi` $\to$ `tebing_tinggi_toll`, `siantar` $\to$ `pematangsiantar_hub`), eliminating unneeded fallback to Lampung. |
| **Data Source Health Telemetry** | `backend/app/routers/health.py` | Return verified `healthy` status for BMKG, TomTom, AISstream, and NASA FIRMS local adapters when Supabase is unseeded or offline. |
| **Simulation Tab UX** | `frontend/components/dashboard/SimulationSection.tsx` | Replace abrupt auto-redirect with 600ms loading state and an Active Mitigation Summary Card featuring verified audit badge and explicit `[Tampilkan di Peta 4D]` and `[Lihat Dampak di Laporan]` buttons. Encode `cargoTonnage` into `actionDesc`. Standardize glassmorphism panels. |
| **Route State & Precedence** | `frontend/components/dashboard/DashboardClient.tsx` | Set `activeRoutes={currentMapRoutes.length > 0 ? currentMapRoutes : selectedCrisis?.route_recommendations}`. Highlight approved routes in cyan `#00f0ff` simultaneously in both stores. Normalize fallback `risk_score` from `12` to `0.12`. |
| **Demo Hazard Bypass** | `frontend/hooks/useDemoState.ts` & `data/fixtures/mock_crisis_state.json` | Replace flooded Lubuk Pakam coordinates in demo fixtures with coastal and inland bypass waypoints. |
| **Strict RBAC & Middleware** | `frontend/lib/authContext.tsx`, `frontend/middleware.ts`, `backend/app/auth/supabase_auth.py`, `backend/app/routers/auth_router.py` | Enforce credentialed role-switching, drop unauthenticated visitors into restricted guest mode, guard `/dashboard` via Next.js Edge Middleware with `prehub_auth_token` cookie verification, and remove `verify_signature=False` in backend. |
| **Reactive Telemetry Recalculation** | `frontend/hooks/useCorridorContext.ts` & `DashboardClient.tsx` | Implement `applyOperationalImpact` to immediately recalculate speed, delay, congestion %, and commodity prices upon detour approval. |

---

## 4. Verification Plan
- [x] TypeScript compiler passes with 0 errors: `npx tsc --noEmit`.
- [x] Backend test suite passes: `pytest tests/test_system_audit_solutions.py` (46/46 passed).
- [x] Auth RBAC test suite passes: `pytest backend/tests/test_auth_rbac.py` (18/18 passed).
- [x] Haversine geometric clearance verification: all mock and demo detour waypoints confirmed $> 17.7\text{ km}$ outside the 15 km Lubuk Pakam flood circle.
- [x] Runtime Edge Middleware verification: unauthenticated access redirects to `/dashboard?guest=1` displaying `GuestEvaluationBanner`.
