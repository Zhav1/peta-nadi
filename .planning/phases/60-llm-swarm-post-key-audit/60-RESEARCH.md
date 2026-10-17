# Phase 60: LLM Swarm Post-Key Audit and Render Parity — Research

**Researched:** 2026-10-17
**Domain:** Gemini-embeddings-only cutover + opencode-Go chat audit + Render env parity
**Confidence:** HIGH (Go endpoints re-verified against live docs this session; all code cites read this session)

## Summary

`GEMINI_API_KEY` is now real but must serve **only** `embed_text` (`agents/memory/ltm.py:16-40` via `models/text-embedding-004`). Two Gemini **chat** paths violate the lock: `agents/llm_gateway.py:154-187` (Gemini branch) and `backend/app/nlp/ner_pipeline.py:26-68` (direct `genai.GenerativeModel`). Both must be gated off while `ltm.py` keeps its key gate unchanged. All 6 chat call sites already pass opencode IDs (`agents/nodes/*`, `news_extractor.py`, `agent_router.py`), so no caller edits are needed — only the two violator bodies plus the `gemini_model="gemini-3.8-flash"` invalid default (`backend/app/config.py:31`).

Go docs fetched this session reconfirm both locked IDs on `/chat/completions` and **no `/embeddings` endpoint** anywhere on the page. The gateway sends only `model/messages/temperature/max_tokens` (`llm_gateway.py:130-135`) and Go docs document no `reasoning_effort`/`thinking` knob — verdict: **keep provider default, add no effort param**. pgvector drift is live-impacting: `ltm_episodes.embedding vector(1536)` (`infra/supabase/migrations/000_init.sql:120`) vs 768-dim `text-embedding-004` — inserting 768-dim rows into a `vector(1536)` column errors on dimension mismatch, so a migration (not a comment fix) is required if the live table was built from `000_init.sql`.

**Primary recommendation:** Gate the gateway Gemini branch behind an explicit opt-in flag defaulting OFF (fail-loud to NIM-or-raise), neutralize `ner_pipeline.py` LLM path to gazetteer-only with opencode-driver as the only LLM option, delete or deprecate `Settings.gemini_model`, ship migration `001_ltm_embedding_768.sql`, and add the missing `GEMINI_MODEL`/`NVIDIA_*`/`OPENCODE_*` keys to `.env.example`, `backend/.env.example`, and `render.yaml` (replacing stale `GOOGLE_API_KEY`).

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Live verification scope (D-01/D-02: local + Render probes), thinking-effort fact (D-03: no effort param sent today), fail-loud fallback (D-05), audit+fix breadth (D-06), honesty guardrail (D-07), LTM stays Google `models/text-embedding-004` (D-08). **Superseding lock from spawning prompt:** `GEMINI_API_KEY` (real, `AQ.Ab8R` prefix) is embeddings-only; no Gemini chat completions anywhere.
- Reasoning = `mimo-v2.6-pro`, workhorse = `deepseek-v4.1-flash` (locked Go plan IDs).

### the agent's Discretion
- Exact per-use-case effort levels after researcher verifies Go knob support.
- Whether 402/403/404 maps to fail-loud vs single chained retry.
- Probe tooling: extend `scripts/verify_opencode_models.py` + `scripts/probe_parity.sh` or new `scripts/verify_llm_swarm.py`.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Chat completions (7 sites) | API / Backend (`LLMGateway`) | — | Single seam; keys never reach browser |
| LTM embeddings + `match_episodes` RPC | API / Backend (`ltm.py`) → Database / Storage (pgvector) | — | 768-dim contract spans code + SQL |
| NER gazetteer / heuristic extraction | API / Backend | — | Deterministic, no network |
| Env sync (yaml / examples / dashboard) | Ops (Render) | — | `sync:false` secrets dashboard-only |

## Standard Stack

