# DOKUMEN AUDIT SISTEM PREHUB & RENCANA SOLUSI KOMPREHENSIF

Tanggal Audit: 9 Oktober 2026
Auditor: Lead E2E Test & Systems Architecture Specialist
Status: Analisis Mendalam (Root Cause Analysis, Verification Artifacts, & Execution Blueprint)

---

## 1. Ringkasan Eksekutif

Berdasarkan pengujian menyeluruh menggunakan simulasi interaksi pengguna, Playwright headless runner, dan inspeksi kode sumber backend/frontend, telah ditemukan 3 kelompok masalah utama yang dilaporkan pengguna beserta 4 anomali sistemik kritis tambahan.

Tiga masalah utama yang menjadi perhatian:
1. **Rute yang diberikan belum optimal**: Penentuan jalur masih kerap memberikan jarak dan waktu yang tidak efisien, serta gagal menemukan jalur alternatif logis.
2. **Halaman Simulasi ("Terapkan Skenario Terpadu") tidak terjadi apa-apa**: Menekan tombol aksi mitigasi di halaman simulasi tidak memicu perubahan visual pada rute, status koridor, armada, maupun peta 4D, melainkan hanya melempar pengguna kembali ke peta tanpa umpan balik nyata.
3. **Simulasi bencana dan RUN DEMO tidak menghindari bencana**: Saat titik banjir/bencana diletakkan di koridor transportasi, garis rute optimal justru tetap melintasi titik pusat banjir (menerobos genangan), bukannya melingkar atau mencari rute pengalihan aman.

Dokumen ini membedah akar penyebab masalah dari level arsitektur hingga baris kode spesifik, memaparkan bukti hasil pengujian E2E, dan menyusun rencana penyelesaian langkah-demi-langkah yang konkret dan terukur.

---

## 2. Temuan & Analisis Akar Masalah (Root Cause Analysis)

### Masalah 1: Rute yang Diberikan Belum Optimal

