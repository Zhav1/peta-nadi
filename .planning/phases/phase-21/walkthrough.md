# Walkthrough — Phase 21: Full Integration Audit, Organic Hazard Geometries & Live Pipeline Engine

## Overview & Objectives
Phase 21 mengeliminasi seluruh bentuk geometri "kotak persegi kaku" pada sistem PetaNadi, menggantikannya dengan geometri organik yang dihitung secara matematis (`incident_geometry_service.py`), mengintegrasikan BMKG polling otomatis pada startup server, serta mengaktifkan stream real-time Redis ke frontend.

---

## Key Deliverables Implemented

### 1. `backend/app/services/incident_geometry_service.py` [NEW]
Fungsi generator geometri GeoJSON organik:
- **`generate_earthquake_geometry(lon, lat, magnitude, strike_deg)`**:
  - MultiPolygon 3 ring (Outer, Mid, Inner) untuk gelombang kejut gempa.
  - MultiLineString untuk vektor garis retakan sesar tektonik di sepanjang *strike angle* 150°.
- **`generate_flood_geometry(lon, lat, water_depth_m)`**:
  - Skewed ellipse Polygon memanjang mengikuti kontur sungai (bearing 20°).
- **`generate_landslide_geometry(lon, lat)`**:
  - Downslope debris fan wedge Polygon.

### 2. Update `backend/app/fixtures/historical_episodes.json`
- Memperbarui koordinat `hist-gempa-pasaman-2022`, `hist-banjir-pantura-2024`, dan `hist-longsor-berastagi-2023` menggunakan GeoJSON organik.
- Menambahkan episode Gempa Dangkal `hist-gempa-2024-recent` (M5.2 Sesar Tarutung).
- Menambahkan struktur `predictive_risks` (proyeksi TFT 48 jam).

### 3. Automatic Startup Poller in `backend/app/main.py`
- Menambahkan `_poll_bmkg_loop()` ke dalam `lifespan(app: FastAPI)` context manager.
- Polling otomatis data gempa & cuaca BMKG setiap 60 detik dan menyimpan 50 event terbaru ke Redis list `lrip:live_events`.

### 4. Live Stream Endpoint `GET /api/v1/incidents/osint/live`
- Membaca item dari Redis list `lrip:live_events`, mengayakan dengan geometri GeoJSON dari `incident_geometry_service.py`, dan mengembalikan data live ke frontend.

### 5. Cleanup `weather_fusion_service.py`
- Menghapus list 4 kotak `NORTH_SUMATRA_REGIONAL_BOUNDARIES`.
- Mengembalikan `FeatureCollection` kosong bila tidak ada peringatan BMKG aktif.

### 6. FeatureCollection Unpacking in `CrisisMap.tsx`
- Memperbarui `historicalSource` & `predictiveSource` untuk mengekstrak array `features` baik dari `FeatureCollection` maupun `Feature` tunggal.

---

## Verification & Test Results
- **Frontend Production Build**: `$env:PATH = ...; rtk npm --prefix frontend run build` ➔ `✓ Compiled successfully (6/6 static pages)`.
- **Backend AST Parse Test**: `ALL PYTHON FILES AST PARSE OK`.
- **Data Integrity Verification**: Mengonfirmasi endpoint `/osint/live` dan `/historical/episodes` mengembalikan struktur GeoJSON MultiPolygon & MultiLineString tanpa kesalahan parsing.
