# LEARNINGS — Phase 29: Interactive Investor Presentation Runner, Direct Map-Click Node Selection & Glass-Box Agent Swarm Engine

**Phase:** 29  
**Date:** 2026-07-25  
**Milestone:** M1 — Hackathon MVP & Investor Selling Pitch  

---

## 💡 Executive Summary & Core Architectural Insights

Phase 29 secara komprehensif merombak total alur presentasi investor (*Guided Demo Presentation Engine*) pada platform PetaNadi 4D Command Center. Mengeliminasi ketergantungan alur otomatis statis (*hardcoded Belawan-Medan flow*), fase ini menghadirkan **Interaksi Direct 2-Node Map Clicking** (bebas memilih titik Start 🟢 dan End 🟡 langsung dari canvas Peta 4D), menghapus total tombol preset koridor statis, mengembangkan **Matriks 6-Agen AI Swarm** dengan alur progres linier terlembagakan (clamped pada 100% untuk menghentikan looping tak berkesudah saat pitch), mengikat gerakan animasi armada logistik 60 FPS ke **polyline jalan asli Mapbox Directions API**, serta menyelesaikan *root-cause bug* inisialisasi React ref (`mapRef.current` vs `mapInstance` state) agar seluruh ikon logistik tampil otomatis pada saat web dimuat.

---

## 🔑 Key Technical Lessons

### 1. Direct 2-Node Map Onboarding & Removal of Static Presets (`GuidedDemoPanel.tsx` & `CrisisMap.tsx`)
- **Problem**: Versi awal Guided Demo memaksa pengguna menggunakan alur rute statis atau memilih dari 3 tombol preset koridor (`Belawan-Medan`, `Belawan-Tebing`, `Belawan-Siantar`), membatasi fleksibilitas investor untuk menguji titik krisis secara bebas.
- **Solution**:
  - Merekayasa ulang kartu instruksi Stage 0 pada `GuidedDemoPanel.tsx` untuk secara eksplisit membimbing investor/pengguna:  
    `"Silakan tentukan rute krisis dengan mengeklik 2 titik marker pada Peta 4D di sebelah kiri (Klik 1: Start 🟢, Klik 2: End 🟡). Sistem akan merender rute baseline hijau sebelum disrupsi disimulasikan."`
  - Menyediakan kartu status visual **🟢 START (Klik 1)** dan **🟡 END (Klik 2)** yang ter-update secara real-time saat marker hub di peta diklik.
  - Menghapus secara total bagian `ATAU PRESET CEPAT INVESTOR:` beserta seluruh tombol preset-nya, memberikan kebebasan penuh 100% kepada pengguna.

### 2. 6-Agent Swarm Matrix & Clamped Progress State Machine (`GuidedDemoPanel.tsx`)
- **Problem**: 
  - Matriks agen AI sebelumnya hanya menampilkan 5 agen (agen *Economic Intelligence* mati/redup).
  - Alur eksekusi Swarm sebelumnya menggunakan modulo berulang (`(prev + 1) % 6`) sehingga terminal log terus berputar tanpa henti, membingungkan presenter mengenai kapan analisis AI selesai dan kapan aman mengeklik `Next Step`.
- **Solution**:
  - Melengkapi matriks agen menjadi **6 Agent Units** utuh: `DataCollectionAgent`, `OSINTHazardAgent`, `PredictionAgent`, `RouteOptimizationAgent`, `EconomicIntelligenceAgent` (aktif & menyala), dan `DecisionSupportAgent`.
  - Mengubah logika transisi `logStep` menjadi linier terlembagakan ($0\% \to 20\% \to 40\% \to 60\% \to 80\% \to 100\%$): `setLogStep((prev) => (prev < 5 ? prev + 1 : 5))`.
  - Saat `logStep === 5` (seluruh 6 agen selesai dieksekusi), sistem menampilkan **Badge Indikator Emerald Berkedip**:  
    `[ ✅ ANALISIS 6 AI SWARM SELESAI (100%) — SIAP ADVANCE ]`
  - Tombol eksekusi utama `[ ⏭️ Next Step ]` secara otomatis berganti gaya visual menjadi cyan menyala dengan animasi *glowing pulse* (`animate-pulse shadow-cyan-500/50 border-2 border-cyan-300`) dengan label `[ ⏭️ Next Step (Swarm Complete 100%) ]`.

