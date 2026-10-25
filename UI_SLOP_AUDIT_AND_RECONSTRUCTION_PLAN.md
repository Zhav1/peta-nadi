# LAPORAN AUDIT UI SLOP & BLUEPRINT REKONSTRUKSI DESIGN SYSTEM
## PreHub: Logistics Resilience Intelligence Platform
**Waktu Audit:** 25 Oktober 2026, 19:40 WIB  
**Framework & Metodologi:** Impeccable (v4.6.0), UI/UX Pro Max, 6-Pillar GSD UI Review, Design Taste Frontend, GPT-Taste, High-End Visual Design, dan Argon High Reasoning.  
**Alat Inspeksi:** Chrome DevTools MCP (Headless Viewport 1280x800), DOM Accessibility Tree Profiler, dan Visual Screenshot Evidence (17 Capture Points).

---

## DAFTAR ISI
1. [Ringkasan Eksekutif & Filosofi Anti-Slop](#1-ringkasan-eksekutif--filosofi-anti-slop)
2. [Matriks Screenshot & Bukti Visual (17 Capture Points)](#2-matriks-screenshot--bukti-visual-17-capture-points)
3. [Audit 6-Pilar Visual & Identifikasi UI Slop per Halaman](#3-audit-6-pilar-visual--identifikasi-ui-slop-per-halaman)
   - 3.1 [Global Header & Navigation Bar](#31-global-header--navigation-bar)
   - 3.2 [Peta Operasi (Overview Map & Tactical HUD)](#32-peta-operasi-overview-map--tactical-hud)
   - 3.3 [Sidebar Feed Berita & Indikator Verifikasi](#33-sidebar-feed-berita--indikator-verifikasi)
   - 3.4 [Modul Analitik (Spasial Aliran Pangan & Grafik PIHPS)](#34-modul-analitik-spasial-aliran-pangan--grafik-pihps)
   - 3.5 [Modul Laporan (ERP Rekonsiliasi Rit & Audit Log Mitigasi)](#35-modul-laporan-erp-rekonsiliasi-rit--audit-log-mitigasi)
   - 3.6 [Modul Evaluasi (Tolok Ukur N=60 & Diagnostik REST API)](#36-modul-evaluasi-tolok-ukur-n60--diagnostik-rest-api)
   - 3.7 [Modal & Dialog Interaktif (Auth RBAC, Onboard Armada, & HITL Queue)](#37-modal--dialog-interaktif-auth-rbac-onboard-armada--hitl-queue)
4. [Katalog "UI Slop" Utama & Analisis Akar Masalah (Root Causes)](#4-katalog-ui-slop-utama--analisis-akar-masalah-root-causes)
5. [Blueprint Rekonstruksi & Solusi Teknis Konkret](#5-blueprint-rekonstruksi--solusi-teknis-konkret)
   - 5.1 [Design Tokens & Theme Contract Baru (Dark Tactical 2.0)](#51-design-tokens--theme-contract-baru-dark-tactical-20)
   - 5.2 [Arsitektur Komponen Primitif Base-UI (Watermelon Polish)](#52-arsitektur-komponen-primitif-base-ui-watermelon-polish)
   - 5.3 [Peta & HUD Ribbon De-cluttering](#53-peta--hud-ribbon-de-cluttering)
   - 5.4 [Bento Grid & Visual Hierarchy Analitik](#54-bento-grid--visual-hierarchy-analitik)
6. [Roadmap Eksekusi Rekonstruksi Bertahap (Phased Rollout)](#6-roadmap-eksekusi-rekonstruksi-bertahap-phased-rollout)

---

## 1. RINGKASAN EKSEKUTIF & FILOSOFI ANTI-SLOP

PreHub adalah platform intelijen ketahanan logistik pangan strategis nasional (*mission-critical command platform*). Meskipun sistem memiliki fondasi fungsional yang sangat kuat (deterministik CPU routing, real-time fusi BMKG, TomTom, NASA FIRMS, dan benchmark empiris N=60 Sumatra dengan akurasi 100%), antarmuka pengguna saat ini memperlihatkan akumulasi **"UI Slop"**—yakni elemen-elemen visual generik, penumpukan badge tanpa struktur hierarki, kontrol formulir HTML mentah bawaan browser, dan kepadatan informasi tanpa prinsip *progressive disclosure*.

### Prinsip Utama Rekonstruksi (The Impeccable & Anti-Slop Creed):
1. **Mode Operasi (Operate Mode)**: PreHub adalah ruang kerja operator, analis, dan regulator. Ambisi desain diekspresikan lewat **presisi, densitas terkontrol, dan ketenangan visual**, bukan dekorasi berlebihan atau efek neon AI generik.
2. **Kepatuhan Terhadap Kontrak Desain**:
   - ❌ **HARAM** gradien ungu/pink generik AI (`from-purple-600 to-pink-500`).
   - ❌ **HARAM** emoji sebagai ikon struktural (Wajib SVG murni dari Lucide).
   - ❌ **HARAM** kontrol bawaan OS yang tidak di-style (native `<select>` putih dan HTML5 date spinbuttons yang kaku).
   - ❌ **HARAM** portal tooltip/popover menimpa kanvas WebGL Mapbox (portal-clipping anti-pattern).
   - ✅ **WAJIB** `cursor-pointer` pada seluruh elemen interaktif.
   - ✅ **WAJIB** `tabular-nums` pada seluruh data angka, jam, persentase, dan rupiah.
   - ✅ **WAJIB** `motion-safe:` pada setiap animasi agar aksesibilitas *reduced-motion* tetap terjaga.

---

## 2. MATRIKS SCREENSHOT & BUKTI VISUAL (17 CAPTURE POINTS)

Seluruh tangkapan layar telah diabadikan langsung dari browser headless produksi menggunakan Chrome DevTools MCP:

| No | Nama View / Tab / Komponen | Path File Tangkapan Layar | Status Tampilan Saat Ini |
|---|---|---|---|
| 1 | Peta Operasi (Mitigasi Rute Aktif) | [media_0.png (Step 897)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/897/media_0.png) | Fungsional, namun HUD atas padat |
| 2 | Peta Operasi (Clean Baseline Overview) | [media_0.png (Step 903)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/903/media_0.png) | 3D Globe jernih, kontrol bawah terpecah |
| 3 | Modul Analitik (Spatial Flow & PIHPS) | [media_0.png (Step 913)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/913/media_0.png) | Select mentah, kolom kanan kosong |
| 4 | Modul Laporan (ERP Penghematan Rit) | [media_0.png (Step 923)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/923/media_0.png) | Empty state polos tanpa visual card |
| 5 | Modul Laporan (Catatan Audit Mitigasi) | [media_0.png (Step 931)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/931/media_0.png) | Date picker HTML5 default, tabel padat |
| 6 | Modul Evaluasi (Tolok Ukur N=60) | [media_0.png (Step 937)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/937/media_0.png) | Kurva kalibrasi berstutter angka |
| 7 | Modul Evaluasi (Diagnostik 24 REST API) | [media_0.png (Step 947)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/947/media_0.png) | Tabel 24 baris sangat panjang |
| 8 | Landing Page (Hero Section & Globe) | [media_0.png (Step 953)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/953/media_0.png) | Tipografi tajam, kontras baik |
| 9 | Landing Page (Feature Bento Cards) | [media_0.png (Step 963)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/963/media_0.png) | Bento teratur, micro-copy informatif |
| 10 | Landing Page (Architecture & Footer) | [media_0.png (Step 969)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/969/media_0.png) | Diagram arsitektur rapi, footer bersih |
| 11 | Modal Persona Switcher / Profil RBAC | [media_0.png (Step 983)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/983/media_0.png) | Teks wewenang padat, tombol keluar besar |
| 12 | Modal Tinjau 10 (Intervention Queue) | [media_0.png (Step 999)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/999/media_0.png) | List insiden kiri terlalu repetitif |
| 13 | Modal Onboard (Step 1 Daftarkan Truk) | [media_0.png (Step 1033)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/1033/media_0.png) | Formulir satu kolom panjang tanpa grouping |
| 14 | Modal Onboard (Step 2 Buat Rit) | [media_0.png (Step 1041)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/1041/media_0.png) | Dropdown asal/tujuan butuh kejelasan UX |
| 15 | Modal Onboard (Step 3 Integrasi Webhook) | [media_0.png (Step 1047)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/1047/media_0.png) | Kode cURL & payload JSON bersih |
| 16 | Route Planning & Alternative Corridors | [media_0.png (Step 1061)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/1061/media_0.png) | Stepper demo mengaburkan roster armada |
| 17 | Panel Krisis Mitigasi & Rute Trade-off | [media_0.png (Step 1107)](file:///C:/Users/PC/.gemini/antigravity/brain/3303b659-b98f-49d6-bc84-86aa0aae53a8/.system_generated/steps/1107/media_0.png) | Trade-off lengkap, tombol aksi jelas |

---

## 3. AUDIT 6-PILAR VISUAL & IDENTIFIKASI UI SLOP PER HALAMAN

### 3.1 Global Header & Navigation Bar
- **Skor Pilar:**
  - Typography: 3/4
  - Color & Contrast: 3.5/4
  - Spacing & Rhythm: 2.5/4 ⚠️
  - Information Architecture: 3/4
  - Motion & Interaction: 2.5/4 ⚠️
  - Component Cohesion: 2.5/4 ⚠️

#### 🚨 UI Slop yang Ditemukan:
1. **Loose Button Cluster (Bukan Segmented Tab)**:
   Tombol navigasi (`Peta Operasi`, `Analitik`, `Laporan`, `Evaluasi`) dirender sebagai tombol-tombol independen dengan margin kaku, alih-alih sebuah **Segmented Control** yang menyatu dalam satu background container gelap (`bg-white/5 border border-white/10 rounded-xl p-1`).
2. **Text Bloat pada Persona Pill**:
   Tombol di kanan atas merender teks lengkap: `"DISPATCHER PT Samudera Logistik Sumatra"` atau `"GUEST Kompetisi LRIP Demo Sandbox"`. Pada layar 1280px atau 1366px, teks panjang ini menekan navigasi utama dan memicu pemotongan visual.
3. **Badge Status Armada Mengambang di Atas Tombol Onboard**:
   Muncul angka kecil ("7") yang menempel canggung pada label `"Onboard Armada Khusus Dispatcher 7"`.

---

### 3.2 Peta Operasi (Overview Map & Tactical HUD)
- **Skor Pilar:**
  - Typography: 3/4
  - Color & Contrast: 3.5/4
  - Spacing & Rhythm: 2/4 🚨
  - Information Architecture: 2.5/4 ⚠️
  - Motion & Interaction: 3.5/4
  - Component Cohesion: 2.5/4 ⚠️

#### 🚨 UI Slop yang Ditemukan:
1. **Top HUD Badge Collision (Ribbon Spaghetti)**:
   Di bagian atas peta terdapat 8 badge mengambang horizontal:
   `[Rute < 15ms] [Lalu lintas +35m] [BMKG: 68.5 mm/j] [18 Hub] [Cuaca 16] [Advisori 0] [Karhutla —] [Tinjau 10]`.
   Badge ini mengambang tanpa pengelompokan tematik, bersaing langsung dengan kotak pencarian gazetteer di kirinya, dan tampak berantakan saat resolusi mengecil.
2. **Bottom-Right Action Buttons Clutter**:
   Tombol kontrol di kanan bawah kanvas: `[Rute] [Pilih Kargo (10T)] [Simulasi Bencana] [8km] [1x] [Demo]`.
   Semuanya berjejer horizontal menutupi sudut tenggara peta (area Selat Sunda/Lampung), tanpa container drawer yang dapat diciutkan (*collapsible*).
3. **Visual Roster Armada Bawah**:
   Roster armada menampilkan ratusan daftar kapal AIS dan pesawat ADS-B dalam satu panel yang memanjang ke bawah. Tampilan setiap item hanya berupa teks 2 baris tanpa badge tipe moda transportasi yang elegan atau identitas operator berkelas agensi.

---

### 3.3 Sidebar Feed Berita & Indikator Verifikasi
- **Skor Pilar:**
  - Typography: 3.5/4
  - Color & Contrast: 3.5/4
  - Spacing & Rhythm: 2.5/4 ⚠️
  - Information Architecture: 2.5/4 ⚠️
  - Motion & Interaction: 3/4
  - Component Cohesion: 3/4

#### 🚨 UI Slop yang Ditemukan:
1. **Kartu Berita Overcrowded (Kepadatan Ekstrem)**:
   Setiap kartu berita menampilkan 12 elemen mikro sekaligus: Penerbit, Waktu Terbit, Badge Warna (Merah/Kuning), Tipe Disrupsi, Judul Artikel (link), Ikon Pin Daerah, Angka Daerah, Daftar Nama Daerah, Koordinat Titik (`2.02°N, 98.97°E`), Estimasi Koridor, Keyakinan Multi-Agen (BMKG TOMTOM 86%), Status Jalur, Label Pangan, Link Eksternal, dan Tombol "Fokus".
   Kepadatan ini membuat mata operator kelelahan (*cognitive overload*).
2. **Ketiadaan Tab Kategori Berita yang Bersih**:
   Filter di atas berita: `[Semua] [ANTARA] [BMKG] [Harga] [Merah 1] [Kuning 5] [Prakiraan Waspada Dini 0]`.
   Pencampuran antara filter *Sumber Berita* (ANTARA, BMKG) dan filter *Tingkat Keparahan* (Merah, Kuning, Prakiraan) dalam satu baris tombol membingungkan taksonomi navigasi.

---

### 3.4 Modul Analitik (Spasial Aliran Pangan & Grafik PIHPS)
- **Skor Pilar:**
  - Typography: 3/4
  - Color & Contrast: 3.5/4
  - Spacing & Rhythm: 2.5/4 ⚠️
  - Information Architecture: 3/4
  - Motion & Interaction: 3/4
  - Component Cohesion: 2.5/4 ⚠️

#### 🚨 UI Slop yang Ditemukan:
1. **Raw HTML `<select>` Dropdowns**:
   Filter komoditas (`Beras`, `Cabai Merah`, `Bawang Merah`, `Minyak Goreng`) dan wilayah (`Sumut`, `Sumbar`, `Riau`, dll.) masih menggunakan tag mentah `<select>`. Saat diklik di browser Windows/macOS, dropdown popup yang muncul adalah menu putih default sistem operasi yang merusak estetika gelap aplikasi.
2. **Kekosongan Visual Kolom Kanan (Asymmetric Slop)**:
   Peta spasial aliran komoditas memakan 8 kolom (kiri), sedangkan kolom kanan (4 kolom) hanya berisi grafik harga beras dan kartu lonjakan harga kosong (`Data tidak tersedia`). Area kanan bawah tampak bolong dan tidak proporsional.
3. **Visualisasi Tren Harga Manual**:
   Grafik tren harga menggunakan representasi vertikal manual (`T-6`, `T-5`, `T-4` bar grafis) alih-alih AreaChart/LineChart Recharts yang interaktif dengan crosshair tooltip, gradient fill halus, dan rentang volatilitas pasar.

---

### 3.5 Modul Laporan (ERP Rekonsiliasi Rit & Audit Log Mitigasi)
- **Skor Pilar:**
  - Typography: 3/4
  - Color & Contrast: 3/4
  - Spacing & Rhythm: 2/4 🚨
  - Information Architecture: 2.5/4 ⚠️
  - Motion & Interaction: 2.5/4 ⚠️
  - Component Cohesion: 2.5/4 ⚠️

#### 🚨 UI Slop yang Ditemukan:
1. **Empty State Polos Tanpa Kontainer Card**:
   Pada tab ERP Penghematan, saat belum ada rit tercatat, teks instruksi *"Belum ada rit pada tenant ini. Buat aset truk lalu buat rit..."* ditampilkan telanjang di atas background hitam pekat tanpa bingkai kartu, tanpa ilustrasi SVG truk cold-chain yang estetik, dan tanpa tombol aksi utama yang menonjol.
2. **Input Tanggal HTML5 Unstyled**:
   Pada tab Catatan Audit Mitigasi, pemilih rentang tanggal menggunakan elemen HTML5 bawaan:
   `spinbutton "Day Day" / spinbutton "Month Month" / spinbutton "Year Year"`.
   Ini adalah tanda paling jelas dari UI template mentah (*unpolished UI*).

---

### 3.6 Modul Evaluasi (Tolok Ukur N=60 & Diagnostik REST API)
- **Skor Pilar:**
  - Typography: 3.5/4
  - Color & Contrast: 3.5/4
  - Spacing & Rhythm: 3/4
  - Information Architecture: 3/4
  - Motion & Interaction: 3/4
  - Component Cohesion: 3/4

#### 🚨 UI Slop yang Ditemukan:
1. **Reliability Diagram Axis Label Stutter**:
   Pada plot kalibrasi probabilitas model (Brier Score 0.0782), angka persentase terulang dua kali dalam DOM snapshot (`0% 0% 20% 20% 40% 40% 60% 60% 80% 80% 100% 100%`), menandakan adanya duplikasi label SVG tick antara prediksi $f_i$ dan observasi $o_i$.
2. **Tabel Diagnostik API 24 Baris Monolitik**:
   Tabel status endpoint backend di tab kedua merender 24 baris tabel penuh. Jika server belum mem-probe endpoint, seluruh kolom menampilkan tanda strip (`- -`), tanpa tombol batch *"Jalankan Uji Diagnostik Seluruh Endpoint"* atau visual health-gauge ringkas.

---

### 3.7 Modal & Dialog Interaktif (Auth RBAC, Onboard Armada, & HITL Queue)
- **Skor Pilar:**
  - Typography: 3/4
  - Color & Contrast: 3.5/4
  - Spacing & Rhythm: 2.5/4 ⚠️
  - Information Architecture: 2.5/4 ⚠️
  - Motion & Interaction: 3.5/4
  - Component Cohesion: 3/4

#### 🚨 UI Slop yang Ditemukan:
1. **Modal Onboard Armada: Formulir Vertikal Tanpa Pengelompokan**:
   Step 1 (Daftarkan Kendaraan) menumpuk 8 input form secara vertikal satu kolom: Nopol, Nama Unit, VIN, Golongan BPJT, Nama Sopir, Kontak WhatsApp, Berat Kotor, Jenis BBM.
   Pengguna harus men-scroll modal kecil ini ke bawah. Form tidak memanfaatkan layout 2-kolom yang seimbang (*Grid System 2-Column*).
2. **Modal Tinjau 10: Repetisi Header Insiden**:
   Di sisi kiri modal Tinjau Insiden, judul berita ANTARA yang panjang diulang-ulang pada tab navigasi list, sehingga memotong ruang baca detail kargo di sebelah kanan.

---

## 4. KATALOG "UI SLOP" UTAMA & ANALISIS AKAR MASALAH

| No | Gejala UI Slop | Lokasi Berkas / Komponen | Akar Masalah Teknis |
|---|---|---|---|
| **SLOP-01** | Dropdown `<select>` mentah dengan popup putih bawaan browser | [`AnalyticsSection.tsx:937-958`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/AnalyticsSection.tsx#L937-L958) | Belum menggunakan primitif Base-UI Select headless |
| **SLOP-02** | Input tanggal HTML5 kaku (`Day/Month/Year`) | [`ReportsSection.tsx:145-180`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/ReportsSection.tsx) | Menggunakan `<input type="date">` bawaan browser tanpa Popover Calendar kustom |
| **SLOP-03** | 8 Badge mengambang horizontal menabrak Search Bar | [`DashboardClient.tsx:2850-2910`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx) | Badge dirender sebagai elemen `absolute` terpisah tanpa unified flex ribbon |
| **SLOP-04** | Kartu Berita 12 baris teks mikro yang padat | [`NewsFeed.tsx:120-240`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/NewsFeed.tsx) | Seluruh metadata dicetak sekaligus tanpa prinsip *progressive disclosure* |
| **SLOP-05** | Form Onboard Armada satu kolom panjang dengan scrollbar | [`FleetOnboardingModal.tsx:320-410`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/fleet/FleetOnboardingModal.tsx) | Layout formulir belum menerapkan bento-grid 2 kolom |
| **SLOP-06** | Tombol Navigasi Header terputus-putus | [`TopNav.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/TopNav.tsx) / [`DashboardClient.tsx:2800`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx) | Tombol belum disatukan dalam Segmented Control Pill |
| **SLOP-07** | Empty state ERP tidak memiliki visual card | [`ReportsSection.tsx:85-110`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/ReportsSection.tsx) | Teks empty state dirender langsung pada root div tanpa kontainer Card |
| **SLOP-08** | Grafik harga beras manual dengan div bar | [`AnalyticsSection.tsx:1060-1120`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/AnalyticsSection.tsx) | Belum memanfaatkan library Recharts AreaChart dengan gradient fill |

---

## 5. BLUEPRINT REKONSTRUKSI & SOLUSI TEKNIS KONKRET

### 5.1 Design Tokens & Theme Contract Baru (Dark Tactical 2.0)
Definisikan kontrak token terpusat di `frontend/app/globals.css` dan `tailwind.config.js`:

```css
/* Dark Tactical Command HUD 2.0 Tokens */
:root {
  /* Surfaces */
  --surface-canvas: #06090e;      /* Deepest Obsidian Navy */
  --surface-panel: #0c1017;       /* Glassmorphic Tactical Panel */
  --surface-card: #121822;        /* Elevated Bento Card */
  --surface-card-hover: #18202c;  /* Interactive Card Hover */

  /* Hairlines & Borders */
  --border-subtle: rgba(255, 255, 255, 0.08); /* 1px Crisp Border */
  --border-strong: rgba(255, 255, 255, 0.16); /* Focus & Header Border */
  --border-cyan: rgba(6, 182, 212, 0.40);     /* Active Tactical Focus */

  /* Tactical Accents */
  --accent-cyan: #06b6d4;         /* Command Primary (Reroute / Active) */
  --accent-emerald: #10b981;      /* Verified Safe / Low Volatility */
  --accent-amber: #f59e0b;        /* Clarification / Caution / Hold */
  --accent-rose: #f43f5e;         /* Confirmed Hazard / Blockage */
}
```

### 5.2 Arsitektur Komponen Primitif Base-UI (Watermelon Polish)
Selesaikan implementasi Base-UI primitif di `frontend/components/base-ui/`:
1. **`select.tsx`**: Menggantikan seluruh `<select>` mentah dengan `@base-ui/react/select`. Mendukung popup gelap bertema `#0c1017`, sudut membulat `rounded-xl`, border tipis, dan efek transisi lembut.
2. **`card.tsx`**: Standarisasi seluruh frame widget analitik dan laporan ke dalam `<Card>`, `<CardHeader>`, `<CardTitle>`, `<CardContent>`.
3. **`empty.tsx`**: Komponen state kosong terpadu dengan ikon SVG Lucide (`PackageSearch`, `FileText`, `AlertCircle`), teks judul tegas, pesan panduan, dan tombol aksi primer.
4. **`date-range-picker.tsx`**: Menggantikan input HTML5 kaku dengan popover kalender gelap berkelas agensi.

### 5.3 Peta & HUD Ribbon De-cluttering
Satukan seluruh badge atas yang tersebar ke dalam **Unified Tactical Command Ribbon**:
- **Sisi Kiri**: Search Box yang terintegrasi rapi dengan gazetteer.
- **Tengah (Sensor Health Ribbon)**:
  `[ ⚡ Solver <15ms ] | [ 🚗 TomTom +35m ] | [ 🌧️ BMKG 68mm ] | [ ⚓ 18 Hub ] | [ ⚠️ 1 Bencana ]`
  Seluruh badge memiliki tinggi seragam (`h-8`), padding presisi (`px-3 py-1`), font monospace tabular (`tabular-nums font-mono text-xs`), dan border halus.
- **Sisi Kanan**: Tombol Intervensi `[ Tinjau Insiden (10) ]` dengan badge pulsing amber.

### 5.4 Bento Grid & Visual Hierarchy Analitik
Restrukturisasi tata letak Modul Analitik menjadi **Bento Grid 8-4 yang Seimbang**:
- **Kolom Kiri (8 Kolom)**:
  - Header: Filter Komoditas (Base-UI Select), Wilayah (Base-UI Select), dan Rentang Waktu (Segmented Pill).
  - Peta Spasial Aliran Pangan Sumatra-Jawa dengan overlay status koridor.
- **Kolom Kanan (4 Kolom)**:
  - **Card 1: Indikator Rezim Pasar & Volatilitas PIHPS** (Skor volatilitas, tren inflasi).
  - **Card 2: Grafik Deret Waktu Recharts** (AreaChart interaktif dengan kurva harga komoditas dan ambang batas stabil/waspada).
  - **Card 3: Tabel Disparitas & Pemeringkatan Kerentanan Antar-Provinsi** (Rank baris h-11 dengan progress bar).

---

## 6. ROADMAP EKSEKUSI REKONSTRUKSI BERTAHAP

```
┌────────────────────────────────────────────────────────────────────────┐
│               ROADMAP REKONSTRUKSI UI SLOP PREHUB                      │
├─────────────────┬──────────────────┬─────────────────┬─────────────────┤
│ GELOMBANG 1     │ GELOMBANG 2      │ GELOMBANG 3     │ GELOMBANG 4     │
│ Primitif        │ Header & Map     │ Analitik Bento  │ Laporan & Modal │
│ Base-UI         │ Command Ribbon   │ & Recharts      │ Form Overhaul   │
│ • select.tsx    │ • TopNav Seg-    │ • Swap Select   │ • Empty States  │
│ • card.tsx      │   mented Tabs    │ • Recharts Area │ • Date Picker   │
│ • empty.tsx     │ • Tactical HUD   │   Chart         │ • 2-Col Onboard │
│ • tooltip.tsx   │   Ribbon         │ • Balanced Grid │ • HITL Polish   │
└─────────────────┴──────────────────┴─────────────────┴─────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│ FINAL VERIFICATION & BROWSER REGRESSION GATE                           │
│ • npx tsc --noEmit (0 error)                                           │
│ • npm run build (7/7 static routes)                                    │
│ • Automated Playwright E2E visual captures (Zero console errors)       │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Gelombang 1 (Foundation Primitif Base-UI)**:
   - Implementasikan `select.tsx`, `chip.tsx`, dan integrasikan `card.tsx`, `empty.tsx`, `skeleton.tsx`, `tooltip.tsx`, `chart.tsx`.
2. **Gelombang 2 (Header & Tactical HUD Map Ribbon)**:
   - Satukan navigasi utama menjadi Segmented Control Pill.
   - Restrukturisasi badge floating atas menjadi satu Command Ribbon teratur.
3. **Gelombang 3 (Analitik Bento Grid & Recharts AreaChart)**:
   - Ganti `<select>` mentah dengan Base-UI `Select`.
   - Ganti grafik manual dengan Recharts AreaChart halus.
4. **Gelombang 4 (Laporan & Formulir Onboarding)**:
   - Restrukturisasi modal Onboard Armada menjadi grid 2 kolom.
   - Berikan visual empty state estetik pada tab ERP Penghematan.
   - Ganti input tanggal HTML5 dengan Date Picker berkelas.

---

## 7. KESIMPULAN

Audit visual ini membuktikan bahwa arsitektur backend, kecerdasan data, dan fungsionalitas PreHub berada pada level produksi enterprise yang sangat matang. Dengan mengeksekusi rekonstruksi visual anti-slop sesuai blueprint di atas, tampilan antarmuka PreHub akan bertransformasi dari sekadar *"demo fungsional"* menjadi **platform intelijen logistik berkelas dunia (Out-of-Distribution Craft)** yang siap memukau dewan juri, regulator kementerian, dan mitra industri logistik nasional.
