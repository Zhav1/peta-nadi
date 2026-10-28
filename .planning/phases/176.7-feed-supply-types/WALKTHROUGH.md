# WALKTHROUGH — Phase 176.7: Feed Supply & Type Vocabulary

**Mode:** docs-only record of built work; read-only inspection this pass.
**Trigger:** live audit — the news panel covered 7 of 10 provinces.

## What was done

1. Read the `44f0ee4` diffstat: 9 files, +454/−10.
2. Audited live breadth: 10 provinces in scope, 7 returning news.
   Missing: Jambi, Bangka Belitung, Bengkulu.
3. Probed candidates and accepted 8 feeds — 2 Jambi, 3 Bangka Belitung,
   3 Bengkulu — each after HTTP 200 **and** parseable XML. Rejected 10
   dead or invalid candidates.
4. Found the reason Bangka Belitung stayed empty even with feeds
   available: the canonical bucket was `"Bangka Belitung"`, so
   `"Kepulauan Bangka Belitung"` was classified as "not a Sumatra
   province" and discarded.
5. Added the official-name alias in three matchers — the extractor, the
   router, and the geocoder — since any single fix still dropped rows.
6. Normalised the gazetteer `type` vocabulary at the API boundary and in
   the generator: `regency` → `kabupaten`, `city` → `kota`,
   `district` → `kecamatan`.

## Evidence (verified this pass)

| Claim | Verification |
|---|---|
| Commit exists in history | `git log -1 44f0ee4` → `fix(m9-176.7): news feed supply for 3 provinces + gazetteer type vocabulary` |
| Diff scope | 9 files, +454/−10 |
| Alias present in extractor | `backend/app/nlp/news_extractor.py` contains `Kepulauan Bangka Belitung` |
| Alias present in router | `backend/app/routers/news_router.py` contains it |
| Alias present in geocoder | `backend/app/nlp/geocoding_service.py` contains it |
| Alias also in aggregator/gazetteer | `news_aggregator.py`, `gazetteer_data.py` contain it |
| Targeted specs | 69 (reported) — **not re-run in this pass** |
| news/geo pytest | 127 (reported) — **not re-run in this pass** |

## Deliberately NOT done (per scope)

- No UI change to the news cards.
- No expansion beyond the three audited provinces.
- No commit, no push from this documentation pass.

## Why this phase mattered beyond the three provinces

The province gap was the visible symptom. The cause was a string
identity mismatch between an official name and an internal bucket key,
and the same class of mismatch existed a second time in the gazetteer
`type` field. Both produced silent drops — no error, no warning, just
missing rows — which is why the fix had to be applied at every matcher
rather than at the one place the audit happened to look.
