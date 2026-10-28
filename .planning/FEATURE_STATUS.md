# FEATURE STATUS — PreHub System Matrix

**Milestone:** M8 — Fast & Durable  
**Architecture Paradigm:** Hybrid Cognitive Swarm (NetworkX Dijkstra + Deterministic CPU Router + Google OR-Tools + Open-Meteo NWP + BMKG Radar Fusion)  
**Last Updated:** 2026-10-27  

---

## Executive Summary

PreHub (*Predictive Logistics Hub & Early Warning System*) adalah platform intelijen krisis logistik pangan nasional multi-sensor berbasis AI. Sistem ini beroperasi di seluruh 8 provinsi daratan Pulau Sumatera (Aceh, Sumatera Utara, Sumatera Barat, Riau, Jambi, Bengkulu, Sumatera Selatan, Lampung) serta alur laut kepulauan ALKI I, menghubungkan produsen komoditas pangan pokok dengan simpul pelabuhan strategis, jaringan jalan tol Trans-Sumatera, dan koridor penerbangan kargo.

---

## 1. Sudah Berfungsi (Functional & Fully Integrated)
**Status:** READY FOR PRODUCTION & PILOT DEPLOYMENT ✅

### 1.1 UI/UX & Interactive Command Center (Mapbox GL JS v3 + Deck.gl v8)
- **High-Density GPU-Instanced Telemetry Layer** (`FleetVehicleLayer.tsx`)
  - Rendering 5.000+ unit armada multi-moda (truk, kapal, pesawat) pada 60 FPS menggunakan `@deck.gl/mapbox` `MapboxOverlay` (`IconLayer`, `PathLayer`, `ScatterplotLayer`, `TextLayer`).
  - Throttling update buffer Deck.gl ke ~4 Hz (250ms interval) dengan daur ulang typed array, melenyapkan lonjakan CPU main-thread dan crash browser V8 heap OOM.
  - Orientasi `billboard: true` dan persistent visual anchor dots mencegah distorsi kemiringan label dan sprite pada tampilan peta 3D globe maupun sudut pitch tinggi.
  - Arbitrase macro-zoom pada `spatialHashArbiter.ts` memberlakukan kuota fair-share seimbang (truk: 8, maritim: 9, udara: 7) sehingga label truk tidak tersingkir oleh armada kapal Selat Malaka.
- **On-Map Contextual Corridor Popover & Reset Sync** (`CrisisMap.tsx`, `CrisisSimulatorBar.tsx`, `DashboardClient.tsx`)
  - Interaksi langsung pada garis rute (`route-paths-line`): klik pada polylines memunculkan popover Glassmorphic interaktif berisi nama koridor, jarak, estimasi durasi, status risiko, rincian biaya logistik (Rp), serta aksi *"Pilih Rute Ini"*, *"Sembunyikan Koridor Ini"*, dan *"Tutup"*.
  - Tombol pengalih moda di bagian bawah telah dieliminasi demi alur kontekstual peta langsung.
  - Pil *"Tampilkan Semua Rute (N Tersembunyi)"* pada `CrisisSimulatorBar.tsx` muncul saat ada koridor tersembunyi dengan sinkronisasi status dua arah.
  - Reset titik rute seketika menghapus `customPinnedPoints` dan membersihkan layer `custom-pinned-source`, memadamkan cincin kilau (glow) pin seketika.
- **100% Water-Path Coastal & Estuary Navigation** (`aiDynamicRouter.ts`, `cpu_routing_adapter.py`)
  - Kanal navigasi muara sungai (`SUMATRA_PORT_CHANNELS`) menghubungkan pelabuhan pedalaman (Boom Baru Sungai Musi, Pekanbaru Sungai Siak, Jambi Sungai Batanghari) ke perimeter 16-titik `SUMATRA_NAUTICAL_PERIMETER`.
  - Algoritma Dijkstra pada graf air menjamin navigasi pesisir dan muara 100% melintasi perairan tanpa memotong semenanjung atau daratan.