No new libraries. `google-generativeai` stays **solely** for `genai.embed_content` in `ltm.py` [VERIFIED: agents/memory/ltm.py:26-31 — `genai.embed_content, model="models/text-embedding-004"` quoted verbatim]. `httpx` stays for opencode/NIM branches. Do NOT add an embeddings client library — none exists on Go.

### Endpoint table (Go docs fetched this session) [VERIFIED: https://opencode.ai/docs/go Endpoints table]

| Role | Model ID | Endpoint | Price/1M (in/out) | Notes |
|------|----------|----------|-------------------|-------|
| Reasoning | `mimo-v2.6-pro` | `https://opencode.ai/inference/go/openai/v1/chat/completions` | $0.435 / $0.87 | `@ai-sdk/openai-compatible`; privacy Not used / 0 days |
| Driver | `deepseek-v4.1-flash` | `https://opencode.ai/inference/go/openai/v1/chat/completions` | $0.30 / $1.20 peak, $0.15 / $0.60 off-peak | Same endpoint; privacy Not used / 0 days* (*ZDR renewed monthly, valid through 2026-10-31) |
| Catalog | — | `GET https://opencode.ai/inference/go/v1/models` | — | What `scripts/verify_opencode_models.py:27-29` already calls [VERIFIED: scripts/verify_opencode_models.py:27-29] |
| Embeddings | — | **does not exist** | — | Five families only: OpenAI chat/completions, OpenAI responses, Anthropic messages, Google generateContent, SystemOne. Confirms 58-RESEARCH.md:44-48 absence finding; LTM stays Google |

## Thinking-Effort Verdict

