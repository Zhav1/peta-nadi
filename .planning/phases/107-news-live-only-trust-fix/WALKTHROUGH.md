# Phase 107 — Walkthrough

**Code commit:** `4e8781b` (`fix(news): live-only feed, drop unresolvable links, freeze timestamp, expand to 10 provinces + weather YELLOW + strict Playwright audit`).
**Docs state:** this file was written after the fact from the current tree; no app code was edited in this pass.
**Verification:** commit evidence + code inspection. Playwright/pytest were **not** re-run in this docs-only pass.

---

## 1. What actually changed

| File:line | What it does now |
|---|---|
| `frontend/hooks/useNewsVerification.ts:296-306` | Starts with `newsFeed = []`, `status = 'warming'`. No offline fixture import. |
| `frontend/hooks/useNewsVerification.ts:322-337` | Reads `last_updated` and `articles||items` from the live response only. |
| `frontend/hooks/useNewsVerification.ts:370-373` | Calls `normalizeNewsPermalink`; `null` means the article is not rendered. |
| `frontend/hooks/useNewsVerification.ts:497-514` | Final admission gate: drops DROPPED, un-geocoded, linkless, coordinate-less, out-of-Sumatra, stale/discourse-failing rows. |
| `frontend/hooks/useNewsVerification.ts:515-526` | Sorted id signature; only a changed signature commits a new feed and a new global clock. |
| `frontend/hooks/useNewsVerification.ts:527-537` | Empty/failed response keeps last-good rows and reports `warming`; never falls back to fixtures. |
| `frontend/components/dashboard/DashboardClient.tsx:2948-2957` | Honest empty-state text: "Belum ada berita live terverifikasi" / "tidak ada data cadangan". |
| `backend/app/services/news_aggregator.py:282-291` | Publisher search-URL fallback removed; function returns `None`. |
| `backend/app/services/news_aggregator.py:294-322` | `_is_unresolvable_article_url` rejects roots, Google hosts, dummy ids, malformed ANTARA ids. |
| `backend/app/services/news_aggregator.py:1007-1014` | RSS keyword gate then resolve-or-drop. |
| `backend/app/services/news_aggregator.py:1061-1072` | Google News targeted path does the same. |
| `backend/app/routers/news_router.py:41-63` | `_max_published_at_iso` replaces `now()` as the freshness source. |
| `backend/app/routers/news_router.py:277-295` | 30 s cache hit replays the stored timestamp. |
| `backend/app/routers/news_router.py:304-307` | Reads 150 rows so the 48 h/tier/geo filters have candidates. |
| `backend/app/routers/news_router.py:309-383` | On-read re-tier + freshness guard duplicates the service guard defensively. |
| `backend/app/routers/news_router.py:402-413` | `last_updated` = newest real `published_at`; `now()` only with zero data. |
| `backend/app/routers/news_router.py:425-437` | Legacy search links force a background refresh. |
| `backend/app/routers/news_router.py:439-462` | Final sanitization; unresolvable rows are skipped. |
| `backend/app/services/news_aggregator.py:1182-1201` | Upsert preserves `original_pub_date`, recomputes `published_at_iso`, stores `age_hours`. |
| `backend/app/services/news_aggregator.py:1734-1759` | Read path distrusts legacy `published_at` overwritten by `now()`, lets URL archival detection dominate. |
| `backend/app/services/news_aggregator.py:81-101` | ANTARA Babel + Kepri feeds. |
| `backend/app/services/news_aggregator.py:189-204` | Q6 Kepri/Babel + Q7 Aceh + Q8 BNPB/BMKG. |
| `backend/app/nlp/news_extractor.py:508-537` | Weather-warning-only detector. |
| `backend/app/nlp/news_extractor.py:1104-1116` | Advisory cap to YELLOW. |

No change was made to the feed schema, Supabase migrations, or the LLM gateway.

---

## 2. Behavior deltas an operator sees

1. **Cold start:** Berita shows "Belum ada berita live terverifikasi" and zero cards. The old Belawan/Malaka/Lau Cih/Sitinjau/Kualanamu/Belmera fixtures are gone.
2. **Dead links:** a row with a bare root, dummy id, or `news.google.com/search` link disappears instead of opening a search page.
3. **Refresh:** two polls with the same article ids leave the per-article timestamp and the "diperbarui" clock unchanged.
4. **Coverage:** Batam/Kepri, Babel, and the Aceh east coast are reachable; the province filter can isolate them.
5. **Weather:** "Waspada gelombang tinggi" without a closure becomes YELLOW, not RED.

---

## 3. Fixes tried and rejected

| Attempt | Why it was rejected | Current approach |
|---|---|---|
| Seed the sidebar with `FALLBACK_SUMATRA_NEWS` when the backend is empty | It is indistinguishable from live data and produced fake Belawan headlines | Honest warming state; no fixture |
| Rewrite an unresolvable link to a publisher `/search?q=` page | A search page is not an article permalink; the citation is dead | Resolve or drop |
| Keep `last_updated = now()` on every response | The clock moves while the feed is frozen; operators read it as freshness | Newest real `published_at`, replayed from cache |
| Trust `published_at` from legacy DB rows | Older upserts overwrote it with `now()` | Distrust when schema < 3 and URL carries an archival date |
| Keep a 60-row read window | DROPPED rows push valid rows out | Read 150, then filter |
| Let the client filter weather text | Server and map zone would disagree | Server caps to YELLOW; client mirrors |

---

## 4. Verification evidence

**Commit:** `.git/logs/HEAD:290-293` records the commit and the rebase pick; the final hash is `4e8781ba03ad69035e8c94ed6ee6e094e7c5ff44`.

**Automated contract that exists:**

- `frontend/e2e/news-live-audit.spec.ts:141` — warming + empty has no fixtures.
- `:191` — unresolvable links dropped, no search anchors.
- `:268` — identical ids freeze both clocks.
- `:344` — Kepri + Lampung reachable.
- `:415` — 9-outlet expanded feed renders every badge.
- `:609` — cache re-poll performs no re-verify/LLM call.

**Not run in this pass:** the six Playwright specs and the pytest news suite. The docs commit only records the contract and the code evidence.

---

## 5. Residual risks

1. `last_updated` still falls back to `now()` when the live feed is genuinely empty (`news_router.py:412-413`); the UI must not render that as "data is fresh".
2. Client id-signature suppression means an in-place correction with the same id is invisible until the id changes.
3. The 150-row read is a window, not a guarantee; DROPPED volume can still starve low-volume provinces.
4. Keyword-based noise pruning can drop legitimate logistics copy that mentions a hospital, promo, or travel word.
5. Reader-side fix only: legacy search URLs remain in Supabase until a later upsert replaces them.
