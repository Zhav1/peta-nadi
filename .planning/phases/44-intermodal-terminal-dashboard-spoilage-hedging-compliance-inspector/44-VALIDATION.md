---
phase: 44
slug: intermodal-terminal-dashboard-spoilage-hedging-compliance-inspector
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-10-02
---

# Phase 44 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.2.2 (Python 3.13) + Next.js build verification |
| **Config file** | `backend/pytest.ini` |
| **Quick run command** | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py` |
| **Full suite command** | `backend\.venv\Scripts\python -m pytest backend/tests && npm --prefix frontend run build` |
| **Estimated runtime** | ~10 seconds (pytest) + ~25 seconds (build) |

---

## Sampling Rate

- **After every task commit:** Run `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py`
- **After every plan wave:** Run `backend\.venv\Scripts\python -m pytest backend/tests && npm --prefix frontend run build`
- **Before `/gsd-verify-work`:** Full suite must be green (120+ tests passing, 0 build errors)
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 44-01-01 | 01 | 1 | FR-17.1 | — | N/A | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_chokepoints_initialization` | ❌ W0 | ⬜ pending |
| 44-01-02 | 01 | 1 | FR-17.2 | — | Clamped [1.0, 3.5] | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_intermodal_delay_multiplier` | ❌ W0 | ⬜ pending |
| 44-01-03 | 01 | 2 | FR-18.1 | — | N/A | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_bpjt_toll_and_fuel` | ❌ W0 | ⬜ pending |
| 44-01-04 | 01 | 2 | FR-18.2 | — | Decay monotonicity | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_4_tier_perishability_decay` | ❌ W0 | ⬜ pending |
| 44-01-05 | 01 | 2 | FR-18.3 | — | Closed-form optimal | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_hedging_cost_solver` | ❌ W0 | ⬜ pending |
| 44-01-06 | 01 | 3 | FR-19.1 | T-44-01 | Legal gate (no bypass) | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_bkhit_quarantine_hard_block` | ❌ W0 | ⬜ pending |
| 44-01-07 | 01 | 3 | FR-19.2 | T-44-02 | Logged override only | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_mst_axle_load_tactical_warning` | ❌ W0 | ⬜ pending |
| 44-01-08 | 01 | 3 | FR-19.3 | — | Hash match integrity | unit | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_surat_jalan_manifest_hash` | ❌ W0 | ⬜ pending |
| 44-01-09 | 01 | 4 | FR-17..19 | — | Router registration | integration | `backend\.venv\Scripts\python -m pytest backend/tests/test_intermodal_hedging_compliance.py -k test_api_endpoints` | ❌ W0 | ⬜ pending |
| 44-02-01 | 02 | 1 | FR-18.4 | — | Zero-emoji compliance | compile | `npm --prefix frontend run build` | ❌ W0 | ⬜ pending |
| 44-02-02 | 02 | 2 | FR-19.4 | — | Monochrome Lucide icons | compile | `npm --prefix frontend run build` | ❌ W0 | ⬜ pending |
| 44-02-03 | 02 | 3 | FR-17.3 | — | Popover state sync | compile | `npm --prefix frontend run build` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_intermodal_hedging_compliance.py` — Stubs for FR-17.1 through FR-19.3 test cases.
- [ ] Existing infrastructure covers test runner and fixtures.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Choke-Point hover popover in TopNav | FR-17.3 | Interactive mouse event in Next.js header | Click `INTERMODAL` in top nav, verify popover opens displaying Belawan, Bakauheni, and Sitinjau Lauik statuses. |
| Spoilage Hedging IDR formatting | FR-18.4 | Visual UI rendering | Trigger an incident in demo, inspect `MitigationTab`, verify `Rp` formatting without floating-point decimals. |
| Compliance Inspector Warning Badge | FR-19.4 | Visual UI rendering | Select heavy vehicle on alternative road, verify amber warning badge and reroute advisory appear. |
