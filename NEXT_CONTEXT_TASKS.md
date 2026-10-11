# MASTER TASK BACKLOG & EXECUTION BLUEPRINT (NEXT CONTEXT WINDOW)

> **Execution Note — updated 2026-10-11:** Phase 54 is fully archived below (all items A1–C4 plus PIHPS persistence, the startup loop, and migration 009 shipped and verified). The actionable scope for the next context window is **Phase 55 — Comprehensive Engines Audit & Stabilization**, whose full blueprint lives in [`.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-PLAN.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-PLAN.md) and whose step-by-step checklist is §2 below.

**Source documents:** [`SYSTEM_ENGINES_AUDIT_REPORT.md`](SYSTEM_ENGINES_AUDIT_REPORT.md) (four audit passes) · [`55-WALKTHROUGH.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-WALKTHROUGH.md) (file:line evidence) · [`55-ENVIRONMENT-FIXES-AND-PITFALLS.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-ENVIRONMENT-FIXES-AND-PITFALLS.md) (external limits) · [`55-LEARNINGS.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-LEARNINGS.md) (resilience principles).

---

## 0. Status Snapshot

| Phase | Scope | Status | Evidence |
|---|---|---|---|
| **54** | Post-audit plotholes A1–C4, guest lockdown, PIHPS persistence, startup loop, migration 009 | **DONE ✅** | Commits `8f12e50`, `0ff2ac0`, `4df17de`; archive in §1 |
| **55** | Seven-engine stabilization S1–S7 | **READY FOR IMPLEMENTATION** | Blueprint in §2 + `55-*.md` docs |

---

## 1. Archive — Phase 54 (DONE ✅)

Full details: [`.planning/phases/54-post-audit-plothole-remediation-guest-lockdown-pihps-persistence/54-PLAN.md`](.planning/phases/54-post-audit-plothole-remediation-guest-lockdown-pihps-persistence/54-PLAN.md)

| ID | Item | Key files | Commit | Verified |
|---|---|---|---|---|
| A1 | Incremental detour delay (`resolveApprovedDelayMinutes`, never total ETA / hardcoded 38) | `frontend/components/dashboard/DashboardClient.tsx` | `8f12e50` | ✅ tsc 0 errors |
| A2 | `ROLE_GUEST` read-only + capability gates (`approvals:write`, `fleet:write`, `manifests:upload`) | `backend/app/auth/supabase_auth.py`, `backend/app/routers/approvals.py`, `backend/app/routers/fleet_ingest_router.py` | `8f12e50` | ✅ `test_auth_rbac.py` 18/18 (guest → 403) |
| A3 | `is_fallback` flag on `CorridorContext` driving `LIVE` / `MEMUAT` / `FALLBACK` badges | `frontend/lib/types.ts`, `frontend/hooks/useCorridorContext.ts`, `DashboardClient.tsx` | `8f12e50` | ✅ badge branches reachable |
| B1 | Corridor impact persistence across the 30s poller (`activeImpactRef` re-base + re-apply) | `frontend/hooks/useCorridorContext.ts` | `8f12e50` | ✅ survives refresh |
| B2 | `pred-*` predictive IDs bypass the 404-prone incidents fetch | `DashboardClient.tsx` | `8f12e50` | ✅ zero round-trip |
| B3 | `isMountedRef` race guards across all auth flows | `frontend/lib/authContext.tsx` | `8f12e50` | ✅ no unmount setState |
| C1 | Offline guest login bypass removed → explicit *"Layanan autentikasi database sedang tidak tersedia"* | `frontend/lib/authContext.tsx` | `8f12e50` | ✅ no session minted |
| C2 | `AlertCircle` on error status (modal) | `frontend/components/auth/AuthModal.tsx` | `8f12e50` | ✅ |
| C3 | `?guest=1` query cleanup post-login (`dismissGuestQuery`) | `frontend/components/auth/AuthModal.tsx` | `8f12e50` | ✅ |
| C4 | Guest persona copy → limited read-only preview; badge `Akses Terbatas` | `frontend/components/auth/AuthModal.tsx` | `8f12e50` | ✅ |
| D1 | PIHPS persistence: all weekly period points → `commodity_prices` (idempotent, service-role, never raises) | `backend/app/scrapers/pihps_scraper.py` | `0ff2ac0` | ✅ `test_scrapers.py` extended (+187) |
| D2 | `_poll_pihps_loop()` startup task + shutdown cancellation | `backend/app/main.py` | `0ff2ac0` | ✅ |
| D3 | Migration 009 — `commodity_prices` public SELECT policy (writes: service-role) | `infra/supabase/migrations/009_commodity_prices_public_read.sql` | `4df17de` | ✅ live series ~35 rows |

