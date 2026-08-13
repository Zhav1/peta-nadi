# Walkthrough — Phase 19: Differentiated Multi-Hazard Map Layers & Time Horizon Engine

## Overview & Objectives
Phase 19 menghadirkan mesin pemilah rentang waktu 4 mode (**`PAST | PRESENT | FUTURE | PREDICT`**), layer peta spasial-temporal terpisah untuk 5 jenis bencana, serta pengintegrasian daemon scraper OSINT Lightpanda untuk feed intelijen bencana real-time.

---

## Key Deliverables Implemented

### 1. Backend REST Endpoints (`backend/app/routers/incidents.py`)
- **`GET /api/v1/incidents/historical/episodes`**: Menyajikan data episode bencana historis (Gempa Pasaman M6.2 2022, Banjir Belawan 2024, Longsor Berastagi 2023) beserta korelasi inflasi PIHPS.
- **`GET /api/v1/incidents/predictive/risks`**: Menyajikan proyeksi risiko TFT 24-48 jam (Banjir Rob Belawan 88%, Bottleneck Tebing Tinggi 72%).
- **`GET /api/v1/incidents/osint/feed`**: Menyajikanfeed berita & media sosial hasil scraping Lightpanda daemon.

### 2. Frontend State Controller (`DashboardClient.tsx`)
- Menambahkan state `activeTimeFilter` (`past` | `present` | `future` | `predict`).
- Mengikat perubahan mode ke fetch reaktif:
  ```typescript
  useEffect(() => {
    if (activeTimeFilter === 'past') {
      api.incidents.historical().then(res => setHistoricalEpisodes(res.items));
    } else if (activeTimeFilter === 'future') {
      api.incidents.predictive().then(res => setPredictiveRisks(res.items));
    }
  }, [activeTimeFilter]);
  ```

### 3. Spatiotemporal Map Layers (`CrisisMap.tsx`)
- Penambahan Mapbox sources & layers:
  - `historical-episodes-source` & `historical-episodes-fill` (Warna ungu `#a855f7` dengan pola garis putus-putus).
  - `predictive-risks-source` & `predictive-risks-fill` (Warna kuning `#eab308` dengan opacity bergelombang).
  - Hazard-specific dynamic styling (Cyan untuk Banjir, Merah untuk Gempa, Cokelat/Oranye untuk Longsor).

---

## Verification & Test Results
- **Production Build**: `$env:PATH = ...; rtk npm --prefix frontend run build` ➔ `✓ Compiled successfully (6/6 static pages)`.
- **Mode Switching Verification**: Memilih `PAST` menampilkan polygon episode historis; memilih `FUTURE` menampilkan proyeksi TFT 48 jam; memilih `PRESENT` menampilkan radar aktif.
