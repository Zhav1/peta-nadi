# Phase 108 — Learnings

**Rule:** evidenced observations only. No claim that a feed works merely because it is configured.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| Add five Tribun editions | `news_aggregator.py:130-163` | Regional coverage extends to Sumbar, Sumsel, Kepri, Lampung, Aceh. |
| Add three economic/national outlets | `news_aggregator.py:165-185` | Economic/logistics copy is no longer CNBC-only. |
| Add Q8 for BNPB/BMKG | `news_aggregator.py:201-203` | Official early-warning recall gets a dedicated query. |
| Use a browser UA for direct RSS | `news_aggregator.py:983-995` | Tribun stops returning 403. |
| Exclude Tribun promo/lifestyle terms | `news_aggregator.py:626-628` | Noise is dropped before the extractor, saving LLM budget. |
| Keep per-feed caps small | `news_aggregator.py:998,1050` | A single high-volume feed cannot monopolize the raw list; the cycle budget is handled in Phase 109. |

---

## 2. Fixes tried and why they changed

1. **Rely on Google News targeted queries for Tribun.** It worked partially but lost the direct regional feed and its province metadata. **Replaced by** direct RSS entries with explicit `province`.
2. **Keep the legacy bot UA.** Tribun regional hosts returned 403. **Replaced by** a Chrome UA + RSS `Accept`.
3. **Add all sources without noise pruning.** Tribun's promo/lifestyle copy (jalan sehat, kunci jawaban, prakiraan cuaca) reached the extractor and wasted tokens. **Replaced by** the exclusion list.
4. **Treat `prakiraan cuaca` as a weather signal.** It is boilerplate, not a warning. **Replaced by** excluding it and keeping explicit warning language in `_detect_weather_warning_only`.

---

## 3. Concerns (open, evidenced)

1. **No feed-health ledger.** `fetch_rss_feed_items` catches everything and logs at debug (`:1034-1035`). An operator cannot see which of the 23 feeds is dead.
2. **The UA fix is brittle.** A WAF rule change can re-break Tribun; the failure is silent.
3. **Coverage is configured, not proven.** Q6/Q7/Q8 and the new feeds are strings in a list. Only a live ingestion run proves they return items.
4. **Title dedup is weak.** `news_aggregator.py:1117-1126` lowercases and compares titles; syndicated rewrites survive as separate rows.
5. **The test floor is too low.** `test_news_pipeline.py:17-26` would pass with four feeds and three queries, so it cannot catch a deleted new source.
6. **Province metadata depends on the config entry.** A feed tagged with the wrong province will mis-filter even if the article is correct.

---

## 4. Mistakes not to repeat

- **Do not assume an RSS URL is live because it is listed.** Add a reachability/health assertion or a periodic probe.
- **Do not use a bot UA against a WAF that expects a browser.** It fails as 403 and disappears at debug level.
- **Do not expand feeds without expanding the intake budget.** More feeds with a flat head-slice makes starvation worse, not coverage better (see Phase 109).
- **Do not rely on title equality for dedup.** Syndication paraphrases titles.
- **Do not let `prakiraan cuaca` count as a warning.** It is the most common Tribun boilerplate.

---

## 5. Constraints carried into this phase

- Muse Spark orchestrator/planner; subagents DeepSeek/GLM high; no default subagent; always use subagents.
- Playwright auto-check mandatory; free-model limit → paid high fallback.
- Windows PowerShell; `D:\College\Pidi.id`.
- Render free Singapore single worker; Vercel `pre-hub.vercel.app`; Supabase PostGIS.
- No Redis by default; `NEXT_PUBLIC_API_URL` inlined at build.
- No schema migration for source expansion.
- Documentation under `.planning/phases/`; no temp final docs.
