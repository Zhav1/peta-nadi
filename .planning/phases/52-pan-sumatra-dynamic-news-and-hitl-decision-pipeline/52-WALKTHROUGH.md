# Phase 52: Dynamic Pan-Sumatra News Aggregator & HITL Decision Pipeline (Walkthrough)

## 1. Overview of System Transformation

The news aggregator and decision-making pipeline has transitioned from hardcoded mock articles into a fully dynamic spatial intelligence engine spanning all 10 provinces of Sumatra, backed by Supabase PostgreSQL 17 + PostGIS + Realtime.

Following the design patterns from [Globot](https://github.com/Vector897/Globot) (Human-in-the-Loop decision verification and spoilage hedging) and [God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) (dynamic PostGIS spatial entities and zero static fallbacks), the system now parses live news reports, resolves coordinates to highway choke-points, automatically assesses cargo risk, and presents reviewable decisions to human dispatchers.

---

## 2. Architecture & Pipeline Sequence

```
Live Press RSS (10 Antara Bureaus + Google News targeted queries across Sumatra)
                         │
                         ▼
             [NewsExtractor Engine]
             • Multi-tier Pan-Sumatra Gazetteer (10 provinces, 154 regencies, passes & ports)
             • Coordinates extraction -> PostGIS POINT(lon lat)
                         │
                         ▼
       [Supabase PostgreSQL 17 + PostGIS]
       • Table: public.news_articles (Spatial GiST index, Realtime enabled)
       • High-severity incidents -> public.incidents
                         │
                         ▼
           [Impact Assessment Service]
       • Matches fleet shipments against disruption buffer radius
       • Spoilage loss (IDR) vs. Detour fuel/toll cost (IDR) trade-off
                         │
                         ▼
        [public.route_approvals Table]
                         │
                         ▼
    [Globot-Style HITL Decision Drawer (Frontend)]
    • Operators inspect ground truth news citation, cost comparison, and approve reroutes
```

---

## 3. Detailed Component Implementations

### A. Pan-Sumatra Logistics Gazetteer & Multi-Tier Geocoding
- **`backend/app/nlp/gazetteer_data.py`**: Covers all 10 provinces of Sumatra:
  - Aceh, Sumatera Utara, Sumatera Barat, Riau, Kepulauan Riau, Jambi, Sumatera Selatan, Bengkulu, Lampung, Bangka Belitung.
  - Critical passes & choke points: Sitinjau Lauik, Kelok 9, Lembah Anai, Bukit Barisan.
  - Logistics ports: Belawan, Dumai, Teluk Bayur, Boom Baru, Panjang, Bakauheni.
  - Major arterial corridors: Jalintim, Jalinteng, Jalinbar, Jalinsum, JTTS (Tol Trans-Sumatera).
- **`backend/app/nlp/geocoding_service.py`**: Three-tier resolver (Gazetteer exact/alias match $\to$ Redis cache $\to$ Sumatra-bounded Nominatim) ensuring sub-millisecond local coordinates for any Sumatra logistics disruption.

### B. Dynamic Supabase Ingestion & Incident Synthesis
- **`infra/supabase/migrations/008_news_articles_and_realtime.sql`**:
  - Created `public.news_articles` with PostGIS `location GEOGRAPHY(Point, 4326)`.
  - Added spatial indexes and RLS policies for `anon` and `authenticated` roles.
  - Enabled Supabase Realtime publication on `news_articles`, `incidents`, and `route_approvals`.
- **`backend/app/services/news_aggregator.py`**: Scrapes all 10 regional LKBN Antara bureaus and Google News Sumatra logistics feeds; upserts deduplicated articles into Supabase.
- **`backend/app/services/unified_news_ingestor.py`**: Ingests dynamic news directly into Supabase, detects road closures, synthesizes live physical incidents in `public.incidents`, computes vehicle disruption impact (`ImpactAssessmentService`), and queues pending human-in-the-loop approvals in `public.route_approvals`.

### C. Globot-Style Human-in-the-Loop Decision Drawer
- **`frontend/components/dashboard/HitlDecisionDrawer.tsx`**:
  - Embedded review drawer with verified news source citation (headline, LKBN Antara bureau badge, source link).
  - Cost-benefit hedging matrix comparing cargo spoilage risk (`spoilage_loss_idr`) against detour fuel/toll cost (`detour_fuel_cost_idr`).
  - Action buttons: `[SETUJUI DETOUR]`, `[TAHAN BUFFER]`, `[TETAP RUTE AWAL]`.
  - Directly commits operator actions back to `POST /api/v1/news/hitl-action` and Supabase.
- **`frontend/components/dashboard/TopNavTelemetry.tsx` & `DashboardClient.tsx`**:
  - Added live `HITL REVIEW` button with pulsing pending item counter badge.
  - Linked directly to drawer open/close state.

### D. Elimination of Static Fallback Data
- **`frontend/hooks/useNewsVerification.ts`**: Removed `MOCK_NEWS_FALLBACK`. Initialized cleanly with empty state, pulling 100% dynamic live records from Supabase via `/api/v1/news/live`.
- **`backend/app/routers/news_router.py`**: Removed hardcoded `FALLBACK_STANDARDIZED_ARTICLES`. Serves dynamic articles from Supabase `news_articles` and computes dynamic market regime indicators.
- **`backend/app/scrapers/social_scraper.py`**: Removed `MOCK_SOCIAL_POSTS` injection. Returns honest empty list when no live Twitter tokens/results exist.
- **`backend/app/routers/commodity_router.py`**: Removed `random.seed()` synthetic prices. Returns honest database records or empty array.

---

## 4. Verification & Validation Results

1. **Backend Test Suite**:
   ```
   pytest backend/tests/test_news_pipeline.py -v
   ======================== 5 passed, 1 warning in 3.00s =========================
   ```
   - `test_official_feeds_configured` PASSED
   - `test_targeted_queries_configured` PASSED
   - `test_fast_heuristic_extraction_flood` PASSED
   - `test_fast_heuristic_extraction_early_warning` PASSED
   - `test_extract_structured_news_caching` PASSED

2. **Frontend Type Check**:
   ```
   TypeScript: No errors found (tsc --noEmit passed cleanly)
   ```

3. **Supabase Live Data Verification**:
   - 30+ dynamic Sumatra news records upserted with PostGIS coordinates across Aceh, Sumut, Sumbar, Riau, and Lampung.
   - Live incidents synced to `public.incidents`.
   - HITL decision flow confirmed: `POST /api/v1/news/hitl-action` commits `APPROVED` state to `public.route_approvals`.
