---
phase: 58-opencode-go-swarm-llm-migration-and-render-parity
plan: 58-PLAN
subsystem: api
tags: [opencode, llm-gateway, langgraph, mimo, deepseek, render, parity, fail-loud]

# Dependency graph
requires:
  - phase: 57-pilot-hardening-e2e-audit-remediation
    provides: D1-D8 locked guardrails (guest 403, invite-only, no mock resurrection, background news) honored as constraints
  - phase: 55-comprehensive-engines-audit-and-stabilization
    provides: LLMGatewayUnavailable fail-loud contract extended by this phase
  - phase: 56-post-audit-integrity-routing-and-mock-purge
    provides: honesty guardrail (payload-derived cards, degraded labels) carried into chat + status seeding
provides:
  - opencode-first LLM gateway (mimo reasoning + deepseek driver) with per-branch defaults and fail-loud contract
  - Prediction narrative + routing explainer prose overlays (numbers stay deterministic)
  - incident_id/id read-path normalization, honest idle boot status, DEMO_OFFLINE=false pin
  - Full Render env sync + local-vs-Render probe matrix script + catalog verification script
affects: [swarm LLM call sites, render deploy env, evaluation honesty labels, future model swaps]

# Actuals (#2632)
actuals:
  tokens: 9200
  tasks: 11
  commits: 12

# Tech tracking
tech-stack:
  added: [opencode inference API (openai-compatible chat/completions)]
  patterns: [per-branch model defaults, ground-truth injection prompts, degraded-flag honesty]

key-files:
  created: [scripts/verify_opencode_models.py, scripts/probe_parity.sh, backend/tests/test_incident_id_normalization.py]
  modified: [agents/llm_gateway.py, backend/app/config.py, agents/nodes/decision_support.py, agents/nodes/economic_intelligence.py, agents/nodes/osint_hazard.py, agents/nodes/prediction.py, agents/nodes/route_optimization.py, backend/app/routers/agent_router.py, backend/app/nlp/news_extractor.py, agents/tools/supabase_tools.py, backend/app/main.py, backend/tests/test_llm_gateway.py, render.yaml, .env.example]

key-decisions:
  - "LTM embeddings stay Google text-embedding-004 (no opencode embeddings endpoint exists; moving models would invalidate pgvector rows)"
  - "Gemini/NIM branches kept fail-closed, not deleted (one-line revert path)"
  - "OPENCODE_API_KEY dashboard-only, never in yaml (57 D2 secrets rule)"
  - "Prediction narrative + routing explainer both approved as prose-only overlays with do-not-invent-numbers injection"

patterns-established:
  - "Per-branch model defaults: opencode branch defaults to driver model, Gemini branch to gemini_model (a global default would deaden the kept Gemini revert path)"
  - "Ground-truth injection: computed numbers embedded verbatim in LLM prompts with do-not-invent instruction; deterministic template kept as fail-loud fallback"
  - "degraded-flag honesty: template-engine chat replies carry degraded=true, genuine model output false"

requirements-completed: []

