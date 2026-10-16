# Agents — LangGraph Cognitive Swarm

This directory contains the 6-agent LangGraph orchestration system.
Built in **Phase 3** — see `.planning/phases/phase-3/PLAN.md` (generated after Phase 2 completes).

## Agent Roster

| Agent | Role |
|-------|------|
| DataCollectionAgent | Normalizes and validates incoming Redis events |
| OSINTHazardAgent | NER location extraction + PostGIS hazard fusion |
| PredictionAgent | 6h/12h/24h/48h multi-horizon forecasting |
| RouteOptimizationAgent | pgRouting + NetworkX alternative routing |
| EconomicIntelligenceAgent | PIHPS anomaly detection + LTM inflation forecast |
| DecisionSupportCopilot | Synthesizes all findings → executive summary |

## Memory Systems

- **STM (Short-Term Memory):** Redis KV via LangGraph `MemorySaver` — live crisis state
- **LTM (Long-Term Memory):** pgvector in Supabase — historical episode semantic search

## Pre-requisite

Run `/gsd-ai-integration-phase 3` to generate the AI-SPEC.md design contract
before implementing any agent code.

## LLM Gateway — endpoint & model ID rules

All agents call `LLMGateway.generate_content(...)` in `llm_gateway.py`. Before
changing `OPENCODE_*` env vars, the gateway URL, or the model defaults in
`backend/app/config.py`, **read `agents/OPENCODE_GATEWAY.md` first**.

The short version: opencode has two inference surfaces (Console pay-as-you-go
vs. Go subscription). We use Go. Mixing the URL with the wrong model ID
catalog, or picking a `*-free` ID that the inference server reserves for the
IDE, causes `402` / `403` / `400 Model is unavailable` failures. The full
diagnostic tree lives in that file.
