---
phase: 107
phase_name: News Live-Only Trust Fix
milestone: M7
milestone_name: Live News Trust, Source Breadth & Forecast Waspada Integrity
created_at: "2026-10-25T00:00:00.000Z"
status: completed
code_commit: 4e8781b
framework: GSD
---

# Phase 107 — News Live-Only Trust Fix

**Status:** IMPLEMENTED (commit `4e8781b`); documented in this pass.
**Commit subject:** `fix(news): live-only feed, drop unresolvable links, freeze timestamp, expand to 10 provinces + weather YELLOW + strict Playwright audit`.
**Depends on:** Phase 90 (OSINT leak hardening), Phase 98 (ingestion resilience), Phase 102 (news hydration).
**Followed by:** Phase 108 (source breadth), Phase 109 (EWKB + intake fairness).

---

## 1. Goal

Make the Berita sidebar tell the truth about what it has:

1. If live ingestion has nothing, show an honest warming/empty state — never a synthetic Sumatra fixture.
2. If a link cannot be resolved to a real publisher permalink, drop the item — never rewrite it to a search page.
3. If the article-id set did not change, do not re-derive the feed, advance per-article `pubDate`, or move the global "diperbarui" clock.
4. Make the 10-province feed reachable, and cap pure weather advisories at YELLOW instead of promoting them to RED.

---

## 2. Issues found (evidence, not assumptions)

| Issue | Evidence | Resolution in this phase |
|---|---|---|
| Synthetic fallback produced Belawan/search links | `frontend/e2e/news-live-audit.spec.ts:38-51` still names the old `FALLBACK_SUMATRA_NEWS` markers as forbidden; `useNewsVerification.ts:296-299` states the fixture is gone | Live-only feed + warm/empty state |
| `datetime.now()` used as freshness | `news_router.py:41-63` adds `_max_published_at_iso`; `news_router.py:287-292` replays the stored value on cache hit | Newest real `published_at` only |
| Legacy Google search URLs in DB | `news_router.py:425-430` detects them; `news_router.py:446-450` drops unresolvable rows | Read-path detection + drop; refresh triggered |
| Untiered legacy rows | `news_router.py:337-360` re-tiers when `zone_tier` is missing or `schema_version != 7`; same in `news_aggregator.py:1673-1731` | On-read re-tier, no migration |
| Medan-only bias | `news_aggregator.py:190-192` documents "Sumut is NOT Medan-only" and expands Q1 to Belawan/Tebing Tinggi/Asahan/Kisaran/Rantauprapat/Sibolga | Wider Q1 + Q6/Q7 corridors |
| Missing Kepri/Babel RSS | `news_aggregator.py:81-94` (ANTARA Babel, ANTARA Kepri); `news_aggregator.py:145-163` (Tribun Batam/Aceh) | Direct bureau feeds added |
| 97% DROPPED thin volume | Operator observation in this window; code only records the consequence at `news_router.py:305-306` ("a 60-row window let valid rows get pushed out by dropped ones") | Over-fetch 150 + Phase 109 round-robin intake |
| Pure weather advisories promoted to RED | `news_extractor.py:508-537` detects warning-only text; `news_extractor.py:1104-1116` caps it at YELLOW | Weather-warning-only gate |

**Not claimed:** the exact 97% figure is not a constant in code. It is an observed operator metric carried into this plan because it explains the 150-row read window.

---

## 3. Work packages (current tree)

### WP1 — Live-only feed, no offline fixture

| File:line | Change |
|---|---|
| `frontend/hooks/useNewsVerification.ts:296-306` | Feed starts empty; status starts `warming`; only live backend rows are admitted. |
| `frontend/hooks/useNewsVerification.ts:527-537` | Empty live response keeps last-good rows (if any) and stays `warming`; never substitutes a fixture. |
| `frontend/components/dashboard/DashboardClient.tsx:2948-2957` | Empty-state copy explicitly says no fallback data. |

### WP2 — Resolve-or-drop link policy

| File:line | Change |
|---|---|
| `backend/app/services/news_aggregator.py:282-291` | `_map_publisher_deep_fallback` is a tombstone that always returns `None`; callers must drop. |
| `backend/app/services/news_aggregator.py:294-322` | `_is_unresolvable_article_url` rejects bare roots, Google hosts, dummy IDs, and ANTARA `/berita/` URLs without a numeric CMS id. |
| `backend/app/services/news_aggregator.py:1011-1014`, `1069-1072` | RSS and Google News paths drop unresolvable items. |
| `backend/app/routers/news_router.py:439-462` | Live response sanitizes legacy Google search links and drops rows that cannot resolve. |
| `frontend/hooks/useNewsVerification.ts:370-373` | Client mirror: no real permalink means no rendered item. |

### WP3 — Freeze timestamps

