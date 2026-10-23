# Master PLAN — P0–P4 Integrity Remediation (Phases 92–96)

**Date:** 2026-10-23
**Code under review:** `20c7fa5` — *"P0-P4: OSINT hazard + prediction
remediation, idempotent writes, honest confidence, map/UI null-guards, OD
preservation, notify fanout, spatial gate"* (40 files, +4462 / −850).
**Pre-fix base:** `20c7fa5^` = Phase 90 (`9f0a854`).
**Commit status:** code was already committed before this documentation pass.
**These documents are uncommitted** and are intended as the handoff for the next
context window.

---

## 1. Numbering

The last committed roadmap phase is **90** (`90-osint-leak-hardening-pan-sumatra-coverage`).
`.planning/phases/91-p0-p4-integrity-remediation/` already exists and holds the
umbrella `DECISIONS.md` + `LEARNINGS.md` for the same commit. To avoid a second
folder with number 91, the five workstream packs continue at **92–96**:

| P | Folder | Scope | Status |
|---|---|---|---|
| P0 | [`92-p0-schema-write-contract`](92-p0-schema-write-contract/PLAN.md) | Column whitelist, idempotent upsert, write gate, STM key, one poller process, OD state contract | Implemented in `20c7fa5`; docs uncommitted |
| P1 | [`93-p1-prediction-core`](93-p1-prediction-core/PLAN.md) | Nearest-segment forecast, nearest-station weather, distance/calibration honesty, GraphRAG causal chain, benchmark scoring | Implemented in `20c7fa5`; docs uncommitted |
| P2 | [`94-p2-social-spatial-gate`](94-p2-social-spatial-gate/PLAN.md) | Citizen payload unpack, 100 km spatial gate, hazard-type alignment, source attribution, social poller, degradation ledger | Implemented in `20c7fa5`; docs uncommitted |
| P3 | [`95-p3-ui-observability`](95-p3-ui-observability/PLAN.md) | Absent-value rendering, map null guards, hazard geometry, health truth, worker telemetry, alert fan-out | Implemented in `20c7fa5`; docs uncommitted |
| P4 | [`96-p4-e2e-blocker-pack`](96-p4-e2e-blocker-pack/PLAN.md) | Multi-client E2E blocker + missing browser/contract coverage | **Not implemented — open blocker** |

Each folder contains:

- `PLAN.md` — defect register (`WRITE-D*`, `PRED-D*`, `OSINT-D*`, `UI-D*`,
  `OBS-D*`, `E2E-D*`), contract changes, fail-today/pass-after tests,
  acceptance gate.
- `WALKTHROUGH.md` — what was actually implemented, files changed, commands run
  in this session and their results, and what remains unverified.

---

## 2. Dependency order

```
92 (P0 write/schema contract)
 ├─ 93 (P1 prediction core)        uses distance/region/confidence contracts
 ├─ 94 (P2 social/spatial gate)    uses region slugs + payload text contract
 └─ 95 (P3 UI/observability)       renders 93/94 output, fans out alerts
        └─ 96 (P4 E2E gate)        blocks release until D1–D6 close
```

93, 94 and 95 can be reviewed in parallel. 96 must follow all three because its
assertions depend on the final payload shapes.

---

## 3. What was verified in this session

All commands were run on 2026-10-23 in `D:\College\Pidi.id`.

| # | Command | Result |
|---|---|---|
| 1 | `backend/.venv/Scripts/python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider` | **33 passed**, 4 warnings, 111.94 s |
| 2 | `backend/.venv/Scripts/python.exe -m pytest tests/test_osint_leak_hardening.py tests/test_news_pipeline.py tests/test_pre_llm_filter.py tests/test_phase76_news_spatial_consensus.py tests/test_bmkg_consensus_validation.py tests/test_geocode_search.py tests/test_scrapers.py -q -p no:cacheprovider` | **128 passed**, 3 warnings, 14.94 s |
| 3 | `backend/.venv/Scripts/python.exe scripts/evaluate_metrics.py` | **GATING PASSED** — precision 97.2%, recall 100%, F1 0.986, FPR 4.0%, Brier 0.0846, latency 0.017 ms |
| 4 | `frontend: npx tsc --noEmit` | exit 0 |
| 5 | `frontend: npm test` (SpatialHashArbiter) | 3/3 PASS, exit 0 |
| 6 | Static fabricated-data audit over six sidebar/map/hook files | 0 data literals; 5 matches are comments or paint opacity |
| 7 | `Test-Path frontend/.next/standalone/server.js` | **False** — Playwright cannot boot its webServer |

**Not run:** the full backend suite, the Playwright suite, `next build`.
No pass claim is made for those.

---

## 4. Known open blockers and gaps

| Ref | Item | Evidence |
|---|---|---|
| E2E-D1 | `multi-client-routing-isolation.spec.ts` fails: `corridor-summary-pill` never renders | `.planning/STATE.md:152`; `frontend/e2e/multi-client-routing-isolation.spec.ts:22-23` |
| E2E-D6 | Standalone bundle absent, so E2E cannot start on a clean tree | `frontend/playwright.config.ts:27-32`; `next.config.mjs:9` |
| — | No tests for write gate/UUIDv5/STM migration | Phase 92 `WALKTHROUGH.md` §4 |
| — | No tests for GraphRAG, alert fan-out, worker telemetry, OD normalization | Phases 93/95 `WALKTHROUGH.md` |
| — | UI honesty is enforced by static audit, not behavior tests | Phase 95 `PLAN.md` §4 |
| — | 100 km OSINT radius is flat; text fallback is alias matching | Phase 94 `PLAN.md` §6 |
| — | Benchmark N=60 is curated/synthetic, not field validation | Phase 93 `PLAN.md` §6 |

---

## 5. Release gate (definition of done)

1. Phase 96 gate green:
   - `multi-client-routing-isolation` 1/1
   - `toll-bypass-routing` 7/7
   - `mapbox-turn-by-turn` 3/3
   - new alert-delivery / honesty / OD specs green
2. Backend idempotency + fan-out tests green.
3. `tsc --noEmit` exit 0.
4. `scripts/evaluate_metrics.py` still prints `GATING PASSED`.
5. No fabricated data literals re-introduced in the audited UI files.

Until then, the P0–P3 work is **implemented and unit-verified**, not
**release-verified**.
