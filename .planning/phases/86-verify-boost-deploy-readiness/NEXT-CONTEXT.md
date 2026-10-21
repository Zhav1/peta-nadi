<!-- generated-by: gsd-docs-update (M5 window, Deepseek worker) -->
# Phase 86: Verify + Boost + Deploy-Readiness — Next Context (handoff)

**For the next window / agent.** Everything below is grounded in committed diffs
(`c5d2e9d/c53261e/f5e032d/b4dee0e/b443352` on `main`) or cited prior artifacts. No assumptions.
Working tree is clean; `stash@{0}` (WIP on `c53261e`, belongs to the parallel session) retained untouched.

---

## 1. Where things stand

- **M4 COMPLETE** (Phase 82, STATE.md frontmatter). **M5 implemented-locally-pending-deploy:**
  - 83 grounded-routing hedging / no_route / HITL SIMULASI gate / blink dedupe — own PLAN+WALKTHROUGH+LEARNINGS
    in `.planning/phases/83-grounded-routing-hedging-no-route-blink-stabilization/`, verified pre-`b443352`
    (tsc 0, 35-test bundle green, 4 live probes).
  - 84 News-Precision Gate-2 (schema v6, Q1 bbox/Java/ceremony guards, selective async Gate-2) — code in
    `b443352`, NOT re-verified (no gate2 tests exist).
  - 85 Weather+FIRMS overlay (blue/purple palette, `/fire/hotspots`, fire-as-I, 3 h poller, honest-degraded
    health, 2 toggles) — code in `b443352`, NOT re-verified, MAP_KEY not provisioned.
  - 86 this deploy-readiness record.
- **Commit hygiene warning:** `b443352` is labeled `docs(83)` but bundles 17 code files (all of 84/85)
  with 3 docs files. Future `git log --oneline` archaeology will misattribute 84/85 to it — this handoff
  and the 84/85 PLANs are the corrective record.

## 2. Environment / context you inherit

| Item | Value |
|---|---|
| Orchestration | Muse Spark orchestrator; Deepseek/GLM workers only (Gate-1 deepseek-v4.1-flash, Gate-2 mimo-v2.6-pro low-effort) |
| Live pair | `https://pre-hub.vercel.app` × `https://peta-nadi.onrender.com` (Render Docker, Singapore, free plan) |
| Local pair | `:3000` × `:8000`; Windows PowerShell (no `head` — use `Select-Object -First`); Python 3.13, Pydantic 2.13 |
| Secrets | `NASA_FIRMS_MAP_KEY` → Render dashboard (`sync:false`) + `.env.local` locally; never in git |
| Cold-start reality | 30–77 s cold > 20 s client timeout → always warm `/health` first, retry-after-warm |
| Prod-only rule | Playwright harness is frontend-only (no backend `webServer`, no JWT seed) — skip API-backed specs locally, flip on against prod |
| Admit-uncertainty > FP | DROPPED over YELLOW; FPR ≤ 0.15 (`evaluation.py:49-51`) |
| Capped async budget | Gate-2: 5-conc / 60 s-item / MD5-500 / single web-search; FIRMS poller 3 h; Redis caps as listed in PLAN §4.3 |

## 3. Do first (ordered)

1. `npx tsc --noEmit -p tsconfig.json` (frontend/) → must be exit 0 post-`b443352`.
2. `pytest test_consensus_calibration.py test_phase76_news_spatial_consensus.py` → confirms `fire_corroboration`
   extra key doesn't break the 4-channel assertions.
3. 35-test bundle (routing-hedging/travels-erp/geocode-search/fleet-ingest) → green baseline.
4. Add `test_gate2_selector.py` (`_needs_gate2_review` true/false matrix) + FIRMS degraded-endpoint test
   (no-key → 200 `degraded` + `[]`); keep them key-independent so they run locally.
5. Warm prod `/health` → re-run the 84/85 re-prove recipes (Sumbing-DROP, Mitigasi-DROP, v6 rows,
   Gate-2 refinement, `/fire/hotspots` degraded, weather palette/provenance).
6. Operator: provision MAP_KEY → redeploy → re-probe `/fire/hotspots` ok-path + toggle UI.
7. Only then: Vercel chunk-manifest check (Phase 83 walkthrough §7.4) and close out M5 deploy.

## 4. Do NOT repeat (issues found this window)

- Do not resolve Java/out-of-island toponyms to Sumatra nodes (Sumbing→Medan) — the 3-layer Q1 guard
  (extractor + geocoder + synthesis + client mirror) must stay in sync; changing one layer without the
  others re-opens the hole, especially the post-LLM re-check (`news_extractor.py:975-1010`).
- Do not promote ceremony to zones (Mitigasi YELLOW) — ceremony is a discourse type, not a severity tweak.
- Do not compare `schema_version` against a hardcoded old number — grep all `!=` / `setdefault` sites on
  every contract bump; single-source the constant.
- Do not report FIRMS healthy without a working key, and do not let a stale DB row resurrect it
  (`health.py:80-110` guards both branches — keep them).
- Do not render `open-meteo-sim` as a warning — projection label + blue/purple + source/valid_until, all three.
- Do not add a fifth consensus vote — fire corroborates I only, transparency outside the breakdown.
- Do not bundle code into a `docs()` commit — `b443352` is the cautionary example.
- Do not drop/apply `stash@{0}` (parallel session's); do not commit foreign hunks (hunk-level discipline —
  `routing_router.py` carries both hedging and `/fire/hotspots` by design now).
- Do not chase pre-existing env failures here (`langgraph` absent for `simulate/stream`, canonical-URL
  expectation mismatch — `.planning/LEARNINGS.md:235`).
- Still open (not M5): migration 014 apply, RLS predicates, `sync_status` drain, `[0,0]` defaults,
  actual-toll-zero, single-record scoping, Playwright backend `webServer`.

## 5. Key file:line index (M5 window)

- Gate-2 core: `backend/app/nlp/news_extractor.py:29/34/57/72/81-86/331/425/434/564/678/975/1080/1118/1155/1222/1452`
- Geocoder: `backend/app/nlp/geocoding_service.py:16/415-500`; gazetteer: `gazetteer_data.py:26-56`
- Ingestor: `unified_news_ingestor.py:143/202/391/553`; aggregator: `news_aggregator.py:135/574/1001/1074/1259`
- Worker: `ingestion_worker.py:88-140`; router re-tier: `news_router.py:140/157`; FPR gate: `evaluation.py:49-51`
- Weather: `weather_fusion_service.py` (palette + source/valid_until hunk); FIRMS adapter: `nasa_firms_adapter.py` (click fields hunk)
- Endpoint: `routing_router.py:115-228`; consensus: `agents/tools/consensus_gate.py:104/140/187/215`
- Poller/lifespan: `main.py:136-180/243/252`; health: `health.py:41/80-110`
- Toggles: `TopNavTelemetry.tsx:24/53/423-466`; client mirror: `useNewsVerification.ts:181/797`
- Config: `config.py:30/47-48`; `render.yaml:29-46/51-54`; `.env.example:43-61`
- Phase 83 (prior, verified): `routing_router.py:242-251/301-343`, `cpu_routing_adapter.py:17-45`,
  `DashboardClient.tsx:744/842/919/1056/2670`, `MitigationTab.tsx:64-90/155-161/814-821`,
  `FleetVehicleLayer.tsx:475-516`, `CrisisMap.tsx:1258-1296`
