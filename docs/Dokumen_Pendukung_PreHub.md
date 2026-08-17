# DOKUMEN PENDUKUNG TEKNIS (TECHNICAL DOCUMENT)
# SISTEM PREHUB: EARLY WARNING & MITIGATION DECISION SUPPORT SYSTEM UNTUK DISTRIBUSI PANGAN BERBASIS MULTI-AGENT SWARM DAN DATA MULTISUMBER

---

**Identitas Dokumen & Aplikasi:**
* **Nama Sistem / Produk:** PreHub (*Predictive Logistics Hub & Early Warning System*)
* **Versi Rilis:** MVP v1.2.0-PROD (Phase 34 Multi-Modal Sumatra Release)
* **Kategori:** Sistem Pendukung Keputusan (Decision Support System - DSS) / AI-Driven Geo-Logistics
* **Fokus Wilayah Operasional:** Seluruh Koridor Strategis Pulau Sumatera (Darat, Laut, Udara: Belawan – Medan – Tebing Tinggi – Batam – Padang – Pekanbaru – Palembang – Lampung – Jakarta)
* **Target Pengguna:** Badan Pangan Nasional (BAPANAS), Kementerian Perhubungan (Kemenhub), Perum BULOG, Dinas Perhubungan / Satlantas POLRI, dan Dispatcher/Operator Armada Logistik Pangan Nasional.
* **Tanggal Rilis:** 17 Agustus 2026

---

## DAFTAR ISI

