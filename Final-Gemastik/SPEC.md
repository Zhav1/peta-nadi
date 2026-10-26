# SPEC — Final-Gemastik Laporan-PreHub Rewrite

Status: READY. Date: 2026-10-26. Scope: Laporan only (`Final-Gemastik/` DOCX, SPEC, PDF, audit); no Proposal or product-code edits.
Method: PreHub is the factual spine; BeforeYouBet (BYB) supplies structure and fills only. Anchor every PreHub claim to PreHub evidence; no new data collection or external claims.

## 1. Goal

- G1. Keep PreHub as the report spine; use BeforeYouBet (BYB) only for shared report structure and fill. Anchor PreHub claims to local code, probe logs, validation letters, and screenshots. Do not add claims from memory or external sources. Generator: `scripts/generate_docx_technical_doc.py:319` (`build_technical_document(output_path, project_root)`).
- G2. `Proposal-PreHub-GEMASTIK19.docx` is frozen. Proposal-vs-implementation divergence is already recorded: Proposal states data largely simulated and decisions not auto-executed, while technical document claims ready-to-deploy routing updates (`Final-Gemastik/last-judgement.txt:20`); reference baseline for this divergence is `.planning/PROPOSAL_VS_IMPLEMENTATION_GAP_ANALYSIS.md:5-9`.
- G3. Laporan describes an operational decision-support demonstrator for Sumatra food-logistics corridors, explicitly non-BULOG-operational: no joint pilot with BULOG/Bapanas/fleet operator exists yet (`Final-Gemastik/last-judgement.txt:11`); BULOG strings in tree are fixture labels only, e.g. `backend/app/services/telemetry_service.py:247` (`1.800 Ton Beras BULOG`) and `backend/app/routers/fleet_ingest_router.py:49` (`Truk Beras BULOG Tebing` sample CSV).

## 2. Non-goals

- N1. No claim of national critical-operational readiness. Free-tier infra fits demo, not SLA/redundancy/high-capacity operational systems (`Final-Gemastik/last-judgement.txt:11`).
- N2. No auto-actuation claim. Operator approval does not move fleet by itself; product is decision support, not operational early-warning system (`Final-Gemastik/last-judgement.txt:20`); HITL remains dispatcher-gated (`backend/app/auth/supabase_auth.py:42-45`).
- N3. No removal of fallback paths to make metrics look live. TomTom keeps ordered-key fallback and degraded states (`backend/app/adapters/tomtom_adapter.py:38-58`, `backend/app/adapters/tomtom_adapter.py:257-288`); local persistence fallback stays (`.planning/REQUIREMENTS.md:94-95` — FR-12.4 SQLite/JSON fallback); CPU router keeps explicit fallback route branch (`backend/app/adapters/cpu_routing_adapter.py:818-870`).

## 3. Decisions locked

### 3.1 Grill decisions: 9 + integrator (D-01..D-10)

Source set is the 10-item pilot-to-real record in `.planning/LEARNINGS.md:267-277` (dedup through HITL). Locked reading:

- D-01 Dedup terminates at Stage 1; UI/sim sources exempt (recorded `.planning/LEARNINGS.md:269`).
- D-02 Confidence is weather-grounded, not source-health-derived (recorded `.planning/LEARNINGS.md:270`).
- D-03 Economic channel votes only with observation; else physical weights renormalized (recorded `.planning/LEARNINGS.md:271`).
- D-04 Degrade with provenance: PIHPS 14-day, bounded local STM/dedup, OSINT 12h, SCAN + 25 km anchor (recorded `.planning/LEARNINGS.md:272`).
- D-05 News replay idempotent via uuid5 + upsert; news incident excluded from self-fusion (recorded `.planning/LEARNINGS.md:273`).
- D-06 Alerts cross workers via validated-alert stream; identity `(crisis_id, timestamp)` or SHA-1 (recorded `.planning/LEARNINGS.md:274`).
- D-07 UI cannot fake success: archived forces unvalidated + Evidence + info toast (recorded `.planning/LEARNINGS.md:275`).
- D-08 Brier uses two named scales; raw product kept as telemetry (recorded `.planning/LEARNINGS.md:276`).
- D-09 Canonical URLs stay on publisher; Google hosts rejected (recorded `.planning/LEARNINGS.md:277`).
- D-10 Integrator: HITL is auth-first; 401 precedes 422 (recorded `.planning/LEARNINGS.md:277`; enforced `backend/tests/test_auth_rbac.py:233-251`).

