# Phase 45: Pilot Verification, Scenario Drills & Final End-to-End Packaging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 45 - Pilot Verification, Scenario Drills & Final End-to-End Packaging
**Areas discussed:** E2E scenario drills scope, Docker Compose & deployment architecture, Pilot onboarding manual structure, Test matrix compilation format

---

## 1. E2E Scenario Drills Scope & Execution

| Option | Description | Selected |
|--------|-------------|----------|
| 3 distinct semantic drills | (1) Belawan-Pekanbaru perishable spoilage detour, (2) Bakauheni strait crossing BKHIT quarantine block/release, (3) Sitinjau Lauik MST axle-load mountain pass warning/override | ✓ |
| Single monolithic end-to-end drill | Chaining all features sequentially into one large operational scenario | |
| Parametrized stress drill matrix | Running combinations across all 4 perishability tiers and multiple choke-point bottleneck types | |

**User's choice:** 3 distinct semantic drills.
**Follow-up requirement from user:** *"make it as real as possible with no mockup data."*
**Notes:** All test inputs, coordinates, road networks (54-node Sumatra graph), toll segments (BPJT Golongan I-V), Pertamina fuel benchmarks, and commodities must be 100% ground-truth real data, avoiding synthetic placeholders.

---

## 2. Docker Compose & Deployment Packaging

| Option | Description | Selected |
|--------|-------------|----------|
| Dual-profile setup | Hardened production docker-compose.yml (multi-stage Next.js standalone build, health checks, prehub-* container naming, persistent volumes) + docker-compose.override.yml for hot-reload dev | ✓ |
| Single production-only docker-compose.yml | Full multi-stage builds, health checks, no volume mounts for source code | |
| Unified docker-compose.yml | COMPOSE_PROFILES or environment flag to switch between dev and production modes | |

**User's choice:** Dual-profile setup with production `docker-compose.yml` and hot-reloading `docker-compose.override.yml`.
**Notes:** Production setup will include native Docker health check probes on redis, backend, and frontend, persistent volumes for SQLite and Redis, and standardized `prehub-*` container names.

---

## 3. Pilot Onboarding Manual Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Persona-Based Operational Runbooks | 4 dedicated sections (Dispatcher, Port/Terminal Coordinator, Government Regulator, DevOps/Admin) with exact step-by-step UI actions, SOPs, and decision-tree protocols | ✓ |
| Chronological Lifecycle Walkthrough | Setup & Onboarding -> Morning Briefing & Fleet Monitoring -> Real-time Crisis Mitigation -> Post-Drill Evaluation & Audit | |
| Quick-Start Cheat Sheet + Reference Manual | 5-minute quick start followed by comprehensive technical and algorithmic reference manual | |

**User's choice:** Persona-Based Operational Runbooks.
**Notes:** The manual `docs/PreHub_Pilot_Onboarding_Manual.md` will contain concrete, practical runbooks for each of the 4 key roles operating PreHub in a real Sumatra pilot setting.

---

## 4. Test Matrix Compilation Format

| Option | Description | Selected |
|--------|-------------|----------|
| Complete Exhaustive Inventory | Full update of docs/test_matrix.md covering FR-1 through FR-20 (130+ individual test cases, exact assertions, and one-command reproduction guide) | ✓ |
| Automated Matrix Generator | Add a script (scripts/generate_test_matrix.py) that inspects pytest test discovery and synchronizes docs/test_matrix.md automatically | |
| Executive Summary Matrix | High-level requirement table with test suite counts and detailed write-ups restricted to Phase 44 & 45 pilot features | |

**User's choice:** Complete Exhaustive Inventory in `docs/test_matrix.md`.
**Notes:** The test matrix will catalogue all 130+ automated tests across backend and frontend, linking each to functional requirements, test functions, and verifiable commands.

---

## the agent's Discretion

- Specific test helper fixtures and assert thresholds in `backend/tests/test_pilot_e2e.py`.
- Multi-stage Docker caching layers and Alpine image optimization.
- Visual ASCII layout and decision flowcharts in the onboarding manual.

---

## Deferred Ideas

- Driver native mobile application (deferred to v2 / post-hackathon).
- Private enterprise GraphRAG self-hosted cluster (deferred to post-pilot cloud migration).