### 3. Dynamic Mapbox Road Polyline Binding for Logistics Fleets (`FleetVehicleLayer.tsx` & `useFleetVehicles.ts`)
- **Problem**: Ikon armada truk logistik sebelumnya bergerak mengikuti 8 titik waypoint garis lurus diagonal mentah yang memotong rumah, persawahan, dan perairan (*nrobos garis lurus mock*).
- **Solution**:
  - Mengalirkan prop `activeRoutes` (hasil perhitungan Mapbox Directions API / cuOpt GPU detour) ke dalam `<FleetVehicleLayer />`.
  - Di dalam loop animasi 60 FPS, jika jenis armada adalah `truck` (`v.modality === 'truck'`) dan `activeRoutes` tersedia di peta, koordinat trajektori armada dialihkan secara dinamis ke `activeRoutes[0].waypoints.map((w) => [w.lon, w.lat])`.
  - Menggunakan algoritma Turf.js (`@turf/along` & `@turf/bearing`) untuk menghitung posisi presisi serta arah kemudi (*bearing*) truk menyusuri setiap lekukan dan tikungan jalan raya Sumatera Utara.
  - Memperbarui `FALLBACK_FLEET` di `useFleetVehicles.ts` dengan titik-titik persimpangan arteri riil Sumut (`Pelabuhan Belawan` ➔ `Marelan` ➔ `Helvetia` ➔ `Gatot Subroto` ➔ `Amplas` ➔ `Kualanamu` ➔ `Tebing Tinggi`).

### 4. React `useRef` vs `useState` State Trigger for Mapbox Canvas (`CrisisMap.tsx`)
- **Problem**: Ikon armada logistik tidak muncul secara default saat pertama kali dashboard dimuat, melainkan baru mendadak muncul setelah pengguna melakukan interaksi (klik node, ubah timeline, dll.).
- **Diagnostic Root Cause**: 
  - Komponen `CrisisMap.tsx` menyimpan objek peta Mapbox dalam `mapRef.current` (`useRef`).
  - Mutasi `mapRef.current` di dalam `useEffect` **TIDAK memicu re-render React**.
  - Akibatnya, saat komponen `<CrisisMap />` di-mount, `mapRef.current` bernilai `null` pada render pertama. Komponen anak `<FleetVehicleLayer map={mapRef.current} />` menerima `map = null` dan tidak mengeksekusi inisialisasi WebGL layer.
- **Solution**:
  - Menambahkan React state `mapInstance`: `const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)`.
  - Memanggil `setMapInstance(map)` pada event `map.on('load')`.
  - Mengoper `map={mapInstance || mapRef.current}` ke komponen `<FleetVehicleLayer />`.
  - Hasil: Begitu peta dimuat di layar, React langsung merender ulang `<CrisisMap />` dan memasukkan instans peta valid ke `<FleetVehicleLayer />`, membuat seluruh ikon armada muncul dan bergerak secara otomatis sejak detik pertama tanpa butuh klik pengguna.

### 5. Standardisasi Key Node Identifier Tebing Tinggi (`'tebingtinggi'`)
- **Problem**: Adanya ketidakcocokan penamaan key antara `'tebingtinggi'` (tanpa garis bawah pada `HUB_NODES`) dan `'tebing_tinggi'` (dengan garis bawah) menyebabkan pencarian node mengembalikan `undefined`, sehingga fallback rute jatuh ke Siantar/Medan.
- **Solution**: Memeriksa dan menstandardisasi seluruh referensi Tebing Tinggi menjadi `'tebingtinggi'` secara konsisten di `GuidedDemoPanel.tsx`, `DashboardClient.tsx`, `useDemoState.ts`, dan `mapboxRoutingService.ts`.

---

## 🛠️ Code Reference & Verification Summary

| Component | File Path | Role |
|---|---|---|
| Guided Demo Panel | `frontend/components/demo/GuidedDemoPanel.tsx` | Stage 0 direct onboarding prompt, 6-agent matrix, clamped 100% progress state & pulsing buttons |
| Crisis Intelligence Map | `frontend/components/map/CrisisMap.tsx` | `mapInstance` state trigger, HTML node marker click listeners & WebGL fleet integration |
| Fleet Vehicle WebGL Layer | `frontend/components/map/FleetVehicleLayer.tsx` | 60 FPS route-bound animation loop, Mapbox road polyline binding & Turf.js bearing math |
| Fleet Vehicles Hook & Fixtures | `frontend/hooks/useFleetVehicles.ts` | Fleet data provider & updated North Sumatra arterial road node coordinates |
| Dashboard Client Orchestrator | `frontend/components/dashboard/DashboardClient.tsx` | Stage transitions, `setActiveRouteIdx(0)` safe detour auto-highlighting & state syncing |
| Mapbox Routing Service | `frontend/lib/mapboxRoutingService.ts` | Standardized `HUB_NODES` keys (`belawan`, `medan`, `binjai`, `tebingtinggi`, `siantar`) |

---

## 🧪 Automated & Pitch Verification Summary

- **Python Backend Compilation:** **PASSED** (`python -m compileall -q backend` ➔ 0 errors).
- **Next.js Production Build:** **PASSED** (`npm run build` ➔ `✓ Generating static pages (7/7)`).
- **Docker Infrastructure:** **PASSED** (`docker compose up --build -d` ➔ 3/3 containers active).
