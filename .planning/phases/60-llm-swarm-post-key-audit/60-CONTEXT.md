# Phase 60: LLM Swarm Post-Key Audit and Render Parity - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

## Phase Boundary

Re-audit the full LLM swarm after `OPENCODE_API_KEY` was added to local `.env`: verify mimo-v2.6-pro (reasoning) + deepseek-v4.1-flash (driver) actually serve all 8 LLM use cases, probe local vs Render `https://peta-nadi.onrender.com` parity, and list plotholes / missing functionality / errors. No swarm redesign; gateway swap from Phase 58 is preserved.

## Implementation Decisions

### Live verification scope
- **D-01:** Probe both local and Render. Local: `scripts/verify_opencode_models.py` catalog + per-model `LLMGateway.generate_content` smoke + 8 use-case traces + `pytest backend/tests/test_llm_gateway.py`. Render: same probe matrix against live (`/health`, `/agents/status`, `/health/sources`, `/news/live`, `/incidents`, `corridor/context`, `POST /api/v1/simulate/stream`) — **Reversibility:** reversible
- **D-02:** Render dashboard access required: confirm `OPENCODE_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_*` are set dashboard-side (`sync:false` in yaml), redeploy, then re-probe. Cold start 30-50s and corridor ~979ms sequential fetch are known constraints, not failures.

### Thinking-effort policy
- **D-03:** Fact locked: no `reasoning_effort` / `thinking` param is sent anywhere today. Gateway sends only `model, messages, temperature, max_tokens:1024` with `timeout 30.0s` (`agents/llm_gateway.py:130-139,213-214`); chat is temp 0.3 (`backend/app/routers/agent_router.py:207`), rest default 0.2. Both mimo and deepseek run at provider default effort.
- **D-04:** Researcher must verify whether Go chat/completions honors an effort knob (`reasoning_effort` / `extra_body.thinking`) before planner locks per-use-case levels. Proposal: mimo high for Agent 5/6 narrative, deepseek medium for driver/chat/extraction — planner confirms or keeps default.

### Fallback policy
- **D-05:** Current is opencode-first fail-loud: any opencode error raises `LLMGatewayUnavailable` (`agents/llm_gateway.py:148-149`) with no Gemini/NIM chaining. Keep for audit; planner proposes either keep fail-loud or restore chaining on 402/403/404 only, never canned prose. `DEMO_OFFLINE=true` mock branch stays dev-only.

### Fix breadth
- **D-06:** Audit + fix drift in same phase: `gemini_model="gemini-3.8-flash"` invalid default (`backend/app/config.py:31`), missing `GEMINI_MODEL`/`NVIDIA_*` in `.env.example` + `render.yaml`, stale `GOOGLE_API_KEY` alias, unbounded `asyncio.to_thread` in `agents/memory/ltm.py:26` + `backend/app/nlp/ner_pipeline.py:46`, 12s-outer/30s-inner timeout inversion in `backend/app/nlp/news_extractor.py:179-181`, `backend/.env.example` missing all `OPENCODE_*`.
- **D-07:** Honesty guardrail carries Phase 56/58: deterministic fallbacks stay labeled (`degraded=true`, `SIG-OPENCODE-*`), no mock resurrection, no synthetic episodes.

### LTM embeddings
- **D-08:** LTM stays on Google `models/text-embedding-004` (`agents/memory/ltm.py:27-28`). No opencode-Go embedding fallback exists: Go docs expose only chat/completions, responses, Anthropic messages, Google generateContent — no `/embeddings` endpoint; 58-RESEARCH verified absence. Switching models would invalidate stored pgvector rows (dimension + distribution shift) — **Reversibility:** one-way — requires pgvector re-embed migration plus `ltm_episodes.embedding vector(1536)` (`infra/supabase/migrations/000_init.sql:120`) vs 768-dim model drift resolution.

