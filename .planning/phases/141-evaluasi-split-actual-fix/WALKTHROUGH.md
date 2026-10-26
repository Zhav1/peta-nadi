# WALKTHROUGH — Phase 141: Evaluasi Split Tabs + Fixes

**Commits:** `d7f81d3` (23:28) + `c10218a` (23:42) + `08bf11a` (2026-10-27 00:03).
**Mode:** docs-only; no code touched, no tests re-run, no commit.

## What was done

1. `d7f81d3` — laporan Keputusan strip + split + footer (`LaporanHybridPanel.tsx` +60):
   - `keputusanCounts` memo (`:146`), `keputusan-strip` testid block
     (`:366-373`: Lanjut / Ubah Rute / Tahan counts, empty-state copy).
   - Fleet-efficiency footer (`:310-311`: avg km/L, measured/unmeasured Trip counts).
2. `c10218a` — Internal Skenario vs Aktual 1:1 split (`EvaluationSection.tsx` +218/−103):
   - Internal switcher Tab A (batch read-only, rumus 1:1) vs Tab B (live)
     (`:513-539`); Tab A section (`:539-545`), Skenario-vs-Aktual table
     headers (`:767-768`), Tab B live aggregate (`:833-837`); 1:1 comments
     (`:221,346,364`).
3. `08bf11a` — Aktual deltas/targets fix + verifikasi modal + fuel guard (6 files, +387/−22):
   - `travel_ledger_service.py` (+139): `FuelPlausibilityError` + plausibility
     validator (1.5–25 km/L, 3× baseline-estimate cap).
   - `travels_router.py` (+5): 422 mapping on create + update
     (verified: `git show 08bf11a -- …travels_router.py`).
   - `test_travel_fuel_guard.py` (+127, new) + `test_travels_erp.py` fixture
     60L→40L with NOTE comment (verified via `git show 08bf11a`).
   - `LaporanAktualModal.tsx` (+35): frontend guard mirror + 422→field-error
     mapping + placeholder `120`→`25` (verified via `git show 08bf11a`).
   - `EvaluationSection.tsx` (+96): Aktual delta/target fixes + inline
     `OutcomeVerificationForm` modal.
4. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence (verified by grep / git show this pass)

| Claim | Verification |
|---|---|
| Tab switcher + 1:1 comments | `EvaluationSection.tsx:221,346,364,513-539,833` |
| Live delta strip hidden from Aktual | `EvaluationSection.tsx:887` (PHASE5 comment) |
| Inline verifikasi replaces dead dispatch | `EvaluationSection.tsx:948-949` ("Pengganti dispatch `pidi:open-verifikasi` yang tak punya [listener]"); import `:43`; modal `:958-979` |
| Dispatcher gate for Catat verifikasi | `EvaluationSection.tsx:243` |
| Fuel guard backend | `travel_ledger_service.py:188-266` (`FuelPlausibilityError`, 120L/73km example `:191`, 3× rule `:194`) |
| 422 wiring create+update | `git show 08bf11a -- backend/app/routers/travels_router.py` (2× `except FuelPlausibilityError → 422`) |
| Frontend mirror + placeholder | `git show 08bf11a -- …/LaporanAktualModal.tsx` (1.5–25 km/L block, `/tidak wajar\|422/` mapping, `cth. 25`) |
| Test fixture correction | `git show 08bf11a -- backend/tests/test_travels_erp.py` (60L→40L + NOTE) |
| Keputusan strip + footer | `LaporanHybridPanel.tsx:146,310-311,366-373` |
| Commit sizes | `git show --stat d7f81d3` (+60); `c10218a` (+218/−103, 1 file); `08bf11a` (+387/−22, 6 files) |

## Deliberately NOT done (per scope)

- No code edits, no test/build re-runs, no E2E changes.
- No commit, no push.