Environment traps discovered during Phase 54 (`.env` cwd trap, process-scope env masking, RLS-with-no-policy silent reads, `KNOWN_POIS` import breaking pytest collection, live-DB-dependent commodity test) are documented in [`54-ENVIRONMENT-FIXES-AND-PITFALLS.md`](.planning/phases/54-post-audit-plothole-remediation-guest-lockdown-pihps-persistence/54-ENVIRONMENT-FIXES-AND-PITFALLS.md).

---

## 2. Phase 55 Execution Checklist (NEXT CONTEXT WINDOW)

**Priority legend:** P0 = correctness/availability blockers · P1 = resilience & data hygiene · P2 = verification & close-out.
**Recommended order:** Diagnostics → S1 + S3 → S4 + S7 (one migration pass) → S2 → S5 → S6 → P2 close-out. Full rationale in [`55-PLAN.md`](.planning/phases/55-comprehensive-engines-audit-and-stabilization/55-PLAN.md) §3.

### P0 — Correctness & Availability

- [ ] **S1. OpenMeteo `health_check` & instantiation fix**
  - Files: [`backend/app/adapters/openmeteo_adapter.py`](backend/app/adapters/openmeteo_adapter.py) (L19, L22-25 missing abstract `health_check`, invalid `super().__init__(source_name=…)`), [`backend/app/adapters/base.py`](backend/app/adapters/base.py) (L18-20, L32-35), [`backend/app/services/weather_fusion_service.py`](backend/app/services/weather_fusion_service.py) (L35-40 swallow).
  - Steps: implement `async def health_check`; fix `__init__` to the base signature; add the missing instantiation test (`test_cpu_routing_weather.py` imports but never instantiates).
  - Acceptance: `OpenMeteoAdapter()` instantiates; no `TypeError` in fusion logs; metadata truthfully reports both providers.

- [ ] **S2. NVIDIA NIM gateway catalog model ID + fail-loud fallback**
  - Files: [`agents/llm_gateway.py`](agents/llm_gateway.py) (L9 model pin, L100-115 canned-string fallback), [`agents/nodes/economic_intelligence.py`](agents/nodes/economic_intelligence.py) (L113-119 length-only filter), [`agents/nodes/decision_support.py`](agents/nodes/decision_support.py) (L139 correct filter to port).
  - Steps: run `GET https://integrate.api.nvidia.com/v1/models` with the configured key to confirm catalog IDs; set `PRIMARY_NIM_MODEL` to `deepseek-ai/deepseek-v4.1-flash`; add startup preflight; replace canned string with typed degradation; make all callers reject fallback content.
  - Acceptance: live call returns a real completion; unavailable gateway surfaces as an error/degraded flag; no canned text reaches agent output.

- [ ] **S3. News Extractor / NER model ID correction**
  - Files: [`backend/app/nlp/ner_pipeline.py`](backend/app/nlp/ner_pipeline.py) (L34 ID, L88 asyncio hygiene), [`backend/app/nlp/news_extractor.py`](backend/app/nlp/news_extractor.py) (L178 ID, L205-206 debug-level fallback), [`agents/llm_gateway.py`](agents/llm_gateway.py) (L30 default param).
  - Steps: centralize the model in `Settings` (valid ID `gemini-1.5-flash` precedent at `decision_support.py:137`); raise fallback logging to warning; add a config test rejecting placeholder IDs.
  - Acceptance: one config location for the model; heuristic fallback visible in logs; no `gemini-3.5-flash-lite` references remain.

- [ ] **S4. `/api/v1/incidents` DB query fix (empty `[]` despite 108 rows)**
  - Files: [`backend/app/routers/incidents.py`](backend/app/routers/incidents.py) (L33-35, L69-96), [`backend/app/services/unified_news_ingestor.py`](backend/app/services/unified_news_ingestor.py) (L153-164, L184 writer columns), migrations [`000_init.sql`](infra/supabase/migrations/000_init.sql) (L41, L49).
  - Steps: probe live schema (columns + RLS state) with a one-shot script; apply the incidents RLS policy together with S7; align the SELECT list (`incident_id`/`lat`/`lon` vs live columns); replace the silent `logger.warning`-then-`[]` with an observable degraded signal; consider raising the 50-row default limit.
  - Acceptance: live endpoint returns rows; failing queries are visible in logs/response; regression test covers the populated case.

### P1 — Resilience & Data Hygiene

