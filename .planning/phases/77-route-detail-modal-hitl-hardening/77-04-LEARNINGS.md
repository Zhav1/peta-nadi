<!-- generated-by: gsd-doc-writer -->
# Phase 77: Route Detail Modal + HITL Hardening — Learnings

**Scope:** fixes tried, constraints encountered, and issues found during Waves 1–3, each grounded in the working-tree files and Wave commits listed in `77-03-WALKTHROUGH.md`. No speculation — every entry names the file and line or commit that proves it.

---

## 1. Fixes tried (what changed, what it proved)

### 1.1 `anonymous` / `dispatcher_lead` identity removal — worked

- **Before:** operator identity could fall back to an unauthenticated literal (`"anonymous"` in local-storage paths, `"Dispatcher Command (HITL)"` / `dispatcher_lead` client-supplied strings reaching the DB).
- **Fix:** `backend/app/schemas/decision_schemas.py` lines 44–46 forbids schema-level `"anonymous"` default so router precedence cannot be shadowed; `backend/app/routers/approvals.py` line 51 resolves `op_id = payload.operator_id or payload.approved_by or current_user.id` with `committed_by_role = current_user.role` (line 52); `backend/app/routers/news_router.py` line 518 applies the same session-wins precedence (`current_user.id or req.approved_by or req.operator_id`) and drops the `dispatcher_lead` literal.
- **Lesson:** keep client-supplied identity fields as aliases only; the session (`current_user.id/role`) is the single source of truth, echoed in `notes` + response + local mirror instead of a new column (013 header documents why no migration was needed).

### 1.2 Optimistic `DISETUJUI` deletion — worked

- **Before:** `MitigationTab.tsx` catch-all set `approvedRouteId` + `onCommitOperationalRoute` + success toast on ANY error, so a 403 painted `DISETUJUI & DIKIRIM` and pinged TMS.
- **Fix:** `frontend/components/sidebar/MitigationTab.tsx` lines 755–772 — the catch parses `403/Forbidden`; the 403 branch only sets `sandboxNote` + sandbox toast, never `setApprovedRouteId`, never `onCommitOperationalRoute`, never a TMS ping. Non-403 failures toast an honest `koneksi/server bermasalah, rute belum disetujui`.
- **Lesson:** error branches must be status-aware. The e2e `wave3 403` case (`phase57-pilot-hardening.spec.ts` lines 655–686) locks this: mocked 403 asserts `DISETUJUI` hidden and the modal retained for retry.

### 1.3 CRLF → LF normalization — partially applied, still watch

- **State:** `git ls-files --eol` shows `backend/app/routers/routing_router.py` and `news_router.py` as `i/lf w/lf` (clean), but `scripts/probe_parity.sh` as `i/lf w/crlf` (`attr/text=auto`) — index is LF, the Windows working copy still checks out CRLF.
- **Lesson:** keep shell probes LF-pinned (`.gitattributes` `eol=lf` as the two routers already carry) or the parity probe risks `bad interpreter` / diff noise on Windows checkouts. The fix is verified for the routers; the probe script still needs the same pin.

### 1.4 `URLError` / timeout degrade — worked

- **Fix:** `backend/app/routers/routing_router.py` `_fetch_proof_context()` wraps weather, TomTom, and news each in `asyncio.wait_for(..., 8.0)` with separate `TimeoutError` and generic `Exception` handlers (lines 33–62); any failure appends to `reasons` and degrades to `seed_fallback` instead of failing the route call (line 26 docstring, line 94 `speed_source`).
- **Lesson:** per-source timeouts with a named fallback reason (`weather_timeout_8s`, `tomtom_timeout_8s`, `news_timeout_8s`) keep the routing endpoint available during upstream outages and make the fallback auditable in `fallback_reasons`.

### 1.5 Proof fallback `seed_fallback` — worked

- **Fix:** `backend/app/adapters/cpu_routing_adapter.py` `enrich_route_with_proof(..., is_fallback)` lowers `eta_confidence` to 0.6 (line 150), tags evidence `detail="seed_fallback"` (line 155), and surfaces `warnings=["speed_source=seed_fallback: ETA memakai kecepatan asumsi"]` (line 186); `KeterbatasanData.is_fallback` (schema line 61) flows to the modal's `CACHE/FALLBACK` badge.
- **Lesson:** fallbacks must be labeled at the data layer, not the UI layer — the modal never invents a confidence value because the proof object already carries `is_fallback` + reason.

---

## 2. Constraints and conditions (hard boundaries this phase respected)

