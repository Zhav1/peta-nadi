# WALKTHROUGH — Phase 171: Sumatra Gazetteer

**Mode:** docs-only. Source and data untouched. Test counts are those
recorded for `2783c10`; they were **not re-run** in this pass.

## What was done

1. Read the `2783c10` diff (9 files, +29,464/−52).
2. Counted the dataset directly from
   `backend/app/nlp/data/sumatra_admin_gazetteer.json`: **2,096 rows**,
   by type — `kabupaten` 118, `kecamatan` 1,944, `kota` 34.
3. Confirmed the record shape: `id`, `name`, `type`, `province`,
   `parent`, `aliases`, `lat`, `lon`.
4. Read `backend/app/nlp/gazetteer_data.py` for the matching path —
   alias lookup plus fuzzy and diacritic-insensitive comparison, not
   slug-only equality.
5. Read `backend/app/routers/geocode_router.py` for the split: gazetteer
   answers offline, `desa` defers to Nominatim with an explicit offline
   state.
6. Confirmed the shortfall is documented rather than patched: 23 rows
   (Natuna, Belitung Timur, 21 kecamatan) are absent by decision.
7. Wrote this folder's `PLAN.md` / `WALKTHROUGH.md` / `LEARNINGS.md`.

## Evidence

| Claim | Source |
|---|---|
| Record count | 2,096 — counted from the JSON this pass |
| Breakdown | 118 kabupaten, 34 kota, 1,944 kecamatan — counted this pass |
| Builder is in-repo | `scripts/build_sumatra_gazetteer.py` (+1,294, new) |
| Matching is fuzzy + diacritic-insensitive | `gazetteer_data.py` (+281) |
| `desa` needs network | `geocode_router.py` (+152) with explicit offline state |
| Coverage test | `backend/tests/test_gazetteer_coverage.py` (146 lines, new) |
| Browser test | `frontend/e2e/gazetteer-search.spec.ts` (168 lines, new) |
| Shortfall | 23 rows unplaced (Natuna, Belitung Timur, 21 kecamatan) — *recorded*, not fabricated |
| pytest | 19 + 43 passed — *recorded* |
| Playwright | 2 passed — *recorded* |
| Accuracy spot-check | 10/10 cities within 15 km — *recorded* |

## Shape of the change

```
before:  query ──> slug equality against a small catalogue ──> usually nothing

after:   query ──> alias / fuzzy / diacritic match ──> 2,096-record offline
         gazetteer (kabupaten, kota, kecamatan)
              └─ desa ──> Nominatim ──(offline)──> stated offline state
         unplaced: 23 rows, absent and recorded — never guessed
```

## Deliberately NOT done

- No re-run of pytest, Playwright, or the 10-city spot-check.
- No code, data, spec, or test edits; no commit, no push.
- No attempt to fill the 23 unplaced rows. Natuna and Belitung Timur are
  island/archipelago cases where a plausible-looking coordinate would be
  worse than an honest gap.
