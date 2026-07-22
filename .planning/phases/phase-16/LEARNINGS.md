# LEARNINGS — Phase 16: Live API Ingestion, Corridor Context Aggregator & AI CoT Prompt Injection

**Phase:** 16  
**Date:** 2026-07-22  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  

---

## 💡 Executive Summary & Core Architectural Insights

Phase 16 secara sukses menghubungkan seluruh API adapters yang telah dibangun (BMKG Weather, TomTom Traffic Flow, PIHPS Price Stream) ke backend FastAPI & Supabase, menyajikannya melalui aggregator `get_corridor_context()`, menginjeksikannya ke dalam AI Copilot System Prompt dengan format Chain of Thought (CoT), dan mengikatnya ke Left Tactical Sidebar & Mapbox Overlay Indicators di frontend.

---

## 🔑 Key Technical Lessons

### 1. Multi-API Context Aggregator & Graceful Fallback
- `get_corridor_context("sumatra_belawan_medan")` menggabungkan telemetri 3 API independen (BMKG, TomTom, PIHPS) ke dalam satu JSON terstruktur.
- Menerapkan *graceful fallbacks* bila salah satu API/koneksi Redis down, memastikan sistem tetap 100% resilien selama demo maupun produksi.
- Secara otomatis menyinkronkan status data source ke tabel `data_sources` Supabase.

### 2. Enforced Chain of Thought (CoT) Prompt Engineering
- AI Copilot (`agents/nodes/decision_support.py` dan `/api/simulation/chat`) secara ketat diinstruksikan menghasilkan output dalam 3 bagian CoT yang dapat diaudit:
  1. **Ringkasan Ancaman Fisik:** Analisis peringatan cuaca BMKG & tingkat kemacetan TomTom.
  2. **Estimasi Dampak Ekonomi / Inflasi:** Deteksi anomali harga PIHPS (cabai, beras, minyak) dan proyeksi inflasi 48 jam.
  3. **Keputusan Rute Taktis + Alasan (Explainable AI):** Rekomendasi rute alternatif beserta justifikasi domain logistik.

### 3. Visual Telemetry Binding (Mapbox Overlays & Sidebar)
- **Left Tactical Sidebar (`DashboardClient.tsx`):** `dynamicMetrics` mendengarkan `corridorContext` secara real-time untuk membarui status inflasi PIHPS dan kondisi kesehatan koridor.
- **Mapbox Overlay Badges (`CrisisMap.tsx`):** Menampilkan marker badge visual di lokasi strategis:
  * **Belawan Port (`[98.68, 3.78]`):** Badge Peringatan Cuaca BMKG (`🌧️ BMKG: Hujan Lebat (68mm)`).
  * **Trans-Sumatra / Jalinsum (`[98.72, 3.55]`):** Badge Kemacetan Lalu Lintas TomTom (`🚗 TomTom: 74.2% Congested (+35m)`).
