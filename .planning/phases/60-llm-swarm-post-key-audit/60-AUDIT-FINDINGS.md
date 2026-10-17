# Phase 60 Audit Findings Ledger (59-03)

**Audited:** 2026-10-17 · **Scope:** 8-use-case live matrix (local) + local-vs-Render parity + retired-literal sweep
**Key rule (T-59-06):** masked key checks only — this ledger records endpoint status + shapes, never secrets or personal data.

## Verdict

- Swarm serves on the locked pair (`mimo-v2.6-pro` reasoning + `deepseek-v4.1-flash` driver, provider-default effort, no effort param anywhere).
- Local leg 10/10 · Render leg 10/10 (see parity table). Gateway suite 9/9 green.
- LTM embeddings externally blocked (HTTP 404, D-08 lock — model NOT switched). Three flakiness findings ledgered below; honesty markers hold on every path.

## Parity table (local vs Render)

Local = fresh uvicorn boot of the current tree on 127.0.0.1:8000 (stopped after the run).
Render = `https://peta-nadi.onrender.com` (warm, 0.47s health; dashboard redeploy NOT human-confirmed — see F-RENDER).

| Probe | Local | Render |
|---|---|---|
| GET /health `"status"` | PASS (69ms) | PASS (676ms) |
| GET /api/v1/agents/status `"active_agents"` | PASS (48ms, `warming`/0.0 pre-run per honesty rule) | PASS (350ms) |
| GET /api/v1/health/sources `BMKG` | PASS (628ms) | PASS (1209ms) |
| GET /api/v1/news/live?limit=2 `live` | PASS (322ms) | PASS (1193ms) |
| GET /api/v1/news/market-regime `volatility` | PASS (4863ms) | PASS (1141ms) |
| GET /api/v1/incidents?limit=2 `"id"` | PASS (212ms) | PASS (539ms) |
| GET /api/v1/corridor/context `corridor` | PASS (3615ms) | PASS (4547ms) |
| POST /api/v1/agent/chat `"degraded"` | PASS (7683ms) | PASS (6875ms) |
| POST /api/v1/simulate/stream events ≥2 | PASS (8 events) | PASS (8 events) |
| stream contains `decision_support` | PASS | PASS |

Render chat detail (terse "berapa biaya hedging?", synthetic POST per threat-model allowance):
`degraded:false`, conf 0.92, consensus true, `SIG-OPENCODE-DRIVER-8969BF`,
sources include `CPU Route Solver (NetworkX/OR-Tools)`, figures grounded
(Rp 2.850.000 / REROUTE / Tol MKTT / 48,5 km / 55 mnt / Rp 42.500.000).

Env note: msys-bash curl cannot reach Windows loopback in this executor
(connection refused; external hosts fine), so the local leg ran as an
equivalent curl.exe sequence with identical endpoints/assertions. The
committed `scripts/probe_parity.sh` is proven by the Render leg (10/10)
plus `bash -n` syntax check.

## Live matrix evidence (scripts/verify_llm_swarm.py --local-only, exit 0)

| Row | Use case / model | Result |
|---|---|---|
| 0 | catalog, both locked IDs | PASS-live (37 models) |
| 1 | decision_support brief / mimo | PASS-live (2591 chars, 3-section ID, 17 markers; marginal — see F-ROW1) |
| 2 | economic narrative / mimo | PASS-live (705 chars ID) |
| 3 | osint severity / driver | PASS-live (`medium`) |
| 4 | prediction overlay / driver 0.2 | PASS-live, grounded (35/22/14 + CIs quoted) |
| 5 | route explainer / driver 0.2 | PASS-live, grounded (REROUTE, 0.15, Rp 42500000, 48.5 km, 55 mnt) |
| 6 | news extraction / driver JSON merge | PASS-live schema-valid (LLM-merge 1/2 runs; heuristic stood 1/2 — see F-ROW6) |
| 7-live | chat declarative / driver 0.3 | PASS-live (`degraded:false`, driver sig, grounded Rp figures) |
| 7-shape | chat terse interrogative | RECORDED — honestly degraded this run (see F-ROW7); live on Render |
| 8a | ltm embed / Google only | DEGRADED-RECORDED — exact 404 (see F-LTM) |
| 8b | ltm query recall | RECORDED — 0 rows (empty-embedding; [] honest) |

Gateway suite: `backend/tests/test_llm_gateway.py` 9/9 passed (incl.
`test_opencode_branch_raises_on_empty_completion`,
`test_chat_never_touches_embedding_key`).

## Findings (file:line precision + disposition)

### F-ROW1-LATENCY — reasoning brief marginal vs fixed 30s gateway bound
- **Evidence:** `mimo-v2.6-pro` brief-size prompts timed out 3/5 attempts
  (`LLMGatewayUnavailable` after 30s); 1-sentence prompts serve in ~12s.
  One run served the full 3-section brief live (2591 chars).
- **Files:** `agents/llm_gateway.py:137` (`timeout=30.0`, fixed);
  `agents/nodes/decision_support.py:139-147` (awaits gateway with no outer
  bound; deterministic `[ESTIMASI DETERMINISTIK …]` fallback stands — honest).
