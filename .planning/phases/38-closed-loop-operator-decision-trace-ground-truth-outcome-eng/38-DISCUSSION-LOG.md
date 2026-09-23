# Phase 38: Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine - Discussion Log

**Date:** 2026-09-23
**Phase:** 38
**Status:** Completed

## Areas Covered

### 1. Operator Decision & Tactical Action Taxonomy
- **Options Considered:** Basic binary approval vs. Multi-action taxonomy (ACCEPT / REJECT / OVERRIDE) with tactical maneuvers (REROUTE / HOLD / CONTINUE).
- **Selection:** Selected recommended multi-action taxonomy with tactical maneuvers and custom constraint overrides (speed limit, weight limit, avoid nodes). Mandatory notes on REJECT or OVERRIDE for operational auditing.

### 2. Ground-Truth Field Outcome Ingestion Workflow
- **Options Considered:** Manual entry only vs. Automated scraping only vs. Dual-mode (REST API for live operators + automated evaluation linking with $N=60$ benchmark scenarios).
- **Selection:** Selected dual-mode architecture supporting both $T+12\text{h}$ and $T+24\text{h}$ horizons.

### 3. Prediction vs. Outcome Variance & Recalibration Engine
- **Options Considered:** Unconstrained automatic online weight modification vs. Conservative advisory recalibration with fixed learning rate ($\eta = 0.05$).
- **Selection:** Conservative advisory recalibration factor calculating $\Delta w_k$ with learning rate 0.05, preserving system stability and audit transparency.

### 4. Resilient Local Storage Persistence
- **Options Considered:** In-memory queue vs. Flat JSON Lines file vs. Local SQLite database (`backend/data/prehub_local.db`).
- **Selection:** Local SQLite database with relational schema matching Supabase, automatic queueing, and reconnect sync.

## Deferred Ideas
None — all discussion aligned with Phase 38 scope.
