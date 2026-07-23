# PLAN — Phase 22: Google Maps-Grade Administrative Boundary Integration, Top-Nav Telemetry Popups & Non-Overlapping Clean Canvas UI Refactor

**Phase:** 22  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** Integrasikan poligon batas wilayah administratif riil Sumatera Utara (Google Maps Style - garis putus-putus presisi ADM2/ADM3), refaktor top navbar telemetri dengan deskripsi human-readable & flyout popups, hilangkan 100% tumpang tindih badge teks melayang di atas peta, unifikasi entitas pin episentrum dengan poligon batas wilayah, dan hubungkan penuh ke pipeline data Supabase.

---

## 🔍 Root Cause & Problem Analysis

1. **Top Navbar Telemetry Cryptic & Pasif:**
   - Label `⚡ CUOPT: 3.2ms (-18.5%)`, `🚗 TOMTOM: +35m (74.2%)`, `🌧️ BMKG: 68.5mm` tidak memiliki keterangan lokasi, kategori cuaca (misal: Hujan Ekstrem Medan), maupun unit yang dapat dipahami pengguna awam. Tidak ada tooltip/popover interaktif saat di-hover/diklik.

2. **Kotak / Geometri Abstrak vs Batas Wilayah Riil (Google Maps Benchmark):**
   - Visualisasi zona cuaca/bencana saat ini belum mengikuti batas hukum wilayah administrasi riil (Kota Medan, Kecamatan Belawan, Kab. Deli Serdang, Kota Binjai, Karo/Berastagi).
   - Pengguna mengharapkan batas wilayah tampil seperti **Google Maps** (garis putus-putus merah/cyan presisi di sepanjang perbatasan kota/kecamatan, pantai, dan sungai).

3. **Komponen Menimpa Kanvas Peta (Overlapping Clutter):**
   - Badge insiden historis (`Gempa Tektonik...`, `Banjir Bandang...`) berupa kotak teks melayang seluas 400px yang membentang di tengah peta, menutupi badge rute (`83 min (24 km)`), menutupi nama kota, dan **menembus masuk ke dalam Right Sidebar Drawer** saat opened.

4. **Keterpisahan Pin Bubble dengan Zona Poligon:**
   - Pin lingkaran oranye/hijau berdiri terpisah dari zona poligon bencana di sekitarnya, membuat pengguna bingung perbedaan fungsi antara lingkaran pin dan zona poligon.

---

## 🛠️ Detailed Technical Deliverables

---

### DELIVERABLE 1 — North Sumatra ADM2/ADM3 Real GeoJSON Boundary Dataset

**File:** `backend/app/fixtures/north_sumatra_adm_boundaries.json` [NEW] & `backend/app/services/adm_boundary_service.py` [NEW]

Menyediakan dataset GeoJSON batas wilayah administratif presisi tinggi untuk sektor koridor logistik Sumatera Utara:
- **`KOTA_MEDAN`**: Poligon batas riil 21 kecamatan Kota Medan & pesisir Pelabuhan Belawan.
- **`KECAMATAN_MEDAN_BELAWAN`**: Poligon batas pesisir & gerbang laut Belawan.
- **`KAB_DELI_SERDANG`**: Poligon batas mengelilingi Medan, Kualanamu (KNO), dan Tanjung Morawa.
- **`KOTA_BINJAI`**: Poligon batas koridor pangan barat Binjai-Langkat.
- **`KAB_KARO_BERASTAGI`**: Poligon batas dataran tinggi hortikultura Berastagi.
- **`KOTA_TEBING_TINGGI`**: Poligon batas simpang tol & koridor timur Trans-Sumatra.

**API Service:**
```python
def get_adm_boundary_geojson(region_ids: List[str] = None) -> dict:
    """Mengembalikan FeatureCollection GeoJSON batas wilayah administratif riil Sumut."""
```

---

### DELIVERABLE 2 — Google Maps-Style Boundary Layer in Mapbox GL JS & Deck.gl

**File:** `frontend/components/map/CrisisMap.tsx` [MODIFY]

Implementasi 2 layer Mapbox terstruktur ala Google Maps:

