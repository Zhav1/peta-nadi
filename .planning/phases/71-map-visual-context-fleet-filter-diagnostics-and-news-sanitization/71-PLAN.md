# Phase 71 Plan: Map Visual Context, Fleet Filter Diagnostics & News Intelligence Link Sanitization

## Execution Strategy

### WP1: Map Visual Context & Blue Layer Legend Expansion
- **Files**:
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/components/map/CrisisMap.tsx`
  - `frontend/components/map/FleetVehicleLayer.tsx`
- **Actions**:
  1. In `DashboardClient.tsx` (`LEGENDA RUTE` modal):
     - Add a distinct section: **"Armada Multimoda & Koridor Maritim"**.
     - Add entries for:
       - Sky Blue (`#38bdf8`): *Kapal Maritim Live AIS (Kargo, Feeder Pelindo, Tanker)*.
       - Emerald Green (`#34d399`): *Truk Logistik Darat (GPS Live Satelit)*.
       - Violet (`#c084fc`): *Kargo Udara (ADS-B Pesawat)*.
       - Dark Blue Dashed Line (`#1e40af`): *Alur Pelayaran Strategis Selat Malaka (TSS)*.
       - Amber Dashed Line (`#f59e0b`): *Proyeksi Rute Estimasi Koridor (Dead-Reckoning)*.
  2. In `CrisisMap.tsx`:
     - Add subtle on-map symbol text for the Malacca Strait baseline corridor layer (`baseline-corridors-symbol`).
  3. In `FleetVehicleLayer.tsx`:
     - Add informative telemetry tooltip on vehicle hover (Name, Mode, Speed in Knots/KMH, Status).

### WP2: Fleet Filter Operational Clarity & Deck.gl Character Fix
- **Files**:
  - `frontend/components/dashboard/DashboardClient.tsx`
  - `frontend/components/map/FleetVehicleLayer.tsx`
- **Actions**:
  1. Replace Unicode bullet `•` (8226) with standard ASCII `-` or clean CSS indicator dots in button labels and Deck.gl text layers to eliminate `deck: Missing character: • (8226)` console warnings.
  2. Add operational explainer tooltip on `#fleet-sim-toggle-btn`:
     - "Mode Taktis Real-Time (GPS Satelit Terverifikasi) vs Mode Perencanaan Makro (Satelit + Proyeksi Jadwal Koridor)".
  3. Ensure vehicle hover cards explicitly display telemetry source status (`[GPS LIVE SATELIT]` vs `[PROYEKSI JALUR JADWAL]`).

### WP3: News Intelligence Link Sanitization & Backend Keyword Filter Gate
- **Files**:
  - `frontend/hooks/useNewsVerification.ts`
  - `backend/app/services/news_aggregator.py`
  - `backend/app/services/unified_news_ingestor.py`
- **Actions**:
  1. In `useNewsVerification.ts`:
     - Sanitize `FALLBACK_SUMATRA_NEWS`:
       - Replace dead BMKG Maritim link with valid official portal (`https://maritim.bmkg.go.id/`).
       - Replace dead BPJT Tol link with valid official portal (`https://bpjt.pu.go.id/`).
       - Replace dead BMKG Radar link with valid public weather radar portal (`https://inderaja.bmkg.go.id/`).
       - Replace mismatched Antara URLs with targeted regional bureau search queries (`https://sumut.antaranews.com/search?q=pelabuhan+belawan` and `https://sumbar.antaranews.com/search?q=sitinjau+lauik+longsor`) so users never land on mismatched or 404 pages.
  2. In `news_aggregator.py`:
     - Implement `LOGISTICS_DISASTER_KEYWORDS` filter: reject non-logistics articles (health, hospital, ceremonial politics, sports) from RSS ingestion before saving to Supabase.
     - Validate that Antara URLs extracted from RSS contain a valid numeric ID (`/\d{6,8}\/`). If missing, route to targeted bureau search URL rather than returning a broken 404 link.

### WP4: Frontend API Base URL Auto-Sanitization (Eliminate CORS & 404 on Vercel)
- **Files**:
  - `frontend/lib/api.ts`
  - `frontend/app/api/proxy/[...path]/route.ts`
- **Actions**:
  1. In `frontend/lib/api.ts`:
     - In `getBaseUrl()`: Add auto-sanitization to ignore `prehub-backend.onrender.com` (deprecated) and automatically fallback to `https://peta-nadi.onrender.com` (active live backend).
  2. In `frontend/app/api/proxy/[...path]/route.ts`:
     - Set default upstream URL fallback to `https://peta-nadi.onrender.com` instead of deprecated host.

---

## Verification Plan

1. **Static Typecheck**: Run `npx tsc --noEmit` from `frontend/` (0 errors).
2. **Python Syntax Check**: Run `python -m py_compile` on modified backend files (0 errors).
3. **Automated Unit Tests**:
   - Run `npm test` from `frontend/`.
   - Run standalone link validation script testing all URLs in `FALLBACK_SUMATRA_NEWS` to prove 0 URLs return 404.
4. **Live E2E Browser Verification**:
   - Verify modal `LEGENDA RUTE` includes maritime vessels, sea lanes, and multimodal fleet entries.
   - Verify `#fleet-sim-toggle-btn` has clear operational tooltip and zero `deck: Missing character` warnings.
   - Verify news links in the sidebar open valid, relevant pages.