### the agent's Discretion
- Exact per-use-case effort levels after researcher verifies Go knob support.
- Whether 402/403/404 maps to fail-loud vs single chained retry.
- Probe tooling: extend `scripts/verify_opencode_models.py` + `scripts/probe_parity.sh` or new `scripts/verify_llm_swarm.py`.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LLM / gateway
- `agents/llm_gateway.py` — opencode-first branch, per-branch defaults, fail-loud contract
- `agents/OPENCODE_GATEWAY.md` — Console-vs-Go traps, catalog path, diagnostic tree
- `backend/app/config.py` — `Settings` with `opencode_*`, `gemini_model`, `nvidia_*` defaults
- `scripts/verify_opencode_models.py` — Go catalog check (`/go/v1/models`, 37 models)
- `https://opencode.ai/docs/go` — Go model list, endpoints table (no embeddings), pricing/limits

### Swarm use cases (all 8)
- `agents/nodes/decision_support.py` — Agent 6 mimo reasoning path
- `agents/nodes/economic_intelligence.py` — Agent 5 mimo narrative path
- `agents/nodes/osint_hazard.py` — Agent 2 conditional deepseek severity
- `agents/nodes/prediction.py` — Agent 3 deepseek prose overlay (expansion A)
- `agents/nodes/route_optimization.py` — Agent 4 deepseek explainer (expansion B)
- `backend/app/nlp/news_extractor.py` — deepseek structured extraction + heuristic merge
- `backend/app/routers/agent_router.py` — deepseek simulation/chat + degraded flag
- `agents/memory/ltm.py` — Google embeddings + `match_episodes` RPC (stays Google)
- `backend/app/nlp/ner_pipeline.py` — direct genai fallback, gazetteer-first (exempt)

### Ops / prior phases
- `.planning/phases/58-opencode-go-swarm-llm-migration-and-render-parity/58-CONTEXT.md` — D-01..D-16 locked
- `.planning/phases/58-opencode-go-swarm-llm-migration-and-render-parity/58-RESEARCH.md` — no-embeddings verification, parity matrix
- `.planning/phases/58-opencode-go-swarm-llm-migration-and-render-parity/58-PLAN.md` — WP1-WP4 structure to reuse
- `render.yaml` — env sync list, `sync:false` secrets
- `.env.example` — placeholder contract (never real secrets)
- `SYSTEM_ENGINES_AUDIT_REPORT.md` — Pass 3 LLM findings baseline

## Existing Code Insights

### Reusable Assets
- `LLMGateway.generate_content(prompt, system_instruction, model_name, temperature)` — single seam for effort-knob addition + per-node model select
- `get_settings()` lru_cache — add `GEMINI_MODEL` / effort fields once, all nodes inherit
- `scripts/verify_opencode_models.py` + `scripts/probe_parity.sh` — extend for 8-use-case live matrix
- `process_crisis_event` SSE generator + `update_agent_status` hook — reuse for live traces

### Established Patterns
- Fail-loud `LLMGatewayUnavailable`, never canned prose (Phase 55/58)
- Deterministic-first nodes: numbers stay code-computed, LLM only prose overlays
- Gazetteer-first NER, heuristic-first extraction with JSON-merge only on valid parse
- Strict RBAC + invite-only auth untouched by LLM work

### Integration Points
- Gateway connects osint_hazard, economic_intelligence, decision_support, prediction, route_optimization, news_extractor, simulation/chat
- Config connects `.env`, `backend/.env`, `render.yaml`, Docker lifespan pollers
- Render connects keep-alive cron, Supabase REST/RPC, Upstash Redis, ephemeral SQLite

## Specific Ideas

- Reasoning = `mimo-v2.6-pro`, workhorse = `deepseek-v4.1-flash` (locked, Go plan IDs).
- Orchestrator delegates menial inventory to subagents (muse-spark-1.3 medium / deepseek-v4.1-flash high) to save main-context tokens.
- Effort proposal only: mimo high for reasoning narrative, deepseek medium for driver paths — pending researcher verification.

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 59-llm-swarm-post-key-audit*
*Context gathered: 2026-10-17*
