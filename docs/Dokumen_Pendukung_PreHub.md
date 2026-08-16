# DOKUMEN PENDUKUNG TEKNIS (TECHNICAL DOCUMENT)
# SISTEM PREHUB: EARLY WARNING & MITIGATION DECISION SUPPORT SYSTEM UNTUK DISTRIBUSI PANGAN BERBASIS MULTI-AGENT SWARM DAN DATA MULTISUMBER

---

**Identitas Dokumen & Aplikasi:**
* **Nama Sistem / Produk:** PreHub (*Predictive Logistics Hub & Early Warning System*)
* **Versi Rilis:** MVP v1.0.0-PROD (Phase 31 Milestone Release)
* **Kategori:** Sistem Pendukung Keputusan (Decision Support System - DSS) / AI-Driven Geo-Logistics
* **Fokus Koridor Logistik:** Koridor Strategis Sumatera Bagian Utara (Pelabuhan Belawan – Kota Medan – Tebing Tinggi – Pematang Siantar)
* **Target Pengguna:** Badan Pangan Nasional (BAPANAS), Kementerian Perhubungan (Kemenhub), Perum BULOG, Dinas Perhubungan / Satlantas POLRI, dan Dispatcher/Operator Armada Logistik Pangan Nasional.
* **Tanggal Rilis:** 13 Agustus 2026

---

## DAFTAR ISI

