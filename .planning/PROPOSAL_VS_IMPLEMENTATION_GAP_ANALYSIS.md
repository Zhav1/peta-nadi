# EVOLUSI & COMPLIANCE ANALYSIS: PROPOSAL TAHP 2 VS IMPLEMENTASI NYATA PETANADI

**Tanggal Dokumen:** 2026-07-25  
**Lokasi Project:** `PetaNadi (LRIP)`  
**Dokumen Acuan Utama:**  
- Proposal Submission Awal: [Submission Tahap 2 (3) - compiled.md](file:///c:/Farras/DIGDAYA/peta-nadi/docs/Submission%20Tahap%202%20%283%29%20-%20compiled.md)  
- Requirement Baseline: [REQUIREMENTS.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/REQUIREMENTS.md)  
- Status Implementasi: [STATE.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/STATE.md) (Phase 0–29 Complete)  
- Riset Routing & Spasial: [maps_research.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/maps_research.md), [integrate_data.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/integrate_data.md)  
- Design System Standard: [MASTER.md](file:///c:/Farras/DIGDAYA/peta-nadi/design-system/MASTER.md)  

---

## 1. RINGKASAN EKSEKUTIF EVOLUSI PROYEK

Selama proses pengembangan dari Phase 0 hingga Phase 29, PetaNadi mengalami **peningkatan arsitektur (architectural upgrade)** dari sebuah *dashboard* pemantauan berbasis GIS dan multi-agent AI standar menjadi sebuah *defense-grade / production-ready situational awareness platform*.

Perubahan ini dipicu oleh penemuan riset teknis mendalam mengenai:
1. **Penanganan LLM Functional Hallucination:** Memisahkan peran LLM sebagai *orchestrator/reasoner* dari *routing engine* geometris (Mapbox/TomTom/NVIDIA cuOpt).
2. **Skalabilitas Rendering WebGL:** Menggantikan HTML DOM Marker dengan Native WebGL Symbol Layers untuk animasi armada 60 FPS.
3. **Data Fusion Spasial Multi-Sumber:** Menerapkan Uber H3 Spatial Mesh Indexing untuk menyatukan data *raster*, *vector*, dan *point*.
4. **Grounding Berita Real-Time:** Bertransformasi dari *scraping* pasif ke *Live Google News Search Grounding (RSS)* yang terverifikasi.

---

## 2. METRIKS PERBANDINGAN HEAD-TO-HEAD

| Komponen / Fitur | Proposal Awal (Submission Tahap 2) | Hasil Implementasi Nyata (Current Codebase) | Status & Dampak Arsitektur |
|---|---|---|---|
| **Pengambilan Berita & OSINT** | Scraping pasif e-commerce & sosmed (Lightpanda) | **Tri-Layer Hybrid OSINT Engine** + Live Google News Grounding (RSS 100% active link) | **UPGRADED** — Menghilangkan link 404 & menyajikan sintesis Markdown XAI interaktif. |
| **Infrastruktur AI Engine** | Dual-model standar (Gemini Flash + DeepSeek V3) | **NVIDIA NIM Gateway** + Gemini 3.1 Flash + DeepSeek V3/V4 | **UPGRADED** — Penambahan *failover router* & inferensi berkecepatan tinggi via NVIDIA API. |
| **Prediksi Cuaca Spasial** | Poligon BMKG & InaRISK standar | BMKG Live Poller + **NVIDIA FourCastNet (Earth-2)** | **UPGRADED** — Prediksi cuaca makro 48 jam berbasis AI fisik. |
| **Optimasi Rute Armada** | pgRouting / NetworkX dasar | **NVIDIA cuOpt GPU Cost Matrix Solver** + Mapbox Directions API | **UPGRADED** — Perhitungan *cost matrix* multi-armada berskala besar berbasis GPU. |
| **Arsitektur Routing** | Generasi rute langsung via teks LLM | **Forced Waypoint OSM Node Graph (18 Node Arterial Nyata)** + Geometric Avoid-Polygons | **CRITICAL FIX** — Membuang halusinasi LLM (seperti *"Pure Agentic Tangential Vector"*) & memaksa rute menyusuri jalan raya nyata. |
| **Visualisasi Armada (Fleet)** | Point markers GPS / DOM element | **Mapbox Native WebGL Vector Layer (60 FPS)** + Turf.js `@turf/along` & `@turf/bearing` | **UPGRADED** — Pergerakan armada mulus tanpa *lag* & rotasi vektor 0°–360° real-time. |
| **Skema Integrasi Data** | Visualisasi layer spasial terpisah | **Unified Uber H3 Hexagonal Spatial Indexing** (Composite Risk Index 3D) | **UPGRADED** — Data *raster* cuaca, *vector* macet, dan *point* api disatukan dalam sel heksagon. |
| **Simulasi Krisis User** | Injeksi poligon bencana manual / toggle statis | **Direct 2-Node On-Map Picking (🟢 Start / 🟡 End)** + Interactive Swarm Matrix | **UPGRADED** — Interaktivitas langsung di atas peta dengan indikator agen *live*. |
| **Batas Administratif** | Garis poligon polos | **Google Maps Style Dashed ADM Line (`[4, 3]`)** + Flyout Telemetry Popovers | **UPGRADED** — Tampilan standar profesional setara Google Maps / Palantir. |
| **Standar UI/UX** | Dashboard web umum | **Glassmorphism 2.0 + Strict Anti-AI Slop Rules** ([MASTER.md](file:///c:/Farras/DIGDAYA/peta-nadi/design-system/MASTER.md)) | **UPGRADED** — Bebas gradien ungu/pink generik, 100% SVG Lucide, & *Spatial Z-Index Hierarchy*. |

---

## 3. ANALISIS DEEP-DIVE EVOLUSI PER KOMPONEN

### 3.1 OSINT & Grounding Berita Real-Time
* **Spesifikasi Proposal:** Mengandalkan *scraping* pasif halaman portal berita dan e-commerce menggunakan Lightpanda headless browser.
* **Realita Implementasi (Phase 26–27):**
  * Membangun **Tri-Layer Hybrid OSINT Pipeline**:
    1. **Medsos & Ground OSINT:** Ingestion laporan warga & sensor lokal.
    2. **Aegis Grounding News Verification:** Menggunakan Google News Search Grounding (RSS Feed) untuk menarik berita aktual dengan tautan asli (0 link 404).
    3. **Globot Market Regime Feeds:** Monitoring dinamika pasar dan sentimen komoditas pangan.
  * Hasil sintesis disajikan dengan **Rich Markdown XAI Renderer** (sorotan cyan `**bold**`, tanpa *header* kaku `=== HASIL ===`).

### 3.2 Integrasi NVIDIA NIM, cuOpt, & FourCastNet (Earth-2)
* **Spesifikasi Proposal:** Menyebutkan secara umum pemanfaatan AI untuk analisis risiko dan simulasi.
* **Realita Implementasi (Phase 8, 17, 30):**
  * **NVIDIA NIM Gateway:** Mengintegrasikan model *inference* berkecepatan tinggi (`NVIDIA_DEEPSEEK_V4_PRO`, `NVIDIA_DEEPSEEK_V4_FLASH`) dengan *fallback router* otomatis di `.env`.
  * **NVIDIA cuOpt:** Menyediakan solver matriks biaya (*cost matrix*) berbasis GPU untuk masalah optimasi rute kendaraan (VRP) saat krisis.
  * **NVIDIA FourCastNet (Earth-2):** Menyediakan lapisan prediksi cuaca makro spasial 48 jam ke depan untuk mengidentifikasi ancaman sebelum meluas.

### 3.3 Routing Engine Google-Maps Grade vs Eliminasi "LLM Hallucination"
* **Spesifikasi Proposal:** Mengasumsikan LLM dapat langsung menyusun dan merekomendasikan rute evakuasi/alternatif.
* **Realita Implementasi (Phase 14–15, [maps_research.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/maps_research.md)):**
  * **Akar Masalah:** LLM tidak memiliki kesadaran spasial native (*native spatial awareness*). Jika diminta menggambar jalur, LLM menghasilkan polylines sembarangan yang memotong sawah/laut atau mengarang istilah teknis buatan (*functional hallucination*).
  * **Solusi Arsitektur Baru:** Pemisahan tegas:
    $$\text{LLM Role} \equiv \text{Deteksi Bencana} \longrightarrow \text{Kirim Geometric Avoid-Polygon} \longrightarrow \text{Panggil Mapbox API} \longrightarrow \text{Sintesis CoT}$$
  * **Forced Waypoint Engine:** Menyusun URL Mapbox 3-stop (`origin;waypoint;dest`) wajib untuk memaksa rute melewati jaringan jalan nyata.
  * **18 Node Persimpangan OSM Nyata:** Menggantikan offset koordinat matematika buatan dengan node persimpangan jalan arteri Sumatra Utara nyata (seperti Belawan, Medan Hub, Tebing Tinggi, Siantar).
  * **Multi-Alternative Routes:** Menyediakan 3 opsi rute interaktif di atas peta dengan tab rekomendasi moda otomatis `(Best)`.

### 3.4 WebGL Native Fleet Vector Layer 60 FPS
* **Spesifikasi Proposal:** Menampilkan posisi armada berdasarkan koordinat GPS.
* **Realita Implementasi (Phase 25, 28):**
  * Mengabaikan metode HTML DOM Marker (yang mengalami penurunan performa parah pada >10 kendaraan).
  * Mengimplementasikan **Mapbox Native WebGL Symbol Layer** yang mampu merender ratusan kendaraan di **60 FPS**.
  * Menggunakan Turf.js `@turf/along` untuk interpolasi pergerakan di sepanjang rute dan `@turf/bearing` untuk rotasi ikon 0°–360° secara *real-time* lengkap dengan *glassmorphic tooltip telemetry*.

### 3.5 Unified Spatial Mesh (Uber H3 Indexing)
* **Spesifikasi Proposal:** Visualisasi layer GIS terpisah (cuaca, lalu lintas, titik api).
* **Realita Implementasi ([integrate_data.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/research/integrate_data.md)):**
  * Mengadopsi **Uber H3 Hexagonal Spatial Indexing** (Resolusi 6-8) di backend PostGIS.
  * Menyatukan data *raster* (Earth-2), *vector* (TomTom), dan *point* (FIRMS) ke dalam sel heksagon yang sama.
  * Menghitung *Composite Risk Score* dan merender heksagon 3D (*extrusion*) di atas Mapbox menggunakan Deck.gl `H3HexagonLayer`.

### 3.6 Direct 2-Node User Interactive Crisis Simulator
* **Spesifikasi Proposal:** Simulasi krisis melalui injeksi poligon bencana hipotetis atau *toggle scenario* statis.
* **Realita Implementasi (Phase 23, 29):**
  * Pengguna dapat mengklik langsung titik **Start (🟢)** dan **Destination (🟡)** di peta Mapbox.
  * Dasbor menampilkan matriks progres 6 agen Swarm (0%–100%) dengan status interaktif dan tombol *pulsing*.
  * Dilengkapi **Investor Presentation Stepper Runner** dengan kontrol *remote presenter* dan *canvas scroll sequence* 121-frame.

### 3.7 Standarisasi Design System (Glassmorphism 2.0 & Anti-AI Slop)
* **Spesifikasi Proposal:** Dasbor web berbasis GIS standar.
* **Realita Implementasi ([MASTER.md](file:///c:/Farras/DIGDAYA/peta-nadi/design-system/MASTER.md)):**
  * **Strict Anti-AI Rules:** Mengharamkan gradien ungu/pink generik, mengharamkan penggunaan Emoji sebagai ikon utama (wajib SVG Lucide/Heroicons), dan melarang tabrakan elemen spasial (*spatial node collision*).
  * **Glassmorphism 2.0:** Panel transparan dengan blur tinggi (`backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10 shadow-2xl`).
  * **Z-Index Hierarchy Matrix:** Memastikan node kota/pelabuhan (`z-30`) selalu berada di atas poligon bencana (`z-5`).

---

## 4. KESIMPULAN KEPATUHAN & KESIAPAN ADOPSI

Seluruh perubahan dan penyesuaian yang dilakukan selama proses pengembangan dari Phase 0 hingga Phase 29 tidak mengubah visi utama proyek PetaNadi dalam **Digitalisasi Ketahanan Pangan & Logistik Cerdas**, melainkan:
1. **Meningkatkan Keandalan Teknis:** Mengeliminasi halusinasi rute AI dan memastikan performa UI tetap berjalan pada 60 FPS.
2. **Memperkuat Infrastruktur AI:** Mengintegrasikan ekosistem NVIDIA Enterprise (NIM, cuOpt, FourCastNet) untuk hasil analisis spasial yang lebih presisi.
3. **Memastikan Kesiapan Demo:** Menyediakan integrasi *live data* (Google News, BMKG, TomTom, PIHPS) sekaligus mekanisme *offline fallback (`run_demo.py`)* yang andal untuk demonstrasi juri.