1. **`adm-boundary-stroke` (Line Layer Garis Putus-Putus):**
   ```javascript
   map.addLayer({
     id: 'adm-boundary-stroke',
     type: 'line',
     source: 'north-sumatra-adm-source',
     paint: {
       'line-color': [
         'case',
         ['boolean', ['feature-state', 'is_hazard'], false], '#ef4444',
         ['boolean', ['feature-state', 'hover'], false], '#00f0ff',
         '#ef4444' // Default Google Maps Style Red Dashed Line
       ],
       'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 3.0, 1.8],
       'line-dasharray': [4, 3], // Garis putus-putus ala Google Maps
       'line-opacity': 0.85
     }
   });
   ```

2. **`adm-boundary-fill` (Fill Layer Ambient Tint):**
   ```javascript
   map.addLayer({
     id: 'adm-boundary-fill',
     type: 'fill',
     source: 'north-sumatra-adm-source',
     paint: {
       'fill-color': [
         'case',
         ['boolean', ['feature-state', 'is_hazard'], false], 'rgba(239, 68, 68, 0.18)',
         'rgba(6, 182, 212, 0.05)'
       ],
       'fill-opacity': 0.8
     }
   });
   ```

3. **Interactive Hover Telemetry Popup & Cyan Glow:**
   - Mouse hover pada area di dalam batas wilayah mengaktifkan border cyan menyala (`#00f0ff`) dan memicu popup telemetri glassmorphism (`curah hujan BMKG mm/j`, `risiko banjir %`, `indeks kemacetan TomTom`).

---

### DELIVERABLE 3 — Top Navbar Interactive Telemetry & Flyout Popups

**Files:** `frontend/components/dashboard/TopNavTelemetry.tsx` [NEW] & `frontend/components/dashboard/DashboardClient.tsx` [MODIFY]

1. **Refaktor Label Telemetry Top Nav:**
   - Mengubah teks singkat menjadi format human-readable dengan indikator warna status:
     - 🌧️ `BMKG: Hujan Lebat Medan (68.5 mm/j)` [Badge Merah/Amber]
     - 🚗 `TOMTOM: Delay +35m Tol Belmera (74.2%)` [Badge Amber]
     - ⚡ `CUOPT: Solver GPU (3.2ms / +18.5% Efisiensi)` [Badge Hijau/Cyan]

2. **Interactive Glassmorphism Flyout Popovers:**
   - Klik/hover pada item navbar membuka popover card di bawah navbar:
     - **BMKG Popover**: *"Stasiun Climatology Sampali Medan — Peringatan Dini Cuaca Ekstrem. Akumulasi Hujan: 68.5 mm/jam. Wilayah Terdampak: Medan Utara & Pelabuhan Belawan."*
     - **TomTom Popover**: *"TomTom Traffic Stream — Kemacetan Segmen Tol Belmera KM 12-18. Keterlambatan Rata-rata: +35 Menit. Kecepatan Armada: 14 km/jam."*
     - **cuOpt Popover**: *"NVIDIA cuOpt VRP Solver — GPU Accelerated Matrix Engine. Waktu Komputasi: 3.2 ms. Efisiensi Penghematan BBM/Waktu: +18.5%."*

---

### DELIVERABLE 4 — Off-Canvas Clean Map Refactor & Overlapping Cleanup

**File:** `frontend/components/map/CrisisMap.tsx` [MODIFY] & `frontend/components/sidebar/EvidenceTab.tsx` [MODIFY]

1. **Eliminasi 100% Floating Text Cards Raksasa di Atas Peta:**
   - Menghapus komponen badge teks panjang (`hist-gempa...`, `hist-banjir...`) dari kanvas peta.
   - Kanvas peta **hanya** menampilkan Compact Icon Markers (`z-30`) berbasis Lucide SVG (`AlertTriangle`, `Droplets`, `Activity`, `FileText`).

2. **Off-Canvas Detail Rendering (Right Sidebar Integration):**
   - Saat pengguna mengeklik marker krisis atau poligon batas wilayah, detail insiden dan dampak korelasi inflasi PIHPS secara otomatis ditampilkan di **Right Sidebar (Evidence & Mitigation Tabs)**.
   - Peta tetap 100% bersih, dapat dibaca, dan tidak ada teks melayang yang menembus sidebar.

3. **Camera Viewport Auto-Offset saat Sidebar Terbuka:**
   - Saat Right Sidebar dibuka, panggil `map.easeTo({ padding: { right: 380 } })` untuk menggeser fokus kamera Mapbox ke sebelah kiri secara mulus sehingga marker dan rute tidak pernah tertutup sidebar.

