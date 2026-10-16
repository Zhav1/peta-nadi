# Phase 58: opencode-go Swarm LLM Migration and Render Parity — Research

**Researched:** 2026-10-14
**Domain:** LLM gateway migration (Google Gemini + NVIDIA NIM → opencode Go subscription) + Render deploy parity
**Confidence:** HIGH (endpoint/model/embedding claims verified against official opencode docs fetched this session; codebase claims read in full; live Render probes executed this session)

## Summary

The migration is a **gateway swap, not a swarm redesign**. All four current LLM call sites (`osint_hazard`, `economic_intelligence`, `decision_support`, `/simulation/chat`) already funnel through `LLMGateway.generate_content(prompt, system_instruction, model_name, temperature)`, so the opencode branch slots into one file plus per-node model selection. The official opencode docs confirm both shortlisted model IDs (`mimo-v2.6-flash-free`, `deepseek-v4.1-flash`) live on the OpenAI-compatible `https://opencode.ai/inference/v1/chat/completions` endpoint — matching D-02 exactly. There is **no embeddings endpoint** in the opencode catalog, so LTM stays on Google `text-embedding-004` (D-05 fallback becomes the decision). Live Render probes show the deploy is healthy but drifting: `/health` still reports `environment: development` despite `render.yaml` now reading `production`, TomTom is `degraded`, NASA FIRMS `last_seen` is 2026-07-18 (~3 months stale), and the `/incidents` API returns `id` while `get_hazard_polygons` reads `row["incident_id"]` — the drift is live, not theoretical.

**Primary recommendation:** Implement opencode as a first-priority branch in `llm_gateway.py` against `https://opencode.ai/inference/v1/chat/completions` with `OPENCODE_*` config, keep `LLMGatewayUnavailable` fail-loud, keep LTM embeddings on Google, fix the `incident_id` read path, and sync the full env set to Render.

## Endpoint Verification

Verified against official docs fetched this session (`https://opencode.ai/v2/docs/console/api/inference` and `https://opencode.ai/v2/docs/console/models`).

- **Chat completions URL (D-02 CONFIRMED):** `POST https://opencode.ai/inference/v1/chat/completions` — this is the exact endpoint the official models table lists for every OpenAI-compatible model including `deepseek-v4.1-flash`, `deepseek-v4-flash`, `deepseek-v4-pro`, and `mimo-v2.6-flash-free` (all tagged `@ai-sdk/openai-compatible`). [VERIFIED: opencode.ai/v2/docs/console/models endpoints table]
- **Alternate form (flag for planner):** The inference API page also documents `POST https://opencode.ai/inference/openai/v1/chat/completions` with an identical payload shape. Both forms are officially documented; the `/inference/v1/...` form is the one tied to the model IDs in the endpoints table. Planner must make the base URL a single constant and verify at build with `GET https://opencode.ai/inference/v1/models` (documented live catalog endpoint), failing loud on mismatch. [VERIFIED: opencode.ai/v2/docs/console/api/inference]
- **Auth:** `Authorization: Bearer <token>` where the token is the Go subscription / console service-account key. Paid models require the header; free chat models can be called without it — planner must always send it. [VERIFIED: opencode.ai/v2/docs/console/api/inference]
- **Payload (OpenAI-compatible):** `{"model": "<id>", "messages": [{"role": "system"|"user", "content": "..."}], "temperature": <float>, "max_tokens": <int>}`. Response: `choices[0].message.content`. This matches the existing NIM branch payload/response parsing in `llm_gateway.py:99-116` line-for-line, so the opencode branch reuses the same code with URL + key + model swapped. [VERIFIED: opencode.ai/v2/docs/console/api/inference + agents/llm_gateway.py:99-116]
- **Temperature / max_tokens conventions (D-02 CONFIRMED):** temp 0.2 reasoning / 0.3 chat maps exactly onto current call sites — gateway default `temperature=0.2` (`llm_gateway.py:38`), chat uses `temperature=0.3` (`agent_router.py:193`), `max_tokens=1024` (`llm_gateway.py:108`). Keep both values unchanged. [VERIFIED: agents/llm_gateway.py:33-39,108 + backend/app/routers/agent_router.py:190-194]
- **Timeout:** keep `timeout=30.0` on the httpx call; if opencode p99 latency proves high in staging, apply the Phase 57 D5 pattern (BackgroundTasks + progress guard) rather than raising the timeout silently. [CITED: .planning/phases/57-pilot-hardening-e2e-audit-remediation/57-CONTEXT.md D5]
- **What was NOT verified:** no live authenticated call was made (no `OPENCODE_API_KEY` available in this environment); catalog contents beyond the docs page (85-model count, Go-subscription-specific IDs) are per CONTEXT D-01/D-04 and must be re-verified at build time against `GET /inference/v1/models`. [ASSUMED — see Assumptions Log A1]

