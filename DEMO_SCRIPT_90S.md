# DEMO SCRIPT 90-SECOND (PITCH PRODUCT WALKTHROUGH) — PETANADI (LRIP)

**Target Duration:** 90 Seconds (1.5 Minutes)  
**Pitchman Role:** Live Product Demo & Core Value Proposition  
**Scope Context:** Intro, Problem Statement, ROI, and CTA handled separately by teammates.  
**Platform URL:** `http://localhost:3000/dashboard` or `http://localhost:3000/` (Command Center)

> [!IMPORTANT]
> **Prerequisites (read-only guest & Supabase required):** Configure Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `frontend/.env.local`) and sign in with a verified `DISPATCHER` account before recording — there is no offline login fallback. Unauthenticated visitors stay in a read-only guest preview (backend `ROLE_GUEST` grants only `benchmark:read` and `reports:read`), so approval/dispatch segments require a real session.  

---

## ⏱️ TIMELINE & DIALOGUE BREAKDOWN (EXACT 90 SECONDS)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ [0:00 - 0:15]  Disruption Scenario & 4D Spatiotemporal Mesh                            │
│ [0:15 - 0:40]  Direct 2-Node Route Picking & Forced Waypoint Engine (No AI Hallucination)│
│ [0:40 - 1:05]  Multi-Alternative Routes & 60 FPS WebGL Fleet                           │
│ [1:05 - 1:30]  Economy Review (Economic Tab) ➔ Mitigation Approval & Action Plan       │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### SEGMENT 1: Disruption Scenario & 4D Spatiotemporal Mesh (0:00 – 0:15)

* **Visual UI State:**  
  Tampilan awal PetaNadi Command Center (Mapbox 3D dark canvas). Kamera meluncur (*cinematic fly-to*) ke Koridor Sumatera Utara (Pelabuhan Belawan ➔ Medan ➔ Tebing Tinggi/Siantar). Terlihat poligon organis merah bencana banjir BMKG/InaRISK & heksagon 3D Uber H3 Composite Risk Score.
* **Action UI:**  
  Hover singkat pada poligon bencana banjir Belawan untuk menampilkan telemetry badge real-time.
* **Spoken Pitch Dialogue (Naskah Suara):**  
  > *"Ini adalah PetaNadi Command Center. Saat banjir atau cuaca ekstrem melumpuhkan koridor logistik utama seperti Pelabuhan Belawan, sistem konvensional butuh berjam-jam untuk mitigasi. PetaNadi mengintegrasikan data BMKG, TomTom, dan Google News secara real-time ke dalam indeks spasial H3 untuk mendeteksi ancaman secara presisi."*

---

### SEGMENT 2: Direct 2-Node Route Picking & Forced Waypoint Engine (0:15 – 0:40)

* **Visual UI State:**  
  Pengguna memilih titik asal dan tujuan langsung di atas peta interaktif. Titik **🟢 Start (Belawan)** dan **🟡 End (Siantar)** menyala di peta.
* **Action UI:**  
  Klik node **🟢 Belawan Port**, lalu klik node **🟡 Siantar / Tebing Tinggi Hub**. Rute merah terputus akibat menembus poligon bencana.
* **Spoken Pitch Dialogue (Naskah Suara):**  
  > *"Operator cukup memilih titik asal dan tujuan langsung di atas peta. Berbeda dengan AI biasa yang sering berhalusinasi rute fiktif, Forced Waypoint Engine kami langsung mengunci jalan ke 18 node arteri OSM nyata dan secara mutlak memutus rute yang menembus poligon bencana."*

---

### SEGMENT 3: Multi-Alternative Routes & 60 FPS WebGL Fleet (0:40 – 1:05)

* **Visual UI State:**  
  Sistem menyajikan 3 opsi rute evakuasi. Tab rekomendasi `(Best)` terpilih otomatis. Truk logistik 3D bergerak mulus di atas rute hijau melingkari poligon banjir.
* **Action UI:**  
  Klik rute `(Best)` pada tab rute alternatif. Hover armada truk untuk menampilkan telemetry tooltip 60 FPS.
* **Spoken Pitch Dialogue (Naskah Suara):**  
  > *"Dalam hitungan milidetik, sistem memberikan 3 rute evakuasi presisi yang memutari area krisis. Armada logistik bergerak mulus 60 FPS di atas layer WebGL Native."*

