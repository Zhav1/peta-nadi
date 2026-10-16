---
phase: 59-llm-swarm-post-key-audit
plan: 01
subsystem: api
tags: [opencode-go, mimo-v2.6-pro, deepseek-v4.1-flash, llm-gateway, ner, fail-loud, embeddings-only]

# Dependency graph
requires:
  - phase: 58-opencode-go-swarm-llm-migration-and-render-parity
    provides: opencode-first gateway swap with mimo reasoning + deepseek driver IDs
provides:
  - Live tracer smoke proving mimo-v2.6-pro + deepseek-v4.1-flash serve over Go chat/completions
  - Embeddings-only gateway (Gemini chat branch deleted, NIM sole fallback, fail-loud kept)
  - NER LLM fallback on the opencode driver model with a 12s bound
affects: [59-02 env-sync, 59-03 render-parity, ltm-embeddings]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
actuals:
  tokens: 5200
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns: [masked-only key checks in probe scripts, lazy in-function LLMGateway import in backend NLP paths]

key-files:
  created:
    - scripts/verify_llm_swarm.py
  modified:
    - agents/llm_gateway.py
    - backend/app/config.py
    - backend/app/nlp/ner_pipeline.py
    - backend/tests/test_llm_gateway.py

key-decisions:
  - "Delete (not gate) the gateway Gemini chat branch per the superseding embeddings-only lock"
  - "Load the real OPENCODE_API_KEY from local .env into process env for live probes (masked handling throughout, values never printed)"
  - "Run the tracer with --local-only and defer the row-7 chat leg to plan 59-03 (no local backend on :8000)"

patterns-established:
  - "Probe scripts print key status as set/len/prefix-class only — never key values (T-59-01)"
  - "Backend NLP modules import LLMGateway lazily inside the function (news_extractor/agent_router pattern)"

requirements-completed: [FR-3.9, FR-3.2]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Live smoke proves catalog + mimo + deepseek serve (rows 0/1/3 pass, row 7 deferred)"
    requirement: "FR-3.9"
    verification:
      - kind: integration
        ref: "scripts/verify_llm_swarm.py --local-only (TRACER PASS)"
        status: pass
      - kind: integration
        ref: "scripts/verify_opencode_models.py (exit 0, both IDs confirmed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Gateway is embeddings-only with opencode-first fail-loud preserved (two chat paths)"
    requirement: "FR-3.2"
    verification:
      - kind: unit
        ref: "backend/tests/test_llm_gateway.py (9 passed, incl. new test_chat_never_touches_embedding_key)"
        status: pass
    human_judgment: false
  - id: D3
    description: "NER LLM fallback routes through the opencode driver model inside a 12s bound, gazetteer-first kept"
    requirement: "FR-3.2"
    verification:
      - kind: unit
        ref: "backend/tests/test_llm_gateway.py (9 passed)"
        status: pass
      - kind: other
        ref: "inline NER check: gazetteer fast path + mocked driver parse + []-on-error (all OK)"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-17
status: complete
plan_head_before: ccca38766a44a413fde3dd5ffb7395c720e070ae
plan_head_after: b7c9e6f
---

# Phase 59 Plan 01: Tracer Smoke + Gemini-Embeddings-Only Cutover Summary

**Live mimo + deepseek completions proven over Go chat/completions, then both Gemini chat violators deleted so GEMINI_API_KEY scopes to LTM embeddings only — fail-loud honesty intact.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-10-17T00:59:12Z
- **Completed:** 2026-10-17T01:08:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Tracer `scripts/verify_llm_swarm.py` passes local-first: catalog exit 0 with both locked IDs, live mimo Indonesian completion (352 chars), live deepseek severity word (`medium`); row-7 chat leg deferred to plan 59-03 (no local backend); zero key values in any output.
- Gateway Gemini chat branch deleted outright (import + `genai.configure`/`GenerativeModel` block); exactly two chat paths remain — opencode primary fail-loud (byte-identical) and NIM last-resort fail-closed; `Settings.gemini_model` invalid default removed while `GEMINI_API_KEY` stays for `ltm.py`.
- NER fallback rewritten to `LLMGateway.generate_content` on the driver model with the existing JSON-array prompt under `asyncio.wait_for(12s)`, `[]` on any failure; gazetteer-first order and sanitize logic preserved; direct genai chat call gone.
- Repo-wide grep proves zero remaining `GenerativeModel(`/`gemini-3.8-flash`/`gemini_model` references; the only `genai` use left is `ltm.py` `embed_content` (embeddings, allowed).

## Task Commits

Each task was committed atomically:

1. **Task 1: Tracer end-to-end opencode live smoke** - `6de48f6` (feat)
2. **Task 2: Delete gateway Gemini chat branch + invalid default + retire pinning test** - `185b11f` (feat)
3. **Task 3: Neutralize NER LLM path to opencode driver** - `b7c9e6f` (feat)

**Plan metadata:** commit for this SUMMARY follows in the close-out step.

