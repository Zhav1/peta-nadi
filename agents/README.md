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