---

### SEGMENT 4: Economy Review ➔ Mitigation Approval & Action Plan (1:05 – 1:30)

* **Visual UI State:**  
  Guided demo mencapai tahap 4: sidebar otomatis membuka tab **Economic** (kartu proyeksi inflasi, horizon proyeksi, anomali harga, dan preseden LTM — semua angka dibaca dari payload agen, bukan angka statis). Setelah itu klik CTA `[ Buka Mitigasi & Setujui ]` untuk berpindah ke tab **Mitigation**.
* **Action UI:**  
  `Run Demo` ➔ `Langkah Berikutnya` hingga **Tahap 4** (tab Evidence ➔ tab Economic) ➔ klik `[ Buka Mitigasi & Setujui ]` (tab Mitigation) ➔ setujui rute pengalihan yang direkomendasikan di tab Mitigation ➔ (opsional) buka tab `Laporan` / `Simulasi` untuk rencana tindakan gabungan. Pacing tahapan sepenuhnya dikendalikan operator lewat tombol tahap, bukan timer.
* **Spoken Pitch Dialogue (Naskah Suara):**  
  > *"Sebelum menyetujui pengalihan, operator melihat dampak ekonominya lebih dulu: proyeksi kenaikan harga, horizon waktu, dan preseden historis dari Long-Term Memory. Semua angka di kartu ini berasal dari payload agen, bukan angka yang ditulis di UI. Satu klik CTA membuka rencana mitigasi resmi untuk disetujui dan dikirim ke otoritas gabungan BULOG, DISHUB, dan BNPB lengkap dengan audit log Supabase. Dibalik layar, PetaNadi memakai solver rute CPU deterministik (NetworkX + OR-Tools / 2-Opt) dan fusi cuaca BMKG Radar + Open-Meteo NWP."*

---

## 🏗️ MERMAID ARCHITECTURE DIAGRAM (FOR PRESENTATION / ONBOARDING SCREEN)

```mermaid
graph TD
    A[Data Ingestion Real-Time<br/>BMKG, TomTom, AISstream, Google News RSS] --> B[Uber H3 Spatial Mesh Indexing<br/>Composite Risk Score 3D Grid]
    B --> C[LangGraph Agent Swarm]
    C --> D[Hazard Avoidance Polygons<br/>Organic Polygon Extraction]
    D --> E[Forced Waypoint Engine<br/>Deterministic CPU Router: NetworkX + OR-Tools / 2-Opt]
    E --> F[60 FPS WebGL Fleet Rendering<br/>Mapbox Symbol Layer + Turf.js Along/Bearing]
    F --> G[B2G Unified Action Plan & PDF Briefing<br/>Supabase Audit Log + WhatsApp Push Alert]
```

---

## 🛠️ PANDUAN EKSEKUSI REKAMAN DEMO (3 OPSI IMPLEMENTASI)

### OPSI A: Built-In Guided Demo Runner + OBS (SANGAT DIREKOMENDASIKAN ⚡)
PetaNadi **SUDAH MEMILIKI** fitur demo runner interaktif bawaan di UI yang dibuat di Phase 23 & 29:
1. Buka `http://localhost:3000/dashboard` di browser Chrome/Edge.
2. Buka OBS Studio / Windows Game Bar (`Win + Alt + R`).
3. Klik tombol **`▶ Run Demo`** di bagian bawah dasbor.
4. Majukan tahapan dengan tombol **`Langkah Berikutnya`** (tahap 3 membuka tab **Evidence**, tahap 4 membuka tab **Economic**).
5. Klik CTA **`Buka Mitigasi & Setujui`** pada tahap 4 untuk berpindah ke tab **Mitigation** dan menyetujui rute — pacing tab mengikuti aksi operator, bukan timer.

### OPSI B: Playwright Automated Screen Recorder Script
Jika ingin otomatisasi browser headless/headed 100% presisi:
Jalankan file Playwright recorder: `frontend/e2e/demo-recorder.spec.ts`
```bash
cd frontend
npx playwright test e2e/demo-recorder.spec.ts --headed
```

### OPSI C: HyperFrames CLI Render
Jika ingin komposisi frame-by-frame HTML to MP4 studio-grade:
```bash
npx hyperframes init demo-video
npx hyperframes render
```