## Files Created/Modified

- `scripts/verify_llm_swarm.py` - One-pass live smoke for RESEARCH rows 0/1/3/7 with `--local-only` deferral and masked-only key status (created)
- `agents/llm_gateway.py` - Gemini chat branch + genai import deleted; docstrings/messages now opencode-first then NIM-or-raise (modified)
- `backend/app/config.py` - `gemini_model="gemini-3.8-flash"` field deleted (modified)
- `backend/app/nlp/ner_pipeline.py` - `extract_locations_llm` via driver model, 12s bound, `[]`-on-error (modified)
- `backend/tests/test_llm_gateway.py` - Pinning Gemini test retired; `test_chat_never_touches_embedding_key` added (both keys set, asserts opencode model verbatim + embedding key absent from headers + 4-field payload) (modified)

## Decisions Made

- **Delete over gate:** the superseding embeddings-only lock resolves RESEARCH option (a)-1 vs (a)-2 in favor of hard deletion — no revert path, no dead code carrying the invalid `gemini-3.8-flash` default.
- **Key sourcing:** shell had no `OPENCODE_API_KEY` but both `.env` files carry a real `oc`-prefix key (len 51); loaded into process env for probe runs only, masked handling throughout. Documented, not a plan change.
- **Row 7 deferral:** per the plan's own precondition, backend absent on `:8000` means `--local-only` and the chat leg moves to plan 59-03 — no checkpoint needed, plan explicitly allows it.
- **venv interpreter:** repo-global python lacks `google.generativeai`/`pytest`; `backend/.venv` is the working interpreter for all gateway/test/verify runs (catalog script is stdlib-only and runs anywhere).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used backend/.venv python for all gateway-dependent runs**
- **Found during:** Task 1 (tracer live smoke)
- **Issue:** Global `python` has no `google.generativeai`, so importing `agents.llm_gateway` failed before any live call. Installing packages is excluded from auto-fix (package-legitimacy gate).
- **Fix:** Used the existing `backend/.venv` interpreter (has genai, httpx, pytest) for the tracer and test runs; no installs, no env changes.
- **Files modified:** None (run-environment choice only)
- **Verification:** Tracer `TRACER PASS`; suite 9 passed
- **Committed in:** `6de48f6` (task commit; no extra commit needed)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Run-environment selection only; no scope or file change. No scope creep.

## Issues Encountered

- `OPENCODE_API_KEY` absent from shell env but present in `.env`/`backend/.env` (`oc` form) — resolved by loading into process env for probe subprocesses; values never printed (masked `set:yes len:51 prefix:oc` only).
- Parallel plan 59-02 committed 3 commits (`392dcd2`, `38883df`, `f55fdca`) to shared `main` interleaved with this plan's commits; file sets are disjoint (59-02: ltm/news_extractor/migrations/env-examples) so no conflicts. Raw ledger range `ccca387..HEAD` counts 6; this plan's measured commits = 3 (`6de48f6`, `185b11f`, `b7c9e6f`).
- Commits land directly on `main` per established project convention (all Phase 58 history is direct-to-main; solo-dev repo, no `allow_default_branch_commits` override configured).

## Known Stubs

None — no placeholders, TODOs, or unwired data sources introduced. New test asserts real behavior against mocked HTTP; tracer asserts real live completions.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. Key-material handling stayed masked-only (T-59-01 mitigated: verified no key value appears in tracer output).

## Deferred Observations (out of scope, not fixed)

- Dead `import google.generativeai as genai` lines remain (unused, no calls) in `agents/nodes/osint_hazard.py:4`, `agents/nodes/economic_intelligence.py:5`, `agents/nodes/decision_support.py:6` — outside this plan's `files_modified`; left for a future cleanup pass.
- Pre-existing working-tree modifications (`.env.example`, `backend/.env.example`, `render.yaml`, `.planning/ROADMAP.md`, untracked `probe_embed.py`) belong to another session (59-02 env-sync) — left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for plan 59-03: row-7 live chat leg (`POST /api/v1/agent/chat`, expect `degraded:false` + `SIG-OPENCODE-DRIVER-*`) plus Render parity probes against the embeddings-only tree.
- Gateway contract for 59-03's grep gate: zero Gemini chat paths; `ltm.py` embeddings untouched.

---
*Phase: 59-llm-swarm-post-key-audit*
*Completed: 2026-10-17*

## Self-Check: PASSED

- `scripts/verify_llm_swarm.py` FOUND; `agents/llm_gateway.py`, `backend/app/config.py`, `backend/app/nlp/ner_pipeline.py`, `backend/tests/test_llm_gateway.py` FOUND (all modified in this plan's commits).
- Commits `6de48f6`, `185b11f`, `b7c9e6f` all ancestors of their plan-time HEAD; file histories show only this plan's commits atop `ccca387`.
- Verifications re-run at close-out: catalog exit 0, tracer PASS (rows 0/1/3 + row-7 deferred), suite 9 passed, zero-`GenerativeModel` grep clean.
