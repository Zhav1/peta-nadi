# Phase 52: Dynamic Pan-Sumatra News Aggregator & Supabase-Native HITL Decision Pipeline (Plan)

## 1. Objective
Transform the news intelligence, alerting, and routing subsystem from a static, mock-laden North Sumatra demo into an end-to-end dynamic, **Pan-Sumatra event intelligence and decision-support engine**, backed natively by **Supabase (PostgreSQL 17 + PostGIS + Realtime)**.

Specifically, replace the previously hardcoded static news feeds (`FALLBACK_STANDARDIZED_ARTICLES`, `MOCK_NEWS_FALLBACK`, synthetic random prices) with live multi-outlet RSS feeds (10 LKBN ANTARA regional bureaus + targeted Google News queries), extract true spatial entities using an extensive Pan-Sumatra Logistics Gazetteer, link high-severity disruptions to physical incidents in Supabase, and connect verified events directly to fleet impact assessments and a **Globot-inspired Human-in-the-Loop (HITL) Decision Review Drawer**.

---

## 2. Context, Environment & User Constraints
1. **Scope: Whole Island of Sumatra**:
   - Must cover all 10 provinces: Aceh, Sumatera Utara, Sumatera Barat, Riau, Kepulauan Riau, Jambi, Sumatera Selatan, Bengkulu, Lampung, and Kepulauan Bangka Belitung.
   - Must cover key mountain passes (Sitinjau Lauik, Kelok 9, Lembah Anai), major seaports (Belawan, Dumai, Teluk Bayur, Boom Baru, Panjang, Bakauheni), and major arterial corridors (Jalintim, Jalinteng, Jalinbar, Jalinsum, JTTS).
2. **Zero Fake News / Mock Fallback Injection**:
   - Production feeds must not serve hardcoded fake news items (`FALLBACK_STANDARDIZED_ARTICLES` or `MOCK_NEWS_FALLBACK`) or synthetic `random.seed()` price data.
   - Missing data must degrade gracefully with an honest empty state or status flag, rather than synthetic simulations masquerading as live telemetry.
3. **Primary Cloud Backbone: Supabase**:
   - Project: `ulpmmacsdkohwkmyhlwj` (Region: `ap-southeast-1`, Postgres 17, PostGIS active).
   - Dedicated table: `public.news_articles` with PostGIS `GEOGRAPHY(Point, 4326)`, GiST indexes, and Supabase Realtime publication.
   - Realtime enabled for: `news_articles`, `incidents`, and `route_approvals`.
   - Local SQLite acts purely as a secondary fallback if offline.
4. **Architectural References**:
   - [Vector897/Globot](https://github.com/Vector897/Globot): Quantitative disruption review, human-in-the-loop decision gating, cost-of-delay & spoilage hedging vs detour, and verified source citations.
   - [bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view): Live multi-provider spatial intelligence across the territory with dynamic PostGIS spatial entities.
5. **Frontend Design Rules (Impeccable & Anti-AI Patterns)**:
   - Zero generic purple/pink AI gradients.
   - Zero raw emojis used as icons; all icons must be SVG from Lucide (`Scale`, `CheckCircle2`, `PauseCircle`, `XCircle`, `FileText`, `MapPin`, `Truck`).
   - Glassmorphism: `backdrop-blur-md bg-[#0c1017]/95 border border-white/10`.
   - `cursor-pointer` mandatory on all buttons and interactive elements.
   - Safe HUD layout: maintain `>95px` physical clearance between top telemetry and right-hand map controls at 100% zoom (1280px width).

---

## 3. Scope of Work & Affected Components

| Layer / Component | File Path | Scope of Implementation |
|---|---|---|
| **Supabase DDL & Realtime** | `infra/supabase/migrations/008_news_articles_and_realtime.sql` | `public.news_articles` schema, spatial GiST indexes, RLS policies, Realtime publication on `news_articles`, `incidents`, and `route_approvals`. |
| **Pan-Sumatra Gazetteer** | `backend/app/nlp/gazetteer_data.py` | 10 provinces, 154 regencies/cities, passes, ports, and snapped arterial highway corridors. |
| **Multi-Tier Geocoder** | `backend/app/nlp/geocoding_service.py` | Tier 1 (Gazetteer lookup) $\to$ Tier 2 (Redis cache) $\to$ Tier 3 (Sumatra-bounded OSM Nominatim). |
| **News NLP Extractor** | `backend/app/nlp/news_extractor.py` | Attach true `latitude`, `longitude`, `province`, `corridor_segment`, and PostGIS WKT point (`POINT(lon lat)`). |
| **News Ingestor & Aggregator** | `backend/app/services/news_aggregator.py` & `unified_news_ingestor.py` | 10 Antara RSS feeds + Google News targeted queries; upsert into Supabase `news_articles`; synthesize high-severity closures into `incidents` & `route_approvals`. |
| **FastAPI REST Router** | `backend/app/routers/news_router.py` | Dynamic `/api/v1/news/live`, `/api/v1/news/market-regime`, and Globot endpoints: `GET /api/v1/news/hitl-pending`, `POST /api/v1/news/hitl-action`. |
| **Frontend API Client** | `frontend/lib/api.ts` | Add `hitlPending()` and `hitlAction()` methods under `api.news`. |
| **Frontend Live Hook** | `frontend/hooks/useNewsVerification.ts` | Eliminate `MOCK_NEWS_FALLBACK`; initialize empty state; map live Supabase news with real coordinates and sanitize external links. |
| **Globot HITL Drawer** | `frontend/components/dashboard/HitlDecisionDrawer.tsx` | Slide-over card displaying verified news citations, cargo spoilage vs detour cost matrix, and action buttons (`[SETUJUI DETOUR]`, `[TAHAN BUFFER]`, `[TETAP RUTE AWAL]`). |
| **HUD & Dashboard Integration** | `frontend/components/dashboard/TopNavTelemetry.tsx` & `DashboardClient.tsx` | Add `HITL REVIEW` trigger button with pulsing pending item counter badge; mount drawer into map canvas. |
| **Static Cleanup** | `backend/app/scrapers/social_scraper.py` & `backend/app/routers/commodity_router.py` | Strip synthetic `MOCK_SOCIAL_POSTS` and random `random.seed()` prices. |

---

## 4. Verification Plan
- [x] Pytest suite passes: `pytest backend/tests/test_news_pipeline.py -v` (5/5 tests passing).
- [x] TypeScript compiler passes with 0 errors: `npx tsc --noEmit`.
- [x] Supabase project `ulpmmacsdkohwkmyhlwj` live verification:
  - 30+ dynamic Sumatra news records upserted with PostGIS coordinates.
  - Incidents synced to `public.incidents`.
  - Operator action committed to `public.route_approvals`.
- [x] Next.js 100% zoom bounding box check: TopNavTelemetry ends at $X = 923.7\text{px}$, leaving safe clearance to map controls at $X = 1020.2\text{px}$.
