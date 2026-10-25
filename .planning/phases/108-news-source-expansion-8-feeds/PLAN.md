---
phase: 108
phase_name: News Source Expansion — 8 Realtime Feeds
milestone: M7
milestone_name: Live News Trust, Source Breadth & Forecast Waspada Integrity
created_at: "2026-10-25T00:00:00.000Z"
status: completed
code_commit: 1588d8b
framework: GSD
---

# Phase 108 — News Source Expansion (8 Realtime Feeds)

**Status:** IMPLEMENTED (commit `1588d8b`); documented in this pass.
**Commit subject:** `feat(news): add 8 realtime sources (5 Tribun + Detik Finance/Katadata/Republika), Q8 BNPB/BMKG, noise prune, UA fix`.
**Depends on:** Phase 107 (live-only trust fix).
**Followed by:** Phase 109 (intake fairness so the larger feed set is actually consumed).

---

## 1. Goal

Widen the Berita feed beyond ANTARA/DetikSumut/CNN/CNBC without turning it into a general-news firehose:

1. Add five Tribun regional editions and three national economic outlets as direct RSS.
2. Add an official BNPB/BMKG targeted query (Q8) for early-warning recall.
3. Prune Tribun-style promo/lifestyle noise before it reaches the extractor.
4. Fix the Tribun HTTP 403 caused by the legacy bot User-Agent.

---

## 2. What the feed set looks like now

### 2.1 Direct RSS (`OFFICIAL_RSS_FEEDS`)

`backend/app/services/news_aggregator.py:24-186` defines **23** direct feeds:

| Group | Count | Lines |
|---|---|---|
| LKBN ANTARA bureaus (Sumut, Sumbar, Riau, Aceh, Sumsel, Lampung, Jambi, Bengkulu, Babel, Kepri) | 10 | `24-94` |
| LKBN ANTARA Ekonomi | 1 | `95-101` |
| DetikSumut, Detik News, CNN Indonesia, CNBC Indonesia | 4 | `102-129` |
| **Tribun Padang, Palembang, Batam, Lampung, Aceh** (new in 108) | 5 | `130-164` |
| **Detik Finance, Katadata, Republika** (new in 108) | 3 | `165-185` |

### 2.2 Targeted Google News queries

`backend/app/services/news_aggregator.py:189-204` defines Q1–Q8:

| Query | Focus | Line |
|---|---|---|
| Q1 | Sumut spine: Belawan, Tebing Tinggi, Asahan/Kisaran, Rantauprapat, Sibolga | `192` |
| Q2 | Sitinjau Lauik / Padang–Solok / Pekanbaru–Dumai | `193` |
| Q3 | BULOG rice / chili / food supply | `194` |
| Q4 | Malacca Strait waves / Belawan / Panjang / Bakauheni / truck queues | `195` |
| Q5 | Jalintim / Jalinbar / broken bridges / Palembang–Jambi–Lampung | `196` |
| Q6 | Kepri/Babel maritime + tin: Batam, Tanjung Pinang, Natuna, Pangkalpinang | `198` |
| Q7 | Aceh east coast: Tamiang, Langsa, Lhokseumawe, Banda Aceh | `200` |
| **Q8** | **BNPB/BMKG official bulletins: flood, landslide, quake, early warning, extreme weather** | **`201-203`** |

### 2.3 Fetch limits

| Path | Cap | Line |
|---|---|---|
| Direct RSS | first 40 `<item>` per feed | `998` |
| Google News targeted | first 10 `<item>` per query | `1050` |

These are per-feed caps. The per-cycle extraction budget is handled in Phase 109 (`NEWS_INGEST_ITEM_BUDGET = 60`, round-robin by source).

---

## 3. Issues found and fixes

| Issue | Evidence | Fix |
|---|---|---|
| Tribun regional feeds returned HTTP 403 to the legacy bot UA | `news_aggregator.py:983-995` comment records the 403 and the browser-UA requirement | Desktop Chrome UA + `Accept: application/rss+xml,...` |
| Tribun promo/lifestyle spam reached the gate | `news_aggregator.py:626-628` adds `jalan sehat`, `jalan santai`, `prakiraan cuaca`, `info cuaca`, `kunci jawaban` to `EXCLUDED_NOISE_KEYWORDS` | Pruned before relevance check |
| Medan-centric coverage | `news_aggregator.py:190-192` plus Q6/Q7 | Wider corridors |
| No official BNPB/BMKG query | Q8 at `news_aggregator.py:201-203` | Official-domain query added |
| Economic coverage limited to CNBC | Detik Finance, Katadata, Republika added at `news_aggregator.py:165-185` | Three economic/national feeds |
| Kepri absent from the bureau list | ANTARA Kepri added at `news_aggregator.py:88-94`; Tribun Batam at `145-150` | Kepri reachable (proven by Playwright spec d/e) |

---

## 4. Non-goals

- No new NLP taxonomy; the extractor still uses the existing hazard/region schema.
- No new database table; feeds land in `news_articles` via the existing upsert path.
- No removal of ANTARA/Detik/CNN/CNBC.
- No paywall/login bypass, no headless browser for RSS.

---

## 5. Operating constraints

- Windows PowerShell, repo `D:\College\Pidi.id`.
- Render free Singapore single worker; no Redis by default.
- Supabase PostGIS; `NEXT_PUBLIC_API_URL` inlined at Vercel build.
- Muse Spark orchestrator/planner; subagents DeepSeek/GLM high; no default subagent; always use subagents.
- Playwright auto-check mandatory; free-model limit → paid high fallback.
- Feed expansion must not require a schema migration.

---

## 6. Verification plan

```powershell
# from D:\College\Pidi.id
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_news_pipeline.py -q
npx playwright test frontend/e2e/news-live-audit.spec.ts
```

Relevant existing assertions:

- `backend/tests/test_news_pipeline.py:17-26` asserts at least four feeds and at least three queries; it does **not** assert the eight new feeds or Q8 by name.
- `frontend/e2e/news-live-audit.spec.ts:415-607` asserts the expanded provider set renders, the province filter narrows, and no link is rewritten to a search page.

**Not run in this docs-only pass.** No shell was available to this subagent.

## 7. Acceptance criteria

- [x] 5 Tribun + Detik Finance + Katadata + Republika are direct RSS entries.
- [x] Q8 targets BNPB/BMKG official domains.
- [x] Tribun fetches use a browser UA.
- [x] Promo/lifestyle noise is excluded before relevance.
- [x] Commit `1588d8b` exists with the stated subject.

## 8. Open concerns

1. **No per-feed health telemetry.** A 403/404/timeout is logged at debug (`news_aggregator.py:1034-1035`) and the feed silently contributes zero items.
2. **UA spoofing is a maintenance liability.** A browser UA fixes Tribun today; a future WAF change can break it again.
3. **General feeds are noisy.** Republika/Detik News/Katadata require the keyword gate to do most of the work; a single missed keyword admits off-topic copy.
4. **Duplicate syndication.** The same story can arrive from ANTARA and a Tribun rewrite; dedup is title-based (`news_aggregator.py:1117-1126`) and will miss paraphrases.
5. **No test locks the eight new URLs.** A typo in a new feed URL would pass the current suite.
6. **Per-feed 40-item cap + 60-item cycle budget.** Without Phase 109's round-robin, early feeds can consume the budget; Phase 109 is the required companion.