- **Disposition:** follow-up phase candidate (per-call timeout policy or
  brief-prompt slimming). NOT changed here — timeout bounding is D-06
  intent and shared-gateway retuning is architectural scope. Probe carries
  one annotated retry; marginality is not hidden.
- **Status:** fixed-in-phase (probe) / follow-up (product timeout policy)

### F-ROW7-SHAPE — driver empty-completion intermittency on terse interrogatives
- **Evidence:** `deepseek-v4.1-flash` returned EMPTY completions for
  "berapa biaya hedging?" / "biaya hedging reroute?" on 4 attempts across
  runs (gateway raises on empty per contract), then served one live;
  declarative phrasing serves live reliably. Render served the SAME terse
  prompt live (`degraded:false`, driver sig) → model-side flake, not
  endpoint logic.
- **Files:** `agents/llm_gateway.py:140-147` (empty → `LLMGatewayUnavailable`,
  fail-loud per D-05); `backend/app/routers/agent_router.py:210-270`
  (honest degraded: `degraded:true`, 0.62, consensus false, sensor-only
  sources — proven live this phase).
- **Disposition:** follow-up phase candidate (single-retry-on-empty policy
  is a planner decision; NOT implemented — fail-loud D-05 kept).
- **Status:** recorded / follow-up candidate

### F-ROW6-FLAKY — extractor LLM-merge intermittency
- **Evidence:** `extract_structured_news` fixture run merged LLM JSON 1/2
  runs (`severity=high`, `type=flood`, ID summary); heuristic baseline stood
  1/2 runs. Schema enums valid both ways; heuristic fallback logs `warning`.
- **Files:** `backend/app/nlp/news_extractor.py:181-212` (35s outer over 30s
  inner per 59-02; JSON-merge with heuristic fallback).
- **Disposition:** deferred-with-reason (schema contract holds on both paths;
  merge variance is model-output noise, not a contract break).
- **Status:** recorded / deferred

### F-LTM-404 — text-embedding-004 unreachable for the current key (D-08 lock)
- **Evidence:** direct error `NotFound: 404 models/text-embedding-004 is not
  found for API version v1beta, or is not supported for embedContent`;
  live ListModels embed-capable: `models/gemini-embedding-001`,
  `models/gemini-embedding-2-preview`, `models/gemini-embedding-2`.
  `embed_text` → `[]`; `query_ltm` → 0 rows (honest). Matches 59-02 evidence.
- **Files:** `agents/memory/ltm.py:16-49` (12s bound, `[]`-on-error);
  `agents/memory/ltm.py:52-103` (`match_episodes` RPC also absent live, per 59-02).
- **Disposition:** follow-up phase (resolve embedding availability, create
  `match_episodes(vector(768))` RPC, run migration step-4 re-embed). Model
  NOT switched — one-way distribution shift per D-08 (Rule-4 scope).
- **Status:** recorded / follow-up phase candidate

### F-RENDER — dashboard redeploy unconfirmed (user_setup remains open)
- **Evidence:** Render serves 10/10 probes; dashboard access is unavailable
  from this executor, so post-59-01/59-02 redeploy is unconfirmed.
- **Disposition:** user setup still requested — confirm `OPENCODE_API_KEY` +
  `GEMINI_API_KEY` (+ optional DeepSeek NIM keys) in Render Dashboard →
  prehub-backend → Environment, then Manual Deploy; warm-up GET /health
  (cold start 30-50s expected).
- **Status:** user-action requested

## Retired-literal sweep (extra gate — zero hits confirmed)

Case-insensitive `cuopt|fourcastnet|earth2` over backend/agents/frontend
(`lib,components,hooks,app`)/env-examples/`render.yaml`/docs, excluding
`.planning` history, `docs/legacy_hackathon_archive`, `test-results`,
gitignored `.env`:

- Hits fixed this plan: `docs/video/TEAM_INFO.md:66` (tech-stack line →
  CPU routing/Open-Meteo naming); `backend/app/routers/agent_router.py:134`
  (chat docstring → `mimo-v2.6-pro` + `deepseek-v4.1-flash` at temp 0.3;
  the D-06 `grep -q mimo-v2.6-pro` gate passes).
- `gemini-3.8-flash|3.5-flash-lite` over agents/backend/scripts: zero hits
  (docstring fix was the last residue).
- Known non-hits (intentional, untouched): `scripts/verify_codebase_consistency.py:30`
  (buzzword-detector must contain the strings to detect them — enforces the
  purge on frontend); live `.env` key NAMES (gitignored secrets, per 59-04 rule).
- 59-04 substitution check: `scripts/probe_parity.sh` references no purged
  path — no `/routing/optimize-cuopt`, no `lrip:cache:earth2`, no adapter
  filenames. No substitution needed; nothing reverted.

## Deferred observations (out of scope, not fixed)

- `docs/video/TEAM_INFO.md:66` still lists `Gemini 3.1 Flash, DeepSeek V3.2`
  (stale vs locked opencode pair) — outside the banned-literal gate; left for
  a docs-refresh pass.
- Local SSE `simulation_complete` carries `copilot_summary` from
  `decision_support_output`; full LangGraph recall paths (Redis/Supabase)
  were live during the local boot (supabase PATCH 200s in server log).