Road-snapping grill lock is additive, not replaced: offline precompute + dual-layer avoid + macro-node stitch + Manhattan benchmark scope (`.planning/phases/100-mapbox-turn-by-turn-street-snapping-dual-layer-avoidance/PLAN.md:26-38`).

### 3.2 Four 26-Okt probes (live, localhost-first)

- P-01 TomTom live: key mask, Redis check, latch state, classifier matrix, conditional live health/fetch (`scripts/check_tomtom.py:40-56`, `scripts/check_tomtom.py:67-77`, `scripts/check_tomtom.py:89`).
- P-02 Fleet/telemetry live: 45-unit master baseline fused with custom fleet (`backend/app/services/telemetry_service.py:239-249`, `backend/app/routers/evaluation_router.py:204` — TEST-FR16-07 fusion invariant).
- P-03 Road-snapping benchmark: Manhattan `[98.6253, 3.5855]` to USU `[98.6570, 3.5650]`, live >200 pts assertion (`frontend/scripts/test_turn_by_turn.ts:168-183`).
- P-04 Eval/benchmark report: N=60 synced 2026-10-26, TP=35 FP=0 TN=25 FN=0, Brier=0.0937 (`backend/app/routers/evaluation_router.py:32-44`, `backend/app/routers/evaluation_router.py:54-56`).

### 3.3 References and architecture shift

- APA reference table: use `pengumpulan/3_Component_and_Library_List.md:1-3` (header) with version/license rows `pengumpulan/3_Component_and_Library_List.md:8-18` (frontend), `pengumpulan/3_Component_and_Library_List.md:23-34` (backend incl. `NetworkX:33`), `pengumpulan/3_Component_and_Library_List.md:39-40` (Pytest/Playwright); expand to minimum 15 cited entries in Laporan Daftar Pustaka.
- Prior-art framing: IBM control tower + SYRI-Alert are the novelty comparators; PreHub differentiator is Indonesia food context, multimoda, source-independence validation, Evidence Chain, Continue-Reroute-Hold comparison; "swarm" wording is pipeline orchestration, not autonomous collaboration (`Final-Gemastik/last-judgement.txt:6`, `Final-Gemastik/last-judgement.txt:8`).
- CPU shift locked: deterministic CPU routing via NetworkX Dijkstra/A* + OR-Tools, zero GPU, <150 ms/50 nodes (`backend/app/adapters/cpu_routing_adapter.py:1-5`); GPU routing purged Phase 59 (`.planning/FEATURE_STATUS.md:69`); zero-GPU-cost architecture is project invariant (`.planning/PROJECT.md:51`).

### 3.4 DOCX preservation and changelog

- Preserve SDT dropdown controls in validation-letter derivatives: row extension deep-copies `w:sdt` (`scripts/generate_ditmawalumni_usu_doc.py:206-209`); rating updates write `dropDownList lastValue` + visible `w:t` (`scripts/generate_ditmawalumni_usu_doc.py:261-276`); save path fixed (`scripts/generate_ditmawalumni_usu_doc.py:338`).
- Preserve the report's PreHub narrative spine, required BYB fills, styled tables, and figures. Source generator: `scripts/generate_docx_technical_doc.py:319-322`; generated output path: `scripts/generate_docx_technical_doc.py:689-691`. Final edits stay in `Final-Gemastik/`.
- Changelog: record Laporan edits in `Apa yang Berubah`; this task stays in `Final-Gemastik/` and does not edit `.planning/STATE.md` or product code.

## 4. Open / deferred (not in this rewrite)