**Verdict: keep provider default; do NOT add an effort knob this phase.** [VERIFIED: agents/llm_gateway.py:130-135 — payload is exactly `{"model", "messages", "temperature", "max_tokens": 1024}` quoted verbatim; no `reasoning_effort`/`extra_body`/`thinking` key sent] + [VERIFIED: https://opencode.ai/docs/go — page documents model list, usage limits, endpoints, privacy; no `reasoning_effort`, `thinking`, or `extra_body` parameter documented anywhere]. The Go OpenAI-compatible surface is a passthrough; unsupported keys risk 400s on strict backends. Per-use-case differentiation already exists via model selection (mimo for Agent 5/6 narrative, deepseek for driver/chat/extraction) + temperature (0.2 default, 0.3 chat at `agent_router.py:203-208` [VERIFIED]). If a future model documents an effort param, add it as an optional `LLMGateway.generate_content(..., effort=None)` kwarg defaulting to unset — planner's discretion item resolves to "keep default."

## Gemini-Embeddings-Only Cutover Plan (file:line edits, no implementation)

### (a) `agents/llm_gateway.py` — gate Gemini chat branch, keep fail-loud

Current violator: lines 151-187 [VERIFIED: agents/llm_gateway.py:154-187 — `gemini_model = settings.gemini_model` … `genai.GenerativeModel(model_name=gemini_model, …)` + `asyncio.wait_for(asyncio.to_thread(model.generate_content…), timeout=30.0)` quoted verbatim in structure]. Note branch order today: opencode raises fail-loud at `:147-149` when keyed, so the Gemini branch is reachable only when `OPENCODE_API_KEY` is absent/placeholder — but with both keys now real locally it is dead code that still imports risk (invalid `gemini-3.8-flash` default) and contradicts the lock.

Planner edit (one of, in order of preference):
1. **Recommended — hard gate (default OFF):** wrap `:162-187` in `if gemini_available and getattr(settings, "gemini_chat_enabled", False):`, else skip to NIM. Add `gemini_chat_enabled: bool = False` to `Settings`. Documented, reversible, keeps revert path without live risk.
2. **Alternative — delete branch:** remove `:151-187` + `import google.generativeai as genai` at `:4`; NIM becomes the only fallback (and `get_nvidia_key()` at `:71-82` returns `""` without `NVIDIA_DEEPSEEK_*` keys → raises `LLMGatewayUnavailable`). Pure opencode-only fail-loud. Loses revert path.
3. Either way, update the docstring at `:92-101` ("Falls back to Gemini, then NVIDIA NIM") to match the chosen behavior, and update/retire `test_gemini_branch_uses_configured_model_not_caller_opencode_id` (`backend/tests/test_llm_gateway.py:113-138` [VERIFIED]) — it pins the branch being gated.

NIM disposition: keep as last resort as today (fail-closed on empty keys → `LLMGatewayUnavailable` at `:191-195` [VERIFIED: agents/llm_gateway.py:190-195]). Do not invent chaining on 402/403/404 without planner lock (discretion item).

### (b) `backend/app/nlp/ner_pipeline.py` — neutralize LLM path

Current violator: `extract_locations_llm` at `:26-68`, direct `genai.GenerativeModel(settings.gemini_model)` at `:35` with unbounded `asyncio.to_thread` at `:46` [VERIFIED: backend/app/nlp/ner_pipeline.py:26-46]. Caller `extract_locations` at `:70-86` falls back to it when gazetteer is empty [VERIFIED: backend/app/nlp/ner_pipeline.py:70-86].

Planner edit (in order):
1. **Recommended — gazetteer-only with opencode-driver option:** make `extract_locations_llm` route through `LLMGateway.generate_content(model_name=settings.opencode_driver_model)` with the existing JSON-array prompt + `asyncio.wait_for(..., timeout=12.0)` bound, `[]` on any failure (preserves current `[]`-on-error contract at `:66-68`). Deletes the direct `genai` import/call — the only remaining `genai` chat call in the repo.
2. **Minimal — gazetteer-only:** make `extract_locations` return gazetteer results directly (delete `:82-84` fallback call), leave `extract_locations_llm` deleted. Zero network, zero key use; recall drops on unseen spellings.
3. Either way: remove `import google.generativeai as genai` (`:6`), add the 12s bound (fixes D-06 unbounded-`to_thread`), keep `json.loads` sanitize + `[]`-on-error.

Note: `news_extractor.py:179-181` outer-12s/inner-30s inversion (D-06) is adjacent: `asyncio.wait_for(LLMGateway.generate_content(...), timeout=12.0)` wraps a 30s-inner gateway call, so the inner never fires first. Fix by either raising outer to 35s or threading a per-call timeout into the gateway — planner's call; flag, don't silently retune.

### (c) `gemini_model="gemini-3.8-flash"` default drift (`backend/app/config.py:31`) [VERIFIED]

`gemini-3.8-flash` is not a valid Gemini model ID (valid lineage per repo history: `gemini-1.5-flash`; 58-DISCUSSION-LOG probed it as invalid). No chat caller references it anymore — all 5 gateway chat callers pass `opencode_*` IDs [VERIFIED: grep `generate_content` — `decision_support.py:139-142`, `economic_intelligence.py:114-116`, `osint_hazard.py:128-130`, `prediction.py:153-156`, `route_optimization.py:358-361`, `news_extractor.py:180`, `agent_router.py:203-207`]. Planner edit:
- **If (a) = gate/delete and (b) = opencode/gazetteer:** delete the `gemini_model` field entirely; `GEMINI_API_KEY` remains for `ltm.py`. Update the one test referencing it (`test_llm_gateway.py:123`).
- **If any Gemini chat path is kept:** lock the default to a valid embeddings-adjacent value is wrong — chat IDs and embedding IDs are different namespaces; instead rename to `gemini_chat_model` with a valid chat ID and leave it unused (keyed but uncalled). Deletion is cleaner; renaming only if the planner keeps the revert path hot.

### (d) pgvector `vector(1536)` vs 768-dim drift — migration required, not comment-fix

- `infra/supabase/migrations/000_init.sql:120` declares `embedding vector(1536)` with comment "OpenAI/Gemini text-embedding-3-small compatible" [VERIFIED: infra/supabase/migrations/000_init.sql:116-123 — `embedding   vector(1536),                   -- semantic embedding (OpenAI/Gemini text-embedding-3-small compatible)` verbatim], while `ltm.py:28` embeds with `models/text-embedding-004` = 768 dims [VERIFIED: agents/memory/ltm.py:26-31]. Phase-3 AI-SPEC specified `VECTOR(768)` for the same model — the 1536 value drifted in at phase-0/000_init.
- **Live impact:** pgvector enforces dimension on insert — writing a 768-dim embedding into a `vector(1536)` column raises a dimension-mismatch error, so `seed_ltm.py:38` inserts and all future `query_ltm` embeddings fail against a 1536-built table; even if inserts were coerced, `match_episodes` cosine distances would be meaningless. If the live Supabase table was built from `000_init.sql`, LTM write + recall are broken today (silent `[]` via the `except → return []` at `ltm.py:38-40` + graceful-degrade to multiplier 1.05 — honest but degraded).
- **Verdict:** ship migration `infra/supabase/migrations/001_ltm_embedding_768.sql`: `ALTER TABLE ltm_episodes ALTER COLUMN embedding TYPE vector(768); DROP INDEX …ltm_episodes_embedding_idx; CREATE INDEX … USING ivfflat … WITH (lists=100);` + re-embed any existing rows via `agents/seeds/seed_ltm.py` (one-way per D-08). Also fix the `000_init.sql:120` comment/dim in place for fresh installs. Verify live first: `SELECT atttypmod FROM pg_attribute …` or one `embed_text` insert probe — planner must include the probe before running ALTER.

## Env-Sync List (exact additions)

Masked-check only (values never printed): `test -n "$OPENCODE_API_KEY"`, `${#GEMINI_API_KEY}` length + prefix class (`AQ.` vs `AIza` vs `your-`), never `echo $KEY`.

| File | Addition | Form |
|------|----------|------|
| `.env.example` | `GEMINI_MODEL=` placeholder + comment "chat-disabled; embeddings use hardcoded models/text-embedding-004" | missing today (only `GEMINI_API_KEY` at `:24` [VERIFIED]) |
| `.env.example` | `NVIDIA_DEEPSEEK_V4_PRO=`, `NVIDIA_DEEPSEEK_V4_FLASH=`, `NVIDIA_FOURCASTNET=`, `NVIDIA_CUOPT=` placeholders | missing today (no `NVIDIA_*` lines [VERIFIED: .env.example:1-73]) |
| `backend/.env.example` | `OPENCODE_API_KEY=`, `OPENCODE_REASONING_MODEL=mimo-v2.6-pro`, `OPENCODE_DRIVER_MODEL=deepseek-v4.1-flash` | missing today (stops at CORS, no `OPENCODE_*` [VERIFIED: backend/.env.example:1-33]) |
| `backend/.env.example` | `GEMINI_MODEL=` placeholder | same |
| `render.yaml` | `- key: GEMINI_MODEL` with placeholder `value:` (non-secret default) | missing today [VERIFIED: render.yaml:1-51] |
| `render.yaml` | `NVIDIA_DEEPSEEK_V4_PRO`, `NVIDIA_DEEPSEEK_V4_FLASH`, `NVIDIA_FOURCASTNET`, `NVIDIA_CUOPT` as `sync: false` (no values) | missing today |
| `render.yaml` | `OPENCODE_REASONING_MODEL`/`OPENCODE_DRIVER_MODEL` already present as values (`:31-34` [VERIFIED]) — no change | — |
| `render.yaml` | Replace stale `- key: GOOGLE_API_KEY / sync: false` (`:14-15` [VERIFIED]) with `- key: GEMINI_API_KEY` dedup (a `GEMINI_API_KEY sync:false` already exists at `:36-37`); dashboard must delete the `GOOGLE_API_KEY` var to avoid dual-key confusion | rename, not duplicate |
| Render dashboard (manual) | Confirm `OPENCODE_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_CUOPT`, `NVIDIA_FOURCASTNET` set; add `NVIDIA_DEEPSEEK_V4_FLASH` or `_PRO` if NIM fallback is kept live, else leave empty (fail-closed) | dashboard-only |

Stale docstring: `agent_router.py:134` "powered by Gemini 3.8 Flash / NVIDIA NIM" [VERIFIED: backend/app/routers/agent_router.py:132-136] must read opencode models. `AGENT_STATUS_STORE` seeds already fixed to `idle`/`never` (`:18-67` [VERIFIED]) — no action.

## Live Verify Command Matrix (read-only, secret-safe — masked checks only)

Prefix every run with: `openssl rand -hex 2 >/dev/null; set -o pipefail` where applicable; never `echo $*_KEY`. Key checks print `set:yes/no len:N prefix:AQ|AIza|your|empty` only.

| # | Use case | Local command | Render command | Pass criterion |
|---|----------|---------------|----------------|----------------|
| 0 | Catalog | `OPENCODE_API_KEY="$(...)" python scripts/verify_opencode_models.py` (reads env, prints IDs not key) | n/a (same catalog) | exit 0, both IDs confirmed |
| 1 | decision_support (mimo reasoning) | `python -c "import asyncio; from agents.llm_gateway import LLMGateway; from backend.app.config import get_settings; s=get_settings(); print(asyncio.run(LLMGateway.generate_content(prompt='Uji: ringkas dalam 1 kalimat.', model_name=s.opencode_reasoning_model))[:200])"` | `curl -sN -X POST https://peta-nadi.onrender.com/api/v1/simulate/stream -H 'Content-Type: application/json' -d '{"type":"flood","region":"north_sumatra"}' --max-time 90 \| head -c 2000` (SSE contains `decision_support_output`) | Indonesian 3-section briefing, no FALLBACK markers |
| 2 | economic_intelligence (mimo narrative) | same driver as #1 with `s.opencode_reasoning_model` + inflation prompt | `curl -s https://peta-nadi.onrender.com/api/v1/news/market-regime \| head -c 800` | 2–3 sentence narrative; `[]`-free `ltm_episodes_used` present |
| 3 | osint_hazard (deepseek severity) | gateway smoke with `s.opencode_driver_model`, prompt `Classify: 'banjir setinggi lutut di Belawan'` | included in SSE stream (`osint_hazard` node_update) | single word in {low,medium,high,critical} |
| 4 | prediction narrative (deepseek overlay) | gateway smoke, horizons prompt | SSE `prediction` node `narrative` key | cites given horizons only |
| 5 | route explainer (deepseek overlay) | gateway smoke, route prompt | SSE `route_optimization` top-route `explainer` key | numbers match injected ground truth |
| 6 | news_extractor (deepseek JSON) | `python -m pytest backend/tests -v -k "news or extract"` + one `extract_structured_news` smoke on fixture article | `curl -s 'https://peta-nadi.onrender.com/api/v1/news/live?limit=2' \| head -c 1500` | valid-schema JSON merge; heuristic fallback logged `warning` not `debug` |
| 7 | agent_router chat (deepseek, temp 0.3) | `curl -s -X POST localhost:8000/api/v1/agent/chat -H 'Content-Type: application/json' -d '{"message":"biaya hedging reroute?","agency":"BULOG"}'` | same against `https://peta-nadi.onrender.com` | `degraded:false` + `SIG-OPENCODE-DRIVER-*`; degraded path has `degraded:true`, conf 0.62 [VERIFIED: agent_router.py:255-269] |
| 8a | ltm embed (Gemini ONLY) | `python -c "import asyncio; from agents.memory.ltm import embed_text; v=asyncio.run(embed_text('banjir Belawan')); print(len(v))"` | not directly probed (no endpoint exposes it; via market-regime `ltm_episodes_used`) | prints `768` |
| 8b | ltm query/RPC | `python -c "import asyncio; from agents.memory.ltm import query_ltm; print(len(asyncio.run(query_ltm('banjir Belawan'))))"` (needs Supabase env) | same via market-regime | list (possibly `[]` on empty table — honest, not failure) |
| 9 | regression suite | `python -m pytest backend/tests/test_llm_gateway.py -v` (update gemini-branch test per cutover first) | n/a | green |

Render baseline probes (parity, from 58 matrix, still valid): `GET /health`, `/api/v1/agents/status` (expect `warming`/0.0 pre-run per honesty rule [VERIFIED: agent_router.py:80-104]), `/api/v1/health/sources`, `/api/v1/news/live`, `/api/v1/incidents`. Cold start 30–50s: prefix Render calls with `--max-time 90` + one warm-up `GET /health`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Embeddings on Go | Custom chunk-and-chat embedding hack | Keep `genai.embed_content(text-embedding-004)` | No `/embeddings` endpoint exists; chat-as-embedding breaks the 768-dim pgvector contract |
| Effort control | Prompt-prefix "think harder" scaffolding | Model selection (mimo vs deepseek) + temperature | Provider default effort; prefix hacks pollute Indonesian output format |
| Chat fallback chain | Silent Gemini/NIM chaining on any error | Fail-loud `LLMGatewayUnavailable` + labeled deterministic fallbacks | Phase 56/58 honesty: canned prose must wear `degraded=true` |

## Common Pitfalls

1. **Endpoint↔ID mismatch:** Go IDs (`mimo-v2.6-pro`) to Console endpoint or vice versa → 400. Keep single `OPENCODE_BASE_URL` + build-time catalog check (existing comment block `llm_gateway.py:13-56` [VERIFIED]).
2. **`*-free` IDs outside IDE:** any `-free` ID over third-party `/chat/completions` → 403 FreeTierError. Locked IDs are non-free — don't "optimize" to flash-free.
3. **Missing `x-opencode-session`:** throttling/lost caching. Gateway already sends it (`llm_gateway.py:124` [VERIFIED]); any new client must copy the header.
4. **`gemini-3.8-flash` resurrection:** grep must return 0 post-phase: `grep -rn "gemini-3.8-flash\|3\.5-flash-lite" agents backend scripts`.
5. **Timeout inversion:** outer 12s vs inner 30s in `news_extractor.py:179-181` [VERIFIED] — the inner timeout is dead code; fix deliberately.
6. **Unbounded `to_thread`:** `ltm.py:26`, `ner_pipeline.py:46` lack `asyncio.wait_for` (D-06). `ltm.py` needs the bound added alongside the migration; `ner_pipeline.py` is fixed by the cutover itself.
7. **Dual key confusion:** `GOOGLE_API_KEY` (stale alias) vs `GEMINI_API_KEY` — exactly one may exist post-phase.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mimo-v2.6-flash-free` reasoning default | `mimo-v2.6-pro` (Go plan, $0.435/$0.87) | Phase 58 commit `ccca387` [VERIFIED: git log] | Paid reasoning, no 403; privacy Not used/0 days |
| Console `/inference/v1` base | Go `/inference/go/openai/v1` + catalog `/inference/go/v1/models` | Phase 58 commit `28133be` [VERIFIED] | Endpoint↔ID match enforced |
| Gemini chat as fallback | Gemini embeddings-only (this phase) | Phase 59 (pending) | `GEMINI_API_KEY` scope shrinks to `ltm.py` |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `GEMINI_API_KEY` real with `AQ.Ab8R` prefix + other env states from spawning prompt (`.env` files not opened this session; values never printed) | Env-sync | Planner re-verifies with masked checks before edits |
| A2 | `text-embedding-004` output is 768 dims (standard spec; live embedding not executed — no key use in research) | Vector-dim | One `len(embed_text(...))` probe at build confirms before ALTER |
| A3 | Live Supabase `ltm_episodes` built from `000_init.sql` (hence 1536) vs manually 768 — unverified without DB probe | Vector-dim | Dimension probe decides migration vs no-op |
| A4 | Go `/chat/completions` ignores unknown `reasoning_effort`/`extra_body` keys or 400s (not probed — no live call made) | Effort | Moot: recommendation sends no such keys |

## Open Questions

1. **NIM fallback live or fail-closed?** `NVIDIA_CUOPT`/`FOURCASTNET` real but `NVIDIA_DEEPSEEK_*` missing — NIM branch serves only if a usable key exists (`get_nvidia_key` order [VERIFIED: llm_gateway.py:71-82]). Recommendation: keep code, leave keys empty → fail-closed `LLMGatewayUnavailable`; planner locks.
2. **402/403/404: fail-loud vs single chained retry?** (Discretion — researcher input: all three today raise immediately at opencode branch; any chaining must never return canned prose.)
3. **Probe tooling:** extend `verify_opencode_models.py` + `probe_parity.sh` vs new `verify_llm_swarm.py` (discretion — matrix above fits either).

## Environment Availability

No new external tools required. Probes need: `python` + `google-generativeai` (installed? — not verified, planner checks via `python -c "import google.generativeai"`), `curl`, `pytest`, live `OPENCODE_API_KEY`/`GEMINI_API_KEY` in env, Render dashboard access (D-02).

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | pytest (`backend/tests/`, 18 files per 58-RESEARCH) |
| Key file | `backend/tests/test_llm_gateway.py` (fail-loud contract) |
| Quick run | `python -m pytest backend/tests/test_llm_gateway.py -v` |
| Full suite | `python -m pytest backend/tests -v -k "llm or agent"` |

Wave 0 gaps: update `test_gemini_branch_uses_configured_model_not_caller_opencode_id` to the gated/deleted behavior; add opencode-only fail-loud test with both keys set; add `vector(768)` migration test (`SELECT atttypmod` or insert-dim probe).

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | unchanged (RBAC untouched) |
| V5 Input Validation | yes | gazetteer word-boundary regex + JSON-schema merge on LLM output (`news_extractor.py:192-206` [VERIFIED]) |
| V6 Cryptography | yes | keys via env/dashboard only, `sync:false`, masked-check probes; never log/print key values |

Threat: `GOOGLE_API_KEY`/`GEMINI_API_KEY` dual-var confusion → wrong key scoped to chat SDK. Mitigation: single `GEMINI_API_KEY`, delete alias yaml + dashboard var.

## Sources

### Primary (HIGH)
- https://opencode.ai/docs/go — Endpoints table, model list, pricing, privacy (fetched this session)
- `agents/llm_gateway.py:1-229`, `agents/memory/ltm.py:1-117`, `backend/app/nlp/ner_pipeline.py:1-86`, `backend/app/nlp/news_extractor.py:138-217`, `backend/app/routers/agent_router.py:18-269`, `backend/app/config.py:1-72`, `infra/supabase/migrations/000_init.sql:116-128`, `scripts/verify_opencode_models.py:1-104`, `render.yaml:1-51`, `.env.example:1-73`, `backend/.env.example:1-33`, `backend/tests/test_llm_gateway.py:1-147`, node call sites (all read this session)

### Secondary
- `.planning/phases/58-opencode-go-swarm-llm-migration-and-render-parity/58-RESEARCH.md:44-48` — no-embeddings absence verification (corroborated by this session's Go docs fetch)

## Metadata

- Standard stack: HIGH — endpoints + IDs from live docs, payload from code
- Architecture: HIGH — all 8 call sites + gateway read verbatim
- Pitfalls: HIGH — drift items file:line confirmed; env values intentionally unopened (A1)

**Research date:** 2026-10-17
**Valid until:** 2026-11-16 (stable domain; Go model list may change — re-run catalog check at build)