| File:line | Change |
|---|---|
| `backend/app/routers/news_router.py:41-63` | `_max_published_at_iso` derives the newest real timestamp; naive values are treated as UTC. |
| `backend/app/routers/news_router.py:287-292` | Cache hit replays the stored fetch-time `last_updated`; never fabricates `now()`. |
| `backend/app/routers/news_router.py:402-413` | `last_updated` is the newest `published_at`; `now()` only when there is genuinely no data. |
| `backend/app/routers/news_router.py:464-467` | Snapshot is written before returning. |
| `frontend/hooks/useNewsVerification.ts:515-526` | Feed identity is the sorted article-id set; same signature does not re-derive rows or move the clock. |
| `backend/app/services/news_aggregator.py:1182-1201` | Upsert preserves the true `published_at` and stores `original_pub_date`/`age_hours`. |

### WP4 — 10-province reach and weather YELLOW

| File:line | Change |
|---|---|
| `backend/app/services/news_aggregator.py:81-101` | ANTARA Babel and ANTARA Kepri added; ANTARA Ekonomi retained. |
| `backend/app/services/news_aggregator.py:189-204` | Targeted queries Q6 (Kepri/Babel maritime) and Q7 (Aceh east coast) added alongside Q1–Q5. |
| `backend/app/nlp/news_extractor.py:508-537` | `_detect_weather_warning_only` treats BMKG hazard phrases (gelombang tinggi, ombak besar, badai, angin kencang) as warnings when no blockage clause exists. |
| `backend/app/nlp/news_extractor.py:1104-1116` | Weather-warning-only / advisory items are pinned to `YELLOW_CLARIFY`. |

### WP5 — Strict Playwright audit

`frontend/e2e/news-live-audit.spec.ts` contains six adversarial specs:

| Spec | Line | Contract |
|---|---|---|
| (a) warming + empty | `141` | No `FALLBACK_SUMATRA_NEWS` markers; zero cards; honest empty copy. |
| (b) unresolvable links | `191` | No `/search?q=` or Google search anchors; valid permalink preserved. |
| (c) identical ids | `268` | Per-article `pubDate` and global clock stay frozen. |
| (d) multi-province | `344` | Kepri and Lampung reachable through the sidebar filter. |
| (e) expanded providers | `415` | Every outlet badge renders; province filter narrows; no search rewrite. |
| (f) identical re-poll | `609` | Second poll served from cache; no re-verify/LLM re-fetch; text frozen. |

---

## 4. Operating constraints (binding for 107–110)

**Execution model**
- Orchestrator/planner: Muse Spark.
- Subagents MUST be DeepSeek/GLM high. No default subagent.
- Always use subagents for execution work; the manager coordinates.
- Playwright auto-check is mandatory for UI-facing work.
- If a free-model limit is hit, fall back to a paid high model rather than silently degrading.

**Environment**
- Windows PowerShell; repo root `D:\College\Pidi.id`.
- Render free tier, Singapore, single worker.
- Vercel frontend: `pre-hub.vercel.app`.
- Supabase Postgres/PostGIS; PostgREST returns geometry as EWKB hex (this is why Phase 109 exists).
- No Redis by default. `get_redis()` may return `None`; ingestion must still run on the in-process lock.
- `NEXT_PUBLIC_API_URL` is inlined at build time. A backend URL change requires a frontend rebuild, not a runtime env change.

**Implications**
- Single worker means cross-process lock bugs are usually latent, not absent; scaling to 2+ workers would expose them.
- Render free may cold-start; the UI must keep `warming` honest rather than pretend to be live.
- No-Redis conditions make the 30 s in-memory cache and DB fallbacks load-bearing.
- Inlined API URL means "fix it in the dashboard env" is not a valid rollback plan.

---

## 5. Acceptance criteria

- [x] Empty/warming response renders zero fixture cards and honest copy.
- [x] No rendered anchor points to a search page or bare publisher root.
- [x] Same article-id set does not advance per-article `pubDate` or the global clock.
- [x] Non-Sumut provinces are reachable through the sidebar filter.
- [x] Weather-warning-only text cannot become RED.
- [x] Commit `4e8781b` exists with the stated subject.

## 6. Verification plan

```powershell
# from D:\College\Pidi.id
npx playwright test frontend/e2e/news-live-audit.spec.ts
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_news_pipeline.py backend/tests/test_cross_workstream_integration.py -q
```

**Status in this docs-only pass:** not re-run (no shell available to this subagent). The Playwright spec is the authoritative contract; its presence is evidence of intent, not of a green run.

## 7. Open concerns

1. The 150-row read window is a mitigation, not a cure; if DROPPED rows dominate, valid rows can still be crowded out. Phase 109 addresses intake fairness.
2. Hospital/noise exclusions are keyword-based; a legitimate logistics story using an excluded word (e.g. "rumah sakit" in a supply story) is dropped.
3. The client duplicate-suppression uses the article-id set only; a corrected article with the same id but new text will not refresh until the id changes.
4. `last_updated` falling back to `now()` in the truly-empty branch is still a fabricated timestamp, but it is only reached with zero data.
5. The six specs stub the backend; they do not prove live RSS reachability.