- O-01 Socfin/USU signature finalization deferred. Stakeholder set includes PT Socfin, PT Sawita, Ditmawalumni USU (`.planning/phases/103-industry-validation-tactical-cargo-tiering-social-disruption/PLAN.md:14`); Socfin/Sawita demand empiric proof + live-vs-fallback transparency (`.planning/phases/103-industry-validation-tactical-cargo-tiering-social-disruption/PLAN.md:25-28`); USU generator uses Bahana Mandiri template and writes Ditmawalumni DOCX/PDF paths (`scripts/generate_ditmawalumni_usu_doc.py:51-56`); discussion date 23 Okt 2026 with signature block Medan 23 Okt 2026 (`scripts/generate_ditmawalumni_usu_doc.py:100-105`, `scripts/generate_ditmawalumni_usu_doc.py:311-336`). Do not claim signed status beyond what the PDFs in `Final-Gemastik/` show.
- O-02 Eval parity waits for backend-up confirmation. Known red: benchmark TP 35 vs expected 34 (`.planning/LEARNINGS.md:290`); same red carried in workflow status (`.planning/STATE.md:153` — `test_evaluation_router TP 35 vs 34 still red`). Canonical fallback report is the 2026-10-26 sync (`backend/app/routers/evaluation_router.py:32-37`).
- O-03 SUS / task-time / error-rate / manual-baseline comparison deferred. Judge note: UI dense, no dispatcher testing, no SUS/task completion/decision-time data (`Final-Gemastik/last-judgement.txt:13`); urgency scoring also waits for corridor-loss quantification (`Final-Gemastik/last-judgement.txt:22`).

## 5. Interfaces and edge cases

- I-01 TomTom live with key0→key1 failover; shared latch False. Ordered keys primary-then-fallback (`backend/app/adapters/tomtom_adapter.py:38-58`); per-key exhaustion set + active index (`backend/app/adapters/tomtom_adapter.py:237-247`); credit-403 failover loop, global 900 s latch only after all keys exhausted (`backend/app/adapters/tomtom_adapter.py:257-288`, `backend/app/adapters/tomtom_adapter.py:168-171`); Redis-shared latch stub always False (`backend/app/adapters/tomtom_adapter.py:183-189`); keyless fetch returns `degraded/tomtom_api_key_missing` (`backend/app/adapters/tomtom_adapter.py:503-507`); latched fetch short-circuits (`backend/app/adapters/tomtom_adapter.py:509-517`).
- I-02 Telemetry hybrid, ingest live. Master baseline is code fixture (`backend/app/services/telemetry_service.py:239-249`); TMS webhook ingest endpoint is live (`backend/app/routers/fleet_ingest_router.py:266-286`); probe-observed hybrid split 99/73 is a 26-Okt probe observation to re-verify against `/api/v1/fleet/vehicles`, not a code constant; do not hardcode 99/73 into Laporan tables.
- I-03 CPU solver interface. Class `CPURoutingAdapter` loads local road-graph cache (`backend/app/adapters/cpu_routing_adapter.py:503-510`); point-to-point `solve_shortest_path` with hazard penalties, <30 ms (`backend/app/adapters/cpu_routing_adapter.py:607-627`); fleet CVRP `solve_fleet_vrp` (`backend/app/adapters/cpu_routing_adapter.py:927-936`); solver labels are `NetworkX Dijkstra / A* CPU Solver` (`backend/app/adapters/cpu_routing_adapter.py:911-913`) and `Deterministic CPU VRP Solver (NetworkX + Heuristic 2-Opt)` (`backend/app/adapters/cpu_routing_adapter.py:990-992`).
- I-04 HOLD for Regulator is UI-only; server stays 403. Regulator perms exclude `approvals:write` (`backend/app/auth/supabase_auth.py:58-65`); HOLD is HITL advisory flag, not commit (`backend/app/auth/supabase_auth.py:42-45`); role gate raises 403 (`backend/app/auth/supabase_auth.py:386-393`); regulator APPROVE denied 403 (`backend/tests/test_auth_rbac.py:233-251`); fleet writes similarly 403-gated (`backend/app/routers/fleet_ingest_router.py:108-120`).
- I-05 PetaNadi alias. Service name is `peta-nadi` (`render.yaml:3`); public URL + CORS list use `https://peta-nadi.onrender.com` (`render.yaml:69-72`); rename `prehub-backend` → `peta-nadi` noted (`.planning/LEARNINGS.md:239-243`). Laporan must name both: PreHub (product) / peta-nadi (deploy alias).
- I-06 BULOG fixture labels. Do not present as integration: sample manifest BULOG row (`backend/app/routers/fleet_ingest_router.py:46-52`); telemetry BULOG cargo rows (`backend/app/services/telemetry_service.py:247`, `backend/app/services/telemetry_service.py:375`); Laporan target-user table still lists Perum BULOG as audience (`scripts/generate_docx_technical_doc.py:351`), which stays audience, not pilot evidence.
- I-07 Vercel figures. Embed `docs/screenshots/vercel-01-dashboard.png` through `vercel-06-evaluasi.png` as Gambar VIII.1-VIII.6. Captions read `Gambar VIII.x. Tampilan laman ...`; no host or date. Localhost remains the SOP/test environment, not the source label for these six figures (`Final-Gemastik/Laporan-PreHub-GEMASTIK19.docx`, Mockup section, paras 266-277).

