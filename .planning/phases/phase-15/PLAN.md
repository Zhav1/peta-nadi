# PLAN — Phase 15: Grounded Mapbox Engine Integration, Real-Road Junction Bypass & Feasibility-Constrained Multimodal Routing

**Phase:** 15  
**Milestone:** M1 — Hackathon MVP (North Sumatra & National Intermodal Corridor)  
**Status:** READY TO EXECUTE ⏳  
**Skills Ingested:** `mapbox-geospatial-operations`, `logistics-routing-vrp`, `mapbox-google-maps-migration`, `nextjs-mapbox-deckgl`, `mapbox-data-visualization-patterns`  
**Benchmark Reference:** [BENCHMARK_ANALYSIS.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/BENCHMARK_ANALYSIS.md) (Globot & Aegis Architectures)  
**Research Reference:** [maps_research.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/maps_research.md)  
**Proposal Spec:** [Submission Tahap 2 (3) - compiled.md](file:///c:/Farras/DIGDAYA/peta-nadi/docs/Submission%20Tahap%202%20%283%29%20-%20compiled.md)  

---

## 1. Root Cause Diagnosis & Strategic Redesign

Berdasarkan analisis mendalam terhadap screenshot pengujian, [BENCHMARK_ANALYSIS.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/BENCHMARK_ANALYSIS.md), dan [maps_research.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/maps_research.md), ditemukan 3 akar masalah utama:

1. **Hallucinated Geometric Polylines & Floating Waypoints ("Coretan Tangan"):**
   - Kode sebelumnya menggunakan proyeksi vektor imajiner (`calculatePureAgenticTangentialWaypoints`) yang menembakkan titik koordinat melayang di tengah sawah/hutan tanpa peduli graf jalan raya. Mapbox dipaksa memutar dari jalan tol masuk ke jalan kampung kecil tersebut dan kembali lagi ke tol, menghasilkan rute berkelok-kelok tidak alami dan menembus lingkaran krisis.
2. **Ketiadaan Constraint Model Moda Logistik (Multi-Modal Absurdity):**
   - Belawan ➔ Tebing Tinggi (jarak darat 60–70 km) direkomendasikan naik Cargo Udara via Bandara Kualanamu. Ini terjadi karena belum ada *feasibility constraint* (jarak minimal udara = 300+ km, penalti transfer bandara = 2-3 jam).
3. **Pemisahan Peran LLM vs Routing Engine yang Belum Tegas:**
   - LLM/AI tidak boleh mengarang polylines atau menggunakan istilah teknis fiktif (`Pure Agentic Tangential Vector`). Peran LLM adalah menyusun constraint bencana dari BMKG/InaRISK, sedangkan Mapbox/TomTom Routing Engine yang menghitung 100% rute fisik di atas graf jalan.

---

## 2. Arsitektur 5 Pilar Perbaikan Phase 15

### Pilar 1: Real-Road Junction Bypass Engine (Zero Floating Off-Road Waypoints)
- Eliminasi 100% perhitungan koordinat melayang murni (`calculatePureAgenticTangentialWaypoints`).
- Waypoint pengalihan **WAJIB** terikat pada simpul persimpangan/interchange jalan raya nyata (misal: Interchange Sei Rampah / Interchange Tebing Tinggi / Indrapura Junction).
- Panggil Mapbox Directions API (`v5/mapbox/driving-traffic`) menyusuri persimpangan arteri nyata.

### Pilar 2: Spatial Hazard Exclusion & Strict Clean Route Check
- Konversi zona banjir/gempa (lingkaran krisis / poligon GeoJSON) menjadi filter pengecekan spasial yang ketat.
- Rute yang memotong zona bencana diklasifikasikan sebagai `COMPROMISED` (Merah `#EF4444`). Rute ini **TIDAK BOLEH** diberi label `⭐ rekomendasi AI: Safe Bypass` atau di-approve sebagai rute utama.
- AI Router menjamin rute rekomendasi utama adalah rute `SAFE_DETOUR` (Hijau Neon `#10B981`) yang 100% bebas dari perpotongan zona bencana. Jika seluruh rute terpotong, UI menampilkan peringatan eksplisit: `"⚠️ DANGER: JALUR UTAMA DITUTUP. TIDAK ADA RUTE BEBAS BENCANA."`

### Pilar 3: Distance & Feasibility Constrained Multi-Modal Graph Engine
- Membangun model kelayakan moda (*Modal Feasibility Model*):
  - **Jarak Short-Haul (< 300 km atau Satu Pulau):** 100% Truk Darat (Road Network). Moda pesawat/kapal secara otomatis DITOLAK karena penalti transfer waktu & biaya.
  - **Jarak Inter-Island / Long-Haul (> 300 km):** Kombinasi Intermodal (Truk First-Mile 🚚 ➔ Pelabuhan/Bandara ➔ Cargo Udara ✈️ / Kapal Laut ⚓ ➔ Truk Last-Mile 🚚).

### Pilar 4: Automated Intermodal UI (Remove Forced Manual Modal Toggle)
- Hapus tombol toggle manual moda (`Moda: Truk | Kapal | Udara`) dari bagian utama Simulator Bar.
- Sistem/AI secara otomatis menentukan moda terbaik berdasarkan analisis graf asal-tujuan (OD distance, konektivitas pulau, dan hambatan bencana). Toggle manual hanya menjadi filter tersembunyi.

### Pilar 5: Grounded AI Copilot & UI Integrity
- Ganti teks AI Reasoning trace yang berisi istilah fiktif dengan fakta data API nyata:
  *&quot;Mapbox Directions Engine mendeteksi krisis banjir pada segmen Tol Medan-Tebing Tinggi km 64. Sistem mengalihkan armada via Interchange Sei Rampah ➔ Arteri Jalinsum (+18 km, +15 min).&quot;*
- Menampilkan visualisasi segmen warna kemacetan ala Google Maps (Hijau `#22C55E` lancar, Kuning `#EAB308` padat, Merah `#EF4444` macet/bencana) menggunakan annotation `congestion` Mapbox.

---

## 3. Verification Plan

### Automated Build Check
- Run Next.js build check:
  ```powershell
  $env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); npm run build --prefix frontend
  ```

### Manual Verification Checklist
1. **Belawan ➔ Tebing Tinggi (Short-Haul)**: Otomatis memilih Truk Darat via Tol/Arteri. Moda pesawat Kualanamu 100% ditolak.
2. **No Floating Loops**: Rute pengalihan melingkari Tebing Tinggi menyusuri jalan arteri nyata tanpa garis "coretan tangan" melayang.
3. **Hazard Avoidance**: Rute rekomendasi AI (`SAFE_DETOUR`) 100% berada di luar lingkaran krisis. Rute yang terpotong ditandai `COMPROMISED` (Merah) dan tidak dijadikan rekomendasi utama.
4. **Traffic Congestion Colors**: Garis rute menampilkan segmen warna hijau/kuning/merah sesuai annotation `congestion` Mapbox.
5. **Clean Initial State**: Web pertama kali dibuka dalam kondisi netral (0 rute digambar).