1. [BAB 1: RINGKASAN EKSEKUTIF & LATAR BELAKANG SISTEM](#bab-1-ringkasan-eksekutif--latar-belakang-sistem)
2. [BAB 2: PERSYARATAN SISTEM (SYSTEM REQUIREMENTS)](#bab-2-persyaratan-sistem-system-requirements)
3. [BAB 3: PANDUAN INSTALASI & DEPLOYMENT LINGKUNGAN](#bab-3-panduan-instalasi--deployment-lingkungan)
4. [BAB 4: ARSITEKTUR STRUKTURAL & FORMULASI MATEMATIKA](#bab-4-arsitektur-struktural--formulasi-matematika)
5. [BAB 5: DESKRIPSI FUNGSIONAL MODUL SISTEM](#bab-5-deskripsi-fungsional-modul-sistem)
6. [BAB 6: PANDUAN OPERASIONAL PENGGUNA (USER MANUAL & SOP)](#bab-6-panduan-operasional-pengguna-user-manual--sop)
7. [BAB 7: GALERI TANGKAPAN LAYAR APLIKASI (VISUAL VERIFICATION)](#bab-7-galeri-tangkapan-layar-aplikasi-visual-verification)
8. [BAB 8: PENANGANAN MASALAH & PEMELIHARAAN (TROUBLESHOOTING)](#bab-8-penanganan-masalah--pemeliharaan-troubleshooting)

---

## BAB 1: RINGKASAN EKSEKUTIF & LATAR BELAKANG SISTEM

### 1.1 Problem Statement
Distribusi komoditas pangan pokok (beras, cabai merah, aneka bawang, minyak goreng, dan daging) di Indonesia sangat rentan terhadap gangguan multi-faktor:
1. **Cuaca Ekstrem & Hidrometeorologi:** Banjir bandang rob pesisir, longsor lereng vulkanik, dan badai tropis yang memutus jalur arteri primer.
2. **Kemacetan Kritis & Kerusakan Infrastruktur:** Antrean bongkar muat pelabuhan, bottleneck simpang jalan non-tol, jembatan rusak, atau kecelakaan kendaraan berat.
3. **Volatilitas Harga & Disparitas Spasial:** Keterlambatan pengiriman komoditas pangan basah (*perishable food*) menyebabkan penyusutan bobot, kebusukan (*spoilage*), dan lonjakan inflasi pangan lokal (*volatile food inflation*).

### 1.2 Solusi PreHub
**PreHub** adalah platform intelijen logistik pangan terpadu (*Unified Food Logistics Command Center*) yang mengintegrasikan:
* **Multi-Source Data Grounding:** Data cuaca presisi tinggi (BMKG / AI Weather FourCastNet), telemetri lalu lintas waktu nyata (TomTom Traffic API / GPS Telematics), dan pemantauan intelijen media/sosial (OSINT NLP Geocoding).
* **Multi-Agent Swarm Architecture:** Kolaborasi 6 agen AI berbasis LangGraph (Weather, Traffic, Intelligence, Risk, Logistics, and Decision Agent) yang menyintesis konsensus risiko secara otomatis.
* **Mathematical Optimization Engine:** Formulasi komputasi risiko operasional kuantitatif dan perutean alternatif kendaraan berbasis GPU NVIDIA cuOpt / Mapbox Navigation Engine.
* **Actionable Decision Support:** Rekomendasi mitigasi operasional berbasis bukti (*Evidence Chain*) dengan 3 opsi aksi terukur: **Continue** (lanjutkan), **Reroute** (alihkan rute), atau **Hold/Delay** (tahan di buffer depot).

```mermaid
graph LR
    A[Multisource Feeds: BMKG, TomTom, OSINT] --> B[PreHub Multi-Agent Swarm]
    B --> C[Risk Assessment & Consensus Engine]
    C --> D[NVIDIA cuOpt Routing Optimization]
    D --> E[Command Center 4D & Actionable Briefing]
```

---

## BAB 2: PERSYARATAN SISTEM (SYSTEM REQUIREMENTS)

### 2.1 Hardware Requirements

| Komponen | Server Minimum (Staging/Demo) | Server Rekomendasi (Production) | Client / Dispatcher Workstation |
| :--- | :--- | :--- | :--- |
| **Processor (CPU)** | 4 Cores @ 2.5 GHz (x86_64 / ARM64) | 8-16 Cores @ 3.2 GHz (AMD EPYC / Intel Xeon) | 4 Cores @ 2.0 GHz |
| **Memory (RAM)** | 8 GB DDR4 | 16 - 32 GB DDR4/DDR5 | 8 GB DDR4 |
| **Storage (Disk)** | 20 GB SSD NVMe | 100 GB SSD NVMe (RAID 1) | 5 GB Ruang Kosong |
| **Graphics (GPU)** | Opsional (CPU Mode) | NVIDIA T4 / RTX 4000 (CUDA Acceleration cuOpt) | GPU Terintegrasi (WebGL 2.0 Support) |
| **Jaringan (Bandwidth)** | 10 Mbps Dedicated | 100 Mbps Dedicated Full-Duplex | 5 Mbps Internet Stabil |

### 2.2 Software & Framework Stack

* **Frontend Environment:**
  * Next.js 14.2+ (React 18, App Router Architecture)
  * TypeScript 5.0+
  * Styling: TailwindCSS dengan Tokens Kustom (*Zero-AI-Anti-Pattern, Dark Mode Glassmorphism*)
  * Peta Interaktif & Visualisasi Spasial: Mapbox GL JS v3, Deck.gl v8, Framer Motion
  * Testing & Screenshot Automation: Playwright Browser Suite (Chromium Headless)
* **Backend Environment:**
  * Python 3.11+
  * Web Framework: FastAPI (Uvicorn ASGI Server)
  * Agentic Framework: LangGraph, LangChain Core
  * AI Model Engine: Google Gemini 2.5 Flash / Flash-Lite, Anthropic Claude
  * Background Task Worker: Celery / Redis Worker Daemon
* **Database & Caching:**
  * PostgreSQL 15+ dengan ekstensi spatial PostGIS 3.3+
  * Supabase Managed Data Layer
  * Redis 7.0+ untuk Pub/Sub WebSocket Streaming dan Realtime Ingestion Queue

---

## BAB 3: PANDUAN INSTALASI & DEPLOYMENT LINGKUNGAN

### 3.1 Kloning Repositori
```bash
git clone https://github.com/Zhav1/peta-nadi.git prehub
cd prehub
```

### 3.2 Konfigurasi Environment Variable

#### A. Backend Environment (`backend/.env`)
Buat file `backend/.env` dari template:
```ini
# Application Core
APP_NAME="PreHub API"
ENVIRONMENT="production"
PORT=8000
HOST="0.0.0.0"

# Multi-Agent LLM Keys
GOOGLE_API_KEY="your-gemini-api-key"
ANTHROPIC_API_KEY="your-claude-api-key"

# External Data APIs
TOMTOM_API_KEY="your-tomtom-api-key"
BMKG_API_URL="https://data.bmkg.go.id/DataMKG/TEWS/"
MAPBOX_ACCESS_TOKEN="pk.your_mapbox_token"

# Database & Cache
DATABASE_URL="postgresql://postgres:password@localhost:5432/prehub"
REDIS_URL="redis://localhost:6379/0"
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-supabase-key"
```

#### B. Frontend Environment (`frontend/.env.local`)
Buat file `frontend/.env.local`:
```ini
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ1IjoicWhhbmFraW56aGF2aSIsImEiOiJjbXI4cG8zN2wxazE5MnhweGwweHY0d2F2In0.rdp0gPLafjh-8X3IZttVog
NEXT_PUBLIC_SUPABASE_URL=https://ulpmmacsdkohwkmyhlwj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### 3.3 Menjalankan Backend Service (FastAPI)
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
pytest  # Verifikasi seluruh 34 unit & integration test lulus 100%
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3.4 Menjalankan Frontend Web Application (Next.js)
```bash
cd frontend
npm install
npm run build   # Kompilasi static route & production chunks
npm run start   # Menjalankan Next.js Production Server di port 3000
```

### 3.5 Menjalankan Pengujian Otomatis & Capture Screenshot (Playwright)
```bash
cd frontend
npx playwright test e2e/capture-screenshots.spec.ts
```

---

## BAB 4: ARSITEKTUR STRUKTURAL & FORMULASI MATEMATIKA

### 4.1 Diagram Arsitektur C4 Level-2 (Container Diagram)

```mermaid
graph TD
    User([Dispatcher / Koordinator BAPANAS]) -->|HTTPS / WSS| FE[Frontend: Next.js 14 Web Command Center]
    FE -->|REST API & SSE| BE[Backend: FastAPI Python Service]
    
    subgraph "PreHub Core Intelligence Layer"
        BE --> AgentOrch[LangGraph Multi-Agent Swarm]
        AgentOrch --> WAgent[Weather Agent - BMKG]
        AgentOrch --> TAgent[Traffic Agent - TomTom]
        AgentOrch --> IAgent[OSINT Intelligence Agent]
        AgentOrch --> RAgent[Risk Synthesis Agent]
        AgentOrch --> LAgent[cuOpt Logistics Optimization Agent]
        AgentOrch --> DAgent[Decision Consensus Agent]
    end

    subgraph "Data Storage & Message Broker"
        BE --> Redis[(Redis 7 - Ingestion Queue & PubSub)]
        BE --> PostGIS[(PostgreSQL + PostGIS / Supabase)]
    end
```

### 4.2 Topologi 6 Multi-Agent Swarm

1. **Weather Agent:** Melakukan scraping, parsing metar, dan estimasi radius intensitas presipitasi hujan (curah hujan mm/jam) di titik rawan longsor/banjir.
2. **Traffic Agent:** Menganalisis *speed delta*, indeks kepadatan segmen jalan (*congestion index*), dan waktu tunda (*delay time*) pada jalur arteri vs jalan tol.
3. **Intelligence Agent (OSINT):** Mengumpulkan berita daring dan laporan insiden lapangan (kecelakaan, aksi blokade jalan, perbaikan gorong-gorong) dengan verifikasi silang kredibilitas sumber (*source reliability weight*).
4. **Risk Synthesis Agent:** Menghitung probabilitas kegagalan rute dan mengkombinasikan matriks dampak ekonomi.
5. **Logistics Agent (cuOpt Engine):** Mengoptimasi graf rute alternatif dengan pembobotan *Vehicle Routing Problem with Time Windows (VRPTW)*.
6. **Decision Consensus Agent:** Merumuskan rekomendasi final (*Continue vs Reroute vs Hold*), justifikasi *Evidence Chain*, serta draf disposisi antar instansi (*Cabinet Briefing*).

### 4.3 Formulasi Matematika Indeks Risiko Gabungan & Optimasi Rute

#### A. Komputasi Probabilitas Gangguan Gabungan ($P_{\text{disruption}}$)
Probabilitas disrupsi logistik pada segmen jalan $s$ dimodelkan dengan penggabungan multi-faktor berbobot independen:
$$P_{\text{disruption}}(s) = 1 - \prod_{k \in \{W, T, I\}} (1 - w_k \cdot p_k(s))$$
Di mana:
* $p_W(s)$: Probabilitas risiko hidrometeorologi BMKG ($w_W = 0.35$).
* $p_T(s)$: Probabilitas kemacetan & insiden TomTom ($w_T = 0.40$).
* $p_I(s)$: Probabilitas validitas laporan OSINT ($w_I = 0.25$).

#### B. Total Operational Risk Score ($\mathcal{R}$)
$$\mathcal{R} = f(P_{\text{disruption}}, \text{Impact}) = P_{\text{disruption}}(s) \times \left( \alpha \cdot \Delta T_{\text{delay}} + \beta \cdot \Delta C_{\text{fuel}} + \gamma \cdot V_{\text{cargo\_perishability}} \right)$$
Di mana $\alpha, \beta, \gamma$ adalah koefisien sensitivitas waktu, biaya operasional bahan bakar, dan faktor risiko kebusukan muatan pangan basah.

#### C. Matriks Keputusan Mitigasi Tiga Arah (*Tri-Option Mitigation Matrix*)
* **REROUTE:** Diterapkan jika $\mathcal{R}_{\text{current}} > \mathcal{R}_{\text{threshold}} \quad \text{dan} \quad \text{Cost}(\text{Detour}) < \text{Loss}(\text{Spoilage/Failure})$.
* **HOLD / DELAY:** Diterapkan jika seluruh rute alternatif memiliki $\mathcal{R}_{\text{alt}} > \mathcal{R}_{\text{critical}}$ (terisolasi cuaca ekstrem) sehingga armada dialihkan ke buffer gudang terdekat.
* **CONTINUE:** Diterapkan jika $\mathcal{R}_{\text{current}} \le \mathcal{R}_{\text{threshold}}$ dengan rekomendasi panduan kecepatan aman (*speed advisory*).

---

## BAB 5: DESKRIPSI FUNGSIONAL MODUL SISTEM

### 5.1 Modul Ingesti Data Multi-Sumber & Grounding Real-Time
* **Worker Ingestion:** Bekerja secara *asynchronous* menarik data cuaca BMKG dan telemetri TomTom setiap interval 60 detik.
* **OSINT Crawler & Geocoder:** Memfilter artikel berita dan laporan kepolisian daerah secara berkala, melakukan ekstraksi entitas geografis (NER Geocoding) ke koordinat lintang/bujur presisi.

### 5.2 Modul Peta Komando 4D & Dynamic Fleet Layer
* **Visualisasi Vektor WebGL 60 FPS:** Menampilkan layer pergerakan armada logistik pangan secara dinamis dengan sudut rotasi bearing nyata.
* **Zona Bahaya Dinamis (Dynamic Hazard Polygon):** Menampilkan batas spasial area banjir/macet dengan gradien warna intensitas risiko (*cyan/yellow/rose*).
* **Multi-Route Detour Overlay:** Menampilkan komparasi rute eksisting vs rute alternatif bebas hambatan (misal: Tol Belmera - Medan - Kualanamu - Tebing Tinggi).

### 5.3 Modul Analisis Spasial & Causal Chain Graph
* **Visualisasi Deck.gl Arc & Scatterplot:** Menampilkan aliran komoditas pangan dari sentra produksi (Pelabuhan Belawan / Tanah Karo) ke titik konsumsi utama.
* **Tracking Disparitas Harga Pangan (PIHPS Grounding):** Grafik fluktuasi harga beras, cabai merah, dan bawang merah dengan kalkulasi lonjakan harga akibat keterlambatan pasokan.

### 5.4 Modul Multi-Agency Simulation Sandbox & What-If Advisor
* **Interactive Disaster Shockwave:** Fitur bagi operator untuk mensimulasikan skenario disrupsi baru dengan radius dampak kustom (5 km – 50 km).
* **Unified Multi-Agency Action Plan:** Rekomendasi tindakan taktis instansi gabungan:
  * **BAPANAS:** Otorisasi pelepasan cadangan pangan pemerintah (CPP) di buffer depot.
  * **KEMENHUB:** Pembukaan lajur prioritas logistik pangan di gerbang tol dan pelabuhan.
  * **BULOG:** Pengalihan pasokan darurat ke pasar induk terdekat.
  * **DISHUB / POLRI:** Rekayasa lalu lintas satu arah (*contraflow*) pada segmen rawan kemacetan.

### 5.5 Modul B2G Executive Cabinet Briefing Center
* **Laporan Ringkasan Eksekutif Instan:** Menghasilkan dokumen taktis berkas kabinet berformat standar kementerian/lembaga.
* **Fitur Ekspor Multi-Format:** Mendukung cetak langsung (*Print-to-PDF*), unduh berkas JSON Telemetri, dan integrasi pengiriman notifikasi instan WhatsApp Dispatcher.

---

## BAB 6: PANDUAN OPERASIONAL PENGGUNA (USER MANUAL & SOP)

```
+-----------------------------------------------------------------------------+
|                      SOP OPERASIONAL DISPATCHER PREHUB                      |
+-----------------------------------------------------------------------------+
| 1. Buka Platform di Browser -> Akses http://localhost:3000                  |
| 2. Klik "LAUNCH COMMAND CENTER 4D" untuk masuk ke Dashboard Utama          |
| 3. Amati Radar Insiden Aktif pada Panel Kiri (Status Kesehatan Logistik)   |
| 4. Klik Salah Satu Insiden Kritis (misal: Banjir Rob Belawan)              |
| 5. Review "Evidence Chain" (Verifikasi multi-sumber BMKG + TomTom + OSINT)  |
| 6. Buka Tab "Mitigasi": Bandingkan Rute Eksisting vs Reroute Bypass        |
| 7. Klik Tombol "SETUJUI & TERAPKAN RUTE ALTERNATIF" (Disposisi Otomatis)   |
| 8. Buka Tab "REPORTS" -> Cetak / Ekspor Executive Briefing untuk Pimpinan  |
+-----------------------------------------------------------------------------+
```

### Langkah 1: Akses Halaman Onboarding & Login
1. Buka peramban modern (Google Chrome / Mozilla Firefox / Microsoft Edge).
2. Arahkan ke URL sistem `http://localhost:3000`.
3. Telusuri ringkasan kapabilitas sistem pada *Kinetic Feature Grid*.
4. Klik tombol **"LAUNCH COMMAND CENTER 4D"** pada sudut kanan atas.

### Langkah 2: Pemantauan Command Center & Radar Insiden
1. Peta 4D akan menampilkan koridor Sumatera Utara beserta posisi armada logistik aktif.
2. Di panel kiri, perhatikan **National Logistics Health Score** (Nilai normal: >85%, Status waspada: <70%).
3. Klik tombol **"▶ Run Demo"** untuk mengaktifkan simulasi multi-agent swarm secara langsung.

### Langkah 3: Evaluasi Bukti Multi-Sumber (Evidence Chain)
1. Saat insiden dipilih, panel *Drawer Kanan (CrisisSidebar)* akan terbuka otomatis.
2. Tab **Evidence** menyajikan:
   * **Telemetry BMKG:** Tingkat presipitasi curah hujan dan kecepatan angin.
   * **Telemetry TomTom:** Estimasi kemacetan dan penurunan kecepatan rata-rata.
   * **OSINT Intelligence Grounding:** Judul berita terverifikasi, tautan sumber, dan skor keyakinan AI.

### Langkah 4: Pengambilan Keputusan Mitigasi (Mitigation Action)
1. Pindah ke tab **Mitigation** di panel kanan.
2. Periksa metrik komparasi: Jarak tempuh tambahan ($\Delta \text{km}$), Waktu tempuh ($\text{ETA}$), Konsumsi bahan bakar ($\Delta \text{BBM}$), dan Penurunan skor risiko.
3. Pilih rute yang direkomendasikan sistem (misal: *Bypass Tol Medan-Tebing Tinggi*).
4. Klik tombol hijau **"SETUJUI & TERAPKAN RUTE ALTERNATIF"**. Notifikasi konfirmasi akan muncul dan rute armada akan diperbarui di seluruh layer peta.

### Langkah 5: Penerbitan Dokumen Eksekutif (Cabinet Briefing)
1. Klik tab navigasi **"REPORTS"** pada bilah navigasi atas.
2. Tinjau draf dokumen *Cabinet Briefing & Executive Summary*.
3. Klik **"Print PDF Briefing"** untuk mencetak dokumen resmi, atau **"Download JSON Telemetry"** untuk integrasi sistem data BAPANAS.

---

## BAB 7: GALERI TANGKAPAN LAYAR APLIKASI (VISUAL VERIFICATION)

Semua tangkapan layar di bawah ini ditangkap secara otomatis menggunakan Playwright Browser Automation pada resolusi Full HD (1920x1080) dari sistem PreHub yang sedang berjalan aktif.

### 7.1 Halaman Onboarding & Pengenalan Sistem (Hero Section)
Halaman awal menyajikan identitas produk PreHub, status koridor aktif, metrik agregat nasional, dan navigasi cepat menuju Command Center.

![01_onboarding_hero.png](file:///d:/College/Pidi.id/docs/screenshots/01_onboarding_hero.png)
*Gambar 7.1: Tampilan Hero Section PreHub Onboarding Portal dengan visualisasi koridor logistik 3D.*

---

### 7.2 Fitur Unggulan Sistem (Kinetic Feature Grid)
Menampilkan 6 pilar keunggulan teknologi PreHub: Multi-Source Grounding, Multi-Agent Swarm, 4D Tactical Mapping, GPU Route Optimization, Realtime Disruption Matrix, dan B2G Cabinet Reporting.

![02_onboarding_features.png](file:///d:/College/Pidi.id/docs/screenshots/02_onboarding_features.png)
*Gambar 7.2: Grid Fitur Interaktif PreHub pada Halaman Onboarding.*

---

### 7.3 Command Center Peta 4D & Visualisasi Pergerakan Armada
Pusat komando terpadu menampilkan peta spasial koridor Pelabuhan Belawan - Tebing Tinggi dengan layer vektor kendaraan logistik 60 FPS, polygon zona bahaya bencana, dan ringkasan telemetri atas.

![03_command_center_map.png](file:///d:/College/Pidi.id/docs/screenshots/03_command_center_map.png)
*Gambar 7.3: Antarmuka Peta Komando Taktis 4D PreHub Command Center.*

---

### 7.4 Radar Insiden & Pipeline Kolaborasi Multi-Agent Swarm
Menampilkan proses penalaran 6 agen AI (Weather, Traffic, OSINT, Risk, Logistics, Decision) saat mendeteksi disrupsi secara *real-time* disertai panel status verifikasi bukti.

![04_incident_radar_pipeline.png](file:///d:/College/Pidi.id/docs/screenshots/04_incident_radar_pipeline.png)
*Gambar 7.4: Radar Insiden Logistik dan Status Eksekusi Multi-Agent Swarm.*

---

### 7.5 Analisis Ekonomi Spasial & Causal Chain Graph (Deck.gl Layer)
Visualisasi makro aliran komoditas pangan antar-wilayah (*Archipelago Commodity Flow*) dengan analisis rantai kausal lonjakan harga pasar komoditas beras, cabai merah, dan bawang.

![05_spatial_economic_analytics.png](file:///d:/College/Pidi.id/docs/screenshots/05_spatial_economic_analytics.png)
*Gambar 7.5: Modul Analisis Spasial Ekonomi dan Pemantauan Disparitas Harga Pangan.*

---

### 7.6 Multi-Agency Simulation Sandbox & What-If Advisor
Ruang uji simulasi interaktif bagi pengambil kebijakan untuk menguji skenario dampak bencana (Shockwave Radius 5-50 km) dan menerapkan *Unified Action Plan* lintas instansi.

![06_simulation_agency_sandbox.png](file:///d:/College/Pidi.id/docs/screenshots/06_simulation_agency_sandbox.png)
*Gambar 7.6: Antarmuka Simulasi Kebijakan Lintas Instansi (What-If Advisor).*

---

### 7.7 B2G Executive Cabinet Briefing Center
Pusat penerbitan laporan resmi untuk rapat koordinasi tingkat menteri/kepala badan dengan fitur cetak PDF, ekspor JSON, dan disposisi taktis.

![07_executive_cabinet_reports.png](file:///d:/College/Pidi.id/docs/screenshots/07_executive_cabinet_reports.png)
*Gambar 7.7: Tampilan Laporan Kabinet Eksekutif (B2G Cabinet Briefing Center).*

---

## BAB 8: PENANGANAN MASALAH & PEMELIHARAAN (TROUBLESHOOTING)

### 8.1 Matriks Troubleshooting

| Masalah | Kemungkinan Penyebab | Tindakan Perbaikan (Actionable Solution) |
| :--- | :--- | :--- |
| **Peta Mapbox Blank / Gelap** | Token Mapbox belum diatur / kuota habis | Periksa variabel `NEXT_PUBLIC_MAPBOX_TOKEN` di `frontend/.env.local`. Pastikan token valid dan memiliki akses Mapbox GL v3 styles. |
| **Koneksi WebSocket / SSE Terputus** | Backend FastAPI mati atau port 8000 terblokir | Pastikan backend berjalan: `uvicorn app.main:app --port 8000`. Cek endpoint health: `curl http://localhost:8000/health`. |
| **Multi-Agent Demo Gagal Berjalan** | API Key Gemini/Claude tidak valid | Masukkan `GOOGLE_API_KEY` aktif di `backend/.env`. Sistem memiliki fallback otomatis (*Deterministic Mock Agents*) jika koneksi API luar terputus. |
| **Database Connection Error** | PostgreSQL / Supabase tidak dapat dijangkau | Verifikasi koneksi internet atau periksa string `DATABASE_URL` pada konfigurasi backend. Jalankan skrip migrasi `alembic upgrade head`. |
| **Performa Rendering Rendah pada Klien** | WebGL Acceleration dinonaktifkan pada browser | Aktifkan *Hardware Acceleration* pada pengaturan browser (*Settings -> System -> Use graphics acceleration when available*). |

### 8.2 Health Check & Monitoring Endpoints

* **Backend Health Probe:** `GET /health` -> Mengembalikan status `{ status: "ok", service: "prehub-api", timestamp: "..." }`.
* **Telemetry Corridor Probe:** `GET /api/v1/corridor/telemetry` -> Mengembalikan data live TomTom, BMKG, dan harga pangan.
* **Active Incidents Probe:** `GET /api/v1/incidents` -> Mengembalikan daftar disrupsi logistik yang sedang terdeteksi.

---

## BAB 9: KESIMPULAN & ROADMAP PENGEMBANGAN MASA DEPAN

Sistem **PreHub** berhasil membuktikan bahwa kolaborasi *Multi-Agent AI Swarm*, *Multi-Source Data Grounding*, dan *Mathematical Route Optimization* mampu mengubah manajemen krisis logistik pangan dari pola **reaktif-manual** menjadi **prediktif-preskriptif otomatis**. 

Dengan rekomendasi mitigasi yang berbasis bukti (*Evidence Chain*) dan rencana aksi terpadu (*Unified Multi-Agency Action Plan*), PreHub siap diimplementasikan untuk mengamankan rantai pasok pangan nasional, mencegah lonjakan inflasi pangan, dan mewujudkan ketahanan pangan Indonesia yang tangguh dan adaptif.

---
*Dokumen Pendukung Teknis PreHub – Disusun untuk Evaluasi Tahap MVP & Penjurian Resmi.*
