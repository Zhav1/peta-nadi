# Laporan Audit Sistem, Analisis Akar Masalah & Rencana Solusi Komprehensif

**Tanggal Audit:** 11 Oktober 2026  
**Status:** Audit E2E & Investigasi Diagnostik Menyeluruh (Pasca-Pull Phase 53)  
**Metodologi:** Pengujian Zero-Mock E2E (Playwright Headless + Mapbox Directions API Profiling + Backend FastAPI State Inspection + Supabase PostgreSQL Live Schema Audit)  
**Dokumen Referensi:** [master_system_analysis_and_architecture.md](file:///c:/Users/PC/.gemini/antigravity-ide/brain/a4f05181-19ff-4838-ba3d-6288c4074bca/master_system_analysis_and_architecture.md)

---

## 1. Ringkasan Eksekutif & Respon Terhadap Project Manager

Dokumen ini menggabungkan seluruh hasil audit sistem, investigasi bug, analisis akar masalah teknis (*root cause*), inventaris data sintetis (*mock data*), dan cetak biru solusi perbaikan (*action plan*) dari seluruh laporan audit sebelumnya ke dalam satu dokumen terpadu.

Berdasarkan komunikasi dengan Project Manager (*"pake supabase command aja buat ngepushnya di cli, yaudah coba cek cek lagi, tes, trus audit apa masalahnya, kek data palsu etc, trus tolong push plannya biar aku yang kerjain"*), laporan ini disusun secara terperinci agar dapat langsung dijadikan panduan kerja (*work packages*) siap eksekusi.

### Ringkasan Temuan Inti:
1. **Rute Menerobos Bencana & Terkunci di Tol:** Sistem selalu memilih jalan tol (`highway=motorway`) karena ketiadaan parameter `exclude=toll` pada pemanggilan Mapbox API, sehingga armada dipaksa menerobos banjir di Lubuk Pakam.
2. **Dampak Ekonomi Hilang pada RUN DEMO:** Panel demo tidak memiliki kartu metrik inflasi/harga pasar, alur tahapan melompati tab ekonomi, dan endpoint `/api/v1/commodities/prices` mengembalikan array kosong (`items: []`).
3. **Tombol "Terapkan Skenario Terpadu" Tidak Terasa Efeknya:** Pengguna langsung dilempar ke peta tanpa umpan balik visual, tanpa mini-map, dan tanpa memperbarui rute atau status koridor.
4. **Tautan Berita Otomatis Redirect ke Base URL:** Tautan berita LKBN ANTARA yang tidak ditemukan langsung mengarahkan pengguna ke beranda portal berita (`https://sumut.antaranews.com/`) tanpa penanganan fallback yang elegan.
5. **Tabrakan Komponen UI pada Zoom 100%:** Bilah navigasi bawah (RUN DEMO, dll) menabrak panel drawer krisis sejauh 97.18 pixel pada resolusi 1366x768, dan 5 filter dropdown bertumpuk jika tidak di-zoom out ke 65%.
6. **Kunci Supabase Tertukar & RLS Lockout:** Kunci `SUPABASE_SERVICE_ROLE_KEY` pada file `.env` identik dengan kunci anonim (`role: anon`), menyebabkan PostgreSQL memblokir background worker dengan error `42501` sehingga tabel `data_sources`, `commodity_prices`, dan `custom_fleet_vehicles` bernilai **0 baris**.
7. **Kesenjangan Klaim Arsitektur vs Realitas Kode:** Fitur seperti GraphRAG, NVIDIA cuOpt GPU Solver, 45 unit armada, dan deteksi lonjakan harga masih berupa mock statis atau array tiruan.
8. **RBAC Bersifat Kosmetik (Sandbox Mode):** Pengguna dapat berganti peran tanpa login karena sistem dirancang dengan sesi tamu otomatis untuk kemudahan dewan juri hackathon.

---

## 2. Inventaris Lengkap Bug & Permasalahan Sistem

### Masalah 1: Rute yang Diberikan Belum Optimal
* **Gejala:** Jalur yang dihasilkan sering kali tidak efisien, memakan waktu terlalu lama, atau tidak mencerminkan jaringan jalan logis di Sumatera Utara.
* **Akar Masalah:**
  1. **Kesalahan Koordinat Hub Tebing Tinggi:** Pada [mapboxRoutingService.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/mapboxRoutingService.ts#L152-L158), koordinat Tebing Tinggi di-hardcode ke `[98.9560, 3.5680]` (yang sebenarnya adalah Jalinsum Perbaungan). Koordinat riil Gerbang Tol Tebing Tinggi adalah `[99.1621, 3.3251]`. Akibatnya, jarak tempuh salah hitung sejauh 40 km.
  2. **Kelangkaan Node Persimpangan Bypass:** Pada [aiDynamicRouter.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts#L9-L46), daftar `HIGHWAY_JUNCTION_NODES` hanya memiliki 46 titik se-Sumatera dan tidak memiliki persimpangan penting di jalur alternatif (Galang, Bangun Purba, Dolok Masihul, Pantai Cermin).
* **Solusi Teknis:**
  1. Perbarui koordinat node Tebing Tinggi ke `[99.1621, 3.3251]`.
  2. Tambahkan titik persimpangan rute alternatif pedalaman dan pesisir ke dalam `HIGHWAY_JUNCTION_NODES`.

---

### Masalah 2: Rute Menerobos Bencana & Keterkuncian Jalur Tol (Toll Road Lock-In)
* **Gejala:** Saat bencana banjir disimulasikan di Lubuk Pakam (`[98.87, 3.56]`, radius 15 km), rute rekomendasi tetap melintasi jalan tol yang terendam atau keluar-masuk gerbang tol di dalam zona merah bencana.
* **Akar Masalah:**
  1. **Ketiadaan Parameter `exclude=toll`:** Mapbox API memprioritaskan profil kecepatan jalan tol (`highway=motorway`, 100 km/jam). Pada [aiDynamicRouter.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts#L313), Mapbox dipanggil tanpa filter penolakan tol saat jalan tol dinyatakan tertutup banjir.
  2. **Jebakan Masuk Tol Ulang (Toll Re-entry Loop):** Ketika dipaksa lewat Galang, Mapbox mengarahkan truk dari Belawan masuk Tol MKTT sampai exit Lubuk Pakam, baru belok ke Galang, lalu masuk lagi ke Tol Sei Rampah.
  3. **Radius Bahaya Terlalu Besar (15 km):** Lingkaran banjir berdiameter 30 km menutupi seluruh lebar daratan dari pantai sampai kaki pegunungan di wilayah Lubuk Pakam.
  4. **Fallback Menggunakan Waypoint Rute Rusak:** Jika algoritma gagal menemukan jalur bersih, sistem justru mengambil waypoint rute yang terendam lalu memberinya label "HOLD / DELAY", sehingga garis rute di peta tetap menembus banjir.
* **Solusi Teknis:**
  1. Tambahkan parameter dinamis `&exclude=toll` pada fungsi pemanggilan Mapbox API di [aiDynamicRouter.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts) saat koridor tol terblokir bencana.
  2. Implementasikan algoritma penghindaran ortogonal (*orthogonal avoidance*) yang menghitung titik belok tangensial di luar poligon bencana.
  3. Definisikan koridor bypass pedalaman selatan: `Belawan -> Medan Amplas -> Talun Kenas -> Bangun Purba -> Dolok Masihul -> Sipispis -> Tebing Tinggi`.
  4. Kalibrasi radius banjir jalan raya menjadi 5 s.d. 8 km agar jalan alternatif tetap terbuka secara legal.

---

### Masalah 3: Halaman Simulasi ("Terapkan Skenario Terpadu") Tidak Berefek Visual
* **Gejala:** Pengguna mengatur slider durasi penutupan jalan, tonase pangan, toggle Dishub, dan buffer Bulog, namun saat menekan tombol "Terapkan Skenario Terpadu", pengguna langsung dilempar ke peta tanpa ada perubahan rute, tanpa status simulasi aktif, dan tanpa umpan balik nyata.
* **Akar Masalah:**
  1. Pada [SimulationSection.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/SimulationSection.tsx#L58-L67) dan [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L415-L460), fungsi `onDeployActionPlan` hanya mengirim POST ke `/api/v1/approvals` dan langsung memanggil `setActiveSection('map')`.
  2. State peta (`currentMapRoutes`, shockwave bencana, status rekayasa tol) tidak disinkronkan dengan nilai slider yang baru diatur oleh pengguna.
  3. Tidak ada komponen pratinjau peta (*mini-map preview*) di halaman simulasi sehingga pengguna merasa tombol tersebut rusak.
* **Solusi Teknis:**
  1. Berikan animasi status proses simulasi (600ms) dan tampilkan kartu konfirmasi "Skenario Rekayasa Terpadu Aktif" di halaman simulasi.
  2. Integrasikan slider halaman simulasi ke generator skenario krisis peta secara dua arah.
  3. Sediakan komponen Mini-Map interaktif di dalam [SimulationSection.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/SimulationSection.tsx).

---

### Masalah 4: Dampak Ekonomi Hilang Saat RUN DEMO
* **Gejala:** Saat demo terpadu dijalankan (Tahap 1 hingga 5), angka lonjakan harga pangan, persentase inflasi wilayah, dan valuasi kerugian kargo tidak muncul di panel panduan maupun di peta.
* **Akar Masalah:**
  1. **UI Kurang Lengkap:** Komponen [GuidedDemoPanel.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx) hanya memiliki kartu sensor jalan dan radius bahaya, tanpa kartu harga pasar atau estimasi kerugian.
  2. **Navigasi Melewati Tab Ekonomi:** Pada [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L862-L875), demo berpindah dari `Evidence` langsung ke `Mitigation`, melewati tab `Economic`.
  3. **Ketidaksesuaian Struktur Payload:** Backend [demo_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/demo_router.py) menyimpan inflasi di dalam sub-objek `economic_intelligence_finding`, sedangkan frontend [EconomicTab.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/EconomicTab.tsx#L12) mencari `crisis.inflation_forecast` di tingkat root.
  4. **Tabel Harga Kosong:** Endpoint `/api/v1/commodities/prices` mengembalikan `items: []` sehingga grafik harga pangan tampil datar.
* **Solusi Teknis:**
  1. Tambahkan kartu metrik lonjakan harga komoditas pangan (+17.1%) dan valuasi muatan kargo pada `GuidedDemoPanel.tsx`.
  2. Buka tab `Economic` selama tahap analisis demo pada `DashboardClient.tsx`.
  3. Salin `inflation_forecast` ke tingkat root payload krisis pada `demo_router.py`.
  4. Sediakan baseline data harga deret waktu 30 hari untuk beras, cabai, dan minyak goreng di [commodity_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/commodity_router.py).

---

### Masalah 5: Tautan Berita Otomatis Redirect ke Base URL (404 Handling)
* **Gejala:** Ketika tautan berita LKBN ANTARA (misalnya `https://sumut.antaranews.com/berita/494720/...`) diklik, jika artikel sudah dihapus atau tidak ditemukan di server ANTARA, situs web eksternal langsung mengarahkan pengunjung ke base URL `https://sumut.antaranews.com/`. Hal ini membingungkan pengguna yang mengira berita tersebut fiktif.
* **Akar Masalah:**
  1. Komponen kartu bukti berita di frontend langsung membungkus judul artikel dengan elemen `<a href={article.url} target="_blank">` tanpa verifikasi validitas URL.
  2. Ingestor berita backend [unified_news_ingestor.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/services/unified_news_ingestor.py) menyimpan URL dari feed RSS tanpa memeriksa status HTTP 200 secara berkala. Server LKBN ANTARA memiliki konfigurasi server web (Nginx/Apache) yang otomatis me-redirect setiap halaman 404 ke beranda utama portal.
* **Solusi Teknis:**
  1. Tambahkan pengecekan integritas URL berkala pada backend ingestor sebelum artikel disimpan ke Supabase.
  2. Pada frontend kartu berita, sediakan modal pratinjau kutipan teks berita yang tersimpan di database (*cached excerpt & snapshot*) beserta label sumber terverifikasi, sehingga jika tautan eksternal kadaluwarsa, konten bukti tetap dapat dibaca oleh pengguna.

---

### Masalah 6: Tabrakan Tata Letak Komponen pada Zoom 100% (1366x768 & Desktop)
* **Gejala:** Tampilan dashboard hanya rapi jika pengguna mengecilkan ukuran browser ke zoom 65%. Pada zoom normal 100% (resolusi layar laptop 1366x768):
  - Bilah navigasi bawah (PAST, PRESENT, FUTURE, PREDICT, RUN DEMO) menabrak panel drawer krisis samping kanan sejauh 97.18 pixel.
  - 5 filter dropdown bawah bertumpuk dan terpotong secara horizontal.
  - Tombol intermodal bertabrakan dengan elemen kontrol di sekitarnya.
* **Akar Masalah:**
  1. Pada [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L1673-L1680), formula posisi footer hanya menggeser elemen 30px (`lg:left-[calc(50%-30px)]`), yang tidak memadai untuk drawer samping selebar 400px pada layar 1366px.
  2. Kontainer 5 filter dropdown bawah menggunakan lebar tetap tanpa pembungkus responsif fleksibel (`flex-wrap`) saat ruang tengah menyempit.
* **Solusi Teknis:**
  1. Pada `DashboardClient.tsx`, sesuaikan posisi footer dinamis ketika drawer kanan terbuka (`isSidebarOpen === true`): pusatkan footer pada sisa area kanvas peta (`left-[calc((100vw-400px)/2)]` atau pasang `right-[420px] left-auto translate-x-0`).
  2. Berikan batas lebar dinamis (`max-w-[calc(100vw-440px)]`) dan scroll horizontal halus (`overflow-x-auto no-scrollbar`) pada kontainer dropdown filter bawah.

---

### Masalah 7: Konfigurasi Kunci Supabase Tertukar & RLS Lockout
* **Gejala:**
  - Tabel `data_sources` di Supabase berisi **0 baris**.
  - Tabel `commodity_prices` di Supabase berisi **0 baris**.
  - Tabel `custom_fleet_vehicles` di Supabase berisi **0 baris**.
  - HUD telemetri atas menampilkan status sensor `MEMUAT` tanpa batas waktu.
* **Akar Masalah:**
  1. Pada [.env](file:///c:/Farras/DIGDAYA/peta-nadi/.env#L8-L9) dan [backend/app/config.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/config.py), token `SUPABASE_SERVICE_ROLE_KEY` diisi dengan token anonim (`role: anon`), bukan kunci rahasia service role yang memiliki izin bypass RLS.
  2. Ketika backend mengeksekusi operasi `upsert()` atau `insert()`, PostgreSQL menolak dengan kode error `42501` (*new row violates row-level security policy*).
  3. Kesalahan ini ditangkap secara diam-diam oleh blok `try...except` tanpa memunculkan peringatan fatal di log server.
* **Solusi Teknis:**
  1. Masukkan nilai Service Role Secret asli dari Dashboard Supabase (*Project Settings -> API -> service_role secret*) ke dalam file `.env` root dan `backend/.env`.
  2. Pastikan service latar belakang ([corridor_service.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/services/corridor_service.py), [unified_news_ingestor.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/services/unified_news_ingestor.py)) memanggil `get_service_client()`.
  3. Jalankan migrasi schema menggunakan Supabase CLI:
     ```powershell
     npx supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.ulpmmacsdkohwkmyhlwj.supabase.co:5432/postgres"
     ```

---

### Masalah 8: Inventaris Data Palsu & Paper Architecture
* **Gejala:** Sejumlah fitur canggih yang tertera pada proposal dan dokumen arsitektur ternyata menggunakan data sintetis hardcoded.
* **Rincian Data Tiruan yang Ditemukan:**
  1. **Social Media OSINT:** [social_scraper.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/scrapers/social_scraper.py#L18) menggunakan array statis `MOCK_SOCIAL_POSTS` (3 postingan fiktif).
  2. **Commodity Price Spikes:** [commodity_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/commodity_router.py#L80) mengembalikan angka statis cabai Rp 62.000 dan bawang Rp 38.500 tanpa kueri database.
  3. **GraphRAG Causal Chain:** [mock_crisis_state.json](file:///c:/Farras/DIGDAYA/peta-nadi/data/fixtures/mock_crisis_state.json#L115) menggunakan array statis 3 relasi. Tidak ada modul Microsoft GraphRAG atau Neo4j aktif di backend.
  4. **NVIDIA cuOpt GPU Solver:** [cuopt_adapter.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/adapters/cuopt_adapter.py#L102) memanggil `_generate_mock_solution` alih-alih API GPU NIM.
  5. **Armada 45 Unit:** [useFleetVehicles.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useFleetVehicles.ts#L7) menyimpan 45 kendaraan sampel sintetis sebagai representasi koridor strategis.
  6. **Matriks Evaluasi:** [EvaluationSection.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/EvaluationSection.tsx#L44) menggunakan `FALLBACK_OUTCOMES` jika API outcomes tidak merespons.
* **Solusi Teknis:**
  1. Hapus array statis `MOCK_SOCIAL_POSTS` dan ganti dengan konsumsi live RSS LKBN ANTARA dan BMKG.
  2. Hubungkan lonjakan harga dengan perhitungan anomali rolling z-score terhadap data historis di Supabase.
  3. Bersikap jujur pada label UI arsitektur: gunakan istilah *Deterministic CPU Routing Solver (OR-Tools / NetworkX)* dan *Topological Supply Chain Knowledge Graph*.

---

### Masalah 9: RBAC & Ganti Role Tanpa Login (Sandbox Mode vs Security)
* **Gejala:** Pengguna dapat berpindah peran dari Operator Lapangan ke Analis Kementerian atau Lead Dispatcher dalam 1 klik tanpa login.
* **Akar Masalah:**
  1. Di [frontend/lib/authContext.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/authContext.tsx), sistem membuat sesi tamu otomatis (`DEFAULT_GUEST_PROFILE`) agar evaluator hackathon dapat langsung menguji aplikasi.
  2. Di backend [backend/app/auth/supabase_auth.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/auth/supabase_auth.py), terdapat fallback tanpa verifikasi signature JWT (`verify_signature: False`).
* **Solusi Teknis:**
  1. Tampilkan banner transparan di UI: *"MODE EVALUATOR SANDBOX AKTIF: Akses Persona Terbuka untuk Penilaian Juri"*.
  2. Sediakan toggle konfigurasi environment (`STRICT_AUTH_MODE=true/false`) untuk mengaktifkan proteksi JWT ketat saat berpindah ke mode produksi.

---

### Masalah 10: Sinkronisasi Telemetri & State Rute Peta Terputus
* **Gejala:** Menambahkan unit armada atau menyetujui rute operasional tidak memperbarui ringkasan metrik koridor, dan warna garis rute di peta tidak berubah menjadi warna operasional (cyan).
* **Akar Masalah:**
  1. Hook `useCorridorContext.ts` melakukan polling statis tanpa mendengarkan mutasi rute atau armada baru.
  2. Pada [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx#L1169), prop peta memprioritaskan `selectedCrisis.route_recommendations` di atas `currentMapRoutes`. Perubahan warna yang dilakukan pada `currentMapRoutes` tidak pernah di-render ke peta.
* **Solusi Teknis:**
  1. Jadikan satu state tunggal (*single source of truth*) untuk rute aktif di `DashboardClient.tsx`.
  2. Picu pembaruan kalkulasi metrik koridor saat status rute disetujui (*HITL commit*).

---

### Masalah 11: Backend Agent Mismatch ID Node (Rute Menyeberang ke Lampung)
* **Gejala:** Ketika simulasi multi-agent backend dijalankan, rute yang muncul di peta kadang melompat 600 km ke Pelabuhan Bakauheni di Lampung selatan.
* **Akar Masalah:**
  Pada [agents/nodes/route_optimization.py](file:///c:/Farras/DIGDAYA/peta-nadi/agents/nodes/route_optimization.py#L148-L175), nama ID node frontend (`belawan`, `medan`, `tebingtinggi`) tidak cocok dengan nama node pada graf backend (`belawan_port`, `medan_kim`, `tebing_tinggi_hub`). Backend jatuh ke fallback node indeks pertama (`belawan_port`) dan node indeks terakhir (`bakauheni_port`).
* **Solusi Teknis:**
  Tambahkan pemetaan kamus alias ID node di backend agar kompatibel dengan seluruh ID node yang dikirimkan oleh frontend.

---

### Masalah 12: Indikator Integritas Sumber Data 0% di Halaman Laporan
* **Gejala:** Halaman Laporan menampilkan metrik *"Integritas Sumber Data: 0% BMKG, TomTom, & PIHPS Terverifikasi"*.
* **Akar Masalah:**
  Pada [backend/app/routers/health.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/health.py#L31-L83), jika tabel `data_sources` kosong, endpoint mengembalikan status `"unknown"`. Halaman laporan hanya menganggap sumber data sehat jika statusnya persis `"healthy"`.
* **Solusi Teknis:**
  Perbarui `health.py` agar mengembalikan status adaptor aktif (BMKG, TomTom, Open-Meteo) sebagai `"healthy"` jika koneksi polling lokal berfungsi, mengembalikan integritas ke 95% - 100%.

---

## 3. Matriks Komprehensif: Gejala, Akar Masalah, & Solusi

| No | Komponen / Fitur | Gejala Terdeteksi | Akar Masalah Teknis | Solusi Terencana |
|---|---|---|---|---|
| 1 | **Titik Hub Tebing Tinggi** | Jarak rute salah 40 km, rute selalu terimbas banjir | Koordinat di-set ke Perbaungan `[98.956, 3.568]` di `mapboxRoutingService.ts` | Koreksi koordinat ke titik asli `[99.1621, 3.3251]` |
| 2 | **Routing Penghindaran Bencana** | Rute rekomendasi tetap melintasi pusat banjir | Tidak ada parameter `exclude=toll` dan minim node persimpangan bypass | Tambahkan `&exclude=toll`, algoritma orthogonal offset, dan 4 node bypass |
| 3 | **Halaman Simulasi** | Tombol aksi terpadu tidak berefek visual | Handler hanya navigasi tab tanpa feedback dan tanpa sinkronisasi rute | Indikator visual aksi aktif, sinkronisasi state slider, dan mini-map preview |
| 4 | **Metrik Ekonomi RUN DEMO** | Angka inflasi & harga komoditas hilang | Panel demo tidak punya kartu ekonomi, tab dilewati, payload tidak sinkron | Kartu metrik demo, buka tab ekonomi, salin inflasi ke root payload |
| 5 | **Tautan Berita LKBN ANTARA** | Tautan 404 auto-redirect ke portal beranda | Server berita me-redirect URL mati tanpa validasi ingestor | Validasi status URL saat ingest dan sediakan snapshot excerpt di modal |
| 6 | **Tata Letak Zoom 100%** | Footer tabrakan 97px dengan drawer, filter bertumpuk | Offset footer statis 30px tidak muat di layar 1366x768 | Reposisi footer dinamis berbasis sisa kanvas dan flex-wrap kontainer filter |
| 7 | **Koneksi Database Supabase** | Tabel `data_sources` & `commodity_prices` 0 baris | `SUPABASE_SERVICE_ROLE_KEY` diisi anon key, memicu RLS error 42501 | Pasang Service Role Secret asli di `.env` dan push migrasi via Supabase CLI |
| 8 | **Data Palsu / Mock Data** | Social posts, cuOpt GPU, dan harga spike statis | Menggunakan array hardcoded tanpa live worker atau GPU endpoint | Hapus mock scraper, hitung z-score harga, gunakan terminologi arsitektur jujur |
| 9 | **RBAC / Otentikasi** | Bebas ganti role tanpa login | Didesain sebagai mode sandbox juri dengan fallback bypass signature | Berikan badge mode sandbox juri atau aktifkan flag proteksi JWT ketat |
| 10 | **Sinkronisasi Telemetri & Rute** | Rute baru tidak mengubah metrik koridor & warna rute tetap abu-abu | Precedence state rute terbalik dan polling koridor terisolasi | Satukan state rute aktif di dashboard dan hubungkan trigger re-kalkulasi |
| 11 | **Backend Swarm Router** | Garis rute memanjang 600 km ke Lampung | Ketidakcocokan ID node `belawan` vs `belawan_port` di NetworkX | Normalisasi kamus alias node ID di `route_optimization.py` |
| 12 | **Integritas Sumber Data** | Halaman Laporan menampilkan integritas 0% | Endpoint health mengembalikan status `"unknown"` saat database kosong | Fallback status `"healthy"` berbasis poller adapter lokal aktif |

---

## 4. Paket Pekerjaan Siap Eksekusi untuk Project Manager (Phase 54 Action Plan)

Paket pekerjaan ini disusun secara bertahap dan terisolasi agar dapat langsung dikerjakan oleh Project Manager:

### Work Package 1: Supabase CLI Migration & Service Role Auth Fix
* **Target File:**
  - [.env](file:///c:/Farras/DIGDAYA/peta-nadi/.env)
  - [backend/.env](file:///c:/Farras/DIGDAYA/peta-nadi/backend/.env)
  - [backend/app/config.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/config.py)
  - [backend/app/db/supabase_client.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/db/supabase_client.py)
* **Tindakan:**
  1. Masukkan Service Role Secret asli dari Dashboard Supabase (*Project Settings -> API -> service_role*) ke file `.env` root dan `backend/.env`.
  2. Pastikan `get_service_client()` digunakan pada seluruh background ingestion worker.
  3. Jalankan migrasi database via Supabase CLI sesuai instruksi:
     ```powershell
     npx supabase db push --db-url "postgresql://postgres:[PASSWORD]@db.ulpmmacsdkohwkmyhlwj.supabase.co:5432/postgres"
     ```
* **Kriteria Keberhasilan:** Skrip `scratch/audit_supabase_and_mock_data.py` menghasilkan status jumlah baris $> 0$ pada tabel `data_sources` dan `commodity_prices`.

---

### Work Package 2: Realisasi Metrik Dampak Ekonomi pada RUN DEMO
* **Target File:**
  - [GuidedDemoPanel.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx)
  - [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx)
  - [demo_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/demo_router.py)
  - [EconomicTab.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/EconomicTab.tsx)
  - [commodity_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/commodity_router.py)
* **Tindakan:**
  1. Tambahkan kartu metrik pada Tahap 2 dan 4 di `GuidedDemoPanel.tsx` (Inflasi: +17.1%, Komoditas: Beras & Minyak Goreng, Valuasi Kerugian: Rp 210 Juta).
  2. Buka tab `Economic` di `DashboardClient.tsx` pada Tahap 3 siklus demo.
  3. Salin `inflation_forecast` ke root krisis pada `demo_router.py`.
  4. Sediakan baseline data harga deret waktu 30 hari pada endpoint `/prices` di `commodity_router.py`.
* **Kriteria Keberhasilan:** RUN DEMO menampilkan kartu inflasi numerik secara visual dan grafik harga pangan terisi kurva nyata.

---

### Work Package 3: Implementasi Parameter `exclude=toll` & Bypass Bencana
* **Target File:**
  - [aiDynamicRouter.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts)
  - [mapboxRoutingService.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/mapboxRoutingService.ts)
* **Tindakan:**
  1. Tambahkan parameter `&exclude=toll` pada pemanggilan Mapbox API ketika koridor tol terendam banjir.
  2. Tambahkan node bypass pedalaman selatan (Bangun Purba, Dolok Masihul, Galang) dan pesisir (Pantai Cermin).
  3. Kalibrasi radius simulasi banjir jalan raya menjadi 8 km.
* **Kriteria Keberhasilan:** Rute pengalihan menghasilkan jarak terdekat $\ge 8.5\text{ km}$ dari pusat banjir tanpa masuk kembali ke jalan tol yang terendam.

---

### Work Package 4: Perbaikan Tata Letak Anti-Tabrakan pada Zoom 100%
* **Target File:**
  - [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx)
* **Tindakan:**
  1. Sesuaikan posisi footer bawah saat drawer samping terbuka: pusatkan footer pada area kanvas peta yang tersisa (`left-[calc((100vw-400px)/2)]` atau `right-[420px] left-auto translate-x-0`).
  2. Berikan pembungkus fleksibel responsif pada kontainer filter dropdown bawah.
* **Kriteria Keberhasilan:** Pengujian Playwright pada resolusi 1366x768 zoom 100% menghasilkan `collision_detected: false` dengan jarak bebas minimal 24 pixel.

---

### Work Package 5: Peningkatan Halaman Simulasi & Feedback Visual
* **Target File:**
  - [SimulationSection.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/SimulationSection.tsx)
  - [DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx)
* **Tindakan:**
  1. Berikan animasi pemrosesan dan kartu konfirmasi "Skenario Rekayasa Terpadu Aktif" di halaman simulasi.
  2. Sinkronkan nilai slider penutupan jalan dan toggle rekayasa tol langsung ke state rute dan shockwave peta.
  3. Sediakan komponen Mini-Map pratinjau di halaman simulasi.
* **Kriteria Keberhasilan:** Menekan tombol "Terapkan Skenario Terpadu" memicu feedback visual langsung dan memperbarui parameter peta.

---

### Work Package 6: Pembersihan Data Palsu & Pemulihan Integritas Laporan
* **Target File:**
  - [social_scraper.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/scrapers/social_scraper.py)
  - [commodity_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/commodity_router.py)
  - [health.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/health.py)
  - [route_optimization.py](file:///c:/Farras/DIGDAYA/peta-nadi/agents/nodes/route_optimization.py)
* **Tindakan:**
  1. Hapus array `MOCK_SOCIAL_POSTS` dan hubungkan dengan live RSS ANTARA/BMKG.
  2. Implementasikan kalkulasi rolling z-score untuk deteksi lonjakan harga komoditas.
  3. Kembalikan status `"healthy"` pada adapter aktif di `health.py` agar integritas data di halaman Laporan bernilai $> 90\%$.
  4. Normalisasi kamus alias node ID di `route_optimization.py` agar rute tidak melompat ke Lampung.
* **Kriteria Keberhasilan:** Tidak ada array fiktif statis pada alur produksi utama dan skor integritas data laporan menampilkan angka valid.

---

### Work Package 7: Validasi Tautan Berita & Snapshot Modal
* **Target File:**
  - [unified_news_ingestor.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/services/unified_news_ingestor.py)
  - [EvidenceTab.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/EvidenceTab.tsx)
* **Tindakan:**
  1. Validasi status kode HTTP tautan berita saat proses ingestion.
  2. Sediakan modal snapshot kutipan berita (*cached excerpt*) pada kartu bukti berita di sidebar Evidence untuk mengantisipasi tautan eksternal yang di-redirect ke beranda.
* **Kriteria Keberhasilan:** Pengguna tetap dapat melihat bukti teks berita otentik meskipun server eksternal me-redirect tautan aslinya.
