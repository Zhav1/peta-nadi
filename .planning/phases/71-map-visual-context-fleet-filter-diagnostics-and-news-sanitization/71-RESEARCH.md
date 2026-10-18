# Phase 71 Research: Map Visual Context, Fleet Filter Diagnostics & News Intelligence Link Sanitization

## 1. Problem Statement & Root Cause Findings

### Problem 1: Unlabeled Blue Elements on the Map (Visual Disorientation)
- **Root Cause**:
  - `FleetVehicleLayer.tsx` (Atlas slot 1, `#38bdf8`) renders **226 AIS maritime vessels** scattered across the Malacca Strait, Bangka Belitung, Palembang Bay, and Sunda Strait.
  - `CrisisMap.tsx` (`baseline-corridors-line`, `#1e40af`) renders the **Malacca Strait Strategic Maritime Transit Corridor (TSS)**.
  - `CrisisMap.tsx` (`hub-nodes-symbol`, `'port': '#38bdf8'`) renders Port Hub symbols (Belawan, Boom Baru, Teluk Bayur, Panjang).
  - The modal `LEGENDA RUTE` in `DashboardClient.tsx` (lines 129-169) only lists 5 items (Fastest recommendation green, secondary alternative orange, blocked red, disaster shockwave red, and food hub white). **It has zero entries for multimodal fleet colors (`#34d399` truck, `#38bdf8` vessel, `#c084fc` aircraft) or maritime sea lane corridors (`#1e40af`)**, leaving users bewildered by hundreds of blue dots and lines on the water.

### Problem 2: Fleet Filter ("Hanya GPS & Transponder Live" vs "Live AIS/ADS-B + Rute Estimasi")
- **Root Cause**:
  - Green icons (`#34d399`) denote physical land GPS hardware streaming.
  - Amber/orange lines (`deck-fleet-estimated-routes`, `[245, 158, 11]`) and rings denote **Estimated Corridor Trajectories (Dead-Reckoning Projections)** for scheduled units without active transponders.
  - **Operational distinction**:
    - "Hanya GPS Live": High-assurance tactical dispatch during active disaster rerouting (only vehicles with physically proven satellite coordinates can be ordered to maneuver).
    - "Semua Armada + Rute Estimasi": Strategic supply chain capacity planning (monitors pipeline volume even for trucks passing through cellular dead zones in the Bukit Barisan mountains).
  - **UX Defect**: The toggle button lacks operational explainer tooltips, the lines lack directional flow ticks, and the Deck.gl canvas triggers thousands of console warnings due to the unsupported bullet point character `•` (Unicode 8226).

### Problem 3: Broken, Outdated & Irrelevant News Links
- **Root Cause**:
  - In `FALLBACK_SUMATRA_NEWS` (`useNewsVerification.ts`):
    - BMKG Maritim URL returns **404 Not Found**.
    - BPJT Tol URL returns **404 Not Found**.
    - BMKG Radar URL returns **403 Forbidden**.
    - Antara URLs (IDs `673537` & `783773`) return HTTP 200, but Antara's CMS ignores artificial title slugs and loads completely unrelated articles (*Sipirok landslide* and *Pegadaian disaster aid* instead of Belawan Port or Sitinjau Lauik).
  - In Live Ingestion (`news_aggregator.py` & `unified_news_ingestor.py`):
    - Antara regional RSS feeds (`terkini.xml`) ingest all general news (osteoporosis, hospital varicose veins, political ceremonies) because there is no **disaster & logistics keyword gate**.
    - Stripped Antara URLs missing numeric IDs `/berita/slug` return **404** on Antara's Laravel CMS.
    - Cloud IP addresses on Render trigger Google News bot blocks, falling back to generic `news.google.com/search?q=...` query pages.

### Problem 4: Vercel Production Environment Hostname Mismatch
- **Root Cause**:
  - Vercel `NEXT_PUBLIC_API_URL` is set to `https://prehub-backend.onrender.com` (deprecated/dead service returning 404 and CORS errors).
  - The real, active backend returning HTTP 200 is `https://peta-nadi.onrender.com`.
  - In `frontend/lib/api.ts`, `getBaseUrl()` accepts `NEXT_PUBLIC_API_URL` without sanitizing this dead hostname.

---

## 2. Architecture & Remediation Strategy

1. **Modal `LEGENDA RUTE` Expansion**: Add dedicated "Armada Multimoda & Alur Laut" section covering `#38bdf8` Maritime AIS, `#34d399` Land GPS, `#c084fc` Air Cargo, `#1e40af` Sea Lane, and `#f59e0b` Scheduled Estimate Trajectory.
2. **Subtle Map Label**: Add an unobtrusive text watermark for the Malacca Strait Traffic Separation Scheme (`ALUR PELAYARAN SELAT MALAKA (TSS)`).
3. **Fleet Filter Polish**:
   - Replace bullet character `•` with standard dash `-` in Deck.gl text to stop console warnings.
   - Add clear telemetry provenance badges: `[GPS LIVE SATELIT]` vs `[PROYEKSI JALUR JADWAL]`.
   - Add hover tooltip explaining operational dispatch utility on `#fleet-sim-toggle-btn`.
4. **News Pipeline Hardening**:
   - Replace all broken URLs in `FALLBACK_SUMATRA_NEWS` with valid, verified 200 OK portals or authoritative bureau search queries.
   - Add strict **logistics & crisis keyword gate** in `news_aggregator.py` (filter out health, celebrity, and political slop).
   - Ensure Antara news URLs always preserve valid numeric IDs or redirect to verified bureau search queries.
5. **Base URL Auto-Sanitization**:
   - In `api.ts`, if `baseUrl` contains `prehub-backend.onrender.com`, redirect to `https://peta-nadi.onrender.com`.
