# LAPORAN AUDIT ROOT CAUSE ANALYSIS & VERIFIKASI END-TO-END (E2E) PREHUB
**Target URL Audit:** `https://pre-hub.vercel.app/dashboard?guest=1`  
**Waktu Pengujian:** 2026-10-19  
**Metodologi:** *Runtime Network Profiling, Chrome DevTools Protocol, DOM Inspection, Automated Headless Browsing, Static Codebase Tracing.*

---

## 1. AUDIT LATENSI TINGGI & STATUS PIPELINE DATA

### Gejala
Pada panel kiri bawah dashboard (`STATUS PIPELINE DATA`), ketiga indikator sensor (`BMKG`, `TOMTOM`, `PIHPS`) selalu menampilkan status **`FALLBACK` (warna oranye)**. Selain itu, latensi API rata-rata tercatat 1.454 ms dengan titik puncak hingga 3.447 ms pada tab Evaluasi.

### Root Cause
1. **Bypass Sanitasi URL di Frontend Hook:**
   Pada file [`frontend/hooks/useCorridorContext.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useCorridorContext.ts), pemanggilan endpoint koridor menggunakan:
   ```ts
   const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
   ```
   Variabel lingkungan pada deployment Vercel masih mengarah ke domain kedaluwarsa `https://prehub-backend.onrender.com`. Karena pemanggilan ini mem-bypass fungsi terpusat `getBaseUrl()` di [`frontend/lib/api.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/api.ts), browser mengalami error CORS / `net::ERR_FAILED`. Hook kemudian secara instan jatuh ke `DEFAULT_FALLBACK_CORRIDOR` dengan flag `is_fallback: true`.
2. **Evaluasi Boolean Monolitik di UI:**
   Pada file [`frontend/components/dashboard/DashboardClient.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx), ketiga sensor dievaluasi secara global:
   ```tsx
   {corridorContext?.is_fallback ? 'FALLBACK' : isCorridorLoading ? 'MEMUAT' : 'LIVE'}
   ```
   Berdasarkan pengujian langsung ke backend aktif (`https://peta-nadi.onrender.com/api/v1/corridor/context`):
   - `BMKG`: **ONLINE / LIVE** (`weather.is_fallback: false`)
   - `PIHPS`: **ONLINE / LIVE** (`commodity_prices.is_fallback: false`)
   - `TomTom`: **DEGRADED / FALLBACK** (`traffic.is_fallback: true`, akibat kuota kredit API TomTom habis).  
   Karena satu sensor degraded, backend mengeset `corridorContext.is_fallback = true`. Akibat evaluasi monolitik di frontend, BMKG dan PIHPS ikut divonis `FALLBACK` padahal datanya live.

### Keputusan Solusi Terpilih (Sesuai Arahan Pengguna)
* **PILIHAN TERPILIH (OPSI 3 - Granular Per-Sensor Indicator UI Binding):**
  - Mengarahkan `useCorridorContext.ts`, `useCrisisSimulationStream.ts`, dan `AgentStatusWidget.tsx` ke fungsi `getBaseUrl()` agar tidak mem-bypass sanitasi domain aktif.
  - Memisahkan evaluasi status masing-masing sensor di `DashboardClient.tsx`:
    - BMKG membaca `corridorContext?.weather?.is_fallback` (menjadi **LIVE hijau**).
    - TomTom membaca `corridorContext?.traffic?.is_fallback` (menjadi **FALLBACK oranye** secara jujur).
    - PIHPS membaca `corridorContext?.commodity_prices?.is_fallback` (menjadi **LIVE hijau**).
  - Opsi caching agresif atau throttling WebGL ditiadakan sesuai instruksi pengguna.

---

## 2. AUDIT PIPELINE BERITA, BUG GEOTAGGING TOMBOL "FOKUS", & RELEVANSI TOPIK

### Gejala
1. Ketika tombol **"Fokus"** pada kartu berita diklik, kamera peta tidak bergerak ke lokasi berita melainkan tetap diam di Kota Medan (`[98.6722, 3.5952]`), dan muncul toast hitam: *"Pilih Titik Asal dan Titik Tujuan di peta terlebih dahulu untuk mengaktifkan simulasi krisis."*
2. Terdapat artikel yang tidak relevan dengan krisis logistik pangan (seperti *"Dokter: Osteoporosis usia di atas 50 tahun..."*, *"Timnas futsal..."*, dan *"Dua tahun Prabowo-Gibran..."*) masuk ke feed.

### Root Cause
1. **Integritas Sumber Data Berita:**
   - Berita yang ditampilkan terbukti **murni live fetching** dari RSS resmi LKBN ANTARA biro regional (Sumut, Sumbar, Riau, Jambi, Babel, Bengkulu) dan DetikSumut melalui backend service `news_aggregator.py`.
   - Artikel non-logistik masuk karena artikel tersebut sudah tersimpan di database Supabase `news_articles` sebelum filter kata kunci diterapkan, dan endpoint `/api/v1/news/live` membacanya dari database.
2. **Kegagalan Geotagging Default ke Medan:**
   Di [`backend/app/nlp/geocoding_service.py`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/nlp/geocoding_service.py), fungsi `resolve_sumatra_location_and_corridor` memiliki fallback:
   ```python
   target_prov = fallback_province if fallback_province in province_centroids else "Sumatera Utara"
   lat, lon = province_centroids.get(target_prov, (3.5952, 98.6722))
   ```
   Karena parameter `fallback_province` default-nya adalah `"Sumatera"` (yang tidak ada di dictionary provinsi), sistem selalu menetapkan `"Sumatera Utara"` dengan koordinat default **`[98.6722, 3.5952]` (Medan)** untuk semua artikel yang nama kotanya tidak terdaftar di gazetteer.
3. **Ketiadaan Animasi `flyTo` & Blokir Validasi Simulasi:**
   Di [`frontend/components/dashboard/DashboardClient.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx), fungsi `handleFocusMap` memanggil `handleMapPointTargeted` yang bertujuan menjalankan simulasi krisis. Di dalam `triggerFullSimulationEngine`:
   ```ts
   if (!originId || !destId) {
     setToast({ message: 'Pilih Titik Asal dan Titik Tujuan...', type: 'info' });
     return;
   }
   ```
   Karena pengguna belum memilih rute asal & tujuan, fungsi berhenti seketika (*early return*), toast muncul, dan tidak ada pemanggilan `map.flyTo({ center: [item.lon, item.lat] })`.

### Rencana Tindakan
1. **Frontend Focus Handler:** Ganti perilaku tombol "Fokus" agar langsung memanggil `map.flyTo({ center: [item.lon, item.lat], zoom: 11, duration: 1200 })`, menyorot kartu berita, dan membuka modal detail koordinat tanpa menyentuh engine simulasi krisis.
2. **Frontend Display Gate:** Tambahkan filter client-side di `useNewsVerification.ts` untuk memblokir artikel lama yang mengandung kata kunci non-logistik (*osteoporosis, varises, futsal, selebriti, konser*) sebelum di-render ke UI.
3. **Backend Geocoder Fallback:** Pastikan ekstraksi lokasi mengenali biro provinsi LKBN Antara (misal "Biro Jambi" -> koordinat Jambi, "Biro Sumbar" -> koordinat Padang), bukan langsung jatuh ke Medan.

---

## 3. PENANGANAN BERITA STATUS `Tautan asli kedaluwarsa`

### Gejala
Beberapa kartu berita menampilkan badge kuning `⚠️ Tautan asli kedaluwarsa` dan tautan sumber aslinya tidak dapat diklik.

### Root Cause
Di [`backend/app/services/unified_news_ingestor.py`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/services/unified_news_ingestor.py), backend menjalankan pemeriksaan `_is_link_alive`. Jika link menghasilkan redirect ke root homepage redaksi atau mengembalikan status 404/410, backend menandai `link_alive = "dead"`.  
Di frontend `DashboardClient.tsx`, ketika `link_alive === 'dead'`, elemen link `<a>` sengaja disembunyikan dan diganti badge peringatan kuning.

### Rencana Tindakan
Alih-alih menonaktifkan link dan meninggalkan pengguna tanpa jalur verifikasi, kartu berita yang berstatus `link_alive === 'dead'` harus menyediakan **Tautan Pencarian Arsip Resmi Otomatis (Verified Search Deep-Link)** menggunakan judul berita ke portal biro terkait:
- Contoh: `https://[biro].antaranews.com/search?q=[encoded_headline]`
- Badge disesuaikan menjadi: `🔍 Buka Arsip Pencarian Resmi [↗]`, sehingga data tetap 100% dapat diverifikasi oleh operator.

---

## 4. LOGIKA MODE `Live AIS/ADS-B + Rute Estimasi` & GARIS ORANYE MENEROBOS DARATAN

### Gejala
Ketika mode `Live AIS/ADS-B + Rute Estimasi (480)` diaktifkan, muncul banyak garis lurus berwarna oranye dari titik-titik truk (Binjai, Kualanamu, Brastagi) yang menerobos gunung, hutan, dan bangunan langsung menuju pusat Kota Medan, meskipun pengguna belum memilih rute asal & tujuan (`RUTE: —`).

### Root Cause
1. **Sifat Garis Oranye:** Garis tersebut adalah **Proyeksi Rute Terjadwal Armada (Fleet Estimated Scheduled Trajectory)** milik armada berstatus `tracking_mode === 'ROUTE_ESTIMATED'` yang di-render oleh Deck.gl `PathLayer` (`deck-fleet-estimated-routes`). Ini bukan rute navigasi yang dipilih pengguna.
2. **Geometri Linier Mentah:** Di [`backend/data/fleet_corridors_snapped.json`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/data/fleet_corridors_snapped.json) dan `telemetry_service.py`, rute armada seperti `TRK-020-MEDAN-BINJAI` hanya memiliki titik-titik kasar hasil interpolasi linier (*lerp*) antara koordinat kota:
   `[98.6722, 3.5952] -> [98.5800, 3.6050] -> [98.4856, 3.6006]`.  
   Koordinat tersebut tidak mengikuti geometri jalan raya (Jalan Gatot Subroto / Tol Medan–Binjai).

### Rencana Tindakan
1. **Anti-Clutter Visual Hierarchy:** Secara default, jangan gambar seluruh garis oranye 480 armada sekaligus di layar saat mode estimasi aktif. Cukup tampilkan titik armada (*dot/icon*) dan pulsanya.
2. **Selective Road-Snapped Inspection:** Garis rute armada hanya ditampilkan saat armada tersebut **di-hover atau diklik oleh operator**.
3. **Pre-Computed Road Geometry Asset:** Sediakan dataset geometri jalan raya berliku (*road-snapped polyline*) untuk koridor utama logistik Sumatera (Medan–Belawan via Jl. Yos Sudarso, Medan–Binjai via Tol Medan-Binjai, Medan–Tebing Tinggi via Tol MKTT) di `frontend/public/data/corridor_road_geometries.json` agar lintasan armada menempel presisi di atas jalan peta tanpa memerlukan ribuan panggilan API eksternal yang membebani memori.

---

## 5. TEMUAN AUDIT E2E TAMBAHAN

1. **Bug URL QR Code Remote Demo:**  
   Di [`frontend/components/demo/GuidedDemoPanel.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx#L94), URL yang di-generate adalah `http://${hostname}:3000/demo-remote...`. Pada production Vercel (`pre-hub.vercel.app`), port 3000 tidak ada, sehingga pemindaian QR code via smartphone selalu gagal (*Connection Refused*). Seharusnya menggunakan `https://${hostname}/demo-remote...`.
2. **Bypass Sanitasi API di Modul Lain:**  
   File [`frontend/hooks/useCrisisSimulationStream.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useCrisisSimulationStream.ts#L48) dan [`frontend/components/dashboard/AgentStatusWidget.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/AgentStatusWidget.tsx#L82) masih membaca langsung `process.env.NEXT_PUBLIC_API_URL` dan perlu distandarisasi ke `getBaseUrl()`.