## Model Routing Table

All IDs verified verbatim against the official models table this session. No `mimo` pro-tier ID exists in the catalog — only `mimo-v2.6-flash-free` and `mimo-v2.5-free`.

| Role (per D-01) | Model ID | Endpoint | Pricing | Call sites |
|---|---|---|---|---|
| Reasoning (decision_support summary + economic narrative) | `mimo-v2.6-flash-free` (default; pro-ID override only if build-time catalog lookup finds one) | `https://opencode.ai/inference/v1/chat/completions` | Free (limited time) | `agents/nodes/decision_support.py:134-138`, `agents/nodes/economic_intelligence.py:114-117` |
| Driver (osint severity + simulation/chat) | `deepseek-v4.1-flash` | `https://opencode.ai/inference/v1/chat/completions` | $0.30 / $1.20 per 1M tokens | `agents/nodes/osint_hazard.py:128-131`, `backend/app/routers/agent_router.py:190-194` |
| Not used | `deepseek-v4-flash` ($0.14/$0.28), `deepseek-v4-pro` ($1.74/$3.48) | same | — | Rejected: v4.1-flash matches the Phase 55 catalog-verified NIM ID; do not substitute without planner sign-off |
| Not needed | `deepseek-v4-flash-vision-exp` | same | — | Rejected per CONTEXT: payloads are JSON text, no vision path |

[VERIFIED: opencode.ai/v2/docs/console/models — IDs `mimo-v2.6-flash-free`, `deepseek-v4.1-flash`, `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp` quoted verbatim from the Model ID column; pricing from the same page]

