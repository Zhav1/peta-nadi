---
status: testing
phase: 60-llm-swarm-post-key-audit
source: [60-01-SUMMARY.md, 60-02-SUMMARY.md, 60-03-SUMMARY.md, 60-04-SUMMARY.md]
started: 2026-10-17
updated: 2026-10-17
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running backend. Start the API from scratch (fresh uvicorn boot of the
  current tree, with Redis reachable). Server boots with no import errors despite
  the deleted cuopt_adapter.py, renamed open_meteo_adapter.py / cpu_routing_service.py,
  and rotated Redis keys (lrip:cache:open_meteo). GET /health returns 200 live data.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running backend. Fresh uvicorn boot of the current tree with Redis reachable: no import/startup errors (cuopt_adapter deleted, adapters renamed, Redis keys rotated). GET /health returns 200 with live data.
result: [pending]

### 2. LTM embedding availability decision
expected: A product decision is recorded for the text-embedding-004 HTTP 404 (key only lists gemini-embedding-001/2 as embed-capable): either keep text-embedding-004 and fix key/model access, switch embedding model via a new migration + re-embed (one-way, breaks D-08 lock — needs explicit override), or defer LTM recall to a later phase (Agent 5 keeps honest base multiplier 1.05).
result: [pending]

### 3. Pytest suites green where pytest exists
expected: In an env with pytest installed, `python -m pytest backend/tests/test_llm_gateway.py backend/tests/test_cpu_routing_weather.py -v` passes (gateway 9/9 incl. test_chat_never_touches_embedding_key; CPU routing/weather incl. renamed tests). No new failures vs the AST + tsc proofs already recorded.
result: [pending]

### 4. Render dashboard redeploy confirmed
expected: Render Dashboard → prehub-backend → Environment holds OPENCODE_API_KEY + GEMINI_API_KEY (plus optional DeepSeek NIM keys); stale GOOGLE_API_KEY / NVIDIA_CUOPT / NVIDIA_FOURCASTNET vars removed. Manual Deploy run, warm-up GET /health passes after 30-50s cold start, and one Render probe (e.g. GET /api/v1/news/live) returns live data.
result: [pending]

### 5. Live smoke proves catalog + mimo + deepseek serve (rows 0/1/3 pass, row 7 deferred)
expected: scripts/verify_llm_swarm.py --local-only exits TRACER PASS; scripts/verify_opencode_models.py exits 0 with both locked IDs confirmed.
result: pass
source: automated
coverage_id: 60-01-D1

### 6. Gateway is embeddings-only with opencode-first fail-loud preserved
expected: backend/tests/test_llm_gateway.py 9 passed, incl. new test_chat_never_touches_embedding_key; exactly two chat paths (opencode fail-loud, NIM fail-closed).
result: pass
source: automated
coverage_id: 60-01-D2

### 7. NER LLM fallback on opencode driver inside 12s bound, gazetteer-first kept
expected: Gateway suite 9 passed; inline NER check OK (gazetteer fast path + mocked driver parse + []-on-error).
result: pass
source: automated
coverage_id: 60-01-D3

### 8. 768-dim pgvector migration plus corrected fresh-install schema
expected: vector(768) in 001 file + 000_init.sql (MIGRATION-PINNED); atttypmod + IF EXISTS + TRUNCATE present (MIGRATION-IDEMPOTENT); live width proven vector(1536) routing to MIGRATE.
result: pass
source: automated
coverage_id: 60-02-D1

### 9. Bounded embedding (12s) and extraction (35s outer) timeouts with honest fallback
expected: py_compile true; wait_for + timeout=35.0 + warning-log greps pass.
result: pass
source: automated
coverage_id: 60-02-D2

### 10. Env contracts synchronized, stale key alias removed
expected: GEMINI_MODEL in .env.example, OPENCODE_API_KEY in backend/.env.example, GEMINI_MODEL in render.yaml (ENV-SYNC-OK); non-comment GOOGLE_API_KEY count 0 (ALIAS-REMOVED); no secret values in examples (NO-SECRET-LEAK).
result: pass
source: automated
coverage_id: 60-02-D3

### 11. Backend purge compiles and scoped grep returns zero hits
expected: Python AST parse over 15 touched backend files; case-insensitive cuopt|fourcastnet|earth2 grep over live scope returns zero.
result: pass
source: automated
coverage_id: 60-04-D1

### 12. Frontend typecheck passes after endpoint/prop renames
expected: npx tsc --noEmit in frontend/ clean (tsc 5.9.3).
result: pass
source: automated
coverage_id: 60-04-D2

### 13. Retired-literal sweep zero, chat docstring names locked pair
expected: grep mimo-v2.6-pro in agent_router.py (DOCSTRING-OK); zero gemini-3.8-flash/3.5-flash-lite in agents/backend/scripts; zero cuopt|fourcastnet|earth2 repo-wide per extra-gate scope.
result: pass
source: automated
coverage_id: 60-03-D1

### 14. Rows 0-7 live on locked models with honesty asserts
expected: verify_llm_swarm.py --local-only exit 0 (rows 0-7 LIVE, 8a DEGRADED-RECORDED, 8b RECORDED); gateway suite 9 passed.
result: pass
source: automated
coverage_id: 60-03-D2

### 15. Parity table filled local-vs-Render, every gap ledgered
expected: probe_parity.sh vs Render 10/10; local curl.exe equivalent 10/10; findings in 60-AUDIT-FINDINGS.md file:line.
result: pass
source: automated
coverage_id: 60-03-D3

## Summary

total: 15
passed: 11
issues: 0
pending: 4
skipped: 0

## Gaps

[none yet]
