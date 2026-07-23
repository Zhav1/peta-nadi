# FEATURE STATUS — PetaNadi System Matrix

**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Architecture Paradigm:** Hybrid Cognitive Swarm (Dijkstra + NVIDIA cuOpt + FourCastNet + OR-Tools Fallback)  
**Last Updated:** 2026-07-21  

---

## Executive Summary

PetaNadi (LRIP) adalah platform intelijen krisis logistik nasional multi-sensor berbasis AI. Sistem ini menggabungkan agen cerdas (LangGraph Swarm), visualisasi 4D (Mapbox GL + Deck.gl), serta mesin optimasi rute hibrida yang memadukan keunggulan komputasi CPU ringan dengan daya akselerasi GPU NVIDIA.

---

## 1. Sudah Berfungsi (Functional & Fully Integrated)
**Status:** READY FOR DEMO & PRODUCTION ✅

### 1.1 UI/UX & Interactive Dashboard Mode
- **Pure Agentic Tangential Avoidance Router** (`aiDynamicRouter.ts`)
  - Mesin rerouting terukur yang memproyeksikan waypoint $W_{left}$ dan $W_{right}$ persis 2 km di luar tepi radius krisis ($R \times 1.15 + 2.0\text{km}$) secara tegak lurus (0% koordinat hardcode).
  - Menyaring candidate rute dengan point-in-circle check (0 titik di dalam lingkaran krisis) & jarak terpendek via Mapbox Directions API.
- **Clean Slate Dynamic Node Selection Workflow** (`DashboardClient.tsx`)
  - State awal netral (`selectedOriginNode = null`, `selectedDestNode = null`), alur interaktif 2-Langkah untuk menentukan node Start (🟢) dan End (🟡), serta tombol `🔄 RESET RUTE`.
- **Docked MAP 4D AI Copilot & 4 Explainable AI (XAI) Blocks** (`MitigationTab.tsx`)
  - Blok penjelas AI (Consensus Badge `91% Confidence`, Chain of Impact, Chain-of-Thought reasoning trace, dan tombol HITL `[ APPROVE & DISPATCH REROUTE ]` yang terhubung ke Toast UI).
- **Guided Demo Runner & Stepper Panel** (`GuidedDemoPanel.tsx`, `useDemoState.ts`)
  - Stepper interaktif 5 tahap (`Injecting Events` ➔ `Agent Swarm` ➔ `Consensus Gate` ➔ `Validated Alert` ➔ `Notification Sent`).
  - Dilengkapi mode otomatis dengan pacing 15 detik, generator QR Code remote HP presenter, dan penanganan krisis offline.
- **3D Globe Mode & Pin Anchoring** (`CrisisMap.tsx`, `layers.ts`)
  - Peta 3D Globe Mapbox v3 dengan `ScatterplotLayer` Deck.gl ber-billboard (`billboard: true`, 0 elevasi).
  - Pin hotspot krisis terkunci 100% pada koordinat lat/lon tanpa melayang saat globe diputar atau di-zoom.
- **Interactive Disruption Drawing Tool** (`CrisisMap.tsx`, `MapboxDraw`)
  - Tombol "SIMULATE DISRUPTION" otomatis mengatur `pointer-events` overlay Deck.gl, mengaktifkan kursor pen (`crosshair`), dan menangkap poligon GeoJSON untuk memicu simulasi bencana.
- **Logistics Corridor Route Polylines** (`layers.ts`, `mock_crisis_state.json`)
  - Visualisasi garis rute pengalihan beresolusi tinggi sepanjang Koridor Tol Medan-Tebing Tinggi / Jalinsum dengan ujung melengkung halus (`jointRounded: true`, `capRounded: true`).
- **Executive Cabinet Briefing PDF Export** (`ReportsSection.tsx`)
  - Jendela cetak laporan resmi *PetaNadi National Logistics Cabinet Briefing* (`window.print()`) dan fitur ekspor raw data JSON.

### 1.2 Core Backend Engine & AI Agent Swarm
- **Backend Demo Engine** (`demo_router.py`)
  - Router `/api/demo/start`, `/api/demo/status/{id}`, dan `/api/demo/advance/{id}` dengan auto-fallback mock fixture (menjamin HTTP 200 OK).
- **LangGraph 6-Agent Cognitive Swarm** (`agents/`)
  - Swarm 6 agen cerdas: *Data Collection*, *OSINT & Hazard*, *Prediction*, *Route Optimization*, *Economic Intelligence*, dan *Decision Support Copilot*.
