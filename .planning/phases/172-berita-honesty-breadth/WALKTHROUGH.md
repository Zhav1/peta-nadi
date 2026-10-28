# WALKTHROUGH — Phase 172: Berita Honesty & Breadth

**Mode:** docs-only. Source and tests untouched. Test counts are those
recorded for `83a12fe`; they were **not re-run** in this pass.

## What was done

1. Read the `83a12fe` diff (11 files, +1858/−42).
2. Confirmed the confidence falsehood in `news_confidence.py`: the file
   header itself records the SPEC decision and the deprecated
   `0.94` (TIER_1) / `0.86` (everything else) pair.
3. Confirmed the read-path window: `order(created_at).limit(150)` with
   no diversity rule. The comment at `news_router.py:35` states the SQL
   path is untouched; per-source cap 12 and province round-robin are
   applied over that window.
4. Confirmed the province default (`"Sumatera Utara"` when ungeocoded)
   was removed in favour of `None` → `"Sumatera"`.
5. Read `news_yield.py` (+334, new) for the `/news/yield` diagnostic.
6. Read the headline measurement: **149 of 150** newest articles dropped
   by the crisis gate — i.e. Aceh dominance was the gate, not the feed.
7. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Constant was displayed as confidence | `news_confidence.py:3,7` documents `0.94`/`0.86` as deprecated |
| New calibrated field | `display_confidence` in `news_confidence.py` (+145, new) |
| Read window unchanged | comment at `news_router.py:35`: SQL path untouched, still `limit(150)` |
| Diversity rules | per-source cap 12 + province round-robin in `news_router.py` |
| Province honesty | `geocoding_service.py` / `news_extractor.py`: `None` then `"Sumatera"` |
| Diagnostic endpoint | `news_yield.py` (+334, new), `/news/yield` |
| Gate drop rate | 149 of 150 newest dropped — *recorded* |
| Backend tests | 22 + 43 passed — *recorded* |
| Playwright | 10 passed — *recorded* |

## Shape of the change

```
before:  confidence  = 0.94 if TIER_1 else 0.86      (constant, labelled "keyakinan")
         feed        = newest 150 rows, no diversity
         province    = "Sumatera Utara" default       (fabricated fact)
         visibility  = none into what was dropped

after:   confidence  = display_confidence (calibrated)
         feed        = newest 150 → per-source cap 12 → province round-robin
         province    = None → "Sumatera"
         visibility  = /news/yield reports keep/drop reasons
         measurement: 149/150 dropped by the crisis gate
```

## Deliberately NOT done

- No re-run of pytest or Playwright in this docs pass.
- No code, spec, or test edits; no commit, no push.
- No quota tuning intended to defeat the crisis gate — the measurement
  showed that was the wrong lever, which is why 172.5 adds a display
  tier instead.