- **Modality-Specific Multi-Color Route Legs** (`CrisisMap.tsx`, `route_optimization.py`)
  - Pewarnaan terstandarisasi untuk setiap segmen rantai multimoda: Hijau Zamrud `#10B981` (truk jalan raya), Biru Laut `#3B82F6` (maritim pesisir & sungai), dan Biru Sian `#00F0FF` (kargo udara).
- **Legenda Rute & Kejelasan Visual Armada** (`DashboardClient.tsx`, `LEGENDA RUTE`)
  - Modal legenda interaktif mendokumentasikan kode warna armada (`#38bdf8` Kapal AIS Live, `#34d399` Truk GPS Live, `#c084fc` Pesawat Kargo, `#1e40af` TSS Selat Malaka, `#f59e0b` Proyeksi Jalur Terjadwal).
  - Teks Deck.gl menggunakan tanda hubung ASCII standar `-` menggantikan karakter Unicode bullet `•` (8226) guna meniadakan peringatan konsol.

### 1.2 Core Backend Engine & Swarm Intelligence
- **LangGraph 6-Agent Cognitive Swarm** (`agents/`)
  - Swarm 6 agen cerdas: *Data Collection*, *OSINT & Hazard*, *Prediction*, *Route Optimization*, *Economic Intelligence*, dan *Decision Support Copilot*.
- **Deterministic CPU Route Optimization** (`cpu_routing_adapter.py`)
  - Algoritma NetworkX Dijkstra dan Google OR-Tools (2-Opt) berjalan di CPU dengan latensi `<150ms`. Bebas ketergantungan GPU cloud berbiaya mahal. Snapping koordinat murni `[lon, lat]` via Haversine lookup ke node jalan terdekat.
- **Persistent AIS Vessel Continuity** (`aisstream_adapter.py`, `useFleetVehicles.ts`)
  - Penggabungan baseline 96 kapal regional Sumatera dengan feed langsung WebSocket AISStream (`get_live_ais_vessels()`) dan cache sliding TTL 90 detik, mencegah hilangnya kapal saat rekoneksi socket.
- **Deep Publisher Permalink Resolution** (`news_aggregator.py`)
  - Penguraian token URL Google News via RPC `batchexecute` Fbv4je dan integrasi RSS biro regional ANTARA langsung menuju artikel permanen penerbit (Antara, Detik, Kompas). Dilengkapi gerbang `LOGISTICS_DISASTER_KEYWORDS` untuk menolak artikel non-logistik.
- **Atmospheric Weather Radar & NWP Fusion** (`weather_fusion_service.py`)
  - Fusi spasial radar cuaca BMKG dan model numerik Open-Meteo (ECMWF/GFS) tanpa GPU.
- **Single Canonical Disaster Simulator** (`CrisisSimulatorBar.tsx` ➔ `POST /api/v1/simulate/stream`)
  - Simulasi krisis terpadu via Server-Sent Events (SSE), evaluasi kepatuhan karantina BKHIT, batas tonase MST, dan peluruhan eksponensial komoditas pangan ($1 - e^{-\delta \cdot T}$). Tab simulasi lama (`SimulationSection.tsx`) telah dipurgen sepenuhnya.
- **Laporan Audit Ledger & Non-Repudiation** (`ReportsSection.tsx`)
  - Pencatatan keputusan HITL (`ACCEPT`, `REJECT`, `OVERRIDE`), status sinkronisasi (`SYNCED`, `PENDING`), stempel waktu ISO dengan timezone (`GMT+7`), filter interaktif, serta ekspor PDF dan JSON dinamis.
- **Analytics Honesty** (`AnalyticsSection.tsx`)
  - Integrasi serial harga pangan riil PIHPS (`GET /api/v1/commodities/prices`) dari Supabase `commodity_prices` dengan status kosong `"Data tidak tersedia"` tanpa kartu risiko rekaan.