| Constraint | Evidence | Handling |
|---|---|---|
| Deploy pair: frontend `https://pre-hub.vercel.app` × backend `https://peta-nadi.onrender.com` | `backend/app/config.py` line 14 `cors_origins` lists both; `frontend/lib/api.ts` line 10 canonical `https://peta-nadi.onrender.com`; `frontend/app/api/proxy/[...path]/route.ts` lines 14–17 rewrites legacy `prehub-backend.onrender.com` → `peta-nadi.onrender.com` | CORS + proxy + probe targets all use the canonical pair; legacy host kept as rewrite, not a second backend |
| Render 30–50 s cold-start | `scripts/probe_parity.sh` line 5 comment; warm-up `GET /health` (line 15) excluded from score; `audit_backend_apis.py` retry-once wakeup | Probes never fail on first-hit cold start; RBAC matrix skips with an explicit message when token mint fails during warmup |
| CORS allowlist | `backend/app/main.py` lines 223–224 `CORSMiddleware(allow_origins=settings.cors_origins_list)`; `backend/tests/test_audit_fixes.py` lines 31–33 pins both origins | Frontend origin changes require a config change + audit-test update, not a code patch |
| Roles GUEST / REGULATOR / DISPATCHER | `backend/app/auth/supabase_auth.py` lines 28–54 `ROLE_PERMISSIONS`: GUEST read-only (`benchmark:read + reports:read`, never `approvals:write`), REGULATOR read-mostly + HOLD advisory, DISPATCHER sole `approvals:write + fleet:write + routes:plan` | Server gates (`approvals.py` lines 38–47, `news_router.py` lines 499–508) enforce; client gating (`MitigationTab`, drawer, modal) is UX-only |
| Sandbox vs real commit | `DashboardClient.tsx` lines 1546–1553 (select), `MitigationTab.tsx` lines 702–710 (approve), `HitlDecisionDrawer.tsx` lines 120–123, modal `isSandbox` branch | Sandbox = watermarked local state, zero `POST /approvals`, zero `hitl-action`, zero `simulatePing`; only dispatcher 2xx crosses the mutation boundary |
| Anonymous forgery risk | Session-wins precedence (1.1 above) + `get_current_user` on all HITL mutations | Client `operator_id/approved_by` cannot escalate; anon hits 401 before RBAC is even evaluated (probe `hitl-pending-anon-401`, `hitl-action-anon-401`) |
| `YELLOW_CLARIFY` never promotes to RED | `backend/app/services/unified_news_ingestor.py` lines 373/481/490, `incident_geometry_service.py` line 282 (advisory zone capped), `backend/tests/test_phase76_news_spatial_consensus.py` lines 107–108 hard invariant | Tier-C (kabupaten/kota, province-only) geometry stays a 3.2–4.5 km advisory; modal `Dasar Risiko` therefore never upgrades a yellow clarify into a red confirmed corridor |

---

## 3. Issues found (root cause → resolution)

| # | Issue | Root cause | Resolution (verified) |
|---|---|---|---|
| 1 | `hitl-action` had zero auth | Endpoint accepted client-supplied `approved_by` with no session check | `news_router.py` line 484 `Depends(get_current_user)` + `approvals:write` 403 gate (lines 499–508); anon now 401, GUEST/REGULATOR 403 |
| 2 | Fake `DISETUJUI` + TMS ping on 403 | Optimistic catch-all approved on any error and pinged fleet | Deleted (1.2 above); 403 branch sets no approved state, calls no commit, fires no ping; drawer retains the queue item (lines 146–151) |
| 3 | Hardcoded `approved_by` | `"Dispatcher Command (HITL)"` literal in drawer + `dispatcher_lead` in router shadowed the real operator | Drawer still passes a display string but the server ignores it in favor of `current_user.id` (news_router line 518); literal removed router-side |
| 4 | `.next` rebuild killing Playwright | `next.config.mjs` `output: standalone` + `playwright.config.ts` `webServer` mismatch; fresh builds did not copy `.next/static` + `public` into `.next/standalone` | Phase 57 record (`4fd1d4f`): webServer command fixed to `node .next/standalone/server.js` with manual asset copy for the pilot gate; Wave 3 spec avoids the issue entirely with mocked-network browser cases |
| 5 | `incidents.incident_id` + `route_approvals.route_id` missing columns | Writers (`approvals.py` `db_payload`, ingestor `approval_row`) sent the columns but the effective 000+006 schema never created them → PostgREST insert failures | `013_hil_hardening.sql` adds both (nullable, indexed, backfilled, unique-guarded); header explicitly lists what was deliberately NOT added and why |
| 6 | Purged `episodes` / `risks` paths still referenced in old docs | Phase 64 removed `/historical/episodes` + `/predictive/risks` endpoints and `TimelineScrubber.tsx` (STATE.md line 107) but stale doc text lingered | No code in Phase 77 touches those paths (`grep /risks` hits only planning history + 59-02 LTM notes); walkthrough and probes target only live `/routing/*`, `/approvals`, `/news/hitl-*`, `/fleet/*` |

---

## 4. Durable rules for the next phase

1. **Session wins, client suggests.** Any new mutation endpoint copies the `approvals.py` lines 38–52 shape: `get_current_user` (or `get_optional_user` + explicit 403), `approvals:write` check, `current_user.id`-first identity.
2. **No optimistic commits.** New approve/commit UI copies the `MitigationTab` 403-safe catch: error paths may only set sandbox/local state, never approved/committed styling.
3. **Fallbacks carry their name.** New upstream fetch copies `_fetch_proof_context`: per-source 8 s timeout, `reasons[]`, `seed_fallback` label in both logs and payload.
4. **Schema follows the writer.** Any new `db_payload` key gets a migration in the same commit (013 is the template: additive, nullable, indexed, backfilled, rerunnable).
5. **Probes assert status, not just body.** New parity checks copy the `expect_status` + RBAC-matrix pattern so 401/403/422 contracts are locked, not just happy-path 200s.
