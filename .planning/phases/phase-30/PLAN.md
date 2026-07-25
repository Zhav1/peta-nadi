# PLAN — Phase 30: System-Wide Multi-Page Integration & Tactical UI/UX Refactoring (Mapbox/Deck.gl Analytics, Multi-Agent Simulation, Executive Cabinet Reports)

**Phase:** 30  
**Milestone:** M1 — Hackathon MVP & Final System Integration  
**Goal:** Merombak dan mengintegrasikan 3 halaman sekunder (**`ANALYTICS`**, **`SIMULATION`**, **`REPORTS`**) ke dalam **Unified Master State Engine** di `DashboardClient.tsx`. Mengganti gambar statis placeholder pada halaman Analytics dengan **Mapbox GL JS + Deck.gl 3D/2D Archipelago Heatmap Canvas** yang interaktif, membangun **Multi-Agent Agency Orchestration Sandbox** pada halaman Simulation (BULOG, DISHUB, BNPB) dengan tombol *Deploy Action Plan* yang terhubung langsung ke `MAP 4D` & database Supabase, serta menghadirkan **B2G National Logistics Cabinet Briefing Center** pada halaman Reports dengan generator PDF resmi dan audit log real-time, mematuhi standar **UI UX PRO MAX** dan aturan *Anti-AI Slop*.

---

## 🔍 Context & Problem Analysis

1. **Fragmentasi State antar Halaman:**  
   Saat ini, saat krisis disimulasikan atau dipilih di `MAP 4D`, data krisis tersebut tidak mengalir ke tab `ANALYTICS`, `SIMULATION`, dan `REPORTS`. Ketiga halaman tersebut berjalan terpisah dengan data mock statis.
2. **Kualitas Visual Halaman Sekunder (MCP Stitch Layout):**  
   - Tab `ANALYTICS` masih memakai gambar statis Google Storage (`lh3.googleusercontent...`) dengan garis SVG overlay polos.
   - Tab `SIMULATION` berupa kotak-kotak hitam kaku tanpa visual hierarchy dan tombol *Deploy* belum mengeksekusi multi-agent action plan.
   - Tab `REPORTS` memakai foto stock placeholder gedung futuristik (`Live Telemetry Feed`) dan teks *Cabinet Briefing* terkurung dalam kotak sempit.

---

## 🛠️ Unified State & Architecture Blueprint

```
                               ┌──────────────────────────────────────────┐
                               │       MASTER DASHBOARD STATE ENGINE      │
                               │  (activeCrisis, demoState, cuOptInfo,    │
                               │   commodityPrices, routeApprovals, etc)  │
                               └────────────────────┬─────────────────────┘
                                                    │
         ┌──────────────────────┬───────────────────┴───────────────────┬──────────────────────┐
         ▼                      ▼                                       ▼                      ▼
┌──────────────────┐  ┌──────────────────┐             ┌──────────────────┐  ┌──────────────────┐
│     MAP 4D       │  │    ANALYTICS     │             │    SIMULATION    │  │     REPORTS      │
├──────────────────┤  ├──────────────────┤             ├──────────────────┤  ├──────────────────┤
│ • 4D GIS Canvas  │  │ • Mapbox/Deck.gl │             │ • Agent Swarm    │  │ • Dynamic PDF    │
│ • Interactive    │  │   Archipelago    │             │ • Agency Matrix  │  │ • Cabinet Brief  │
│   Rerouting      │  │ • GraphRAG Causal│             │   (BULOG/DISHUB) │  │ • Reroute Audit  │
│ • Fleet Vector   │  │   Chain Overlay  │             │ • Interactive    │  │   Log Table      │
│ • Telemetry HUD  │  │ • PIHPS Variance │             │   Deploy Action  │  │ • Real Telemetry │
└──────────────────┘  └──────────────────┘             └──────────────────┘  └──────────────────┘
```

---

## 🛠️ Detailed Technical Deliverables

### DELIVERABLE 1 — Unified Master State Pipeline (`frontend/components/dashboard/DashboardClient.tsx`)

