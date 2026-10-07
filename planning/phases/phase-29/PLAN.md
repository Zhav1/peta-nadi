# PLAN — Phase 29: Interactive Investor Presentation Runner, Direct Map-Click Node Selection & Glass-Box Agent Swarm Engine

**Phase:** 29  
**Milestone:** M1 — Hackathon MVP & Investor Selling Pitch  
**Goal:** Merombak total alur presentasi demo (*Guided Demo Presentation Engine*) pada komponen `DashboardClient.tsx`, `useDemoState.ts`, `CrisisMap.tsx`, `GuidedDemoPanel.tsx`, dan `aiDynamicRouter.ts`. Mengeliminasi alur *auto-running hardcoded* (yang memaksa rute Belawan-Medan di Stage 0), menggantinya dengan **Alur Interaktif User-Driven Route First** (pilihan preset koridor atau **klik langsung marker simpul di peta 4D**). Memperbaiki *bug key* `'tebingtinggi'`, menambahkan **Glass-Box Agent Swarm Processing & Live Streaming Log Terminal** (ala `Aegis` & `Globot`), serta menjamin rute pengalihan teraman (#10B981 Emerald Safe Detour) secara otomatis dihitung dan ditampilkan di Stage 3 & 4 untuk kombinasi simpul mana pun pilihan pengguna, didukung oleh **100% offline-resilient local fixture fallback** (`belawan-demo-offline`).

---

## 🔍 Context & Problem Analysis

### 1. Masalah & Bug yang Ditemukan pada Debugging Phase 29
1. **Key Mismatch `'tebingtinggi'` vs `'tebing_tinggi'` & Klik Marker Peta Tidak Merespon:**  
   Key simpul di `HUB_NODES` adalah `'tebingtinggi'`. Pemanggilan `'tebing_tinggi'` dengan garis bawah menghasilkan `undefined` sehingga fallback rute jatuh ke Siantar/Medan. Selain itu, handler `onNodeSelected` belum dihubungkan ke event click marker di `CrisisMap.tsx`.
2. **Ketiadaan Loading State & Transparansi Agent Swarm (Opaque Processing):**  
   Transisi stage terjadi secara instan tanpa indikator visual. Investor tidak dapat melihat proses komputasi yang sedang dijalankan oleh 6 agen cerdas.
3. **Bug Stage 3 Reroute (Rute Pengalihan Tidak Ditampilkan di Peta):**  
   Saat Stage 3 tervalidasi, `setActiveRouteIdx(0)` tidak dipanggil, sehingga peta tetap menampilkan indeks rute lama yang terpotong bencana. Selain itu, waypoint offline mode pada `useDemoState.ts` sebelumnya berupa data statis.

---

## 🛠️ Arsitektur Solusi & Alur Presentasi Investor (5-Stage Glass-Box Pitch Flow)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 0: DIRECT MAP CLICK / PRESET ROUTE SELECTION (Baseline Route)         │
│ User/Investor mengeklik marker di peta 4D (Klik 1: 🟢 Start, Klik 2: 🟡 End) │
│ atau memilih Preset Corridor Pills (Belawan ➔ Tebing Tinggi / Medan).       │
│ Map Canvas langsung merender rute baseline hijau tanpa hambatan.            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ Klik [ 🚀 INJECT CRISIS & RUN SWARM ]
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: GLASS-BOX AGENT SWARM PROCESSING & LIVE STREAMING LOGS            │
│ Terminal log streaming menyala: Agent 1-6 berpulsasi (pending -> running).   │
│ Progress Bar 0% -> 100%. User melihat secara transparan analisa AI Swarm.   │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 2 & 3: CONSENSUS GATE & DYNAMIC HAZARD DETECT                        │
│ Swarm mendeteksi bencana banjir yang MEMOTONG RUTE PILIHAN USER.             │
│ Consensus Gate mengonfirmasi ancaman (91% Validated). Rute lama jadi MERAH. │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 4: PURE AGENTIC TANGENTIAL AVOIDANCE REROUTING                        │
│ Engine menghitung rute pengalihan aman (#10B981 Emerald Detour).            │
│ Force setActiveRouteIdx(0) & auto-focus rute pengalihan mengitari bencana. │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 5: XAI EXECUTIVE BRIEFING & FLEET WHATSAPP DISPATCH                   │
│ DeepSeek V3.2 reasoning trace, proyeksi inflasi (+1.8%), WhatsApp dispatch.│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Detailed Technical Deliverables

### DELIVERABLE 1 — Direct Map-Click Node Selection & Key Standardisation (`frontend/components/map/CrisisMap.tsx` & `frontend/lib/mapboxRoutingService.ts`)

1. **Standardisasi Key Simpul:**  
   Standardisasi seluruh referensi Tebing Tinggi menjadi `'tebingtinggi'` (tanpa garis bawah) di `GuidedDemoPanel.tsx`, `DashboardClient.tsx`, dan `useDemoState.ts`.
2. **Integrasi Handler Klik Marker Peta (`CrisisMap.tsx`):**  
   Tangkap prop `onNodeSelected` di `CrisisMapProps` dan hubungkan ke event listener `onClick` pada HTML DOM Markers & WebGL Symbol Layers untuk Hub Nodes:
   - **Klik 1:** Mengeset **Start Node (🟢)** + Toast Notification.
   - **Klik 2:** Mengeset **End Node (🟡)** + Mengisi baseline route Mapbox.
   - **Klik 3:** Memperbarui **Destination Node** + Toast Notification.

---

### DELIVERABLE 2 — Glass-Box Agent Swarm Loading Engine (`frontend/components/demo/GuidedDemoPanel.tsx`)

1. **Agent Swarm Processing Terminal & Live Progress Bar:**  
   Di Stage 1 & Stage 2, tampilkan terminal mini log transparan:
   - Progress bar animasi komputasi Swarm ($0\% \to 100\%$).
   - Matriks status 6 agen (`DataCollection`, `OSINTHazard`, `Prediction`, `RouteOpt`, `EconomicIntel`, `DecisionSupport`) dengan indikator pulsing cyan saat `running` dan hijau saat `done`.
   - Streaming log terminal:
     `> Agent 1: Ingesting BMKG & TomTom feeds...`  
     `> Agent 2: Hazard boundary detected at Lubuk Pakam...`  
     `> Agent 4: Computing cuOpt GPU dynamic detour matrix...`  
     `> Consensus Gate: Threat score 91% (VALIDATED)`

---

### DELIVERABLE 3 — Stage 3 Dynamic Reroute Engine Fix (`frontend/components/dashboard/DashboardClient.tsx` & `useDemoState.ts`)

1. **Force Active Route Selection to Safe Detour (`setActiveRouteIdx(0)`):**  
   Di `handleCrisisReadyFromDemo`, panggil `setActiveRouteIdx(0)` secara eksplisit setelah `calculateAIDynamicDetourRoutes` selesai dihitung, sehingga peta 4D secara otomatis meng-highlight dan memfokuskan rute pengalihan aman warna Hijau Emerald (`#10B981`).
2. **Dynamic Offline Reroute Generation:**  
   Perbarui `useDemoState.ts` agar saat mode offline aktif, rute pengalihan dihitung secara matematis memutari bencana khusus untuk titik asal dan tujuan yang dipilih pengguna, bukan lagi menggunakan waypoint statis.

---

### DELIVERABLE 4 — Dynamic Tangential Avoidance Synchronization (`frontend/lib/aiDynamicRouter.ts`)

1. **Multi-Corridor Bypass Candidates:**  
   Memastikan `calculateAIDynamicDetourRoutes` secara tepat mendeteksi perpotongan polygon bencana dengan rute baseline pengguna, lalu melakukan *snapping* ke simpul jalan OSM terdekat (Belawan ➔ Tebing Tinggi, Belawan ➔ Medan, Belawan ➔ Siantar).

---

## 🧪 Verification Plan

### Automated Verification
- Run TypeScript compilation check:
  ```bash
  cd frontend && pnpm build
  ```
- Verify backend API demo endpoints:
  ```bash
  python -m compileall -q backend
  ```

### Manual Verification (Investor Pitch Simulation)
1. **Uji Klik Marker Peta 4D Langsung:**
   - Klik marker `Pelabuhan Belawan` di peta ➔ Toast muncul `🟢 Start Node Terpilih: Pelabuhan Belawan`.
   - Klik marker `Interchange Tebing Tinggi` di peta ➔ Toast muncul `🟡 End Node Terpilih: Interchange Tebing Tinggi`. Baseline rute hijau langsung tergambar menyusuri Tol Belmera/Medan-Tebing.
2. **Uji Transparansi Agent Swarm Loading (Stage 1 & 2):**
   - Klik `[ 🚀 INJECT CRISIS & RUN SWARM ]`.
   - Perhatikan terminal log streaming & progress bar animasi agen bekerja secara bergantian (`DataCollection` ➔ `OSINT` ➔ `Prediction` ➔ `RouteOpt` ➔ `Consensus`).
3. **Uji Reroute Stage 3 & Highlight Rute Aman:**
   - Saat Stage 3 aktif, pastikan rute utama berubah MERAH (COMPROMISED), dan rute pengalihan **HIJAU EMERALD (#10B981)** secara otomatis di-highlight di peta pada indeks 0 mengitari lingkaran banjir Lubuk Pakam.
4. **Uji Offline Fallback:**
   - Matikan Wi-Fi, jalankan demo untuk koridor `Belawan ➔ Tebing Tinggi`, pastikan rute pengalihan aman tetap terhitung mulus.

---

## 📝 Debug & Refinement Record (Appended Iterative Fixes)

### 1. Direct 2-Node Map Onboarding & Preset Removal (`GuidedDemoPanel.tsx` & `CrisisMap.tsx`)
- **Action:** Refactored Stage 0 onboarding card to instruct users to click 2 nodes directly on the 4D Map canvas (Click 1: Start 🟢, Click 2: End 🟡).
- **Preset Cleanup:** Removed the quick preset buttons (`Belawan-Medan`, `Belawan-Tebing`, `Belawan-Siantar`) completely as requested by user, providing 100% full interactive freedom for custom node selection.

### 2. 6-Agent Swarm Matrix & Clamped Progress State (`GuidedDemoPanel.tsx`)
- **6-Agent Matrix:** Expanded Swarm agent list to 6 agents (`DataCollectionAgent`, `OSINTHazardAgent`, `PredictionAgent`, `RouteOptimizationAgent`, `EconomicIntelligenceAgent`, `DecisionSupportAgent`), resolving the unlit state of `Economic Intel`.
- **Clamped Progress (100% Completion):** Clamped Swarm execution step to 5 ($0\% \to 20\% \to 40\% \to 60\% \to 80\% \to 100\%$) to prevent infinite looping.
- **Completion Indicator:** Rendered an emerald completion badge `[ ✅ ANALISIS 6 AI SWARM SELESAI (100%) — SIAP ADVANCE ]` and styled the `Next Step` button with a glowing cyan pulse (`animate-pulse shadow-cyan-500/50`).

### 3. Dynamic Road Network Trajectory Binding (`FleetVehicleLayer.tsx` & `useFleetVehicles.ts`)
- **Mapbox Road Polyline Binding:** Dynamically bound truck fleet vehicle paths (`TRK-001` & `TRK-002`) to the actual turn-by-turn road polyline from Mapbox Directions API (`activeRoutes[0].waypoints`).
- **Zero Off-Road Cutting:** Truck icons now travel along actual highway curves instead of straight diagonal fallback lines.
- **Dynamic Detour Adaption:** When Stage 3 rerouting activates, trucks dynamically adapt to the Emerald Safe Detour (#10B981) polyline at 60 FPS.

### 4. Initial Load Map Instance State Fix (`CrisisMap.tsx`)
- **React State vs Ref:** Discovered that `mapRef.current` (`useRef`) does not trigger a React re-render when `new mapboxgl.Map(...)` is instantiated.
- **Resolution:** Introduced `mapInstance` state (`const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null)`), updated on `map.on('load')`, passing `mapInstance || mapRef.current` to `<FleetVehicleLayer />`.