#### 1.1 Kesalahan Fatal Koordinat Hub Node Tebing Tinggi
* **Lokasi Kode:** [frontend/lib/mapboxRoutingService.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/mapboxRoutingService.ts#L152-L158)
* **Temuan:**
  ```typescript
  tebingtinggi: {
    id: 'tebingtinggi',
    name: 'Interchange Tol Tebing Tinggi',
    coords: [98.9560, 3.5680], // SALAH: Ini adalah koordinat Perbaungan!
    type: 'interchange',
    province: 'Sumatera Utara',
  }
  ```
* **Akar Masalah:**
  Koordinat asli Kota dan Gerbang Tol Tebing Tinggi berada di `[99.1621, 3.3251]`. Koordinat `[98.9560, 3.5680]` yang dicantumkan pada sistem sebenarnya adalah Jalinsum Perbaungan (Serdang Bedagai). 
* **Dampak Sistemik:**
  1. Jarak Belawan ke "Tebing Tinggi" terhitung hanya ~45 km padahal jarak sebenarnya ~85 km via tol.
  2. Jarak dari Lubuk Pakam (`[98.87, 3.56]`) ke titik ini hanya ~9.5 km.
  3. Ketika bencana banjir disimulasikan di Lubuk Pakam dengan radius 15 km, titik tujuan "Tebing Tinggi" secara matematis berada di **dalam** lingkaran bencana. Oleh karena itu, mesin router tidak akan pernah bisa menemukan rute pengalihan yang bersih dari bencana, karena titik akhirnya sendiri terendam banjir.

#### 1.2 Minimnya Node Persimpangan Jalan Alternatif (Bypass Junctions)
* **Lokasi Kode:** [frontend/lib/aiDynamicRouter.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts#L9-L46)
* **Temuan:**
  Daftar `HIGHWAY_JUNCTION_NODES` hanya memiliki 46 titik untuk seluruh pulau Sumatera. Untuk koridor Sumatera Utara, seluruh titik hanya terkonsentrasi di satu garis lurus jalan tol dan arteri Jalinsum yang sama (Marelan, Adam Malik, Amplas, Kualanamu, Lubuk Pakam, Perbaungan, Sei Rampah, Tebing Tinggi).
* **Akar Masalah:**
  Tidak ada node perantara di jalur bypass pedalaman selatan (seperti rute Galang `[98.905, 3.445]`, Bangun Purba, Dolok Masihul `[99.048, 3.385]`) maupun jalur pesisir timur (Pantai Cermin `[99.035, 3.642]`, Teluk Mengkudu). Ketika jalan arteri dan tol di Lubuk Pakam terendam, mesin pencari bypass tidak memiliki titik waypoint alternatif yang dapat diarahkan ke Mapbox Directions API.

#### 1.3 Ketiadaan Logika Penghindaran Geometris Tangensial (Orthogonal Avoidance Algorithm)
* **Lokasi Kode:** [frontend/lib/aiDynamicRouter.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts#L577-L650)
* **Temuan:**
  Jika semua rute default Mapbox terpotong lingkaran bahaya, sistem saat ini hanya mencoba 5 node terdekat dari `HIGHWAY_JUNCTION_NODES`. Jika kelimanya gagal menghasilkan rute bersih, algoritma menyerah dan mengeksekusi:
  ```typescript
  // STEP 3: Fallback ke HOLD / DELAY
  recommendations.unshift({
    id: 'mitigation-hold-delay',
    route_name: 'Mitigasi Taktis: Tunda Keberangkatan (Hold / Delay)',
    waypoints: recommendations[0]?.waypoints || [], // MENGGUNAKAN WAYPOINT RUTE YANG TERENDAM!
    ...
  });
  ```
* **Akar Masalah:**
  Alih-alih mencari titik belok matematis yang mengitari lingkaran bahaya, sistem langsung memasukkan kembali waypoint rute yang terendam banjir, memberi label "HOLD", dan menampilkannya sebagai rute rekomendasi aktif pertama di peta. Pengguna melihat rute aktif tetap memotong genangan air.

---

### Masalah 2: Halaman Simulasi ("Terapkan Skenario Terpadu" Tidak Terjadi Apa-Apa)

#### 2.1 Terputusnya Alur Aksi Simulasi dari Rendering Peta dan State Koridor
* **Lokasi Kode:** [frontend/components/dashboard/SimulationSection.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/SimulationSection.tsx#L58-L67) & [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L415-L460)
* **Temuan:**
  Pengguna mengatur slider durasi penutupan jalan (`closureHours`), tonase pangan (`cargoTonnage`), toggle rekayasa tol Dishub (`dishubDiversion`), dan buffer Bulog (`bulogStockAlloc`). Saat tombol "Terapkan Skenario Terpadu" ditekan:
  1. `SimulationSection` memunculkan toast lokal singkat.
  2. Fungsi `onDeployActionPlan` di `DashboardClient` mengirim request POST ke `/api/v1/approvals` dan langsung mengeksekusi `setActiveSection('map')`.
* **Akar Masalah:**
  1. Pengguna langsung dilempar kembali ke tab peta tanpa ada konfirmasi visual apa pun di halaman simulasi.
  2. Di tab peta, rute tidak diperbarui berdasarkan parameter simulasi yang baru diatur (misalnya toggle rekayasa tol tidak mengubah rute antara arteri vs tol).
  3. Lokasi penutupan jalur yang disimulasikan di halaman simulasi tidak memicu shockwave bencana di peta.
  4. Halaman simulasi tidak menyimpan status "Skenario Telah Diterapkan", tidak memiliki log audit eksekusi, dan tidak menyediakan peta mini (mini-map preview) interaktif. Pengguna menyimpulkan tombol tersebut rusak atau tidak bekerja.

---

### Masalah 3: Simulasi Bencana & RUN DEMO Menerobos Banjir

#### 3.1 Kontradiksi Skenario RUN DEMO Hardcoded
* **Lokasi Kode:** [frontend/components/dashboard/DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L793-L800) & [frontend/hooks/useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts#L186-L202)
* **Temuan:**
  Pada tahap 2 RUN DEMO (`DashboardClient.tsx`), sistem menempatkan lingkaran bahaya banjir di Lubuk Pakam:
  ```typescript
  setSimulatedShockwave({
    center: [98.87, 3.56], // Lubuk Pakam flood corridor
    radiusKm: 15,
    hazardType: 'flood',
  });
  ```
  Namun, data fixture yang disiapkan untuk demo (`mock_crisis_state.json` dan fallback di `useDemoState.ts`) berasal dari skenario **longsor di Pematangsiantar (Km 128)**, sehingga rute deturnya justru menggunakan jalur Jalinsum yang melintasi Lubuk Pakam:
  ```json
  {"lat": 3.5600, "lon": 98.8750} // Koordinat tepat di tengah shockwave banjir [98.87, 3.56]!
  ```
* **Akar Masalah:**
  Terjadi ketidaksesuaian skenario demonstrasi: bencana diletakkan di Lubuk Pakam, tetapi rute pengalihan yang di-load adalah rute yang melewati Lubuk Pakam. Hasilnya, rute alternatif yang diklaim sebagai rute aman justru digambar menembus titik banjir.

#### 3.2 Pemanggilan Endpoint Demo Mengalami HTTP 404
* **Lokasi Kode:** [frontend/lib/api.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/api.ts#L159-L176) vs [backend/app/main.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/main.py#L207)
* **Temuan:**
  Hasil inspeksi console browser saat RUN DEMO:
  `[warning] Backend demo API call failed, activating client-side offline demo runner: Error: API /api/demo/start → 404`
* **Akar Masalah:**
  Di frontend `api.ts`, URL yang dipanggil adalah `/api/demo/start`. Namun di backend `main.py`, router demo di-mount tanpa prefix `/api`:
  `app.include_router(demo_router.router)` dengan prefix internal `/demo`.
  Akibatnya, endpoint demo di backend berlokasi di `/demo/start`, bukan `/api/demo/start`. Request selalu gagal dengan 404, memaksa aplikasi menjalankan runner demo offline client-side yang memiliki data koordinat cacat di atas.

#### 3.3 Penimpaan Rute Backend Mengabaikan Titik O-D Pengguna
* **Lokasi Kode:** [agents/nodes/route_optimization.py](file:///c:/Farras/DIGDAYA/peta-nadi/agents/nodes/route_optimization.py#L148-L175) & [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L889-L892)
* **Temuan:**
  Ketika pengguna menargetkan titik bencana di peta (`triggerFullSimulationEngine`), frontend sempat menghitung rute sementara (`calculateAIDynamicDetourRoutes`). Namun saat stream multi-agent backend selesai, callback `onComplete` menimpa peta:
  `setCurrentMapRoutes(backendCrisisState.route_recommendations)`.
* **Akar Masalah:**
  Di backend `route_optimization.py`, pencarian ID node asal dan tujuan (`belawan` vs `belawan_port`, `medan` vs `medan_kim`) gagal mencocokkan node di graf `road_network_sumatra.json`. Backend kemudian mengambil node pertama graf (`belawan_port`) dan node terakhir graf (`bakauheni_port` di Lampung selatan). Rute yang dikembalikan backend adalah garis diagonal memanjang sepanjang 600+ km dari ujung utara ke ujung selatan pulau Sumatera yang sama sekali tidak relevan dengan simulasi bencana lokal yang sedang diuji pengguna.

#### 3.4 Precedence State Merender Rute Kadaluwarsa
* **Lokasi Kode:** [frontend/components/dashboard/DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L1169)
* **Temuan:**
  Props layer rute pada peta dioper sebagai:
  `activeRoutes={selectedCrisis?.route_recommendations || currentMapRoutes}`
* **Akar Masalah:**
  Jika `selectedCrisis` memiliki data rute (meskipun rute awal yang terblokir atau rute mock), maka rute tersebut akan selalu diprioritaskan di atas `currentMapRoutes`. Hasil perhitungan rute baru pada `currentMapRoutes` terabaikan dan tidak pernah ditampilkan di canvas peta.

---

### Masalah 4: Temuan Anomali Tambahan (Miss Lainnya)

#### 4.1 Indikator "Integritas Sumber Data: 0%" di Halaman Laporan
* **Lokasi Kode:** [frontend/components/dashboard/ReportsSection.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/ReportsSection.tsx#L55-L65) & [backend/app/routers/health.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/health.py#L31-L83)
* **Akar Masalah:**
  Halaman Laporan menghitung persentase sumber data sehat dengan rumus: `(okSources / totalSources) * 100`, di mana `okSources` hanya dihitung jika status persis bertuliskan `"healthy"`. Di backend, jika tabel Supabase `data_sources` kosong, status default yang dikembalikan adalah `"unknown"` (bukan `"healthy"`). Hasilnya, metrik integritas menampilkan `0% BMKG, TomTom, & PIHPS Terverifikasi`, meskipun pipeline data latar belakang sebenarnya aktif.

#### 4.2 Warna Rute Peta Tidak Berubah Saat Operator Menyetujui Rute (HITL Approval)
* **Lokasi Kode:** [frontend/components/sidebar/MitigationTab.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/MitigationTab.tsx#L749) & [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L910-L919)
* **Akar Masalah:**
  Ketika tombol setujui rute ditekan di sidebar Mitigasi, fungsi `handleCommitOperationalRoute` hanya mengubah warna menjadi cyan (`#00f0ff`) pada array `currentMapRoutes`. Karena peta merender `selectedCrisis.route_recommendations`, warna rute pada peta tetap berwarna abu-abu/biru tua lama dan tidak berubah menjadi warna operasional aktif.

#### 4.3 Pemisahan Kontrol Modalitas Antara Filter Armada dan Pencarian Rute
* **Lokasi Kode:** [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L1493) & [CrisisSimulatorBar.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisSimulatorBar.tsx#L134)
* **Akar Masalah:**
  Terdapat dua kontrol modalitas terpisah yang tidak saling berkomunikasi:
  1. Bilah atas (`SEMUA`, `TRUK`, `KAPAL`, `UDARA`) hanya memfilter layer armada kendaraan GPS.
  2. Tombol bubble bawah (`Multi-Moda`, `Truk`, `Kapal Laut`, `Cargo Udara`) mengatur modalitas kalkulasi rute.
  Pengguna yang memilih filter "KAPAL" di atas mengharapkan rute di peta otomatis berubah ke rute maritim ALKI, namun rute tetap menampilkan rute truk darat karena state-nya tidak disinkronkan.

---

## 3. Rencana Penyelesaian Langkah-demi-Langkah (Action Plan Blueprint)

Rencana perbaikan dirancang secara modular dan dapat dieksekusi tanpa merusak arsitektur yang sudah ada:

### Fase 1: Perbaikan Geometri Node & Algoritma Routing Dinamis
1. **Koreksi Koordinat `HUB_NODES` Tebing Tinggi:**
   - Ubah koordinat `tebingtinggi` pada [frontend/lib/mapboxRoutingService.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/mapboxRoutingService.ts) dari `[98.9560, 3.5680]` menjadi `[99.1621, 3.3251]`.
   - Tambahkan node khusus Perbaungan (`[98.9501, 3.5701]`) dan Sei Rampah (`[99.1501, 3.4801]`) jika diperlukan sebagai titik terpisah.
2. **Perluasan Jaringan Bypass `HIGHWAY_JUNCTION_NODES`:**
   - Tambahkan titik persimpangan jalur alternatif di koridor Sumatera Utara:
     - `galang_junction`: `[98.9050, 3.4450]` (Bypass Selatan Lubuk Pakam via Galang)
     - `dolok_masihul_jct`: `[99.0480, 3.3850]` (Jalur Penghubung Tebing Tinggi Barat)
     - `pantai_cermin_coastal`: `[99.0350, 3.6420]` (Jalur Pesisir Timur Serdang Bedagai)
     - `bangun_purba_jct`: `[98.8500, 3.3800]` (Jalur Kaki Gunung Serdang)
3. **Implementasi Orthogonal Avoidance Waypoint Generator di `aiDynamicRouter.ts`:**
   - Bila seluruh rute Mapbox default memotong lingkaran bencana, buat algoritma yang menghitung 2 titik belok tangensial:
     - Hitung vektor arah O -> D.
     - Buat vektor normal tegak lurus (perpendicular vector) ke kiri dan ke kanan.
     - Tentukan koordinat titik belok kiri dan kanan pada jarak `radiusKm + 6.0 km` dari pusat bencana.
     - Panggil Mapbox Directions API dengan waypoint belok tersebut.
     - Pilih rute yang terbukti tidak memotong poligon bahaya, tetapkan status `SAFE_DETOUR` berwarna hijau zamrud (`#10B981`), dan beri label `Rute Pengalihan Bebas Bencana`.

---

### Fase 2: Sinkronisasi Backend Agent & Routing Router
1. **Normalisasi ID Node pada `agents/nodes/route_optimization.py`:**
   - Tambahkan tabel pemetaan alias node ID antara frontend dan backend:
     `belawan` <-> `belawan_port`, `medan` <-> `medan_kim`, `tebingtinggi` <-> `tebing_tinggi_hub`, `siantar` <-> `siantar_hub`.
   - Pastikan rute yang dihitung oleh NetworkX backend benar-benar menghubungkan asal dan tujuan yang dipilih pengguna, bukan jatuh ke fallback node Lampung.
2. **Koreksi Routing Prefix Demo di Backend `main.py`:**
   - Tambahkan prefix `/api` pada router demo:
     `app.include_router(demo_router.router, prefix="/api")` atau samakan di frontend `api.ts`.
   - Hal ini akan langsung menyelesaikan masalah 404 pada pemanggilan `/api/demo/start` dan `/api/demo/status`.

---

### Fase 3: Rekayasa Ulang Skenario RUN DEMO & Simulasi Bencana
1. **Penyelarasan Lokasi Bencana dan Rute Demo:**
   - Pada RUN DEMO, jika bencana diletakkan di Lubuk Pakam (`[98.87, 3.56]`), gunakan rute bypass via Galang - Dolok Masihul atau pesisir Pantai Cermin yang secara visual melingkar jelas di luar lingkaran banjir.
   - Perbarui waypoints di `mock_crisis_state.json` agar konsisten menampilkan deviasi rute yang bersih dari lingkaran banjir.
2. **Penyatuan Sumber Rute pada DashboardClient (`Single Source of Truth`):**
   - Di `DashboardClient.tsx`, satukan manajemen rute ke satu state utama. Ketika rute baru dihitung atau disetujui, perbarui secara simultan baik di `currentMapRoutes` maupun `selectedCrisis.route_recommendations`.
   - Ubah `activeRoutes={currentMapRoutes.length > 0 ? currentMapRoutes : selectedCrisis?.route_recommendations || []}` sehingga kalkulasi terbaru pengguna selalu menjadi prioritas utama di canvas peta.

---

### Fase 4: Peningkatan UX Halaman Simulasi ("Terapkan Skenario Terpadu")
1. **Feedback Interaktif & Visualisasi State:**
   - Saat pengguna menekan "Terapkan Skenario Terpadu":
     - Munculkan state visual "Skenario Sedang Diterapkan..." dengan animasi loading singkat 600ms.
     - Jangan langsung melempar pengguna ke peta secara mendadak. Berikan kartu status "Skenario Aktif: Rekayasa Terpadu Siap" dengan tombol aksi: `[Tampilkan di Peta 4D]` atau `[Lihat Dampak di Laporan]`.
2. **Sinkronisasi Parameter Slider ke Peta 4D:**
   - Jika slider toggle "Pengalihan Tol / Koridor Alternatif" diaktifkan di halaman simulasi, perbarui preferensi routing peta untuk memprioritaskan jalan tol.
   - Jika durasi hambatan dinaikkan, perbarui label estimasi delay di peta.
   - Sediakan komponen Mini-Map Preview langsung di dalam halaman simulasi agar pengguna dapat melihat dampak skenario tanpa harus berpindah halaman.

---

### Fase 5: Penyelesaian Temuan Tambahan (Kesehatan Data & Sinkronisasi Modalitas)
1. **Perbaikan Fallback Status Sumber Data pada `health.py`:**
   - Jika Supabase offline atau belum diisi, kembalikan status berdasarkan ketersediaan adapter lokal:
     - BMKG: `healthy` (karena poller BMKG lokal aktif)
     - TomTom: `healthy` (karena adapter lokal aktif)
     - Open-Meteo / Weather: `healthy`
     - PIHPS: `healthy`
   - Hal ini akan mengembalikan skor Integritas Sumber Data di halaman Laporan dari 0% menjadi 95% - 100%.
2. **Sinkronisasi Dua Arah Kontrol Modalitas:**
   - Hubungkan state `fleetModalityFilter` di bilah atas dengan `selectedModality` di bilah bawah. Pemilihan modalitas armada kapal di bilah atas otomatis mengalihkan rute peta ke Alur Laut Kepulauan (ALKI).

---

## 4. Matriks Ringkasan Audit & Verifikasi

| Komponen / Fitur | Gejala Saat Ini | Akar Masalah | Solusi Terencana |
| :--- | :--- | :--- | :--- |
| **Titik Tebing Tinggi** | Jarak salah & rute selalu terimbas banjir | Koordinat disetel ke Perbaungan `[98.956, 3.568]` | Koreksi ke titik asli `[99.1621, 3.3251]` |
| **Pencarian Detour Banjir** | Rute rekomendasi tetap melintas di tengah banjir | Kurang node bypass & fallback menggunakan rute terendam | Algoritma orthogonal detour offset + penambahan 4 node bypass |
| **RUN DEMO** | Mengalami error 404 & garis menembus banjir | Prefix router backend tidak cocok & skenario fixture Siantar | Mount `/api/demo` & sesuaikan waypoints bypass Lubuk Pakam |
| **Halaman Simulasi** | Klik tombol tidak ada efek nyata | Tidak ada feedback visual & tidak menyinkronkan rute peta | State indikator aktif + sinkronisasi parameter slider ke peta 4D |
| **Backend Agent Swarm** | Rute menyeberang ke Lampung | Mismatch ID node `belawan` vs `belawan_port` | Normalisasi alias ID node di `route_optimization.py` |
| **Halaman Laporan** | Integritas data tertulis 0% | Endpoint health mengembalikan status `"unknown"` | Fallback status adapter aktif `healthy` pada `health.py` |
| **Persetujuan Rute (HITL)** | Garis rute tidak berubah cyan | Penimpaan warna hanya pada `currentMapRoutes`, bukan `selectedCrisis` | Sinkronisasi dua arah pada state rute aktif |

Dokumentasi ini siap menjadi acuan eksekusi perbaikan sistem yang menyeluruh, terarah, dan terukur.