- **Pro-ID override procedure (the agent's discretion item):** at build, `curl https://opencode.ai/inference/v1/models` with the Go key, grep for `mimo` IDs; if a non-free `mimo-*` ID appears, set `OPENCODE_REASONING_MODEL` to it, else ship `mimo-v2.6-flash-free`. Record the resolved ID in the plan walkthrough. [ASSUMED — see A1]
- **Privacy note for planner:** the official privacy section states free-period models including `MiMo-V2.6-Flash Free` may use collected data to improve the model. Payloads sent are crisis telemetry + commodity stats (no PII per Phase 11 UU 27/2022 sweep), but the plan must note this and must never send operator PII. [VERIFIED: opencode.ai/v2/docs/console/models privacy section]
- **Config keys (D-04):** add `opencode_api_key: str = ""`, `opencode_reasoning_model: str = "mimo-v2.6-flash-free"`, `opencode_driver_model: str = "deepseek-v4.1-flash"` to `Settings` in `backend/app/config.py` (current keys listed at `config.py:29-35`; no `OPENCODE_*` exists today). Mirror in `.env.example` (currently ends at `DEMO_OFFLINE`, no LLM-opencode section) and `render.yaml` (currently 8 vars, no LLM keys). `get_settings()` is `lru_cache`d so all nodes inherit after one edit. [VERIFIED: backend/app/config.py:5-46 + .env.example:1-61 + render.yaml:1-25]

## Embedding Decision

**Decision: keep LTM embeddings on Google `text-embedding-004`. Do NOT move to opencode (D-05 fallback becomes the plan).**

- The official docs enumerate exactly five API families: OpenAI Chat Completions, OpenAI Responses, Anthropic Messages, Gemini (`:generateContent`), and SystemOne (structured decisions). **No `/embeddings` endpoint exists** anywhere in the inference or models documentation. [VERIFIED: opencode.ai/v2/docs/console/api/inference endpoints table — absence confirmed by reading the full page]
- Current LTM path (`agents/memory/ltm.py:16-40`) uses `genai.embed_content(model="models/text-embedding-004", ...)` producing 768-dim vectors queried via Supabase RPC `match_episodes` (`ltm.py:63-72`). Changing embedding models would invalidate every stored pgvector row (dimension + distribution shift) — a data migration, not a config swap. [VERIFIED: agents/memory/ltm.py:16-72]
- **Planner instruction:** leave `ltm.py:embed_text` on Google; gate on `settings.gemini_api_key` as today. The `GEMINI_API_KEY` env var must therefore stay in the Render sync list even after the chat migration. Empty-embedding → `query_ltm` returns `[]` and Agent 5 degrades gracefully to base multiplier 1.05 (`economic_intelligence.py:62`) — this deterministic degradation is honest and must be preserved, not "fixed" with synthetic episodes. [VERIFIED: agents/memory/ltm.py:54-58 + agents/nodes/economic_intelligence.py:61-62]

## Swarm Audit Findings

Read in full this session: all 6 nodes, `graph.py`, `state.py`, `consensus_gate.py`, `agent_worker.py`, `agent_router.py`, `stm.py`, `ltm.py`, `supabase_tools.py`.

### LLM call sites today (4 — the migration surface)

| # | File:line | Purpose | Model arg today | Temp | Fail behavior |
|---|---|---|---|---|---|
| 1 | `agents/nodes/osint_hazard.py:128-131` | Severity classify, only if `source == "social"` + raw text present | `settings.gemini_model` | default 0.2 | Exception → keeps normalized severity, logs error (safe: numbers stay deterministic) |
| 2 | `agents/nodes/economic_intelligence.py:114-117` | 2–3 sentence inflation narrative | `settings.gemini_model` | default 0.2 | Rejects degraded markers (`FALLBACK`, `CRISIS EXECUTIVE SUMMARY`, `MOCKED`), falls back to deterministic `narrative` string (`:118-128`) — the honest pattern to copy |
| 3 | `agents/nodes/decision_support.py:134-138` | Executive summary (3 fixed Indonesian sections) | `settings.gemini_model` | default 0.2 | Rejects `FALLBACK`/`CRISIS EXECUTIVE SUMMARY`, keeps deterministic `summary_text` (`:139-140`); note the deterministic fallback embeds hardcoded figures (Rp values, 12.8%, Tol MKTT at `:104-117`) — acceptable only as last-resort deterministic text, flag for Phase 56 honesty review if it ever surfaces in UI without live grounding |
| 4 | `backend/app/routers/agent_router.py:190-194` | `/simulation/chat` advisor reply | default (gemini) | 0.3 | Falls through to keyword-template dynamic engine (`:199-233`) — **this is canned prose by another name**; D-03 requires the planner to either route it through opencode fail-loud or label it honestly. Minimum: keep `LLMGatewayUnavailable` propagation and mark template replies with a `degraded: true` flag in the response |

[VERIFIED: file:line citations above, all read this session]

### Deterministic nodes (no LLM — do not touch)

- **Agent 1 data_collection** (`agents/nodes/data_collection.py:19-105`): validation + SHA dedup + source-health confidence map (green 0.9 / yellow 0.6 / red 0.3). Simulations bypass dedup. No LLM. [VERIFIED]
- **Agent 3 prediction** (`agents/nodes/prediction.py:12-157`): numpy polyfit extrapolation on Redis TomTom keys + Earth-2 adjustments + wildfire ×1.3. No LLM. Note: `incidents` history query at `:61` selects `incident_id` — same drift as below. [VERIFIED]
- **Agent 4 route_optimization** (`agents/nodes/route_optimization.py:65-375`): NetworkX DiGraph + severity penalties (×1.5/×3.0/×10.0/9999.0 blocked) + spoilage hedging + BKHIT/MST compliance + choke-point multiplier. No LLM. Excluded from consensus voting per FR-11.2. [VERIFIED]

### Must-preserve contracts (D-14)

- **DAG topology** (`agents/graph.py:32-82`): 4 stages, fan-out data_collection → {osint_hazard, prediction}, fan-in → consensus_gate → conditional → economic_intelligence → route_optimization → decision_support → END. Gateway swap only; no edge changes. [VERIFIED]
- **Consensus formula** (`agents/tools/consensus_gate.py:128-190`): `P = 1 − Π(1 − w_k·p_k)` over 4 channels (weather 0.35, traffic 0.35, osint 0.30, economics 0.20) with temporal (λ=0.05/h) + spatial (d₀=25km) decay, calibrated normalization, gate at ≥0.85 + ≥2 sources (sim bypass keeps 2-source rule, floors confidence to 0.90). Untouched. [VERIFIED]

### Drift + state findings (D-07 — all confirmed live)

1. **`incident_id` vs `id` drift — LIVE, fix required.** Write path tolerates both (`supabase_tools.py:50`: `res.data[0].get("incident_id") or res.data[0].get("id", "")`), but read path `get_hazard_polygons` does `row["incident_id"]` (`supabase_tools.py:78`) — a `KeyError` if rows carry `id`. The live `/api/v1/incidents` probe this session returned items with `"id": "d52cf5ff-..."` and **no `incident_id` field**. `prediction.py:61` also selects `incident_id`. Planner must normalize with `.get("incident_id") or .get("id")` at both read sites. [VERIFIED: agents/tools/supabase_tools.py:50,78 + agents/nodes/prediction.py:61 + live probe `GET /api/v1/incidents?limit=2` returning `"id"` keys]
2. **MemorySaver is in-memory** (`backend/app/workers/agent_worker.py:13-15`: module-level `_memory = MemorySaver()`). Restart wipes checkpoint threads; Redis STM (`lrip:crisis:*`, TTL 86400) is the durable path but `save_crisis_state` is never called from the worker — state survives only in-process. Acceptable for free-tier pilot; planner must document "restart loses in-flight stream checkpoints, Supabase `incidents` remains source of truth." [VERIFIED: backend/app/workers/agent_worker.py:12-15 + agents/memory/stm.py:38-48]
3. **`AGENT_STATUS_STORE` seeded `complete`** (`backend/app/routers/agent_router.py:18-67`): all 6 agents boot as `complete` with static confidences (0.82–0.92) and `last_run_at` = import time. Live probe confirmed `average_confidence: 0.87` with `last_run_at` timestamps predating the probe — i.e. **seeded, not measured**. Honesty guardrail: planner must either reset to `idle` at boot or label the endpoint "last-known" until a real run updates it; the DecisionSupportCopilot seed summary still cites "DeepSeek R1" reasoning which will be false post-migration — update the seed string. [VERIFIED: backend/app/routers/agent_router.py:18-77 + live probe `GET /api/v1/agents/status`]
4. **`demo_offline` canned mock survives** (`agents/llm_gateway.py:47-49` returns a hardcoded `CRISIS EXECUTIVE SUMMARY ... (mocked fallback)`). D-03 fail-loud applies to all production paths; the mock may remain **only** behind `DEMO_OFFLINE=true` and must never leak into Render (planner: assert `DEMO_OFFLINE=false` in render.yaml + add a boot log line). Phase 57 D6 explicitly rejects mock-economy injection. [VERIFIED: agents/llm_gateway.py:46-49 + 57-CONTEXT.md D6]
5. **Test surface:** 18 test files in `backend/tests/` including `test_llm_gateway.py` (fail-loud contract: catalog-ID pin, raises-when-keyless, raises-on-NIM-failure), `test_agents.py`, `test_consensus_calibration.py`, `test_api_routers.py`, `test_auth_rbac.py` (guest-403 — do not regress per 57 D1). Planner must extend `test_llm_gateway.py` with opencode-branch tests (success parse, `LLMGatewayUnavailable` on 401/404/empty, degraded-marker rejection) and keep the NIM tests until Gemini/NIM removal is separately decided (out of scope: D-01 is migration, not deletion — planner locks whether old branches stay as fallback-off or are removed; recommendation: keep code paths but leave keys empty so they fail closed into `LLMGatewayUnavailable`). [VERIFIED: backend/tests/ listing + backend/tests/test_llm_gateway.py:1-42]
6. **SSE trace:** `POST /api/v1/simulate/stream` (`agent_router.py:247-304`) builds a simulation event and streams `process_crisis_event` chunks (`simulation_started` → per-node `node_update` → `simulation_complete`|`error`). Reuse for live verification traces. [VERIFIED]

## Render Parity Matrix

Probed live this session against `https://peta-nadi.onrender.com` (local backend was not running; local column = codebase truth).

| Probe | Local (code) | Render (live, this session) | Gap / action |
|---|---|---|---|
| `GET /health` | `main.py` returns env from settings | `{"status":"ok","version":"0.1.0","environment":"development"}` | **Drift:** `render.yaml:12-13` already reads `ENVIRONMENT=production`, but live still reports `development` → Render dashboard env override or stale deploy. Planner: set dashboard var + redeploy, then re-probe. |
| `GET /api/v1/agents/status` | Seeded store, 6 agents | `healthy`, 6 agents, avg 0.87, `last_run_at` = deploy time (seeded) | Seeded-not-live (see finding 3). No action beyond honesty label. |
| `GET /api/v1/health/sources` | Supabase `source_health` + fallbacks | BMKG healthy, **TomTom degraded**, AISstream healthy, **NASA FIRMS healthy but `last_seen` 2026-07-18 (~3 mo stale)** | TomTom 403/backoff path (Phase 55) holding; FIRMS needs freshness label in UI (gods-eye honest-stale rule). No new code unless planner adds stale-threshold badges. |
| `GET /api/v1/news/live` | Supabase cache, 3-min TTL | `live`, 60/60 articles, TIER_1_OFFICIAL, `link_alive: alive` tagging present (Phase 56 WP4 intact) | Parity OK. |
| `GET /api/v1/news/market-regime` | Classifier | `EARLY_WARNING_ACTIVE`, volatility 0.05, 0 critical / 1 early-warning | Parity OK. |
| `GET /api/v1/incidents` | Supabase select | Returns `"id"` keys, no `incident_id` | **Drift live** (see finding 1). Fix read sites. |
| `POST /api/v1/simulate/stream` | SSE generator | Not probed (POST stream via webfetch infeasible) | Planner: verify with `curl -N` locally + against Render post-deploy; expect cold-start delay on first hit. |
| Corridor 979ms sequential note (D-12) | Codebase aggregator | Not re-measured | [ASSUMED — see A2] Carry the note; planner adds timing log, not a fix. |
| Cold start 30–50s (D-12) | n/a | Not measured (probes returned warm) | [ASSUMED — see A2] Keep `keep-alive.yml` `*/10` cron (verified present, 3-step ping: `/health` + `/health/sources` + Supabase REST). [VERIFIED: .github/workflows/keep-alive.yml:1-56] |

### Env sync (D-10)

`render.yaml` today holds **8 vars** (CONTEXT's "only 5" is stale): `APP_NAME`, `ENVIRONMENT=production`, `GOOGLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `REDIS_URL`, `TOMTOM_API_KEY` — all but the first two `sync: false`. [VERIFIED: render.yaml:1-25]

Missing and required for this phase: `OPENCODE_API_KEY`, `OPENCODE_REASONING_MODEL`, `OPENCODE_DRIVER_MODEL` (new); `GEMINI_API_KEY` (keep — LTM embeddings); `AISSTREAM_API_KEY`, `NASA_FIRMS_MAP_KEY`, `CORS_ORIGINS`, `APP_URL`, `PREHUB_DB_PATH`, `DEMO_OFFLINE=false`, `SUPABASE_ANON_KEY`/`JWT_SECRET` (verify against dashboard before adding secrets to yaml — prefer dashboard-only for secret values, yaml for non-secret defaults). `GEMINI_MODEL` is code-defaulted (`config.py:30`) and needs no Render var unless overriding.

### SQLite vs Supabase (D-13)

`PREHUB_DB_PATH=/app/data/prehub_local.db` (`.env.example:54`, `docker-compose.yml:34`) is the offline decision-trace fallback (`backend/app/db/local_storage.py`); Render free-disk is ephemeral → planner documents Supabase as source of truth and treats local rows as write-through cache. No `backend/.env` exists in repo (glob confirmed absent) — good; planner must not create one with real secrets. [VERIFIED: .env.example:54 + glob backend/.env absent + Phase 38 walkthrough references]

## Expansion Proposal

Constraints: DAG + consensus untouched (D-14), numbers stay deterministic, opencode-first fail-loud, no canned prose (D-03/D-15, Phase 56 honesty).

**Recommended: (A) Prediction narrative wrapper — approve. (B) Routing explainer — approve as prose-only. Both, in that order.**

- **(A) Prediction narrative (Agent 3).** Today Agent 3 emits only numbers + a templated summary (`prediction.py:132-144`). Add an opencode-driver (`deepseek-v4.1-flash`, temp 0.2) call that narrates the already-computed `congestion_forecast` dict in 1–2 Indonesian sentences. Contract: forecast numbers are injected into the prompt as ground truth with instruction "do not invent numbers; cite only the given horizons"; on `LLMGatewayUnavailable`, keep the current templated summary (deterministic, honest). Risk: minimal — pure prose overlay, confidence formula untouched (Agent 3 confidence stays code-computed at `:117-130`).
- **(B) Routing explainer (Agent 4).** Today Agent 4 emits route descriptions from path nodes (`route_optimization.py:256-260`). Add an opencode-driver call producing a 1–2 sentence "why this route" explainer from the computed top-3 (`distance_km`, `eta_minutes`, `risk_score`, hedging `optimal_policy`) with the same do-not-invent-numbers instruction; on failure, keep the templated `desc`. Never let the LLM alter waypoints/ETA. Risk: low — same overlay pattern; slightly higher review burden because hedging Rupiah figures must pass through verbatim (Phase 57 D6: no canned figures — pass-through of computed values is compliant, invention is not).
- **Explicitly out:** data_collection (validation must stay code), consensus_gate (formula locked), economic narrative already covered, decision_support already covered. No new nodes, no new edges, no state-schema changes beyond optional `*_narrative` string fields (planner decides; recommendation: reuse `summary`/`data` slots, no schema change).
- **Model assignment under expansion:** reasoning model (mimo) reserved for decision_support + economic narrative; driver model (deepseek) for osint severity, prediction narrative, routing explainer, and chat. Keeps cost profile (mimo free, deepseek-v4.1-flash $0.30/$1.20) predictable.

## Risks

| # | Risk | Severity | Mitigation (planner must include) |
|---|---|---|---|
| R1 | Dual endpoint forms (`/inference/v1/...` vs `/inference/openai/v1/...`); wrong one 404s at runtime | HIGH | Single configurable base URL + build-time `GET /models` verification task; fail-loud `LLMGatewayUnavailable` on 404 (already the contract) |
| R2 | No mimo pro ID in public catalog; Go subscription may expose a different ID or none | MEDIUM | Ship `mimo-v2.6-flash-free` default; pro-override lookup task at build (agent's discretion); never block deploy on pro absence |
| R3 | Free-tier mimo data-use (prompts may train future models) | MEDIUM | Never send PII; note in plan; crisis telemetry only (already PII-free per Phase 11 sweep) |
| R4 | `incident_id` KeyError crashes `get_hazard_polygons` on live schema | HIGH | Normalize `.get("incident_id") or .get("id")` at `supabase_tools.py:78` + `prediction.py:61`; regression test with `id`-only rows |
| R5 | Seeded `AGENT_STATUS_STORE` misread as live health; stale "DeepSeek R1" seed string post-migration | MEDIUM | Boot state `idle` or "last-known" label; update DecisionSupportCopilot seed summary to opencode models |
| R6 | `/simulation/chat` keyword templates read as AI output (Phase 56 honesty) | MEDIUM | Flag template replies `degraded: true` or route fail-loud; never present templates as model reasoning |
| R7 | `DEMO_OFFLINE` mock leaking to production | HIGH | Pin `DEMO_OFFLINE=false` in render.yaml; boot assertion log; Phase 57 D1–D8 untouched (RBAC tests, no mock resurrection, background-news pattern) |
| R8 | opencode latency on chat path degrading UX | LOW | Keep 30s timeout; apply 57-D5 BackgroundTasks pattern if staging shows slowness; keep-alive cron unchanged |
| R9 | TomTom degraded + FIRMS 3-month-stale eroding consensus inputs | MEDIUM | No code fix in this phase; ensure stale/degraded labels surface (pilot lens D-16, gods-eye rule); consensus decay math already discounts old timestamps |
| R10 | MemorySaver loss on Render restart/redeploy | LOW | Document; Supabase `incidents` is source of truth; no action |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|---|---|---|
| A1 | Catalog holds 85 models; Go subscription exposes mimo reasoning + deepseek driver under the documented IDs; no mimo pro ID exists | Endpoint / Routing | Wrong default model → 404 at runtime; mitigated by build-time catalog check (R1/R2) |
| A2 | Cold start 30–50s; corridor sequential ~979ms (carried from CONTEXT/discussion notes, not measured this session — probes returned warm) | Parity Matrix | Planner schedules perf verification rather than assuming the numbers |
| A3 | `GET /inference/v1/models` is reachable without auth for catalog verification (docs show unauthenticated curl; free models callable without header) | Endpoint | Build check needs the key; harmless — key will exist at build |

## Open Questions (for planner lock, not research gaps)

1. Keep or delete the Gemini/NIM branches after opencode lands? Recommendation: keep code, empty keys (fail closed) — one-line revert path.
2. Exact Render var placement (yaml vs dashboard-only) for `OPENCODE_API_KEY`? Recommendation: dashboard-only, `sync: false` reference in yaml.
3. Schema fix for `incidents` (`id` → `incident_id` alias at DB vs code normalization)? Recommendation: code normalization (no migration on free-tier Supabase during pilot).

## Sources

### Primary (HIGH — fetched + read this session)
- `https://opencode.ai/v2/docs/console/api/inference` — endpoint paths, auth, payload shapes
- `https://opencode.ai/v2/docs/console/models` — model IDs, per-model endpoints, pricing, privacy, free-model terms
- Codebase reads: `agents/llm_gateway.py`, `backend/app/config.py`, `agents/graph.py`, `agents/state.py`, `agents/tools/consensus_gate.py`, all 6 `agents/nodes/*.py`, `backend/app/workers/agent_worker.py`, `backend/app/routers/agent_router.py`, `agents/memory/stm.py`, `agents/memory/ltm.py`, `agents/tools/supabase_tools.py`, `render.yaml`, `.github/workflows/keep-alive.yml`, `.env.example`, `backend/tests/test_llm_gateway.py`

### Live probes (HIGH — executed this session)
- `GET https://peta-nadi.onrender.com/health` → ok, `environment: development`
- `GET /api/v1/agents/status` → healthy, 6 agents, avg 0.87 (seeded timestamps)
- `GET /api/v1/health/sources` → TomTom degraded, FIRMS `last_seen` 2026-07-18
- `GET /api/v1/news/live?limit=2` → live, 60 articles, `link_alive` tagging
- `GET /api/v1/news/market-regime` → `EARLY_WARNING_ACTIVE`
- `GET /api/v1/incidents?limit=2` → `"id"` keys, no `incident_id`

### Secondary
- 57-CONTEXT.md D1–D8 (locked guardrails); 58-CONTEXT.md D-01–D-16 (phase decisions); 58-DISCUSSION-LOG.md
