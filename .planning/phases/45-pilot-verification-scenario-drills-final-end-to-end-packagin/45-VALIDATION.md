---
phase: 45
slug: pilot-verification-scenario-drills-final-end-to-end-packagin
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-10-03
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (Backend) + Next.js 14 Build Verification (Frontend) |
| **Config file** | `backend/pyproject.toml` & `frontend/package.json` |
| **Quick run command** | `backend/.venv/Scripts/pytest.exe backend/tests/test_pilot_e2e.py -q` |
| **Full suite command** | `backend/.venv/Scripts/pytest.exe backend/tests -q` |
| **Estimated runtime** | ~50 seconds (Full suite) / ~8 seconds (Pilot E2E only) |

---

## Sampling Rate

- **After every task commit:** Run `backend/.venv/Scripts/pytest.exe backend/tests/test_pilot_e2e.py -q`
- **After every plan wave:** Run `backend/.venv/Scripts/pytest.exe backend/tests -q`
- **Before `/gsd-verify-work`:** Full suite must be green (130+ tests passed) and `npm run build` in `frontend/` must be 100% clean.
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | FR-20.1 | T-45-01 | TestClient hermetic session with isolated SQLite WAL | integration | `backend/.venv/Scripts/pytest.exe backend/tests/test_pilot_e2e.py -k test_pilot_e2e_belawan_to_pekanbaru` | ❌ W0 | ⬜ pending |
| 45-01-02 | 01 | 1 | FR-20.1 | T-45-02 | Non-negotiable BKHIT Hard Block on missing quarantine | integration | `backend/.venv/Scripts/pytest.exe backend/tests/test_pilot_e2e.py -k test_pilot_e2e_bakauheni_strait_quarantine` | ❌ W0 | ⬜ pending |
| 45-01-03 | 01 | 1 | FR-20.1 | T-45-03 | Mandatory liability justification for MST Class III override | integration | `backend/.venv/Scripts/pytest.exe backend/tests/test_pilot_e2e.py -k test_pilot_e2e_sitinjau_lauik_mst_override` | ❌ W0 | ⬜ pending |
| 45-01-04 | 01 | 1 | FR-20.2 | T-45-04 | Docker Compose syntax and healthcheck validation | config | `docker compose config` | ✅ | ⬜ pending |
| 45-02-01 | 02 | 2 | FR-20.3 | — | N/A | manual/doc | `test -f docs/PreHub_Pilot_Onboarding_Manual.md` | ❌ W0 | ⬜ pending |
| 45-02-02 | 02 | 2 | FR-20.1 | — | N/A | doc/audit | `test -f docs/test_matrix.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/tests/test_pilot_e2e.py` — Stubs for FR-20.1 3-scenario pilot test suite
- [ ] `docs/PreHub_Pilot_Onboarding_Manual.md` — Creation of operator onboarding manual

*Existing infrastructure covers all other phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Multi-stage Docker container launch | FR-20.2 | Requires Docker daemon running on host | `docker compose up --build -d` and inspect `docker compose ps` for healthy status |
| Manual Runbook Readability & Procedure Verification | FR-20.3 | Human operator validation of SOPs | Review procedures in `docs/PreHub_Pilot_Onboarding_Manual.md` against live UI screens |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-10-03