---

### DELIVERABLE 5 — Unifikasi Entitas Episentrum Pin & Poligon Batas Wilayah

**File:** `frontend/components/map/CrisisMap.tsx` [MODIFY]

1. **Unified Hazard Entity Linking:**
   - Menghubungkan ID pin episentrum (`incident_id`) dengan poligon batas wilayah administratifnya (`region_id`).
2. **Unified Highlight & Click Behavior:**
   - Mengeklik pin episentrum **ATAU** mengeklik poligon batas wilayah akan menyorot kedua elemen secara bersamaan (border magenta/cyan glow) dan membuka Side Drawer Detail Insiden yang sama.

---

### DELIVERABLE 6 — Supabase Real Data Pipeline & Regional Coordinates Sync

**Files:** `backend/app/routers/incidents.py` [MODIFY] & `backend/app/services/incident_geometry_service.py` [MODIFY]

1. **Koneksi Supabase DB Real:**
   - Memastikan `/api/v1/incidents` memprioritaskan query dari tabel Supabase `incidents` & `ltm_episodes`.
2. **Presisi Koordinat Sumatera Utara:**
   - Synchronize koordinat presisi tinggi:
     - **Gempa Pasaman**: Episentrum `0.15° N, 99.98° E` + Sesar Angkola.
     - **Banjir Belawan**: Pesisir Belawan `3.78° N, 98.67° E` + ADM Poligon Belawan.
     - **Longsor Berastagi**: Tebing Jalinsum `3.18° N, 98.50° E` + ADM Poligon Karo/Berastagi.

---

## 📁 File Changes Summary

| File | Action | Scope |
|---|---|---|
| `backend/app/fixtures/north_sumatra_adm_boundaries.json` | NEW | GeoJSON batas wilayah administratif riil Sumut (Google Maps ADM2/ADM3) |
| `backend/app/services/adm_boundary_service.py` | NEW | Service penyedia GeoJSON ADM batas wilayah Sumut |
| `backend/app/routers/incidents.py` | MODIFY | Integrasi Supabase real DB & pengayaan ADM GeoJSON |
| `backend/app/services/weather_fusion_service.py` | MODIFY | Integrasi poligon ADM cuaca riil BMKG per kecamatan |
| `frontend/components/dashboard/TopNavTelemetry.tsx` | NEW | Component top navbar telemetry interaktif dengan flyout popovers |
| `frontend/components/dashboard/DashboardClient.tsx` | MODIFY | Integrasi TopNavTelemetry & manajemen viewport camera offset |
| `frontend/components/map/CrisisMap.tsx` | MODIFY | Implementation Google Maps dashed stroke layer, unifikasi pin-polygon, eliminasi text pills melayang |
| `frontend/components/sidebar/EvidenceTab.tsx` | MODIFY | Off-canvas detail viewer insiden & korelasi inflasi |

---

## 🧪 Detailed Verification Plan

### 1. Build Verification
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk npm --prefix frontend run build
```

### 2. Backend API Verification
```bash
# Verify real ADM boundaries GeoJSON
curl http://localhost:8000/api/v1/incidents/adm-boundaries

# Verify enriched incidents with real ADM GeoJSON
curl http://localhost:8000/api/v1/incidents/historical/episodes
```

### 3. Visual & Interactive Browser Verification
- [ ] **Google Maps Style Dashed Border**: Memastikan batas wilayah Kota Medan, Belawan, Binjai, Deli Serdang, dan Berastagi tampil dengan garis putus-putus merah/cyan yang presisi mengikuti batas daerah riil.
- [ ] **Zero Overlapping Floating Pills**: Memastikan tidak ada lagi badge teks 400px melayang di tengah peta yang menutupi rute atau menembus sidebar.
- [ ] **Top Nav Telemetry Popovers**: Memastikan mengeklik/meng-hover item `BMKG`, `TOMTOM`, dan `CUOPT` di navbar atas membuka popover card yang informatif.
- [ ] **Unified Pin & Polygon Click**: Memastikan mengeklik titik episentrum atau poligon batas wilayah menyorot entitas secara bersamaan dan membuka detail di Sidebar Kanan.
- [ ] **Viewport Offset**: Memastikan saat Sidebar Kanan dibuka, kamera peta menggeser rute dan marker secara mulus ke kuadran kiri agar tidak tertutup sidebar.