- **Analitik Activation M7 + Watermelon Restyle P1-P3 (Phase 111-114)**
  - 6 widget read-only bertumpuk regulator+dispatcher di atas API `prices`/`spikes` yang ada (4 komoditas × 8 provinsi × 7/14/30d), Globot Deck + gods-eye chips, tanpa Cesium, empty jujur `< 3` records, tanpa sintesis RED, tanpa PII.
  - Chrome P1 (Badge/Button/Popover/Separator), tabel P2 (`Table h-11` + `Progress`), polish P3 (`AnimatedValue`/`LoadingSkeleton`/`motion-safe:`); tanpa Portal di atas kanvas Mapbox; 12px min, `tabular-nums`, ikon Lucide.
- **Gap Shims Scaffold (Phase 116, PLANNED ⏳)**
  - 8 shim file direncanakan: C1 `empty`/`skeleton`/`tooltip` (base-ui), C2 `status-picker`/`editable-chip`/`budget-card` (hand-rolled CSS, `motion-safe:`), C3 `disparity-bar`/`trend-line` (recharts ^3.9.2); swap impor di `AnalyticsSection.tsx` tanpa ubah logika.
  - Batasan: tanpa `shadcn add`, tanpa `motion`/`react-icons`/`hugeicons`/`radix`, tanpa Portal di atas kanvas Mapbox; dark 12px `tabular-nums`. Docs: `116-gap-shims-scaffold/`.
- **Analitik Simplification (Phase 117, COMPLETE ✅)**
  - Hapus regime/freshness/telemetry/map-overlay/ops per 6 user notes; pertahankan filter bersama (4 komoditas × 8 provinsi × 7/14/30d + URL sync), tren hijau/merah (`#10b981`/`#ef4444`, guard `>= 3`), spikes honest-empty (`spikeRecordsTotal < 3` + pesan guard backend), tautan `Lihat Laporan` → Reports, days a11y (`role=group`, `aria-pressed`/`aria-label`/`title`). Read-only `GET prices` + `GET spikes`; globe dasar `layers: []`. tsc 0, build 7/7, Playwright 1 passed. Docs: `117-analitik-simplification/`.

---

## 2. Sudah Didekomisioning & Dieliminasi (Decommissioned & Purged)
**Status:** FULLY PURGED 🗑️

- ❌ **GPU-Based Routing & AI Forecasts:** Purged pada Phase 59 (digantikan oleh CPU NetworkX Dijkstra, OR-Tools, dan Open-Meteo NWP).
- ❌ **Legacy Simulasi Main Tab & Chat:** `SimulationSection.tsx` dan rute `/simulation/chat` dihapus pada Phase 65 (digantikan oleh Simulasi Bencana kanonikal di canvas peta).
- ❌ **Mock Past/Future/Predict Replay Tabs:** `TimelineScrubber.tsx`, `/historical/episodes`, dan `/predictive/risks` dihapus pada Phase 64.
- ❌ **Fake Risk Cards & Arcs:** Dihapus dari `AnalyticsSection.tsx` pada Phase 66 (digantikan oleh status `"Data tidak tersedia"` yang jujur).
- ❌ **Fake Fallback Audit Rows:** Dihapus dari `ReportsSection.tsx` pada Phase 67 (digantikan oleh ledger audit dinamis dari tabel `route_approvals`).
- ❌ **Bottom Modality Selector Buttons:** Dihapus pada Phase 69 demi on-map contextual popover.

---

## 3. Verifikasi & Pengujian Otomatis
**Status:** 100% PASSING VERIFIED 🧪

- **Backend Pytest Suite:** 216 tes unit, integrasi, dan E2E dalam 16 modul lulus 100% (`backend/tests/`).
- **Frontend TypeScript:** `npx tsc --noEmit` lulus dengan 0 error.
- **Frontend Unit & Logic Tests:**
  - `scripts/test_arbiter.ts`: Lulus 100% (bebas RangeError pada input koordinat tak terhingga/ekstrem).
  - `scripts/test_nautical_corridor.ts`: Lulus 100% (garansi rute air 100% pada Boom Baru, Siak, dan Selat Sunda).
  - `scripts/test_phase70_logic.ts`: Lulus 100% (keabsahan filter transponder armada dan estimasi viewport).
