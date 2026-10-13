# CONTEXT: Phase 57 — Pilot Hardening (E2E Audit Remediation, No Mock Resurrection)

Source: `SYSTEM_AUDIT_AND_ROOT_CAUSE_ANALYSIS.md` (7 findings) + pilot-lens re-research (codebase reads + Supabase/Mapbox/FastAPI standards) + user decisions 2026-10-13.

## What Phase 56 already settled (do not regress)
- Mock purge complete: `MOCK_SOCIAL_POSTS`, `FALLBACK_OUTCOMES`, fabricated `/spikes`, hardcoded chart prices removed; sweep 0 source hits (`56-WALKTHROUGH.md` WP5).
- Honest empty states are the standard: "Belum tersedia / Belum dihitung / Belum ada temuan ekonomi", `FALLBACK_FLEET` only behind "Mode Simulasi" toggle (default off, D3).
- Strict RBAC is intentional (Phases 53/54): guests have no write permissions; `test_auth_rbac.py` asserts guest 403 on fleet/approvals.

## Locked decisions (user-confirmed)
| ID | Decision | Why |
|---|---|---|
| D1 | Guest writes stay 403 (Option A). Fix UX, not permissions. | Backend sandbox-write would break auditability + RBAC tests. `DashboardClient` catch becomes "Mode Sandbox: tersimpan lokal" + localStorage save + map styling still applies. |
| D2 | NO copy-paste password card in UI/repo. Pilot accounts = invite-only via Supabase Dashboard / `auth.admin.inviteUserByEmail` + Magic Link login. Secrets live in Supabase Auth + team password manager only. | Shared passwords in UI/markdown are a pilot security hole. Open self-signup as DISPATCHER must be closed. |
| D3 | `company_id` captured at signup (user was right). New `organizations` + `profiles(company_id FK)` tables, `handle_new_user()` trigger from `raw_user_meta_data`, signup UI company field, JWT `app_metadata.company_id`, fleet filtered by it. | Today tenancy is free-text `org_name` (`fleet_ingest_router.py:121`, `local_storage.py:117`) with no read-path filter (`telemetry_service.get_unified_fleet:969-1029` filters modality/status only). Unenforceable without stable ID. |
| D4 | Pilot routing = live Mapbox Directions first; curated polyline ONLY as labeled last-known-good/offline cache, never presented as live. | `fallbackHighwayRoute` interpolation (`mapboxRoutingService.ts:384-410`) is the "rute ngasal" source. Presenting it as real violates Phase 56 honesty guardrail. |
| D5 | News ingestion moves to background (`BackgroundTasks` + `_ingestion_in_progress` guard); endpoint returns Supabase cache immediately; frontend shows honest loading/last-updated, no fake articles. | `run_ingestion_cycle` (RSS×10 + NLP×30 + link-probe + upsert + Redis) is 20s+ and currently `await`ed inside the request (`news_router.py:55-68`). |
| D6 | REJECT audit Solusi 2 mock-economy injection (+17.1% / Rp 210jt canned payload). Offline demo shows honest empty state or real engine output only. | Directly contradicts Phase 56 WP3/WP5 (no hardcoded figures, payload-derived cards only). |
| D7 | Guest banner gets dismiss X (sessionStorage). Stage-0 button calls `onStart({origin,destination})`, not `onAdvance()` on null `crisisId`. Simulation tab gets macro-vs-tactical explainer card. | Confirmed bugs: `GuestEvaluationBanner.tsx:9-40` (no dismiss), `GuidedDemoPanel.tsx:429-432` + `useDemoState.ts:222-232` (advance early-return). |
| D8 | Perf items (GPU ReadPixels stall, Mapbox style abort) are P3 stretch, not pilot-blockers. | Log-only symptoms; fix = debounce style reload + avoid sync canvas reads in animation loop. |

## Open-but-defaulted items (flag if you disagree)
- Signup UX: invite-only + company field replaces open role-picker signup. If open signup stays, it must default to GUEST and require operator approval for DISPATCHER.
- Baseline 45-unit `MASTER_FLEET` gets `company_id` tags (pilot seed orgs) vs only custom vehicles carrying org. Default: tag baseline too, else filter looks broken on first login.
- `route_approvals` RLS stays as-is (migration 010: authenticated can write); permission gate stays in API (`approvals:write`), not RLS.
