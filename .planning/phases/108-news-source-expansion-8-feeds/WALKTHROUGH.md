# Phase 108 — Walkthrough

**Code commit:** `1588d8b` (`feat(news): add 8 realtime sources (5 Tribun + Detik Finance/Katadata/Republika), Q8 BNPB/BMKG, noise prune, UA fix`).
**Docs state:** written from the current tree; no app code edited in this pass.
**Verification:** code inspection + commit evidence. Tests were not re-run.

---

## 1. Changed surface

| File:line | What changed |
|---|---|
| `backend/app/services/news_aggregator.py:130-164` | Added Tribun Padang, Palembang, Batam, Lampung, Aceh. Each carries `tier=TIER_2_AUTHORITATIVE_PRESS`, `category=REGIONAL_DISASTER`, and the matching province. |
| `backend/app/services/news_aggregator.py:165-185` | Added Detik Finance (`ECONOMIC_LOGISTICS`), Katadata (`ECONOMIC_LOGISTICS`), Republika (`NATIONAL_ALERT`). |
| `backend/app/services/news_aggregator.py:201-203` | Added Q8: `site:bnpb.go.id OR site:bmkg.go.id` with flood/landslide/quake/early-warning/extreme-weather terms across Sumatra. |
| `backend/app/services/news_aggregator.py:626-628` | Added Tribun-style promo/lifestyle terms to `EXCLUDED_NOISE_KEYWORDS`. |
| `backend/app/services/news_aggregator.py:983-995` | Replaced the legacy `PreHub Logistics Bot` UA with a Chrome UA and an RSS `Accept` header for direct feeds. |

No router, schema, or frontend component was changed by this commit. The new sources flow through the existing `fetch_rss_feed_items` → `extract_structured_news_batch` → `upsert_articles_to_supabase` path.

---

## 2. Feed inventory after the change

**23 direct feeds** (`news_aggregator.py:24-186`):

- 10 ANTARA bureaus: Sumut, Sumbar, Riau, Aceh, Sumsel, Lampung, Jambi, Bengkulu, Babel, Kepri.
- ANTARA Ekonomi.
- DetikSumut, Detik News, CNN Indonesia Nasional, CNBC Indonesia Market.
- 5 Tribun: Padang, Palembang, Batam, Lampung, Aceh.
- 3 national/economic: Detik Finance, Katadata, Republika.

**8 targeted queries** (`news_aggregator.py:189-204`), including Q8 official BNPB/BMKG.

**Per-feed caps:** direct RSS 40 items (`:998`); Google News 10 items (`:1050`).

---

## 3. Why the UA fix was necessary

The comment at `news_aggregator.py:983-985` records the observed behavior: Tribun regional hosts rejected the legacy bot UA with HTTP 403 while serving the same RSS to a standard browser UA. The fix is scoped to `fetch_rss_feed_items`; Google News still uses its own client at `:1047`.

This is a compatibility workaround, not an authentication bypass. It should be revisited if Tribun changes its WAF policy.

---

## 4. Noise-prune behavior

`is_relevant_logistics_or_disaster` (`news_aggregator.py:743-748`):

1. Reject if any `EXCLUDED_NOISE_KEYWORDS` term appears.
2. Accept only if a `LOGISTICS_DISASTER_KEYWORDS` term appears.

The new exclusions at `:626-628` specifically target Tribun's habit of publishing `jalan sehat`, `prakiraan cuaca`, `info cuaca`, and quiz-answer pages alongside regional news. `prakiraan cuaca` is also deliberately excluded from the weather-warning path; only explicit warning language survives.

---

## 5. Verification evidence

**Commit:** `.git/logs/HEAD:294` records `1588d8b722743ef5e541b0286c6fedb80c0560e6`.

**Tests that cover this area:**

- `backend/tests/test_news_pipeline.py:17-26` — feed/query presence, but only the old minimums (`>= 4` feeds, `>= 3` queries). It does **not** enumerate the eight new feeds.
- `backend/tests/test_news_pipeline.py:46-58` — BMKG-style early warning extraction.
- `frontend/e2e/news-live-audit.spec.ts:415-607` — expanded provider UI, badges, filter narrowing, no search rewrite. This stubs the backend; it proves rendering, not RSS reachability.

**Not run:** pytest/Playwright in this pass.

---

## 6. Operator-visible delta

1. Berita can now show Tribun Padang/Palembang/Batam/Lampung/Aceh, Detik Finance, Katadata, and Republika with their own source badges.
2. Q8 can surface a BNPB/BMKG bulletin that the previous query set missed.
3. Tribun no longer returns 403 to the ingestor.
4. Promo/lifestyle Tribun items no longer consume LLM budget.

---

## 7. Residual risks

- Silent feed failure: a 403/404 is logged at debug and contributes zero items.
- The 23-feed × 40-item surface is much larger than the 60-item extraction budget; Phase 109's round-robin is required to make the breadth real.
- The UA workaround can rot.
- Title-only dedup misses syndicated paraphrases.
- No test asserts the eight new feed URLs are correct or reachable.
