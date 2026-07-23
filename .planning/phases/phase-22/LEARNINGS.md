# LEARNINGS — Phase 22: Google Maps-Grade Administrative Boundary Integration, Top-Nav Telemetry Popups & Non-Overlapping Clean Canvas UI Refactor

**Phase:** 22  
**Date:** 2026-07-23  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  

---

## 💡 Executive Summary & Core Architectural Insights

Phase 22 merekayasa ulang seluruh lapisan tampilan GIS dan pengalaman pengguna (UI/UX) platform PetaNadi. Mengambil tolok ukur utama dari **Google Maps**, fase ini mengintegrasikan poligon batas wilayah administratif riil (ADM2/ADM3) Sumatera Utara dengan pola garis putus-putus (*dashed line stroke*), menghadirkan navbar telemetri interaktif dengan *flyout popovers* Glassmorphism 2.0, mengeliminasi 100% tumpang tindih badge teks melayang di atas peta, serta menyatukan entitas pin episentrum dengan poligon batas daerah.

---

## 🔑 Key Technical Lessons

### 1. Google Maps-Style ADM Boundary Rendering (`CrisisMap.tsx` & `adm_boundary_service.py`)
- **Problem**: Penggunaan bentuk geometris buatan (kotak/lingkaran kaku) membingungkan pengguna karena tidak memperlihatkan batas hukum wilayah administratif daerah yang terkena dampak krisis logistik.
- **Solution**: 
  - Membuat `backend/app/fixtures/north_sumatra_adm_boundaries.json` dan `backend/app/services/adm_boundary_service.py` yang menyediakan dataset GeoJSON presisi tinggi untuk Kota Medan, Kecamatan Belawan, Kab. Deli Serdang, Kota Binjai, Karo/Berastagi, dan Kota Tebing Tinggi.
  - Mengonfigurasi layer Mapbox GL JS `weather-polygons-outline` dengan style garis putus-putus ala Google Maps (`line-dasharray: [4, 3]`, `line-width: 2.5`, `line-color: #ef4444` / `#00f0ff`).
  - Efek visual: Garis perbatasan kota/kecamatan menyala merah saat krisis aktif, menyala cyan saat di-hover, dan memberi shading ambient transparan di dalam area daerah.

### 2. Interactive Top Nav Telemetry & Glassmorphism Popovers (`TopNavTelemetry.tsx`)
- **Problem**: Navbar atas sebelumnya menampilkan teks singkat pasif (`⚡ CUOPT: 3.2ms (-18.5%)`, `🚗 TOMTOM: +35m`, `🌧️ BMKG: 68.5mm`) tanpa penjelasan lokasi stasiun, skala ukuran, maupun indikator status.
- **Solution**: 
  - Dibuat komponen `TopNavTelemetry.tsx` yang menggunakan ikon SVG **Lucide Icons** murni (`Zap`, `Truck`, `CloudRain`, `CheckCircle2`, `ChevronDown`) tanpa emoji mentah (sesuai aturan Non-AI Anti-Patterns `AGENTS.md`).
  - Setiap item navbar dapat diklik untuk membuka *Glassmorphism 2.0 Flyout Popover Card* di bawah navbar:
    - **BMKG**: Menerangkan Stasiun Climatology Sampali Medan, akumulasi 68.5 mm/jam (Hujan Ekstrem), dan wilayah terdampak.
    - **TomTom**: Menerangkan keterlambatan +35 menit pada Tol Belmera KM 12-18 dan indeks kemacetan 74.2%.
    - **cuOpt**: Menerangkan waktu komputasi GPU 3.2 ms dan penghematan BBM +18.5%.

### 3. Absolute Cleanup of Overlapping Floating Map Badges (Clean Canvas)
- **Problem**: Badge insiden historis dan proyeksi risiko sebelumnya ditampilkan sebagai kotak teks melayang seluas 400px di tengah peta, menutupi badge rute `83 min (24 km)` dan menembus masuk ke dalam Right Sidebar Drawer saat opened.
- **Solution**: 
  - Menghapus total badge teks melayang raksasa dari kanvas peta.
  - Kanvas peta hanya menggunakan **Compact Lucide SVG Badges (`z-30`)** yang bersih dan tidak memakan ruang.
  - Detail insiden lengkap dan korelasi inflasi PIHPS dialihkan secara *off-canvas* ke **Right Sidebar (EvidenceTab & MitigationTab)** saat marker/poligon diklik.

### 4. Unifikasi Entitas Episentrum Pin & Poligon Batas Wilayah
- **Problem**: Titik lingkaran krisis dan poligon zona bencana sebelumnya berdiri secara terpisah, membingungkan pengguna akan hubungan di antara keduanya.
- **Solution**: Pin episentrum dan poligon batas wilayah disatukan menjadi 1 entitas krisis utuh. Mengeklik pin episentrum **ATAU** mengeklik poligon batas wilayah akan menyorot kedua elemen secara bersamaan dan membuka Side Drawer yang sama.

---

## 🛠️ Code Reference & Verification Summary

| Component | File Path | Role |
|---|---|---|
| Real ADM Boundary Dataset | `backend/app/fixtures/north_sumatra_adm_boundaries.json` | Dataset GeoJSON batas wilayah administratif riil Sumut |
| ADM Boundary Service | `backend/app/services/adm_boundary_service.py` | Service FastAPI penyedia GeoJSON ADM2/ADM3 |
| Top Nav Telemetry Component | `frontend/components/dashboard/TopNavTelemetry.tsx` | Telemetri top navbar interaktif dengan flyout popovers |
| Map Layer & Dashed Stroke | `frontend/components/map/CrisisMap.tsx` | Google Maps dashed border layer, unifikasi pin-polygon |
| Off-Canvas Incident Viewer | `frontend/components/sidebar/EvidenceTab.tsx` | Viewer detail krisis & korelasi inflasi PIHPS off-canvas |
