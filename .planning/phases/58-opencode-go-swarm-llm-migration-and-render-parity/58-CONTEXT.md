# Phase 58: opencode-go swarm LLM migration and Render parity - Context

**Gathered:** 2026-10-14
**Status:** Ready for planning

## Phase Boundary

Migrate LangGraph swarm LLM from Google Gemini + NVIDIA NIM to opencode-go subscription (OPENCODE_API_KEY), audit backend engines in code (not old docs) locally vs hosted https://peta-nadi.onrender.com, keep full 6-agent swarm per proposal. Researcher verifies opencode endpoints + embedding path; planner preserves graph.py DAG + consensus formula.

## Implementation Decisions

### LLM provider wiring
- **D-01:** Split models — mimo reasoning + deepseek driver. Mimo (PRO intent, catalog today only mimo-v2.6-flash-free) for decision_support + economic narrative; deepseek-v4.1-flash for osint severity + simulation/chat driver — **Reversibility:** costly — touches llm_gateway + 4 call sites
- **D-02:** Single endpoint POST https://opencode.ai/inference/v1/chat/completions with Bearer OPENCODE_API_KEY, temp 0.2 reasoning / 0.3 chat (openai-compatible per docs).
- **D-03:** opencode-first, fail-loud. Keep LLMGatewayUnavailable, no canned prose. No silent fallback.
- **D-04:** Config keys OPENCODE_API_KEY + OPENCODE_REASONING_MODEL + OPENCODE_DRIVER_MODEL in backend/app/config.py, .env.example, render.yaml. Reasoning default mimo-v2.6-flash-free with pro-ID override verified at build (catalog 85 models, only mimo-v2.6-flash-free today).
- **D-05:** Move LTM embeddings to opencode (researcher must verify embedding endpoint; fallback Google text-embedding-004 if missing).

### Local engine truth (codebase, not docs)
- **D-06:** Full swarm + adapters audit: all 6 nodes + TomTom/AIS/BMKG + LTM + consensus_gate + hedging/compliance.
- **D-07:** Include incident_id vs id drift (agents/tools/supabase_tools.py:50,78), MemorySaver in-memory (backend/app/workers/agent_worker.py:13-15), AGENT_STATUS_STORE seeded complete (backend/app/routers/agent_router.py:18-67).
- **D-08:** Verify pytest backend/tests + SSE POST /api/v1/simulate/stream trace + live probes (/health, /agents/status, /health/sources, /news/live, /incidents).
- **D-09:** Honesty guardrail carries Phase 56: fail-loud + stale/degraded labels, no mock resurrection.

### Render parity gap
- **D-10:** Full env sync to render.yaml + ENVIRONMENT=production (today only 5 vars, env=development).
- **D-11:** Full probe matrix local vs https://peta-nadi.onrender.com (health, agents, sources, news, incidents, corridor, simulate/stream).
- **D-12:** Note cold start 30-50s + corridor 979ms sequential; keep .github/workflows/keep-alive.yml cron */10.
- **D-13:** Document SQLite PREHUB_DB_PATH ephemeral on free disk; Supabase source of truth.

### Swarm preservation
- **D-14:** Preserve agents/graph.py 4-stage DAG + agents/tools/consensus_gate.py formula (>=0.85 + >=2 sources) untouched; gateway swap only.
- **D-15:** LLM scope expansion allowed beyond current 3 nodes + chat; researcher proposes minimal safe expansion (prediction narrative and/or routing explainer, numbers stay deterministic).
- **D-16:** Pilot lens all: dispatcher reroute-approve-dispatch, regulator provenance, Globot HITL gate, gods-eye honest stale labels.

### the agent's Discretion
- Exact new-LLM node set beyond D-15 (prediction narrative vs routing explainer) — researcher proposes, planner locks.
- Embedding endpoint choice if opencode lacks embeddings (fallback Google).
- Pro-ID resolution if Go subscription exposes mimo pro under different ID.

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### LLM / gateway
- `agents/llm_gateway.py` — current Google-then-NIM chain + LLMGatewayUnavailable to extend
- `backend/app/config.py` — Settings to extend with OPENCODE_* keys
- `https://opencode.ai/inference/v1/models` — 85-model catalog (only mimo-v2.6-flash-free, deepseek-v4.1-flash/v4-flash/v4-pro)
- `render.yaml` — missing LLM keys, env=development to fix

### Swarm (preserve)
- `agents/graph.py` — 4-stage DAG, must not change topology
- `agents/state.py` — CrisisState contract
- `agents/tools/consensus_gate.py` — P=1-prod formula, 0.85 + 2-source gate
- `agents/nodes/data_collection.py` — deterministic validation/dedup
- `agents/nodes/osint_hazard.py` — conditional LLM only if source==social
- `agents/nodes/prediction.py` — numpy polyfit, no LLM today
- `agents/nodes/economic_intelligence.py` — PIHPS z>1.5 + LTM + narrative
- `agents/nodes/route_optimization.py` — Dijkstra + hedging/compliance
- `agents/nodes/decision_support.py` — LLM summary + GraphRAG + write_incident
- `backend/app/workers/agent_worker.py` — MemorySaver + SSE streaming
- `backend/app/routers/agent_router.py` — status store + /simulation/chat fallback
- `agents/memory/stm.py` — Redis crisis/dedup/cache
- `agents/memory/ltm.py` — embedding + pgvector RPC
- `agents/tools/supabase_tools.py` — incident_id drift site

### Ops / pilot refs
- `.github/workflows/keep-alive.yml` — */10 scheduler for peta-nadi.onrender.com + Supabase
- `.planning/phases/57-pilot-hardening-e2e-audit-remediation/57-CONTEXT.md` — D1-D8 locked (do not regress mock purge/RBAC)
- `https://github.com/Vector897/Globot` — HITL gate + provenance + mock-first reference
- `https://github.com/bilawalsidhu/gods-eye-view` — layer modules + server key proxy + honest stale labels reference

## Existing Code Insights

### Reusable Assets
- LLMGateway.generate_content(prompt, system_instruction, model_name, temperature): extend with opencode branch + per-node model select
- get_settings() lru_cache: add OPENCODE_* fields once, all nodes inherit
- process_crisis_event SSE generator: reuse for live verification traces
- update_agent_status hook: reuse for honest per-node confidence

### Established Patterns
- Fail-loud LLMGatewayUnavailable (Phase 55): continue, never canned text
- Deterministic-first nodes (1,3,4): numbers stay code-computed, LLM only prose
- BackgroundTasks + guard for slow ingestion (57 D5): apply if opencode latency high
- Strict RBAC + invite-only auth (57 D1-D3): do not weaken for LLM work

### Integration Points
- Gateway connects osint_hazard, economic_intelligence, decision_support, simulation/chat
- Config connects .env, backend/.env, render.yaml, Docker lifespan pollers
- Render connects keep-alive cron, Supabase REST, Redis Upstash, ephemeral SQLite

## Specific Ideas

- Heterogeneous routing per user: mimo = smartest reasoning, deepseek = fast driver; deepseek text-only (vision needs deepseek-v4-flash-vision-exp, not needed today since payloads are JSON text)
- Verify mimo PRO ID at build against Go subscription; ship with flash-free default if pro absent
- Researcher must confirm opencode embedding endpoint before moving LTM

## Deferred Ideas

None — discussion stayed within phase scope

---

*Phase: 58-opencode-go-swarm-llm-migration-and-render-parity*
*Context gathered: 2026-10-14*
