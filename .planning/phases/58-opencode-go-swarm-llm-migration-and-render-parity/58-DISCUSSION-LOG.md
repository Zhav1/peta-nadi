# Phase 58: opencode-go swarm LLM migration and Render parity - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-14
**Phase:** 58-opencode-go-swarm-llm-migration-and-render-parity
**Areas discussed:** LLM provider wiring, Local engine truth, Render parity gap, Swarm preservation

---

## LLM provider wiring

| Option | Description | Selected |
|--------|-------------|----------|
| deepseek-v4.1-flash | Via chat/completions, cheapest, matches NIM ID |  |
| gemini-3.8-flash | Via models/gemini endpoint, matches config default |  |
| muse-spark-1.3 | Via responses, higher quality costlier |  |
| mimo + deepseek split | Mimo reasoning, DeepSeek driver; deepseek text-only | ✓ |

**User's choice:** split, mimo v2.6 pro reasoning + deepseek driver; single chat/completions endpoint; opencode-first fail-loud; add all 3 config keys; move embeddings to opencode
**Notes:** Catalog /models (85) has only mimo-v2.6-flash-free, no pro — build must verify pro ID under Go subscription. Vision needs vision-exp, not needed for JSON payloads.

---

## Local engine truth

| Option | Description | Selected |
|--------|-------------|----------|
| Full swarm + adapters | All 6 nodes + adapters, codebase truth | ✓ |
| LLM nodes only | Faster, gateway sites only |  |

**User's choice:** Full swarm + adapters; include incident_id drift + MemorySaver + seeded status; pytest + SSE + probes; enforce honesty guardrail
**Notes:** Explicitly codebase over old audit docs.

---

## Render parity gap

| Option | Description | Selected |
|--------|-------------|----------|
| Full env sync | Parity + production flag | ✓ |
| LLM keys only | Minimal |  |

**User's choice:** Full sync; full probe matrix vs https://peta-nadi.onrender.com; note cold start + keep cron; document SQLite ephemeral
**Notes:** Scheduler confirmed .github/workflows/keep-alive.yml */10. Live probes showed TomTom degraded, NASA FIRMS stale 2026-07-18, env development.

---

## Swarm preservation

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve all | DAG + consensus untouched, gateway swap only | ✓ |
| Allow tuning | May adjust weights |  |

**User's choice:** Preserve all; expand LLM beyond 3 nodes (you decide which); pilot lens all (HITL + provenance + stale labels)
**Notes:** Proposal mandates swarm — no topology cuts.

---

## the agent's Discretion

- New-LLM node set (prediction narrative vs routing explainer)
- Embedding fallback if opencode lacks embeddings endpoint
- Mimo pro-ID resolution under Go subscription

## Deferred Ideas

None
