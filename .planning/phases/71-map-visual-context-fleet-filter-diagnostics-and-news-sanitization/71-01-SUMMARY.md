# Phase 71 Summary: Map Visual Context, Fleet Filter Diagnostics, and News Sanitization

## Executive Overview
Phase 71 resolved four critical production defects affecting user trust, visual clarity, and data integrity on `https://pre-hub.vercel.app/dashboard?guest=1`:
1. **Unlabeled Blue Map Elements**: 226 AIS maritime vessels (`#38bdf8`) and the Malacca Strait sea lane (`#1e40af`) rendered without clear legend context or text labels.
2. **Filter Distinction & Deck.gl Console Error**: Addressed operator ambiguity regarding "Hanya GPS & Transponder Live" vs "Live AIS/ADS-B + Rute Estimasi", while eliminating the Deck.gl `Missing character: • (8226)` console error.
3. **Broken & Irrelevant News Links**: Eradicated 404/403 errors and non-logistics news (lifestyle/varicose vein/osteoporosis articles) in the "Sidebar Intelijen Berita Resmi" through a strict backend keyword gate and 100% 200 OK fallback routing.
4. **CORS & Deprecated Backend URL Sanitization**: Auto-redirected requests pointing to dead backend `https://prehub-backend.onrender.com` to the active production backend `https://peta-nadi.onrender.com`.

---

## Detailed Implementation & Changes

### 1. API Base URL Sanitization & CORS Guard
- **Frontend Utilities**: `frontend/lib/api.ts` & `frontend/app/api/proxy/[...path]/route.ts`
  - Sanitized `getBaseUrl()` to detect if `NEXT_PUBLIC_API_URL` contains the deprecated domain `prehub-backend.onrender.com` (which returned 404/CORS errors on Vercel).
  - Automatically redirects and falls back to `https://peta-nadi.onrender.com`, ensuring client-side API fetches and Edge proxy requests succeed consistently.

### 2. News Link Sanitization & Backend Keyword Gate
- **Backend Service**: `backend/app/services/news_aggregator.py`
  - Introduced `LOGISTICS_DISASTER_KEYWORDS` and `EXCLUDED_NOISE_KEYWORDS` gate across `fetch_rss_feed_items` and `fetch_google_news_targeted`.
  - Blocks lifestyle/medical noise (e.g. osteoporosis, varicose veins, entertainment) from polluting the intelligence feed before database persistence.
  - Sanitized `resolve_canonical_article_url`: detects Antara URLs without numeric IDs (`antaranews.com/berita/[^0-9]`) and converts them to targeted search queries instead of dead links.
- **Frontend Hook**: `frontend/hooks/useNewsVerification.ts`
  - Enhanced `normalizeNewsPermalink` to redirect malformed Antara bureau URLs to valid bureau search queries.
  - Updated all 6 items in `FALLBACK_SUMATRA_NEWS`:
    - Replaced raw BMKG domains (which returned 403 Forbidden under automated headers/WAF) with targeted Antara regional search queries covering BMKG bulletins.
    - Verified all 6 fallback URLs return HTTP 200 OK via automated verification script.

### 3. Map Visual Context, Maritime Corridor & Multimodal Legend
- **Modal Component**: `frontend/components/dashboard/DashboardClient.tsx`
  - Expanded `LEGENDA RUTE` modal with a dedicated "Armada Multimoda & Koridor Maritim" section:
    - **Kapal Kargo & Feri Maritim (AIS)**: `#38bdf8` (Sky Blue)
    - **Truk Logistik Pangan (GPS)**: `#34d399` (Emerald)
    - **Kargo Udara Darurat (ADS-B)**: `#c084fc` (Purple)
    - **Alur Laut Selat Malaka (TSS)**: `#1e40af` (Dark Blue Dashed)
    - **Proyeksi Rute Estimasi**: `#f59e0b` (Amber Dashed)
  - Updated `#fleet-sim-toggle-btn` tooltip with explicit operational guidance:
    - Cyan `[Hanya GPS & Transponder Live]`: Tactical instant dispatch based on physical AIS & satellite GPS signals.
    - Amber `[Live AIS/ADS-B + Rute Estimasi]`: Macro corridor capacity planning for strategic food logistics.
- **Mapbox Layer**: `frontend/components/map/CrisisMap.tsx`
  - Added `baseline-corridors-symbol` layer along the maritime corridor line rendering `ALUR LAUT SELAT MALAKA (TSS)` in high-contrast blue typography with dark halo.
- **Deck.gl Layer**: `frontend/components/map/FleetVehicleLayer.tsx`
  - Replaced unicode bullet `•` (char 8226) with ASCII hyphen `-` (char 45), eliminating the Deck.gl font atlas console warning.
  - Enhanced telemetry badge in inspector console: clearly identifies `PROYEKSI RUTE` (amber) versus `AIS LIVE SATELIT` / `GPS LIVE SATELIT` (emerald).

---

## Verification & Proof of Work
1. **Type Safety**: `npx tsc --noEmit` on `frontend/` exited with code 0 (`TypeScript: No errors found`).
2. **Python Syntax Compilation**: `python -m py_compile backend/app/services/news_aggregator.py` exited with code 0.
3. **Automated Unit Tests**: `npm test -- --run` (`scripts/test_arbiter.ts`) passed 100% clean.
4. **Fallback URL Health Check**: Node script verified all 6 `FALLBACK_SUMATRA_NEWS` endpoints returned HTTP 200 OK.