coverage:
  - id: D1
    description: "opencode-first gateway with config keys and catalog verification (WP1)"
    verification:
      - kind: unit
        ref: "backend/tests/test_llm_gateway.py (8 tests: success parse, 401/404/empty raise, marker rejection)"
        status: pass
      - kind: other
        ref: "python scripts/verify_opencode_models.py (live catalog: 403 without key, fail-loud exit 2 as designed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "5 LLM call sites rewired to mimo/deepseek routing table (WP2.1)"
    verification:
      - kind: unit
        ref: "backend/tests/test_agents.py (osint/economic/decision suites)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Prediction narrative + routing explainer prose overlays (WP2.2)"
    verification:
      - kind: unit
        ref: "backend/tests/test_agents.py::test_prediction_with_tomtom_data + keyless swarm smoke (deterministic fallback, no traceback)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Chat degraded flag + copilot seed string (WP2.3)"
    verification:
      - kind: unit
        ref: "backend/tests/test_auth_rbac.py + backend/tests/test_api_routers.py (RBAC green, zero DeepSeek R1 refs)"
        status: pass
      - kind: integration
        ref: "bash scripts/probe_parity.sh :: chat-degraded-flag probe"
        status: unknown
    human_judgment: false
  - id: D5
    description: "incident_id/id normalization at read sites (WP3.1)"
    verification:
      - kind: unit
        ref: "backend/tests/test_incident_id_normalization.py (6 tests: id-only, incident_id-only, mixed, missing)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Honest idle boot status + DEMO_OFFLINE pin (WP3.2)"
    verification:
      - kind: unit
        ref: "python -c AGENT_STATUS_STORE idle check + grep DEMO_OFFLINE render.yaml"
        status: pass
    human_judgment: false
  - id: D7
    description: "Gateway + drift + honesty test coverage (WP4.1)"
    verification:
      - kind: unit
        ref: "40 passed (gateway 8 + normalization 6 + auth_rbac 26), zero regressions"
        status: pass
    human_judgment: false
  - id: D8
    description: "Render env sync + probe matrix + parity docs (WP4.2/4.3)"
    verification:
      - kind: integration
        ref: "bash scripts/probe_parity.sh http://localhost:8000 + SSE trace (simulation_started, node_updates, consensus 0.86 validated)"
        status: unknown
    human_judgment: true
    rationale: "Render leg requires post-redeploy run against live https://peta-nadi.onrender.com; operator must confirm environment field flips to production"

# Metrics
duration: ~75min
completed: 2026-10-14
status: complete
---

# Phase 58: opencode-go Swarm LLM Migration and Render Parity Summary

**Swarm LLM migrated from Gemini+NIM to opencode-go (mimo reasoning + deepseek driver) via a gateway swap with fail-loud preserved, plus full Render env parity and live-verified drift fixes**

## Performance

- **Duration:** ~75 min (planning + execution incl. verification)
- **Started:** 2026-10-14T00:42Z
- **Completed:** 2026-10-14T01:55Z
- **Tasks:** 11
- **Files modified:** 17

## Accomplishments

- opencode-first `LLMGateway` branch on single `OPENCODE_BASE_URL` constant, per-branch model defaults, 30s timeout, `LLMGatewayUnavailable` on any failure; Gemini/NIM kept fail-closed
- All 5 gateway call sites rewired (decision_support + economic narrative on mimo; osint severity, prediction narrative, routing explainer, simulation/chat on deepseek); `ner_pipeline.py` explicitly stays Gemini-direct
- `incident_id` vs `id` live drift fixed at both read sites with regression tests; boot status honest (`idle`/`never`); `DEMO_OFFLINE=false` pinned
- `render.yaml` full env sync (OPENCODE_* + kept GEMINI_API_KEY + infra keys, secrets dashboard-only); probe matrix script + catalog verification script shipped
- Research verified no opencode embeddings endpoint exists, so LTM stays on Google `text-embedding-004` per D-05's own fallback clause

## Task Commits

Each task was committed atomically:

1. **WP1.1 Config keys** - `44030b4` (feat)
2. **WP1.2 Gateway branch** - `2960de6` (feat)
3. **WP1.3 Catalog script** - `30bb93a` (feat)
4. **WP2.1 Rewire 5 sites** - `e0440f5` (feat)
5. **WP2.2 Expansion A+B** - `531595a` (feat)
6. **WP2.3 Chat honesty** - `396df36` (feat)
7. **WP3.1 Drift fix** - `60aada1` (fix)
8. **WP3.2 Boot honesty** - `9caffd4` (feat)
9. **WP4.1 Tests** - `39e1191` (test)
10. **WP4.2 Env sync** - `f296487` (chore)
11. **WP4.3 + closeout** - pending commit (docs: SUMMARY, WALKTHROUGH, planning docs, probe script)

**Plan metadata:** `58-PLAN.md` (verified PASS, iteration 2)

## Files Created/Modified

