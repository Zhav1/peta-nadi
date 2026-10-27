# LEARNINGS — Phase 154: P5 HITL / Detail 3-Section

**Window:** 2026-10-26/27 · Grounded facts only.

## 1. Fixes tried (what worked, with file evidence)

1. **Evidence gate on decisions** — APPROVE/OVERRIDE require grounded
   evidence; HOLD exempt as the safe default.
2. **Forecast total block** — client disables + handler early-returns +
   server 409 (defense in depth, Phase 110 contract kept).
3. **Silent guest** — role gate enforces read-only; banner removal cut
   noise without weakening enforcement.
4. **Mitigation mirror** — `hitlBlocked` replicates the modal gate so the
   tab and modal never disagree.

## 2. Concerns (open, evidenced)

1. Client + handler + server triple-checks must stay aligned; any new
   decision path needs all three.
2. Notes-required rule for Tahan/Lanjut must survive form refactors
   (`:742` hint).

## 3. Constraints (observed this window)

- E2E route→HITL→commit never breaks: gates additive, role matrix intact.
- Auth-first HITL: Dispatcher writes, Regulator HOLD-only, Guest sandbox.
- Playwright per phase for the approval pipeline (Phase 68 precedent).

## 4. Conditions (user-stated this window)

- Hold/reroute only after a real route; forecast = pantau saja.
- Watermelon blocks for modal chrome (AlertDialog pattern).

## 5. Issues found (do not repeat)

1. Banners do not enforce — role + evidence gates do; never rely on a
   watermark for security.
2. `benchHud` empirical-metric line removed from modal — keep validation
   metrics on the EVALUASI surface, not per-route chrome.