- **Next.js Production Build:** `npm run build` berhasil 100% (7/7 rute statis).

---

## 4. Masih Direncanakan (Post-MVP / v2)
**Status:** PLANNED FOR POST-MVP / v2 ⏳

- **Aplikasi Mobile Pengemudi Logistik (v2 / Post-MVP)**
  - Aplikasi React Native + WatermelonDB dengan sinkronisasi CRDT offline untuk pengemudi armada.
- **Pengembangan Koridor Multi-Provinsi (v2 / Post-MVP)**
  - Perluasan cakupan sistem pemantauan dari Koridor Sumatra menuju Koridor Trans-Jawa dan Kawasan Timur Indonesia.
- **National Logistics Health Index API & GraphRAG Enterprise (v2 / Post-MVP)**
  - API publik kesehatan logistik dan deployment private cloud kementerian (Kemendag, Kemenhub, BNPB, Bapanas, Bulog).
- **Watermelon MCP Connect (Phase 115, PLANNED ⏳)**
  - Menutup 7 primitif yang belum ada (Select/Chip/Card/Empty/Skeleton/Tooltip/Chart) via Watermelon MCP; `npx shadcn add` dilarang; `hideWhenDetached` absen di Base-UI 1.9.0; pola `asChild` digate saat review.

- **Analitik Fixes (Phase 118, COMPLETE ?)**
  - Peta/globe canvas dihapus total ? satu kolom penuh col-span-12; day pills glass hand-rolled + tombol Lihat Laporan shimmer motion-safe: tanpa shadcn add; REGION_TO_DB 8 slug ? 
orth_sumatra, Semua ? undefined; tren DD/MM per bar + tanggal header + Tren min(days,len) + hijau/merah (#10b981/#ef4444, guard >= 3); spikes tetap honest-empty (spikeRecordsTotal < 3 guard + pesan backend). Read-only GET prices + GET spikes. Docs: 118-analitik-fixes/.

- **PIHPS 8-Province Scraper (Phase 119, COMPLETE)**
  - PROVINCES 8 slugs -> BI ids + DISPLAY/SHORT_SLUG/CENTROID tables; fetch() region-outer loop keyed {commodity}@{region}; parse() region-scoped rolling/dedup/latest:{region}; bare latest stays north_sumatra compat; _persist_readings eq(region); REGION_TO_DB 1:1 (supersedes Phase 118 collapse). Tests +2. Docs: 119-pihps-8-province/.

- **Analitik Fixes Followup (Phase 121, COMPLETE � docs-only)**
  - Peta dihapus total (layers:[] + label menyesuaikan); days glass + Lihat Laporan shimmer hand-rolled motion-safe; REGION_TO_DB short-term 8?north_sumatra / Semua?undefined (diganti peta 1:1 Phase 119); tren DD/MM + header latest/tanggal + min(days,rows) + hijau/merah; spikes honest-empty; tooltip.tsx scaffold-only (0 konsumen, native title tetap). Docs: 121-analitik-fixes-followup/.
- **Analitik Heatmap + BNPB Layout Milestone (Phase 126, COMPLETE ✅)**
  - Mixed dashboard: tren 8 + donat 4, 4 heatmap 6+6 (PriceHeatmap, BencanaHeatmap, CorrelationMatrix Pearson ≥10, TimeHeatstrip 4-pekan), tabel 8 + panel BNPB 4; 7 KPI + `AnalyticsTip` rich tooltips (base-ui, no Portal); PIHPS 10-provinsi (`babel`/`kepri` backfill, `{commodity}@{region}`); BNPB async 1 jam + Tier-0 CKAN Action API (`datastore_search` limit 500 + offset, kab 10 km / prov 25 km); DEGRADED → CKAN stats live, realtime via BMKG/FIRMS; canvas 0 (Playwright `analitik-heatmap-tooltip-bnpb` + M7 gate 2 passed). Docs: 126-analitik-heatmap-bnpb-layout/.