## 6. Verification hooks (must all pass before Laporan export)

- V-01 TomTom: classifier matrix 6 cases (`scripts/check_tomtom.py:20-37`); latch + live health/fetch verdict (`scripts/check_tomtom.py:55-89`); latch unit test (`backend/tests/test_adapters.py:335-358` per `.planning/STATE.md:153` context; implementation `backend/app/adapters/tomtom_adapter.py:195-230`).
- V-02 Fleet: telemetry schema/modality/cold-chain/offline-fallback matrix (`backend/app/routers/evaluation_router.py:171-174` — TEST-FR13-01..04); ingest webhook + fusion invariants (`backend/app/routers/evaluation_router.py:198-204` — TEST-FR16-06/07).
- V-03 Benchmark: N=60 integrity/distribution/engine-execution gates (`backend/app/routers/evaluation_router.py:124-126` — TEST-FR06-01..03); live fallback report values (`backend/app/routers/evaluation_router.py:36-56`).
- V-04 Eval: benchmark/calibration report endpoint + 133-test matrix + corridor efficiency (`backend/app/routers/evaluation_router.py:176-180` — TEST-FR14-01..05).
- V-05 Backend suite: `pytest backend/tests` green; known exception is eval TP 35-vs-34 red (`.planning/LEARNINGS.md:290`) — fix label/cut first, never edit expectation silently.
- V-06 Frontend: `npx tsc --noEmit` exit 0; Playwright suite against localhost webServer (`frontend/playwright.config.ts:25-32`) with no-errors gate; turn-by-turn 4/4 (`frontend/scripts/test_turn_by_turn.ts:231`).
- V-07 DOCX/export/similarity: back up before edits; use run-level changes and do not alter `w:sdt`. Keep `w:sdt` count 133, Mendeley strings 18 citations + 3 bibliography, 15 entries in the bibliography SDT + 4 plain references, N=60 table, Tabel VII.4, six plain sync boxes, eight chapter stubs, and 6 Vercel figures (maximum 12 inline shapes). Export PDF and record pages/bytes. Screen exact 5-word n-gram overlap between Makalah and Laporan; target <25%, not a certified similarity score.

## 7. Report content gates (PreHub spine, BYB fill, and 8 chapter stubs)