1. **State Elevation & Props Distribution:**  
   Salurkan state utama dari `DashboardClient` ke `AnalyticsSection`, `SimulationSection`, dan `ReportsSection`:
   - `selectedCrisis`: State krisis/bencana aktif.
   - `activeRoutes`: Dynamic Mapbox/cuOpt routes & rute pengalihan aman.
   - `demoState`: Stage guided demo (0–5), progress swarm, dan confidence score.
   - `cuOptInfo` & `corridorContext`: Data telemetry real-time dari BMKG, TomTom, PIHPS, dan cuOpt solver.
   - `approvalsCount` & `routeApprovals`: Total rute yang disetujui dan log items dari Supabase.
2. **Unified Action Plan Deploy Handler:**  
   Implementasikan fungsi `handleDeployUnifiedActionPlan()` yang:
   - Mencatat rute pengalihan yang disetujui ke tabel Supabase `route_approvals`.
   - Memicu notifikasi Toast WhatsApp.
   - Mengalihkan tab aktif secara otomatis kembali ke `MAP 4D` dengan rute pengalihan hijau yang langsung di-highlight.

---

### DELIVERABLE 2 — Mapbox GL JS + Deck.gl Spatial Economic Analytics (`frontend/components/dashboard/AnalyticsSection.tsx`)

1. **Mapbox & Deck.gl Archipelago Heatmap Canvas:**  
   - Eliminasi tag `<img>` statis dan ganti dengan instance Mapbox GL JS (`mapbox://styles/mapbox/dark-v11`) + Deck.gl Overlay.
   - **Deck.gl `ArcLayer`:** Visualisasi vektor aliran logistik antar-hub (Belawan ➔ Medan ➔ Jakarta) dengan warna dinamis (Cyan untuk aliran lancar, Glowing Red/Amber untuk koridor terdisrupsi).
   - **Deck.gl `ScatterplotLayer`:** Titik panas inflasi pada simpul pasar berrisiko tinggi (Medan, Deli Serdang, Tebing Tinggi).
   - **GraphRAG Chain of Impact Overlay:** Node interaktif sebab-akibat:  
     `[ ⚓ Belawan Port Closed ] ➔ [ 🚚 CPO / Rice Truck Stalled ] ➔ [ 📈 Medan Retail Price +18.5% ]`.
2. **Tactical Bento Grid Panels:**  
   - **Inflation Variance Matrix:** Bar chart kombinasi sparkline Recharts dengan baseline prediktif `#00F0FF` vs dampak riil `#EF4444`.
   - **Indicator Risk Ranking Table:** Tabel dinamis dengan ikon SVG Lucide (`LucideWheat`, `LucideFlame`, `LucideShoppingBag`), badge status risiko (`CRITICAL`, `ELEVATED`, `STABLE`), dan delta volume.

---

### DELIVERABLE 3 — Multi-Agent Crisis Simulation & Agency Orchestration Sandbox (`frontend/components/dashboard/SimulationSection.tsx`)

1. **Active Scenario & Swarm Synchronization:**  
   Hubungkan kartu skenario langsung ke `selectedCrisis` atau `demoState` (menampilkan *Active: Belawan Flash Flood*, armada terdampak: 1,420, proyeksi kerugian: IDR 4.2B).
2. **Glass Box AI Advisor Chat & Thought Signatures:**  
   Tampilkan log penalaran AI lengkap dengan badge hash kriptografi **Thought Signatures**, skor konsensus (`91% Consensus Gate Passed`), dan output CoT streaming.
    provide quick prompt pills ("Simulasikan Penutupan Tol Medan", "Hitung Rute Alternatif BULOG", "Proyeksikan Stok 48 Jam").
3. **Multi-Department Agency Orchestration Board (B2G Command):**  
   - **BULOG (Ketahanan Pangan):** Slider alokasi stok & ketersediaan depot darurat (Medan & Tebing Tinggi).
   - **DISHUB (Perhubungan):** Toggle rekayasa lalu lintas, pembatasan tonase truk, dan timing lampu lalu lintas.
   - **BNPB (Penanggulangan Bencana):** Status evakuasi & perahu karet di genangan.
4. **Interactive Action Bar (`[ 🚀 DEPLOY UNIFIED ACTION PLAN ]`):**  
   Memicu `handleDeployUnifiedActionPlan()`, mencatat approval, memicu notifikasi Toast, dan mengalihkan layar kembali ke `MAP 4D`.

