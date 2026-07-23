# LEARNINGS — Phase 21: Full Integration Audit, Organic Hazard Geometries & Live BMKG/OSINT Incident Spatiotemporal Engine

**Phase:** 21  
**Date:** 2026-07-23  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  

---

## 💡 Executive Summary & Core Architectural Insights

Phase 21 mengaudit dan memperbaiki akar permasalahan visualisasi bencana "4 kotak persegi kaku", membangun service pembuat geometri spasial GeoJSON organik (`incident_geometry_service.py`), mengintegrasikan polling BMKG otomatis saat startup FastAPI (`main.py`), mengaktifkan endpoint live stream Redis (`/osint/live`), serta menghapus total ketergantungan pada bounding box sintetis sehingga kanvas Mapbox GL JS menyajikan visualisasi realistis per jenis bencana.

---

## 🔑 Key Technical Lessons

### 1. Organic Incident Geometry Service Architecture (`incident_geometry_service.py`)
- **Problem**: Sistem sebelumnya mengandalkan daftar 4 koordinat kotak persegi `NORTH_SUMATRA_REGIONAL_BOUNDARIES` pada `weather_fusion_service.py` dan koordinat 4-titik kaku pada `historical_episodes.json`. Akibatnya, gempa bumi maupun banjir selalu tampil sebagai kotak persegi yang tidak masuk akal secara geografis.
- **Solution**: Dibuat `backend/app/services/incident_geometry_service.py` yang menggunakan kalkulasi matematika spasial Haversine & rotasi bearing ellips:
  - **Gempa Tektonik (Earthquake)**: Menggenerasi `MultiPolygon` 3 ring shockwave konsentris (Outer, Mid, Inner) berdasarkan magnitudo skala Richter + `MultiLineString` garis retakan sesar tektonik yang searah dengan *strike angle* Sesar Sumatra (150°).
  - **Banjir (Flood)**: Menggenerasi `Polygon` kontur luapan air yang memanjang mengikuti arah lembah sungai Sumatera Utara (SSW ➔ NNE, bearing 20°).
  - **Tanah Longsor (Landslide)**: Menggenerasi `Polygon` berbentuk wedge/pasak (menyempit di puncak tebing, melebar di area deposit material bawah).
  - **Wildfire & Congestion**: Menggenerasi `Polygon` ellips dispersi angin / koridor terdistorsi.

### 2. Automatic BMKG Background Poller via FastAPI Lifespan Manager
- **Problem**: Adaptor BMKG sebelumnya hanya berjalan jika dipanggil secara manual melalui HTTP request, sehingga data krisis di Redis STM tidak pernah terbarui secara otomatis di latar belakang.
- **Solution**: Di dalam `backend/app/main.py`, dibuat fungsi `_poll_bmkg_loop()` yang dimasukkan ke dalam `lifespan(app: FastAPI)` context manager:
  ```python
  async def _poll_bmkg_loop():
      adapter = BMKGAdapter()
      while True:
          raw = await adapter.fetch()
          events = await adapter.parse(raw)
          if events:
              r = get_redis()
              for ev in events:
                  r.lpush("lrip:live_events", json.dumps(ev))
              r.ltrim("lrip:live_events", 0, 49)
          await asyncio.sleep(60)
  ```
  BMKG poller kini berjalan otomatis saat container FastAPI/Docker dinyalakan tanpa memerlukan script runner terpisah.

### 3. Redis STM Live Stream Endpoint & Geometry Enrichment (`incidents.py`)
- **Problem**: Frontend membutuhkan endpoint terpadu untuk mengambil insiden live (BMKG + OSINT) yang sudah siap digambar di kanvas peta.
- **Solution**: Dibuat endpoint `GET /api/v1/incidents/osint/live` pada `backend/app/routers/incidents.py`. Endpoint ini membaca item `lrip:live_events` dari Redis, lalu secara otomatis mengayakan payload dengan geometri GeoJSON organik dari `incident_geometry_service.py`. Jika Redis kosong, sistem mengembalikan fallback event live (Gempa Tarutung M5.2 & Banjir Belawan 1.4m) yang telah diayakan geometri organik.

### 4. Zero Artificial Boxes Policy & Compound FeatureCollection Unpacking
- **Problem**: `weather_fusion_service.py` selalu mengembalikan 4 kotak wilayah meskipun tidak ada bencana atau cuaca ekstrem aktif. Mapbox GL JS juga sebelumnya hanya menerima `Feature` tunggal dan mengabaikan `FeatureCollection` bertingkat.
- **Solution**:
  - `NORTH_SUMATRA_REGIONAL_BOUNDARIES` dihapus dari `weather_fusion_service.py`. Jika tidak ada peringatan cuaca BMKG aktif, service mengembalikan `FeatureCollection` kosong (`features: []`) sehingga kanvas peta mode `PRESENT` tampil gelap dan bersih tanpa kotak sintetis.
  - Pada `CrisisMap.tsx`, pembacaan source `historical-episodes-source` & `predictive-risks-source` diperbarui agar secara rekursif mengekstrak `FeatureCollection` (memungkinkan ring gelombang kejut gempa DAN garis retakan sesar digambar bersamaan dalam satu layer).

---

## 🛠️ Code Reference & Verification Summary

| Component | File Path | Role |
|---|---|---|
| Organic Geometry Generator | `backend/app/services/incident_geometry_service.py` | Generator GeoJSON organik per jenis bencana |
| Historical Episode Fixture | `backend/app/fixtures/historical_episodes.json` | Dataset episode dengan geometri organik & predictive risks |
| FastAPI Lifespan & Poller | `backend/app/main.py` | Polling BMKG latar belakang otomatis tiap 60 detik |
| Live Incident Stream Router | `backend/app/routers/incidents.py` | Endpoint `GET /osint/live` dari Redis STM |
| Clean Weather Fusion | `backend/app/services/weather_fusion_service.py` | Weather fusion murni BMKG (0 kotak sintetis) |
| FeatureCollection Map Canvas | `frontend/components/map/CrisisMap.tsx` | Unpacking FeatureCollection & rendering layer gempa |
