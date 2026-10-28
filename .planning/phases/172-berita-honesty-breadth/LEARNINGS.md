# LEARNINGS — Phase 172: Berita Honesty & Breadth

**Window:** 2026-10-27 · Grounded facts only.

## 1. The single most valuable lesson

**Measure before theorising.** The visible symptom was provincial
imbalance, and the obvious theory was a biased feed. The measurement
said otherwise: **149 of the 150 newest articles were dropped by the
crisis gate.** Aceh dominance was an artefact of the gate, not of the
sources. Every quota-shaped fix aimed at the feed would have been tuned
against a phantom.

The second lesson is about labels: **a static tier constant must never be
labelled confidence.** `base_conf = 0.94 if TIER_1 else 0.86` renders as
a precise number next to an article. Precision is not calibration, and a
two-valued constant cannot be evidence.

## 2. Fixes tried (what worked, with file evidence)

1. **Calibrated confidence** — `news_confidence.py` (+145, new) computes
   `display_confidence`; the `0.94`/`0.86` pair is explicitly marked
   deprecated in the file header (`:3`, `:7`).
2. **Diversity over the same window** — per-source cap 12 plus province
   round-robin, applied on top of the untouched
   `order(created_at).limit(150)` (`news_router.py:35`). Rewriting the
   SQL was avoided deliberately.
3. **Province honesty** — ungeocoded articles carry `None`, displayed as
   `"Sumatera"`; the `"Sumatera Utara"` default is gone
   (`geocoding_service.py`, `news_extractor.py`).
4. **Observability first** — `/news/yield` (`news_yield.py`, +334) makes
   the keep/drop ratio and reasons queryable, which is what produced the
   149/150 finding.

## 3. Concerns (open)

1. Province round-robin can lift low-relevance rows into view; the
   per-source cap bounds volume, not relevance.
2. `display_confidence` is now the only honest number, but old clients
   that still read the legacy field would keep showing the constant —
   not verified in this phase.
3. The 150-row window is unchanged. If the gate keeps dropping ~99%, the
   ceiling on breadth is the window, not the quotas.

## 4. Conditions (observed this window)

- Users read "keyakinan" as a probability and act on it; a constant there
  is a trust liability, not a cosmetic issue.
- Provincial breadth is a product requirement for Sumatra coverage, not
  a nice-to-have.

## 5. Issues found (do not repeat)

1. Defaulting a missing field to the most common value ("Sumatera Utara")
   converts absence into a false assertion — the same class of bug as
   Phase 167's zero-for-unknown.
2. A ranking rule (`created_at` only) is also a diversity policy by
   default; it must be stated as such or corrected.
3. Nothing in the pipeline reported its own drop rate until this phase,
   which is why a 99% loss went unnoticed.

## 6. Environment constraints (this checkout)

- Windows + PowerShell. Backend interpreter is
  `backend/.venv/Scripts/python.exe`, not a bare `python`.
- Playwright `webServer` serves the PREBUILT
  `frontend/.next/standalone/server.js`; a build must run before e2e.
- Concurrent sessions share this checkout: never `git add -A` without
  authorisation; never kill port 3000 blindly.
- Free subagent model quota can be exhausted mid-run; keep a fallback
  model configured.
- Four backend tests fail at baseline: `test_impact_assessment`,
  `test_travel_fuel_guard` (×2), and
  `test_cpu_routing_weather::…seed_fallback`. Treat them as pre-existing.