1. [BAB 1: RINGKASAN EKSEKUTIF & LATAR BELAKANG SISTEM](#bab-1-ringkasan-eksekutif--latar-belakang-sistem)
2. [BAB 2: PERSYARATAN SISTEM (SYSTEM REQUIREMENTS)](#bab-2-persyaratan-sistem-system-requirements)
3. [BAB 3: PANDUAN INSTALASI & DEPLOYMENT LINGKUNGAN](#bab-3-panduan-instalasi--deployment-lingkungan)
4. [BAB 4: ARSITEKTUR STRUKTURAL & FORMULASI MATEMATIKA](#bab-4-arsitektur-struktural--formulasi-matematika)
5. [BAB 5: DESKRIPSI FUNGSIONAL MODUL SISTEM](#bab-5-deskripsi-fungsional-modul-sistem)
6. [BAB 6: PANDUAN OPERASIONAL PENGGUNA (USER MANUAL & SOP)](#bab-6-panduan-operasional-pengguna-user-manual--sop)
7. [BAB 7: GALERI TANGKAPAN LAYAR APLIKASI (VISUAL VERIFICATION)](#bab-7-galeri-tangkapan-layar-aplikasi-visual-verification)
8. [BAB 8: STRATEGI DEPLOYMENT & ARSITEKTUR CLOUD GRATIS](#bab-8-strategi-deployment--arsitektur-cloud-gratis)
9. [BAB 9: PENANGANAN MASALAH & PEMELIHARAAN (TROUBLESHOOTING)](#bab-9-penanganan-masalah--pemeliharaan-troubleshooting)
10. [BAB 10: KESIMPULAN & ROADMAP PENGEMBANGAN](#bab-10-kesimpulan--roadmap-pengembangan)

---

## BAB 1: RINGKASAN EKSEKUTIF & LATAR BELAKANG SISTEM

### 1.1 Problem Statement
Distribusi komoditas pangan strategis (beras, cabai merah, bawang merah, minyak goreng, dan daging) di Indonesia sangat rentan terhadap gangguan multi-faktor:
1. **Cuaca Ekstrem & Hidrometeorologi:** Banjir rob pesisir, tanah longsor jalur lintas Sumatera, dan badai laut yang melumpuhkan rute pelayaran antar-pulau.
2. **Kemacetan Kritis & Bottleneck Infrastruktur:** Antrean bongkar muat pelabuhan utama (Belawan, Panjang, Tanjung Priok), penyempitan jalan arteri non-tol, jembatan rusak, atau kecelakaan kendaraan berat.
3. **Volatilitas Harga & Disparitas Spasial:** Keterlambatan pengiriman komoditas basah (*perishable goods*) mengakibatkan penyusutan bobot, kebusukan (*spoilage*), dan lonjakan inflasi pangan lokal (*volatile food inflation*).

### 1.2 Solusi PreHub
**PreHub** adalah platform intelijen logistik pangan terpadu (*Unified Food Logistics Command Center*) yang mengintegrasikan:
* **Multi-Source Data Grounding:** Integrasi data cuaca BMKG dan Open-Meteo 48 jam, telemetri lalu lintas waktu nyata TomTom Traffic API, dan pemantauan intelijen berita/sosial Google News OSINT NLP.
* **Multi-Agent Swarm Architecture:** Kolaborasi 6 agen AI berbasis LangGraph (Data Collection, OSINT Hazard, Weather/Congestion, Route Optimization, Economic Intelligence, dan Decision Copilot DeepSeek R1) yang menyintesis konsensus risiko secara otomatis.
* **Multi-Modal Network Routing:** Perutean multimoda lintas darat (truk arteri & jalan tol), laut (kapal kargo Tol Laut via Selat Malaka & Selat Sunda), serta udara (kargo penerbangan KNO-CGK).
* **Actionable Decision Support:** Rekomendasi mitigasi berbasis bukti (*Evidence Chain*) dengan 3 opsi aksi terukur: **Continue** (lanjutkan), **Reroute** (alihkan rute), atau **Hold/Delay** (tahan di buffer depot terdekat).

---

## BAB 2: PERSYARATAN SISTEM (SYSTEM REQUIREMENTS)

### 2.1 Hardware Requirements

| Komponen | Server Minimum (Staging/Demo) | Server Rekomendasi (Production) | Client / Dispatcher Workstation |
| :--- | :--- | :--- | :--- |
| **Processor (CPU)** | 2 Cores @ 2.0 GHz (x86_64 / ARM64) | 8-16 Cores @ 3.2 GHz (AMD EPYC / Intel Xeon) | 4 Cores @ 2.0 GHz |
| **Memory (RAM)** | 4 GB DDR4 | 16 - 32 GB DDR4/DDR5 | 8 GB DDR4 |
| **Storage (Disk)** | 10 GB SSD NVMe | 50 GB SSD NVMe (RAID 1) | 5 GB Ruang Kosong |
| **Graphics (GPU)** | Opsional (CPU Mode) | NVIDIA T4 / RTX 4000 (CUDA Acceleration cuOpt) | GPU Terintegrasi (WebGL 2.0 Support) |
| **Jaringan (Bandwidth)** | 10 Mbps Dedicated | 100 Mbps Dedicated Full-Duplex | 5 Mbps Internet Stabil |

### 2.2 Software & Framework Stack

* **Frontend Environment:**
  * Next.js 14.2+ (React 18, App Router Architecture)
  * TypeScript 5.0+
  * Styling: TailwindCSS dengan Custom Design Tokens (*Dark Mode Glassmorphism, Zero-AI Anti-Patterns*)
  * Peta Interaktif & Spasial: Mapbox GL JS v3, Deck.gl v8, Lucide React Icons
  * Otomasi Uji & Tangkapan Layar: Playwright Browser Suite (Chromium Headless)
* **Backend Environment:**
  * Python 3.11+
  * Web Framework: FastAPI (Uvicorn ASGI Server)
  * Agentic Framework: LangGraph, LangChain Core
  * AI Model Engine: Google Gemini 2.5 Flash / Flash-Lite, Anthropic Claude, DeepSeek R1 (via NVIDIA NIM / OpenRouter)
  * Routing & Graph Engine: NetworkX, Dijkstra, Geopy, PostGIS 3.3+
* **Database & Caching:**
  * PostgreSQL 15+ dengan ekstensi spatial PostGIS 3.3+ (Supabase Managed Layer)
  * Redis 7.0+ (Local Redis atau Upstash Serverless Redis)

---

## BAB 3: PANDUAN INSTALASI & DEPLOYMENT LINGKUNGAN

### 3.1 Kloning Repositori
```bash
git clone https://github.com/Zhav1/peta-nadi.git prehub
cd prehub
```

### 3.2 Konfigurasi Environment Variable

#### A. Backend Environment (`backend/.env`)
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
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
pytest  # Menjalankan unit & integration test
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3.4 Menjalankan Frontend Web Application (Next.js)
```bash
cd frontend
npm install
npm run build   # Kompilasi static route & production chunks
npm run start   # Menjalankan Next.js Production Server di port 3000
```

### 3.5 Otomasi Tangkapan Layar Aplikasi (Playwright)
```bash
cd frontend
npx playwright test e2e/capture-screenshots.spec.ts
```

---

## BAB 4: ARSITEKTUR STRUKTURAL & FORMULASI MATEMATIKA

### 4.1 Diagram Arsitektur C4 Container Level-2

```mermaid
graph TD
    User([Dispatcher / Pimpinan BAPANAS / Kemenhub]) -->|HTTPS / WSS| FE[Frontend: Next.js 14 Web Command Center]
    FE -->|REST API & SSE| BE[Backend: FastAPI Python Service]
    
    subgraph "PreHub Core Intelligence Layer"
        BE --> AgentOrch[LangGraph Multi-Agent Swarm]
        AgentOrch --> WAgent[Data Collection Agent - Multi-Sensor Telemetry]
        AgentOrch --> TAgent[OSINT Hazard Agent - RSS & News Grounding]
        AgentOrch --> IAgent[Forecast Agent - Open-Meteo & TomTom 48h]
        AgentOrch --> RAgent[Route Optimization Agent - Multi-Modal Graph Dijkstra]
        AgentOrch --> LAgent[Economic Intelligence Agent - PIHPS Anomaly]
        AgentOrch --> DAgent[Decision Copilot - DeepSeek R1 via NVIDIA NIM]
    end

    subgraph "Data Storage & Cache Layer"
        BE --> Redis[(Redis 7 / Upstash Serverless)]
        BE --> PostGIS[(PostgreSQL + PostGIS / Supabase Road Graph)]
    end
```

### 4.2 Topologi 6 Agen Swarm
1. **Data Collection & Health Agent:** Melakukan deduplikasi hash, validasi skema, dan normalisasi telemetri sensor waktu nyata (BMKG, TomTom, Open-Meteo).
2. **OSINT & Intelligence Agent:** Mengagregasi berita terkini (Google News RSS) dengan *Source Reliability Scoring* (0.0–1.0) serta kalkulasi zona dampak spasial.
3. **Congestion & Weather Forecast Agent:** Menggabungkan prediksi presipitasi curah hujan 24–48 jam dengan proyeksi tren perlambatan kecepatan lalu lintas.
4. **Logistics & Multi-Modal Routing Agent:** Mengoptimasi graf jaringan darat (Tol & Arteri), laut (Tol Laut Selat Malaka & Selat Sunda), serta udara menggunakan algoritma NetworkX Dijkstra berpenalti zona bahaya.
5. **Price & Inflation Intelligence Agent:** Mendeteksi anomali *z-score* harga komoditas strategis (cabai merah, beras, minyak goreng) dan memproyeksikan multiplier inflasi regional.
6. **Decision Support Copilot (DeepSeek R1):** Merumuskan sintesis eksekutif penalaran mendalam (*Chain-of-Thought*), matriks mitigasi 3 arah (*Continue vs Reroute vs Hold*), serta draf rencana aksi gabungan lintas kementerian/lembaga.

### 4.3 Formulasi Matematika Indeks Risiko Gabungan & Optimasi Rute

#### A. Komputasi Probabilitas Gangguan Gabungan ($P_{\text{disruption}}$)
$$P_{\text{disruption}}(s) = 1 - \prod_{k \in \{W, T, I\}} (1 - w_k \cdot p_k(s))$$
Di mana:
* $p_W(s)$: Probabilitas risiko cuaca BMKG / Open-Meteo ($w_W = 0.35$).
* $p_T(s)$: Probabilitas kemacetan & insiden TomTom ($w_T = 0.40$).
* $p_I(s)$: Probabilitas validitas laporan OSINT ($w_I = 0.25$).

#### B. Total Skor Risiko Operasional ($\mathcal{R}$)
$$\mathcal{R} = P_{\text{disruption}}(s) \times \left( \alpha \cdot \Delta T_{\text{delay}} + \beta \cdot \Delta C_{\text{fuel}} + \gamma \cdot V_{\text{cargo\_perishability}} \right)$$
Di mana $\alpha, \beta, \gamma$ adalah koefisien penalti keterlambatan waktu, biaya bahan bakar, dan indeks kebusukan muatan pangan basah.

#### C. Matriks Keputusan Mitigasi Tiga Arah (*Tri-Option Mitigation Matrix*)
* **REROUTE:** Diterapkan jika $\mathcal{R}_{\text{current}} > \mathcal{R}_{\text{threshold}}$ dan $\text{Cost}(\text{Detour}) < \text{Loss}(\text{Spoilage/Failure})$.
* **HOLD / DELAY:** Diterapkan jika seluruh rute alternatif memiliki $\mathcal{R}_{\text{alt}} > \mathcal{R}_{\text{critical}}$ (jalur terisolasi) sehingga armada ditahan di buffer depot terdekat.
* **CONTINUE:** Diterapkan jika $\mathcal{R}_{\text{current}} \le \mathcal{R}_{\text{threshold}}$ dengan rekomendasi panduan kecepatan aman (*speed advisory*).

---

## BAB 5: DESKRIPSI FUNGSIONAL MODUL SISTEM

### 5.1 Modul Ingesti Data Multi-Sumber & Grounding Real-Time
* **Worker Ingestion:** Menarik data gempa/cuaca BMKG, proyeksi curah hujan Open-Meteo, dan telemetri kecepatan TomTom secara terjadwal.
* **Google News RSS & OSINT Pipeline:** Memfilter artikel berita logistik pangan regional, menghitung skor kredibilitas sumber, dan menyimpan telemetri ke Redis stream `lrip:stream:osint`.

### 5.2 Modul Peta Komando 4D & Dynamic Fleet Layer
* **Visualisasi Multimoda 60 FPS:** Menampilkan layer pergerakan truk darat, kapal kargo Tol Laut via jalur laut nyata, dan pesawat kargo udara dengan sudut rotasi bearing dinamis.
* **Filter Modalitas & Hub Adaptif:** Filter interaktif (*All, Land, Sea, Air*) dan penanda hub logistik (Pelabuhan, Bandara, Gudang Buffer BULOG, Pasar Induk) yang menyesuaikan tingkat zoom peta.
* **Multi-Route Detour Overlay:** Membandingkan rute awal vs rute bypass aman (misal: Tol Belmera - Medan - Kualanamu - Tebing Tinggi).

### 5.3 Modul Analisis Spasial & Causal Chain Graph
* **Visualisasi Deck.gl Arc & Scatterplot:** Menampilkan aliran komoditas pangan dari sentra produksi (Pelabuhan Belawan / Tanah Karo) ke titik konsumsi utama.
* **Tracking Disparitas Harga Pangan (PIHPS Grounding):** Grafik harga beras, cabai merah, dan minyak goreng dengan kalkulasi lonjakan harga akibat keterlambatan pasokan.

### 5.4 Modul Multi-Agency Simulation Sandbox (What-If Advisor)
* **Simulasi Bencana Kustom:** Operator dapat memilih titik episentrum bencana di peta, mengatur radius gelombang kejut (5 km – 50 km), tingkat keparahan, dan jenis komoditas.
* **Unified Multi-Agency Action Plan:** Rekomendasi aksi taktis instansi gabungan:
  * **BAPANAS:** Pelepasan cadangan pangan pemerintah (CPP) di buffer depot.
  * **KEMENHUB:** Pembukaan lajur prioritas logistik pangan di gerbang tol dan pelabuhan.
  * **BULOG:** Pengalihan pasokan darurat ke pasar induk terdekat.
  * **DISHUB / POLRI:** Rekayasa lalu lintas satu arah (*contraflow*) pada segmen rawan kemacetan.

### 5.5 Modul B2G Executive Cabinet Briefing Center
* **Live 6-Agent Swarm Status:** Indikator kesehatan dan keyakinan agen waktu nyata (`GET /api/v1/agents/status`).
* **Laporan Ringkasan Eksekutif Instan:** Menghasilkan dokumen taktis berkas kabinet berformat standar kementerian berbasis penalaran DeepSeek R1.
* **Fitur Ekspor Multi-Format:** Mendukung cetak dokumen resmi (*Print-to-PDF*), unduh berkas JSON Telemetri, dan integrasi pengiriman pesan instan WhatsApp Dispatcher.

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
1. Peta 4D akan menampilkan koridor Sumatera beserta armada darat, laut, dan udara.
2. Gunakan filter modalitas (*All / Land / Sea / Air*) untuk menyaring visualisasi armada.
3. Di panel kiri, perhatikan **National Logistics Health Score** (Nilai normal: >85%, Status waspada: <70%).
4. Klik tombol **"▶ Run Demo"** untuk mengaktifkan simulasi multi-agent swarm secara langsung.

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

### 7.3 Command Center Peta 4D & Visualisasi Pergerakan Armada Multimoda
Pusat komando terpadu menampilkan peta spasial koridor Sumatera dengan layer vektor armada darat, kapal laut, dan pesawat terbang kargo 60 FPS, polygon zona bahaya, serta filter modalitas.

![03_command_center_map.png](file:///d:/College/Pidi.id/docs/screenshots/03_command_center_map.png)
*Gambar 7.3: Antarmuka Peta Komando Taktis 4D PreHub Command Center.*

---

### 7.4 Radar Insiden & Pipeline Kolaborasi Multi-Agent Swarm
Menampilkan proses penalaran 6 agen AI (Weather, Traffic, OSINT, Risk, Logistics, Decision) saat mendeteksi disrupsi secara *real-time* disertai panel status verifikasi bukti.

![04_incident_radar_pipeline.png](file:///d:/College/Pidi.id/docs/screenshots/04_incident_radar_pipeline.png)
*Gambar 7.4: Radar Insiden Logistik dan Status Eksekusi Multi-Agent Swarm.*

---

### 7.5 Analisis Ekonomi Spasial & Causal Chain Graph (Deck.gl Layer)
Visualisasi makro aliran komoditas pangan antar-wilayah (*Archipelago Commodity Flow*) dengan analisis rantai kausal lonjakan harga pasar komoditas beras, cabai merah, dan minyak goreng.

![05_spatial_economic_analytics.png](file:///d:/College/Pidi.id/docs/screenshots/05_spatial_economic_analytics.png)
*Gambar 7.5: Modul Analisis Spasial Ekonomi dan Pemantauan Disparitas Harga Pangan.*

---

### 7.6 Multi-Agency Simulation Sandbox & What-If Advisor
Ruang uji simulasi interaktif bagi pengambil kebijakan untuk menguji skenario dampak bencana kustom (Shockwave Radius 5-50 km) dan menerapkan *Unified Action Plan* lintas instansi.

![06_simulation_agency_sandbox.png](file:///d:/College/Pidi.id/docs/screenshots/06_simulation_agency_sandbox.png)
*Gambar 7.6: Antarmuka Simulasi Kebijakan Lintas Instansi (What-If Advisor).*

---

### 7.7 B2G Executive Cabinet Briefing Center
Pusat penerbitan laporan resmi untuk rapat koordinasi tingkat menteri/kepala badan dengan fitur cetak PDF, ekspor JSON, dan disposisi taktis.

![07_executive_cabinet_reports.png](file:///d:/College/Pidi.id/docs/screenshots/07_executive_cabinet_reports.png)
*Gambar 7.7: Tampilan Laporan Kabinet Eksekutif (B2G Cabinet Briefing Center).*

---

## BAB 8: STRATEGI DEPLOYMENT & ARSITEKTUR CLOUD GRATIS

Untuk kebutuhan evaluasi, live demo, dan penjurian tanpa biaya operasional infrastruktur ($0/bulan), PreHub dirancang dengan arsitektur *Decoupled Cloud Native*:

### 8.1 Ringkasan Topologi Cloud Gratis ($0 / Month)

| Layer | Rekomendasi Layanan Gratis | Alasan & Keunggulan | Konfigurasi Khusus |
| :--- | :--- | :--- | :--- |
| **Frontend Web** | **Vercel** (Hobby Plan) | Build Next.js 14 otomatis dari GitHub, Global CDN Edge, HTTPS gratis, performa WebGL optimal. | Set Environment Variable `NEXT_PUBLIC_API_URL` ke URL Backend. |
| **Backend API** | **Koyeb** (Eco Free Tier) atau **Render** (Free Web Service) | Menjalankan Python FastAPI (`uvicorn`) via GitHub repo atau Dockerfile. | **Koyeb:** Tidak sleep/spin down. **Render:** Pasang UptimeRobot ping per 10 menit agar tidak cold-start. |
| **Database & Spatial** | **Supabase** (Free Tier) | 500 MB PostgreSQL 15 + PostGIS 3.3, REST API otomatis, backup harian. | Sudah terhubung & terkonfigurasi. |
| **Cache & Queue** | **Upstash Redis** (Serverless Free) | 10.000 request/hari gratis, kompatibel penuh dengan protokol Redis standar (`REDIS_URL`). | Region Singapura (`ap-southeast-1`) untuk latensi <15ms. |
| **AI LLM Engine** | **Google AI Studio (Gemini 2.5 Flash)** | Free tier 15 RPM (Request per Minute), latensi rendah, kapabilitas penalaran logistik tinggi. | Gunakan `GOOGLE_API_KEY`. |

### 8.2 Perbandingan Opsi Hosting Backend Gratis

1. **Koyeb (Pilihan Utama - Recommended):**
   * Menyediakan 1 Eco Nano instance (512 MB RAM, 0.1 vCPU).
   * **Keunggulan Utama:** Tidak pernah tidur (*no sleep/no spin-down*), respon selalu instan saat juri membuka web.
   * Cukup hubungkan repositori GitHub, tentukan root folder `backend`, dan set build command `pip install -r requirements.txt` serta run command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

2. **Render (Pilihan Alternatif Populer):**
   * Free Web Service tier dengan setup sangat mudah.
   * *Catatan:* Masuk mode tidur (*spin down*) jika tidak ada traffic selama 15 menit. Butuh ~40 detik untuk bangun saat request pertama.
   * *Solusi:* Tambahkan health check URL (`https://your-backend.onrender.com/health`) ke cron job gratis (seperti cron-job.org atau UptimeRobot) setiap 10 menit.

3. **Hugging Face Spaces (Pilihan Komputasi Terbesar):**
   * Menyediakan 2 vCPU + 16 GB RAM gratis menggunakan Docker Space.
   * Sangat cocok jika ingin memproses graf jaringan jalan besar tanpa batasan memori.

---

## BAB 9: PENANGANAN MASALAH & PEMELIHARAAN (TROUBLESHOOTING)

### 9.1 Matriks Troubleshooting

| Masalah | Kemungkinan Penyebab | Tindakan Perbaikan (Actionable Solution) |
| :--- | :--- | :--- |
| **Peta Mapbox Blank / Gelap** | Token Mapbox belum diatur / kuota habis | Periksa variabel `NEXT_PUBLIC_MAPBOX_TOKEN` di `frontend/.env.local`. Pastikan token valid dan memiliki akses Mapbox GL v3 styles. |
| **Koneksi API / SSE Terputus** | Backend FastAPI mati atau port 8000 terblokir | Pastikan backend berjalan: `uvicorn app.main:app --port 8000`. Cek endpoint health: `curl http://localhost:8000/health`. |
| **Multi-Agent Demo Gagal Berjalan** | API Key LLM tidak valid atau habis kuota | Masukkan `GOOGLE_API_KEY` aktif di `backend/.env`. Sistem memiliki fallback otomatis (*Deterministic Fallback Agents*) jika koneksi API luar terputus. |
| **Database Connection Error** | PostgreSQL / Supabase tidak dapat dijangkau | Verifikasi koneksi internet atau periksa string `DATABASE_URL` pada konfigurasi backend. |
| **Performa Rendering Rendah pada Klien** | WebGL Acceleration dinonaktifkan pada browser | Aktifkan *Hardware Acceleration* pada pengaturan browser (*Settings -> System -> Use graphics acceleration when available*). |

### 9.2 Health Check & Monitoring Endpoints
* **Backend Health Probe:** `GET /health` -> `{ status: "ok", service: "prehub-api" }`
* **Telemetry Corridor Probe:** `GET /api/v1/corridor/telemetry` -> Telemetri live TomTom, BMKG, dan harga pangan.
* **Agent Swarm Health Probe:** `GET /api/v1/agents/status` -> Status kesehatan dan tingkat keyakinan 6 agen AI.
* **Active Incidents Probe:** `GET /api/v1/incidents` -> Daftar disrupsi logistik aktif yang sedang ditangani.

---

## BAB 10: KESIMPULAN & ROADMAP PENGEMBANGAN

Sistem **PreHub** membuktikan bahwa sinergi *Multi-Agent AI Swarm*, *Multi-Source Data Grounding*, dan *Multi-Modal Network Routing* mampu mentransformasi manajemen krisis logistik pangan dari pola **reaktif-manual** menjadi **prediktif-preskriptif otomatis**. 

Dengan rantai pembuktian berbasis bukti (*Evidence Chain*) dan rencana aksi terpadu lintas instansi (*Unified Multi-Agency Action Plan*), PreHub siap diadopsi oleh BAPANAS, Kementerian Perhubungan, dan Perum BULOG untuk menjaga stabilitas pasokan, meredam inflasi pangan, dan memperkuat kedaulatan logistik pangan Indonesia.

---
*Dokumen Pendukung Teknis PreHub – Disusun untuk Evaluasi Tahap MVP & Penjurian Resmi.*
