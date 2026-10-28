# PLAN — Phase 172: Berita Honesty & Breadth

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `83a12fe` — `feat(m9-172): news yield diagnostic, honest province derivation, breadth quotas, calibrated confidence`

## Objective

Replace three measured falsehoods in the Berita feed — a constant
labelled as confidence, a window with no diversity, and a default
province — with measured values, explicit quotas, and honest absence.

## Scope IN

- **Confidence** (`backend/app/services/news_confidence.py`, new): the
  displayed "keyakinan" was `base_conf = 0.94 if TIER_1 else 0.86` — a
  two-value constant dressed as a probability. Replaced by
  `display_confidence`, a calibrated value that is never the constant.
- **Read path** (`backend/app/routers/news_router.py`, +299): the window
  `order(created_at).limit(150)` had no diversity rule. Added **per-source
  cap 12** plus a **province round-robin**. The SQL window itself is
  untouched (`news_router.py:35`); diversity is applied over it.
- **Province honesty** (`backend/app/nlp/geocoding_service.py`,
  `news_extractor.py`): an ungeocoded article defaulted to
  "Sumatera Utara". Now `None`, falling back to a neutral "Sumatera".
- **Measurement** (`backend/app/services/news_yield.py`, new, +334):
  `/news/yield` diagnostic endpoint reporting what the pipeline keeps
  and what it drops, and why.
- Frontend (`components/dashboard/DashboardClient.tsx`,
  `hooks/useNewsVerification.ts`, `lib/types.ts`): render
  `display_confidence`, the honest province, and the quota-shaped feed.
- Tests: `backend/tests/test_news_breadth_confidence.py`,
  `frontend/e2e/news-honesty-breadth.spec.ts`.

## Scope OUT

- No new news source onboarded.
- No weakening of the crisis gate — see 172.5.
- No change to ingestor cadence.

## The measurement that reframed the phase

**149 of the 150 newest articles were dropped by the crisis gate.** The
perceived Aceh dominance was therefore a gate artefact, not a feed
bias. Quotas alone could not fix it; the next phase had to add a display
tier instead.

## Decisions locked

1. **A static tier constant must never be labelled confidence.** If the
   number cannot vary with evidence, it is a classification, and it must
   be named as one.
2. Ungeocoded is `None`, never the most populous province. A default
   province is a fabricated fact.
3. Breadth is enforced by explicit rules — per-source cap 12, province
   round-robin — not by hoping the newest 150 rows are varied.
4. Diagnosis precedes repair: `/news/yield` exists so the drop rate is
   observable rather than inferred.

## Risk notes

- Round-robin over provinces can promote low-relevance rows. The cap
  bounds it per source, but relevance is not the ordering key.
