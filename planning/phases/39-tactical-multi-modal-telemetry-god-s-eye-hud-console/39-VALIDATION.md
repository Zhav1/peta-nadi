---
phase: 39
slug: tactical-multi-modal-telemetry-god-s-eye-hud-console
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-24
---

# Phase 39 — Validation Strategy: Tactical Multi-Modal Telemetry & God's-Eye HUD Console

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Pytest 8.2.2 + pytest-cov 5.0.0 (Python) & TypeScript tsc / Next.js ESLint (Frontend) |
| **Config file** | `backend/.coveragerc`, `frontend/tsconfig.json` |
| **Quick run command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_vehicles_telemetry.py -v` |
| **Full suite command** | `backend/.venv/Scripts/python.exe -m pytest backend/tests/ -q --tb=line && node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit` |
| **Estimated runtime** | ~6 seconds |

---

## Sampling Rate

- **After every task commit:** Run `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_vehicles_telemetry.py -v`
- **After every plan wave:** Run full test suite & TypeScript compile check
- **Before `/gsd-verify-work`:** Full test suite green (75+ passing, 0 TypeScript errors)
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 39-01-01 | 01 | 1 | FR-13.1 | — | Strict Pydantic schema validation for transponder coordinates & speed | unit | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_vehicles_telemetry.py::test_fleet_telemetry_schema -v` | ❌ W0 | ⬜ pending |
| 39-01-02 | 01 | 1 | FR-13.1 | — | Cold-chain temperature parsing & alert threshold evaluation (<=4°C normal, >4°C alert) | unit | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_vehicles_telemetry.py::test_cold_chain_threshold_evaluation -v` | ❌ W0 | ⬜ pending |
| 39-01-03 | 01 | 1 | FR-13.1, NFR-8 | — | Graceful fallback to synthetic transponder cache when Redis/OpenSky offline | integration | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_vehicles_telemetry.py::test_offline_telemetry_fallback -v` | ❌ W0 | ⬜ pending |
| 39-02-01 | 02 | 2 | FR-13.3, NFR-6 | — | Native Mapbox WebGL symbol & line layer setup replacing DOM markers | static/build | `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit` | ✅ yes | ⬜ pending |
| 39-02-02 | 02 | 2 | FR-13.2 | — | Target locking reticle overlay & dynamic forward bearing vector calculation | unit/static | `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit` | ✅ yes | ⬜ pending |
| 39-02-03 | 02 | 2 | FR-13.2, NFR-10 | — | God's-Eye follow-camera tracking & monospaced tactical HUD card | integration | `node frontend/node_modules/typescript/bin/tsc -p frontend/tsconfig.json --noEmit && npm run --prefix frontend lint` | ✅ yes | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `backend/tests/test_vehicles_telemetry.py` — dedicated unit & integration tests covering FR-13.1 transponder schemas, cold-chain checks, and offline resilience.
- [ ] `backend/app/schemas/fleet.py` — Pydantic schema models for enriched transponders.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WebGL 60 FPS under map pitch/rotation | NFR-6 | GPU frame render smoothness requires interactive canvas inspection | Launch dev server, rotate and pitch map to 45°, observe DevTools FPS counter >= 55 FPS |
| Follow-camera disengagement on user drag | FR-13.2 | Mouse drag interaction event propagation | Click an asset, verify camera follows, manually drag canvas and verify follow-mode disengages immediately |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-24