---

### DELIVERABLE 4 — B2G Executive Cabinet Briefing Center & Dynamic PDF Reports (`frontend/components/dashboard/ReportsSection.tsx`)

1. **Top Executive Scorecard (3 Glassmorphic Tiles):**  
   - `Total Economic Impact Mitigated`: IDR 4.2B (Dihitung dinamis dari total reroutes disetujui).
   - `Operational System Integrity`: 92% OPTIMAL (Dihitung live dari data health check BMKG/TomTom/AISstream).
   - `Reroute Approvals Dispatched`: Total rute yang disetujui dari database Supabase.
2. **Interactive 3-Page Cabinet Briefing Viewer:**  
   Layout editorial dengan tipografi presisi (`Outfit` / `Inter` font + `JetBrains Mono` telemetry tags).
   - **Halaman 1:** Executive Overview & Macro Economic Impact (Biaya logistik vs PDB 14.29%).
   - **Halaman 2:** Matrix Kerentanan Koridor & Reasoning Trace AI Swarm.
   - **Halaman 3:** Tabel Log Audit Pengalihan Rute Resmi (Timestamp, tipe insiden, lokasi, confidence score, status approval).
3. **Executive Actions:**  
   - `[ 📄 GENERATE OFFICIAL CABINET BRIEFING PDF ]`: Membuka jendela cetak dokumen resmi yang rapi (`window.print()`).
   - `[ 📊 EXPORT RAW AUDIT DATA (JSON/CSV) ]`: Ekspor data mentah JSON audit log.

---

## 🎨 Anti-AI Slop & UI UX PRO MAX Checklist

- ❌ **TIDAK BOHLEH Memakai Gradient Ungu/Pink AI Generic** (`from-purple-600 to-pink-500`). Gunakan palette Dark Tactical Command (`#080d14` base canvas, `#00f0ff` tactical cyan, `#10b981` emerald clear, `#ef4444` warning red).
- ❌ **TIDAK BOHLEH Memakai Emoji sebagai Ikon UI** (Wajib SVG dari `lucide-react`: `LucideShip`, `LucideTruck`, `LucideAlertTriangle`, `LucideFileText`, `LucideTrendingUp`, `LucideShieldAlert`).
- ❌ **TIDAK BOHLEH Memakai Screenshot Placeholders Statis** (Ganti semua URL gambar statis dengan Mapbox/Deck.gl canvas & UI dinamis).
- ✅ **Cursor & Micro-interactions:** `cursor-pointer` pada semua tombol/kartu interaktif, transisi 150ms–300ms, `hover:scale-[1.02]` & `active:scale-95`.
- ✅ **Glassmorphism 2.0:** Container panel memakai `backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 shadow-2xl`.

---

## 🧪 Verification Plan

### Automated Verification
```bash
# 1. Typecheck and build frontend
cd frontend && pnpm build

# 2. Check Python backend syntax
python -m compileall -q backend
```

### Manual Verification
1. **Navigasi & Master State Flow:**
   - Jual krisis di `MAP 4D` (misal klik preset atau run demo).
   - Pindah ke `ANALYTICS`: Pastikan peta Mapbox/Deck.gl Archipelago merender arc aliran komoditas dan node GraphRAG yang sesuai dengan koridor Sumut.
   - Pindah ke `SIMULATION`: Pastikan skenario aktif menampilkan *Belawan Flash Flood*, atur parameter BULOG/DISHUB, klik `DEPLOY UNIFIED ACTION PLAN`. Pastikan notifikasi Toast muncul, approval tercatat, dan otomatis kembali ke `MAP 4D`.
   - Pindah ke `REPORTS`: Pastikan Cabinet Briefing mencerminkan jumlah reroute terbaru, health score live, dan ekspor PDF menghasilkan dokumen yang rapi.
2. **Inspeksi Visual (Anti-AI Slop Quality):**
   - Pastikan 0 gradient ungu/pink generic, 0 emoji, 0 gambar pecah/statis, dan transisi glassmorphism 60 FPS yang mulus.