- [ ] **S5. TomTom bbox compliance, credit fallback & honest degradation**
  - Files: [`backend/app/adapters/tomtom_adapter.py`](backend/app/adapters/tomtom_adapter.py) (L41 bbox ~1.7M km², L67-68 keyless empty, L72-101 silent discard, L43-61 dead `health_check`), [`backend/app/services/cuopt_tomtom_service.py`](backend/app/services/cuopt_tomtom_service.py) (L39-44 seeds, L134 mislabeled `tomtom_live_speed_kmh`), [`backend/app/services/corridor_service.py`](backend/app/services/corridor_service.py) (L46-57 hardcoded defaults, L175-181 `"ONLINE"` labels), [`backend/app/main.py`](backend/app/main.py) (L61-96 loop).
  - Steps: corridor-anchored tiles ≤ 10,000 km² (0.5° lat × 0.75° lon ≈ 4,600 km²) with ID dedupe; 403 `InsufficientFunds` latch + warning + backoff; propagate `is_fallback`/degraded status in corridor payloads; wire `health_check` → `update_source_health`.
  - Acceptance: no >10k km² request; incidents flow for corridor tiles when credits exist; credits-exhausted state renders `FALLBACK` (Phase 54 contract) and health shows degraded, not `healthy`.

- [ ] **S6. Redis `lrip:stream:osint` maxlen trimming**
  - Files: [`backend/app/services/unified_news_ingestor.py`](backend/app/services/unified_news_ingestor.py) (L99 — the only uncapped `XADD`), [`backend/app/services/redis_client.py`](backend/app/services/redis_client.py) (L63 cap pattern), [`docker-compose.yml`](docker-compose.yml) (Redis service, L2-15, no `maxmemory`).
  - Steps: `XADD … maxlen=10_000, approximate=True`; one-time `XTRIM lrip:stream:osint MAXLEN ~ 10000` (43,640 items observed); optional compose `maxmemory` guard; log `XLEN` after publish.
  - Acceptance: `XLEN` stabilizes ≤ 10,000; `osint_hazard.py` 3h-window reads unchanged; news pipeline regression-free.

- [ ] **S7. Data Layer RLS hardening across core tables**
  - Files: [`infra/supabase/migrations/`](infra/supabase/migrations/) — `000_init.sql` (7 unprotected tables), `006:16-28` (`ground_truth_outcomes`), `009_commodity_prices_public_read.sql` (policy-only pattern), `007`/`008` (correct precedents).
  - Steps: migration batch with explicit `enable row level security` + SELECT policies for public-read tables (`incidents` together with S4, `data_sources`, `kg_*`, `commodity_prices` enablement backfill); writes stay service-role by design (document in comments); verify with `pg_class.relrowsecurity` + `pg_policies` queries and anon smoke reads.
  - Acceptance: every core table has an explicit RLS decision; anon reads return data (no silent `[]`); anon writes rejected as designed; fresh-replay matches prod.

### P2 — Verification & Close-Out

- [ ] Run `pytest backend/tests` (100% pass; new engine-contract tests: openmeteo instantiation, gateway fallback rejection, incidents populated query, TomTom tile area ≤ 10k km², XADD maxlen).
- [ ] Run `npx tsc --noEmit` (0 errors).
- [ ] Run the live probe: `python scripts/audit_backend_apis.py` — `/api/v1/incidents` non-empty; corridor latency no worse than the 979.57 ms baseline; degraded flags visible.
- [ ] Verify `XLEN lrip:stream:osint` ≤ 10,000 and Supabase RLS state via the verification SQL.
- [ ] Update [`ROADMAP.md`](.planning/ROADMAP.md) Phase 55 status → COMPLETE and write Phase 55 results (walkthrough results section), then refresh this file for the next context window.

### Watchlist — Deferred (do NOT start in Phase 55)

- AISStream `mmsi` bridge into published `port_queue` events (`aisstream_adapter.py:217-233` vs `telemetry_service.py:985-989`).
- NASA FIRMS runtime registration + `NASA_FIRMS_MAP_KEY` provisioning.
- Generic health-loop wiring for BMKG/Earth2 beyond S5's TomTom work; removal of seeded `'ok'` optimism.
- Hardcoded savings constants (18.5% / 14.2%) and hardcoded solver latencies (1.2–1.9 ms) presented as measurements.
- Frontend dead path `/api/crisis/process` (`frontend/lib/api.ts:75`).
- Social scraper dead config (`settings.twitter_bearer_token`) and `MOCK_SOCIAL_POSTS` residue; multi-worker poller duplication (`--workers 2`).

These become the Phase 56 candidate list once Phase 55 lands.