- PreHub spine: keep the problem, method, implementation, and evaluation tied to the demonstrator's evidence; do not turn a design target or fixture into an operational result (`Final-Gemastik/last-judgement.txt:11,20`).
- BYB fill: use only source-backed material to complete required report sections; retain status labels for live, fallback, simulated, draft, and final evidence.
- Six sync boxes: six plain paragraphs, numbered 1-6; place 1-3 in Latar Belakang and 4-6 in Metodologi. Keep the comparison table in Batasan and roadmap in Metodologi (`Final-Gemastik/taskC_sync.py:128-267`).
- Chapter stubs: eight plain `Catatan sinkronisasi` paragraphs; each points readers to the relevant sync box or evidence without adding a new claim (`Final-Gemastik/taskC_sync.py:158-255`).
- Validation: retain Tabel VII.4 for five sources, verbatim quotes with source/status in Lampiran B, and Lampiran A's N=60 evidence and open TP 35-vs-34 note (`Final-Gemastik/taskC_sync.py:170-196`; `Final-Gemastik/Laporan-PreHub-GEMASTIK19.docx`, paras 262,303-340).
- Figures: embed six Vercel screenshots as Gambar VIII.1-VIII.6; each caption starts `Gambar VIII.x. Tampilan laman` and omits host/date. Keep aspect ratio and at most 12 inline shapes.
- Other report gates: retain the Proposal comparison, CPU-only solver framing, test/benchmark tables, draft/final labels, and the TOC refresh note. Main TOC refresh remains pending F9 (Laporan para 347); Daftar Gambar VIII.1-VIII.6 page labels are updated. Proposal remains frozen (`Final-Gemastik/SPEC.md:8-16`; `.planning/STATE.md:341-356`).

## 8. Traceability

| SPEC item | Evidence |
|---|---|
| Proposal frozen | `Final-Gemastik/last-judgement.txt:20`, `.planning/PROPOSAL_VS_IMPLEMENTATION_GAP_ANALYSIS.md:5-9` |
| Non-BULOG, non-national-critical, no auto-actuation | `Final-Gemastik/last-judgement.txt:11`, `Final-Gemastik/last-judgement.txt:20`, `backend/app/services/telemetry_service.py:247`, `backend/app/routers/fleet_ingest_router.py:49` |
| Grill 9+integrator | `.planning/LEARNINGS.md:267-277`, `.planning/phases/100-mapbox-turn-by-turn-street-snapping-dual-layer-avoidance/PLAN.md:26-38` |
| 4 probes | `scripts/check_tomtom.py:40-89`, `backend/app/services/telemetry_service.py:239-249`, `frontend/scripts/test_turn_by_turn.ts:168-183`, `backend/app/routers/evaluation_router.py:32-56` |
| IBM/SYRI/CPU | `Final-Gemastik/last-judgement.txt:6`, `Final-Gemastik/last-judgement.txt:8`, `backend/app/adapters/cpu_routing_adapter.py:1-5`, `.planning/FEATURE_STATUS.md:69` |
| SDT + changelog | `scripts/generate_ditmawalumni_usu_doc.py:206-209`, `scripts/generate_ditmawalumni_usu_doc.py:261-276`, `.planning/STATE.md:341-356` |
| Socfin/USU signatures and SUS deferred | `.planning/phases/103-industry-validation-tactical-cargo-tiering-social-disruption/PLAN.md:14,25-28`, `scripts/generate_ditmawalumni_usu_doc.py:51-56`, `Final-Gemastik/last-judgement.txt:13,22` |
| TomTom edge | `backend/app/adapters/tomtom_adapter.py:38-58`, `backend/app/adapters/tomtom_adapter.py:183-189`, `backend/app/adapters/tomtom_adapter.py:257-288` |
| HOLD 403 edge | `backend/app/auth/supabase_auth.py:42-65`, `backend/app/auth/supabase_auth.py:386-393`, `backend/tests/test_auth_rbac.py:233-251` |
| PetaNadi alias | `render.yaml:3`, `render.yaml:69-72` |
| Task D: PreHub spine + BYB structure/fill, six plain sync boxes, validation, and eight stubs | `Final-Gemastik/Laporan-PreHub-GEMASTIK19.docx`, paras 99-101,177-179,262,303-340; stubs 98,127,150,176,236,263,277,286; `Final-Gemastik/Laporan Akhir - BeforeYouBet.pdf`, pp.2-3 |
| Task E: six Vercel figures, SDT-safe audit, export, and similarity screen | `docs/screenshots/vercel-01-dashboard.png` through `vercel-06-evaluasi.png`; Laporan paras 262,266-277,350; PDF 45 pp / 2,909,811 B; Makalah-to-Laporan exact 5-gram overlap 0.25% |