- **Consensus Gate Engine** (`consensus_gate.py`)
  - Gerbang validasi multi-sensor dengan threshold keyakinan $> 85\%$ dan syarat minimal **2 sumber data independen**.
- **AI Advisor Multilingual Chat** (`agent_router.py`, `llm_gateway.py`)
  - Adaptasi bahasa otomatis (merespon Bahasa Indonesia saat prompt Bahasa Indonesia) dengan fallback taktis lokal.
- **WhatsApp Notification & Approval Logging** (`notification_service.py`, `approvals.py`)
  - Pengiriman pesan peringatan ke operator armada logistik dan pencatatan log keputusan di tabel `route_approvals`.

---

## 2. Masih Berupa Simulasi / Stub (Simulated & Mock-Seeded)
**Status:** MOCK-SEEDED / SYNTHETIC STUB 🧪

- **Synthetic Incident Stream Generator** (`belawan_scenario.json`, `run_demo.py`)
  - Injeksi event sintetis (cuaca BMKG, kemacetan TomTom, banjir, lonjakan PIHPS) ke Redis Streams untuk simulasi krisis offline.
- **GraphRAG Causal Chain Seeding** (`graphrag_tool.py`, `mock_crisis_state.json`)
  - Graph hubungan sebab-akibat (*Belawan Port Closure* ➔ *Cooking Oil Supply Drop* ➔ *Medan Inflation*) dimuat dari seed data lokasi Koridor Sumut.
- **LTM Historical Disaster Episode Memories** (`ltm_db.py`)
  - Memori jangka panjang episode bencana masa lalu berbasis vector database (pgvector) untuk estimasi dampak ekonomi.
- **Source Health Live Monitors** (`health.py`, `ReportsSection.tsx`)
  - Indikator status adaptor data (BMKG, TomTom, AISstream) dikalkulasikan dari health check backend.

---

## 3. Pekerjaan Aktif & Target Berikutnya (Phase 15)
**Status:** READY TO START 🚀

### 3.1 Pendekatan Arsitektur Optimasi Rute & Prediksi Hibrida

PetaNadi menggabungkan algoritma CPU konvensional yang cepat dengan akselerasi GPU NVIDIA untuk mencapai efisiensi komputasi, keandalan tinggi, dan keberlanjutan biaya:

| Skenario Kebutuhan | Cara yang Dipakai | Alasan / Benefit |
| :--- | :--- | :--- |
| **Navigasi Single (Point A ➔ B)** | **Dijkstra / pgRouting (CPU)** | Cepat, hemat biaya, tak butuh GPU. |
## 3. Pekerjaan Aktif & Target Berikutnya (Phase 18)
**Status:** IN PROGRESS 🛠️

- **Phase 18: Map UI/UX Refactoring, Unified Telemetry HUD & Localized Weather Animations**
  - Refactor map overlays to unify TomTom congestion stats and NVIDIA cuOpt GPU optimization metrics in a glassmorphic **Operations Telemetry HUD Panel**.
  - Replace the single hardcoded weather badge with 4 localized interactive weather cards over regional center points (Belawan, Deli Serdang, Binjai, Tebing Tinggi).
  - Embed custom animated SVG weather icons (rain fall, storm/lightning flash, cloud drift animations) styled directly with inline performance keyframes.
  - Remove redundant static map markers to clean up visual clutter on map rotation.

---

## 4. Masih Direncanakan (Post-MVP)
**Status:** PLANNED FOR POST-MVP / v2 ⏳

- **Aplikasi Mobile Pengemudi Logistik (v2 / Post-MVP)**
  - Aplikasi React Native + WatermelonDB dengan sinkronisasi CRDT offline untuk pengemudi truk.
- **Pengembangan Koridor Multi-Provinsi (v2 / Post-MVP)**
  - Perluasan cakupan sistem pemantauan dari Koridor Sumatra Utara menuju Koridor Trans-Jawa.
- **National Logistics Health Index API & GraphRAG Enterprise (v2 / Post-MVP)**
  - API publik kesehatan logistik dan deployment private cloud kementerian (Kemendag, Kemenhub, BNPB, Bapanas, Bulog).

---

## Summary Matrix

| Kategori Fitur | Jumlah Fitur | Tingkat Kesiapan |
| :--- | :--- | :--- |
| **1. Sudah Berfungsi** | 19 Fitur Utama | Production & Demo Ready (100%) |
| **2. Simulasi / Stub** | 4 Subsystem | Operational via Mock Seed Data |
| **3. Sedang Dikembangkan (Phase 18)** | 1 Major Module | In Progress |
| **4. Masih Direncanakan (Post-MVP)** | 3 Major Modules | Scheduled on Proposal Roadmap |
