# Phase 107 — Learnings

**Rule:** only decisions and observations evidenced by the code, tests, commit log, or this window. No inferred intent.

---

## 1. Decisions

| Decision | Evidence | Consequence |
|---|---|---|
| No offline news fallback | `useNewsVerification.ts:296-306,527-537`; `DashboardClient.tsx:2948-2957` | Empty means empty. The sidebar can no longer look live when the backend is cold. |
| Resolve or drop links | `news_aggregator.py:282-322,1011-1014,1069-1072`; `news_router.py:439-450` | Dead citations disappear instead of becoming search pages. |
| Freeze the feed by article-id set | `useNewsVerification.ts:515-526` | A CDN-cached response cannot move `pubDate` or the global clock. |
| `published_at` is the only freshness source | `news_router.py:41-63,402-404`; `news_aggregator.py:1182-1201` | `now()` survives only for the truly-empty branch. |
| Over-fetch 150, then filter | `news_router.py:304-307` | Valid rows are less likely to be crowded out by DROPPED rows. |
| Weather-only advisories cap at YELLOW | `news_extractor.py:508-537,1104-1116` | A BMKG warning no longer creates a RED zone without a physical blockage. |
| Expand the feed to 10 provinces | `news_aggregator.py:81-101,189-204` | Kepri/Babel/Aceh east coast become reachable; Medan is no longer the implicit center. |

---

## 2. Fixes tried and why they changed

1. **Fallback fixture first.** `FALLBACK_SUMATRA_NEWS` made the warming state look populated, but the Belawan/Malaka/Lau Cih/Sitinjau/Kualanamu/Belmera headlines were fabricated. The Playwright audit now treats every one of those strings as a failure (`news-live-audit.spec.ts:38-51`). **Replaced by** empty + `warming`.
2. **Search-page rewrite first.** `_map_publisher_deep_fallback` used to synthesize `…/search?q=…`. That is not a permalink and produced 404/dead-citation behavior. **Replaced by** a tombstone returning `None` and drop-at-caller.
3. **`now()` timestamp first.** It made every response look fresh. **Replaced by** `_max_published_at_iso` + cache snapshot. The old DB rows that already contain a `now()` value are handled by distrusting them when the URL carries an archival date (`news_aggregator.py:1734-1759`).
4. **60-row read first.** The 48 h/tier/geo filters ran after the limit, so dropped rows could starve the visible feed. **Replaced by** a 150-row read (`news_router.py:305-307`).
5. **Client-only weather filter first.** A server RED zone would still render red even if the sidebar showed "advisory". **Replaced by** the server-side warning-only gate.

---

## 3. Concerns (open, evidenced)

1. **97% DROPPED is a symptom, not a constant.** No code constant encodes 97%. The only code evidence is the 150-row mitigation comment (`news_router.py:305-306`). Treat the percentage as a window observation.
2. **The 150-row window is finite.** If DROPPED volume grows faster than intake, low-volume provinces can still disappear. Phase 109's 60-item round-robin is the structural fix on the write side.
3. **Two guards, one policy.** `news_aggregator.py:1667-1771` and `news_router.py:309-383` both re-tier and re-check freshness. They must stay in sync.
4. **Id-set suppression hides corrections.** A corrected article with the same id is not re-rendered.
5. **Keyword noise pruning is blunt.** `EXCLUDED_NOISE_KEYWORDS` (`news_aggregator.py:611-628`) can drop a logistics story that mentions a hospital, promo, or travel word.
6. **Live reachability is not tested.** The Playwright specs stub `/api/v1/news/live`; they prove UI behavior, not that the eight feeds answer.

---

## 4. Mistakes not to repeat

- **Do not make an empty feed look populated.** A fixture that looks like news is worse than an empty state because it manufactures trust.
- **Do not use a search page as a citation.** If a permalink cannot be resolved, the item is not publishable.
- **Do not use `now()` as a data timestamp.** It moves when nothing changed.
- **Do not filter after a small `limit()`.** The limit must account for rows that will be dropped.
- **Do not let the client be the only enforcement point.** The map zone and the sidebar must agree; enforce on the server and mirror on the client.
- **Do not assume a single worker.** The current lock is latent-safe on Render free, but the code must still behave if a second worker appears.

---

## 5. Constraints carried into this phase

- Orchestrator/planner: Muse Spark.
- Subagents MUST be DeepSeek/GLM high; no default subagent; always use subagents.
- Playwright auto-check is mandatory; free-model limits fall back to a paid high model.
- Windows PowerShell, repo `D:\College\Pidi.id`.
- Render free Singapore single worker; Vercel `pre-hub.vercel.app`; Supabase PostGIS.
- No Redis by default; `NEXT_PUBLIC_API_URL` is inlined at build.
- Docs live under `.planning/phases/`; no temp-file final docs.