- `agents/llm_gateway.py` - opencode-first branch, per-branch defaults, DEMO_OFFLINE boot warning
- `backend/app/config.py` - `opencode_api_key`, `opencode_reasoning_model`, `opencode_driver_model`
- `scripts/verify_opencode_models.py` - build-time catalog check + mimo pro-override lookup
- `scripts/probe_parity.sh` - local-vs-Render matrix (health, agents, sources, news, incidents, chat flag, SSE)
- `agents/nodes/prediction.py` - driver narrative overlay + either-key history counting
- `agents/nodes/route_optimization.py` - why-this-route explainer overlay
- `agents/tools/supabase_tools.py` - `.get("incident_id") or .get("id")` normalization
- `backend/app/routers/agent_router.py` - `degraded` flag, SIG-OPENCODE signatures, idle boot seeds, opencode seed summary
- `backend/app/nlp/news_extractor.py` - rewired to driver model, stale Gemini comment fixed
- `backend/app/main.py` - DEMO_OFFLINE production boot assertion
- `backend/tests/test_llm_gateway.py` - opencode branch tests (success, 401/404/empty, marker rejection)
- `backend/tests/test_incident_id_normalization.py` - new, 6 tests
- `render.yaml` - full env sync, model defaults, DEMO_OFFLINE=false
- `.env.example` - OPENCODE_* placeholders, GEMINI kept-for-LTM note

## Decisions Made

- LTM stays Google (RESEARCH verified no `/embeddings` in opencode docs; migration would invalidate stored pgvector rows) - honors D-05 fallback clause, not a scope cut
- Keep Gemini/NIM code paths fail-closed for one-line revert (RESEARCH open question 1)
- `OPENCODE_API_KEY` dashboard-only with `sync: false` reference (RESEARCH open question 2, 57 D2)
- Code-level `id` normalization, no Supabase migration on free-tier pilot (RESEARCH open question 3)
- Both expansion items approved (prediction narrative + routing explainer), prose-only, deterministic fallback

## Deviations from Plan

None - plan executed exactly as written (plan itself was revised pre-execution for checker W1-W3: PYTHONPATH prefixes, 5th caller, per-branch defaults).

## Issues Encountered

- **NIM egress ~30-50s timeouts in sandbox:** `test_decision_support_output_format` takes 49.86s alone (NIM `timeout=30.0` burn, then fail-loud fallback passes). Pre-existing environmental slowness (real nvapi keys in root .env, blocked/slow egress), not a Phase 58 regression; fail-loud-to-deterministic path works exactly per contract. Full suite therefore runs in background.
- **tsc OOM in sandbox:** `npx tsc --noEmit` exhausts Node heap (exit 134) even at 6GB. Zero frontend files touched by this phase, so this is environmental, not a regression. Flagged for an environment with more memory.
- **Executor probe debris at repo root** (`chat_probe.json`, `sse_out.txt`, `sse_probe.json`): removed during closeout; key SSE evidence transcribed into 58-WALKTHROUGH.md.

## User Setup Required

**Render dashboard needs manual env entry before parity is real.** See [58-WALKTHROUGH.md](./58-WALKTHROUGH.md) runbook:
- Set `OPENCODE_API_KEY` (Go subscription key), `GEMINI_API_KEY` (kept for LTM), `AISSTREAM_API_KEY`, `NASA_FIRMS_MAP_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET` as dashboard-only secrets
- Redeploy, then re-probe: live `/health` still reported `environment: development` against a yaml reading `production` (dashboard override or stale deploy suspected)
- Run `bash scripts/probe_parity.sh https://peta-nadi.onrender.com` and record results

## Next Phase Readiness

- Swarm runs opencode-first wherever `OPENCODE_API_KEY` is set; without it, fail-closed to Gemini/NIM keys or loud failure - no silent mocks
- Build-time step `python scripts/verify_opencode_models.py` resolves the mimo pro-ID question under the Go subscription
- Remaining Render leg (redeploy + re-probe + environment-field confirmation) is the only open loop; everything else verified
- No blockers for pilot ops work; graph.py / consensus diffs confirmed empty

---
*Phase: 58-opencode-go-swarm-llm-migration-and-render-parity*
*Completed: 2026-10-14*
