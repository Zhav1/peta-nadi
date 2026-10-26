# LEARNINGS — Phase 141: Evaluasi Split Tabs + Fixes

**Window:** 2026-10-26 → 2026-10-27 · Grounded facts only (grep / `git show` this pass).

## 1. Fixes tried (what worked, with file evidence)

1. **Internal Skenario vs Aktual 1:1 split** — `EvaluationSection.tsx:221`
   (switcher forces batch vs live), `:346` (Tab A read-only batch, rumus 1:1),
   `:364` (Tab B live aggregate, rumus 1:1), `:513-539` (switcher UI),
   `:767-768` (Skenario-vs-Aktual table headers), `:833-837` (Tab B section).
2. **Live-vs-batch delta strip hidden from Aktual** —
   `EvaluationSection.tsx:887` (PHASE5 comment).
3. **Dead dispatch replaced with inline modal** — `EvaluationSection.tsx:948-949`
   states `pidi:open-verifikasi` had no listener; the shared
   `OutcomeVerificationForm` (import `:43`) now opens inline (`:958-979`),
   dispatcher-gated (`:243`) with the same form as the Laporan tab (`:930`).
4. **Fuel plausibility guard, three layers**:
   - Backend: `travel_ledger_service.py:188-266` (`FuelPlausibilityError`,
     1.5–25 km/L band, 3× baseline-estimate cap, 120L/73km example `:191`).
   - Router: `travels_router.py` maps it to 422 on create + update
     (verified: `git show 08bf11a -- backend/app/routers/travels_router.py`).
   - Frontend: `LaporanAktualModal.tsx` pre-PATCH mirror + `/tidak wajar|422/`
     → inline field error + placeholder `cth. 120` → `cth. 25`
     (verified: `git show 08bf11a -- …/LaporanAktualModal.tsx`).
5. **Test fixture corrected, not weakened** — `test_travels_erp.py` 60L→40L
   with NOTE comment explaining ≈1.86 km/L keeps the loss intent inside the
   guard; new `test_travel_fuel_guard.py` (+127) covers the guard itself.
6. **Laporan Keputusan strip + fleet footer** — `LaporanHybridPanel.tsx:146`
   (`keputusanCounts`), `:366-373` (`keputusan-strip` testid, incl.
   empty state), `:310-311` (fleet-efficiency footer: avg km/L, measured /
   unmeasured counts).

## 2. Concerns (open, evidenced)

1. **Guard band is truck-diesel-specific** (1.5–25 km/L): any future
   non-diesel asset class silently inherits a wrong band — the range lives in
   three places (service, modal, test NOTE) with no shared constant.
2. **422 detection is message-regex** (`/tidak wajar|422/`): a backend
   rewording of the guard message drops the frontend back to the generic
   submit-error path.

## 3. Constraints (observed this window)

- `c10218a` is a single-file frontend change (`EvaluationSection.tsx` only) —
  the split touched no backend contract.
- `08bf11a` kept backend changes additive (new exception + 2× except-mapping,
  +139 service lines, no schema change).

## 4. Conditions (environment this window)

- Order in-window: `d7f81d3` (23:28) → `c10218a` (23:42) → `08bf11a` (00:03),
  i.e. the laporan strip landed between the live-reader (`2069c23` 23:00)
  and the tab split.
- Handoff-reported, not re-verified: user conditions "frontend-only lock",
  "no E2E break", "Vercel deploy", "subagents to avoid main-context clutter",
  "backend open except outcomes wiring", plus "concurrent-worker dirty files"
  and "stash merge" incidents — recorded here as brief-stated, with git-side
  consistency (no `e2e/` paths in any of the three commits' stats) supporting
  only the no-E2E-break item.

## 5. Issues found (do not repeat)

1. **Never dispatch custom window events without a listener in-tree**:
   `pidi:open-verifikasi` shipped with zero listeners (admitted at
   `EvaluationSection.tsx:948-949`) — grep for the handler *before* wiring
   the dispatch.
2. **Demo-magnitude placeholders leak into prod inputs**: `cth. 120` was
   itself an implausible value for a 73 km trip — placeholders must pass the
   same guard as real input.
