# LEARNINGS — Phase 19: Differentiated Multi-Hazard Map Layers, Time Horizon Engine & Lightpanda OSINT Integration

**Phase:** 19  
**Date:** 2026-07-23  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  

---

## 💡 Executive Summary & Core Architectural Insights

Phase 19 berfokus pada diferensiasi visualisasi spasial-temporal untuk berbagai jenis bencana (`flood`, `earthquake`, `landslide`, `wildfire`, `storm`), pengikatan mesin filter waktu 4 mode (**`PAST | PRESENT | FUTURE | PREDICT`**) pada bottom bar ke API backend reaktif, serta integrasi daemon scraper OSINT Lightpanda (`backend/app/routers/incidents.py`) untuk menyalurkan feed berita & laporan media sosial secara real-time.

---

## 🔑 Key Technical Lessons

### 1. Differentiated Multi-Hazard Spatiotemporal Layer Architecture
- **Problem**: Layer peta sebelumnya menggunakan gaya visual generik (lingkaran oranye tunggal), membuat pengguna kesulitan membedakan antara luapan banjir pesisir Belawan, retakan gempa bumi sesar Sumatra, dan tanah longsor di Berastagi.
- **Solution**: Di dalam `CrisisMap.tsx`, diterapkan layer Mapbox GL JS terspesialisasi per jenis bencana:
  - **Banjir (Flood)**: Inundation fill berwarna cyan-navy (`rgba(6, 182, 212, 0.35)`), garis tepi gelombang teranimasi, serta penyorotan ruas jalan tergenang.
  - **Gempa Tektonik (Earthquake)**: Ring gelombang kejut konsentris 3-lapis dari hiposenter + vektor garis retakan sesar (`#f43f5e`) bergaris putus-putus beserta badge `M6.2 Epicenter`.
  - **Tanah Longsor (Landslide)**: Polygon arsiran lereng gunung (`#d97706`) di sepanjang tebing Medan-Berastagi + penanda blokir material tebing.
  - **Titik Panas (Wildfire)**: Heatmap gradien termal (`rgba(249, 115, 22, 0.35)`).
  - **Cuaca Ekstrem (Storm)**: Radar rain grid polygon dengan gradien cyan-slate.

### 2. Time Horizon Engine Reactive State Binding (`PAST | PRESENT | FUTURE | PREDICT`)
- **Problem**: Pengubahan mode waktu di bottom bar (`DashboardClient.tsx`) sebelumnya hanya mengubah label UI tanpa memperbarui data peta, sehingga data masa lalu dan prediksi masa depan tercampur.
- **Solution**: Dibuat hook `useEffect` reaktif pada `DashboardClient.tsx` yang mendengarkan perubahan `activeTimeFilter`:
  - **PAST Mode**: Memanggil API `GET /api/v1/incidents/historical/episodes`. Memuat episode bencana LTM historis (Gempa Pasaman 2022, Banjir Belawan 2024, Longsor Berastagi 2023) beserta penanda lonjakan inflasi PIHPS historis (+18.4% cabai/bawang).
  - **PRESENT Mode**: Menampilkan stream multi-sensor real-time aktif (BMKG, TomTom Traffic, PIHPS, antrean kapal Belawan).
  - **FUTURE Mode**: Memanggil API `GET /api/v1/incidents/predictive/risks`. Menyorot zona risiko probabilitas TFT 24-48 jam pada ruas jalan tol/arteri yang rentan.
  - **PREDICT Mode**: Mengaktifkan kanvas simulasi AI interaktif (trigger skenario krisis kustom, pengalihan rute AI, dan perhitungan dampak kaskade ekonomis).

### 3. Lightpanda OSINT Scraper Bridge Integration
- **Problem**: Laporan berita lokal dan unggahan media sosial warga di lapangan tidak terhubung secara otomatis ke stream insiden aktif.
- **Solution**: Dibuat endpoint `/api/v1/incidents/osint/feed` pada `backend/app/routers/incidents.py`. Router ini mengintegrasikan daemon scraper Lightpanda (`osint_worker.py`) yang membaca feed dari Supabase `osint_feed` atau Redis STM fallback, kemudian menyajikannya ke sidebar krisis lengkap dengan score relevansi, analisis sentimen, dan link sumber.

---

## 🛠️ Code Reference & Verification Summary

| Component | File Path | Role |
|---|---|---|
| Historical & Predictive Endpoints | `backend/app/routers/incidents.py` | Menyajikan data episode LTM & proyeksi risiko TFT |
| Fixture Data | `backend/app/fixtures/historical_episodes.json` | Dataset episode bencana historis & laporan OSINT |
| Time Horizon Controller | `frontend/components/dashboard/DashboardClient.tsx` | Mengontrol state `activeTimeFilter` & trigger fetch |
| Map Layer Renderer | `frontend/components/map/CrisisMap.tsx` | Render layer Mapbox terpisah per bencana & mode waktu |
