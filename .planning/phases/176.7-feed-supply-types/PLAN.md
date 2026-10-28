# PLAN — Phase 176.7: Feed Supply & Type Vocabulary

**Window:** 2026-10-28 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `44f0ee4` — `fix(m9-176.7): news feed supply for 3 provinces + gazetteer type vocabulary`
**Diff size (verified):** 9 files, +454/−10

## Objective

A live audit of the news panel showed breadth of **7/10 Sumatra
provinces**: Jambi, Bangka Belitung, and Bengkulu returned nothing. Fill
the gap with verified sources, and fix the two data-shape bugs that the
audit exposed on the way.

## Scope IN — supply

- Probed candidate feeds; accepted **8 new feeds** only after HTTP 200
  **and** parseable XML: 2 Jambi, 3 Bangka Belitung, 3 Bengkulu.
- Rejected **10 dead or invalid candidates** rather than shipping
  providers that would silently return empty.

## Scope IN — the real bug

- The canonical bucket was `"Bangka Belitung"`, so incoming
  `"Kepulauan Bangka Belitung"` was discarded as "not a Sumatra
  province". Fixed with an official-name alias in the **extractor, the
  router, and the geocoder** — all three, because any one of them alone
  still drops the row.
- Gazetteer `type` vocabulary normalised at the API boundary and in the
  generator: `regency` → `kabupaten`, `city` → `kota`,
  `district` → `kecamatan`.

## Scope OUT

- No UI change; nothing in the panel was restyled here.
- No new provinces outside the three audited gaps.
- No change to the scrapers' scheduling.

## Decisions locked

1. **Acceptance is evidence, not reputation.** A feed enters only on
   HTTP 200 plus parseable XML; 10 candidates failed that bar and were
   dropped.
2. **One canonical name per province, with explicit aliases.** Bucket
   names are keys, so an alias must be declared where matching happens —
   not normalised ad-hoc at each call site.
3. **Vocabulary is normalised at the boundary.** Internal `regency` /
   `city` / `district` must not leak into API responses; the Indonesian
   set (`kabupaten` / `kota` / `kecamatan`) is the contract.
4. **Empty is honest, dead is not.** Adding unverified feeds would have
   turned a visible 7/10 into an invisible 10/10 of mostly empty cards.

## Risk notes

- The alias fix has to exist in three places; a fourth matcher added
  later without the alias re-opens the drop, and the drop is silent.
- Feed liveness is not permanent. A probed-200 feed can die; the
  rejected list is a record of how quickly that happens.
