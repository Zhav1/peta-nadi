# Laporan Audit Sistem & E2E Testing Terpadu: Investigasi Bug, Peran Multi-Tenant & Rekomendasi Solusi

**Tanggal Audit:** 13 Oktober 2026  
**Status Audit:** Audit Diagnostik E2E Playwright Headless + Inspeksi Endpoint FastAPI + Audit Supabase Auth RBAC  
**Dokumen Referensi:** [master_system_analysis_and_architecture.md](file:///c:/Users/PC/.gemini/antigravity-ide/brain/a4f05181-19ff-4838-ba3d-6288c4074bca/master_system_analysis_and_architecture.md), [STATE.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/STATE.md)  
**Artefak Bukti Pengujian:** [stage3_audit.png](file:///c:/Farras/DIGDAYA/peta-nadi/scratch/stage3_audit.png), [master_e2e_audit_report.json](file:///c:/Farras/DIGDAYA/peta-nadi/.e2e-artifacts/master-audit/master_e2e_audit_report.json)

---

## 1. Ringkasan Eksekutif & Status Progress Proyek (/gsd-progress)

### 1.1 Status Progress Proyek Saat Ini
Berdasarkan memori status kanonikal [.planning/STATE.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/STATE.md), repositori telah menyelesaikan Milestone M3 hingga **Phase 56 (Post-Audit Integrity Routing & Mock Purge)**:
- **Total Phase:** 56 dari 56 Phase tercatat selesai (*100% Milestone M3*).
- **Backend Build & Pytest:** 183 pengujian backend berstatus hijau (`pytest tests/`).
- **Frontend Build:** 0 kesalahan TypeScript (`npx tsc --noEmit`).

### 1.2 Temuan Lapangan Pasca-Pekerjaan Project Manager
Meskipun Project Manager telah menerapkan perbaikan tata letak anti-tabrakan 1366x768 dan penyesuaian endpoint pada Phase 54-56, serangkaian pengujian Playwright E2E mandiri pada seluruh 5 tab dan alur interaktif menemukan **7 kesenjangan sistemik dan logic bugs**:

1. **Bubble Notifikasi Tamu Tanpa Tombol Tutup & Ketiadaan Akun Demo Siap Pakai:**
   Banner mode evaluasi tamu terpaku di bagian atas layar tanpa tombol `X` (tutup), menghalangi interaksi, dan pengguna dipaksa masuk tanpa tersedianya akun demo resmi atau pemisahan akses peran armada logistik.
2. **Logic Bug Pemajuan Demo (Stage 0 Advance Blocker):**
   Pada [GuidedDemoPanel.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx#L436), tombol `Mulai Simulasi Disrupsi` memanggil `onAdvance()` bukannya `onStart()`. Karena `crisisId` masih kosong, fungsi `advance()` di [useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts#L223) langsung keluar tanpa memulai simulasi.
3. **Rute RUN DEMO Tahap 3 Memotong Lurus & Dampak Ekonomi Belum Muncul:**
   Pada Tahap 3/5 RUN DEMO, rute yang ditampilkan berupa garis diagonal kasar melintasi pesisir (*straight-line waypoint fallback*). Pada Tahap 5/5, rute jalan raya Mapbox telah memutar, namun tab *Dampak Ekonomi* menampilkan pesan kosong (*"Proyeksi inflasi belum diterbitkan"*).
4. **Panel Berita Kosong Saat Server Backend Tidak Terhubung / Cold Cache:**
   Sebanyak 60+ artikel berita LKBN ANTARA dan BMKG sebenarnya telah tersimpan di Supabase dan endpoint backend `/api/v1/news/live`. Namun ketika server backend belum dijalankan di port 8000 atau saat cold-cache scraper berjalan sinkron selama 25 detik, frontend mengalami timeout sehingga panel berita menampilkan *0 Sumber Terverifikasi* dan *"Tidak ada berita yang cocok"*.
5. **Error 403 / Failed to Fetch pada Halaman Simulasi Kebijakan:**
   Menekan tombol *"Terapkan Skenario Terpadu"* pada tab Simulasi memicu error `Failed to fetch` (jika backend mati) atau `API /api/v1/approvals -> 403 Forbidden` (karena peran tamu tidak memiliki izin `approvals:write`). Terdapat pula kebingungan pengguna mengenai perbedaan simulasi di halaman peta vs tab simulasi atas.
6. **Peringatan Performa GPU Stall pada Rendering WebGL:**
   Console browser mendeteksi peringatan pengemudi grafis: `GPU stall due to ReadPixels` pada canvas Mapbox saat pergantian mode kamera atau pembacaan frame.
7. **Aborsi Request Style Mapbox Dark-v11:**
   Pemeriksaan jaringan Playwright mencatat error `net::ERR_ABORTED` pada request style Mapbox saat navigasi tab cepat karena pemanggilan ulang style sebelum request sebelumnya selesai.

---

## 2. Analisis Mendalam Permasalahan & Temuan E2E (Root Cause Analysis)

### Masalah 1: Bubble Mode Tamu Tanpa Tombol Close & Desain Akun / Hak Akses Peran

#### A. Bukti Diagnostik Lapangan
* **Komponen:** [GuestEvaluationBanner.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/GuestEvaluationBanner.tsx#L9-L40)
* **Temuan E2E Playwright:**
  Banner memiliki selector `text="Mode Evaluasi Tamu (Belum Terautentikasi)"` dengan posisi `fixed top-16 z-[550]`. Di dalam kontainer banner hanya terdapat 1 tombol, yaitu tombol `Masuk / Daftar` yang memicu `openAuthModal()`. **Tidak ada tombol dismiss (X) atau opsi sembunyikan banner.**
* **Dampak:** Banner menutupi area kerja bagian atas secara permanen pada resolusi laptop, mengganggu navigasi tanpa cara untuk menutupnya.

#### B. Akar Masalah Akun Demo & Pemisahan Akses Peran (Multi-Tenant RBAC)
Pada [AuthModal.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/auth/AuthModal.tsx#L52-L58):
```tsx
const handlePersonaSelect = async (targetRole: UserRole) => {
  if (!isAuthenticated) {
    setStatusMessage({ type: 'error', text: GUEST_LOCK_MESSAGE });
    setActiveTab('password');
    return;
  }
  ...
}
```
Ketika pengguna tamu mengklik tombol persona evaluasi 1-klik, sistem menolak aksi tersebut dan melempar pengguna ke form login/password. Namun, di dalam database dan form tersebut, **tidak disediakan akun demo yang sudah terisi otomatis (pre-seeded credentials)**.

#### C. Matriks Hak Akses Peran & Isolasi Armada Logistik (Sesuai Arahan PM)
Sesuai arahan Project Manager (*"kalo misalnya dipake perusahaan logistik kan ga iya kalo bisa ngeliat truk perusahaan lain"*), berikut adalah desain arsitektur peran resmi PreHub:

| Peran (Role) | Entitas / Organisasi | Hak Akses Fitur Utama | Tampilan Khusus & Batasan Akses |
|---|---|---|---|
| **1. DISPATCHER LOGISTIK** | Perusahaan Logistik Mitra (PT Pos Logistik, Pelindo Belawan, JNE, ALFI Sumut) | - Peta Operasi<br>- Simulasi Rute Bypass<br>- Persetujuan Rute Darurat (`approvals:write`)<br>- Onboarding Armada Kustom | **Isolasi Armada Ketat (Tenant Isolation):**<br>Dispatcher PT Pos Logistik **hanya boleh melihat armada milik perusahaannya sendiri** (`company_id = 'pos_logistik'`). Truk milik kompetitor disembunyikan dari peta dan tabel telemetri untuk menjaga kerahasiaan kargo bisnis. |
| **2. REGULATOR PEMERINTAH** | Bapanas, Kemenhub, BKHIT, BMKG, Satgas Pangan Polri | - Peta Operasi (Makro)<br>- Analitik Disparitas Harga PIHPS<br>- Laporan Kabinet B2G (`reports:read`)<br>- Evaluasi Benchmark Akurasi | **Pandangan Holistik Pulau (Macro Overview):**<br>Regulator melihat status agregat seluruh koridor nasional Trans-Sumatera dan komoditas pangan pokok, namun tidak melakukan dispatching operasional armada harian. |
| **3. EVALUATOR SANDBOX (TAMU)** | Juri Kompetisi LRIP, Penguji Independen | - Eksplorasi Peta Interaktif<br>- RUN DEMO Terpadu<br>- Uji Skenario Bencana Lokal | **Mode Pratinjau Terpandu:**<br>Dapat menguji alur sistem tanpa mengubah data produksi riil di Supabase. Aksi persetujuan dieksekusi dalam mode sandbox lokal. |

---

### Masalah 2: Logic Bug Pemajuan RUN DEMO (Stage 0 Advance Blocker)

#### A. Bukti Diagnostik Lapangan
* **Komponen:** [GuidedDemoPanel.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx#L426-L440) dan [useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts#L223)
* **Temuan E2E Playwright:**
  Saat pengguna berada pada Tahap 1 (Stage index 0), tombol utama tertulis `Mulai Simulasi Disrupsi`.
  ```tsx
  <button onClick={() => onAdvance()}>
    {stage === 0 ? <span>Mulai Simulasi Disrupsi</span> : <span>Langkah Berikutnya</span>}
  </button>
  ```
  Handler memanggil `onAdvance()`, yang diteruskan ke `demoState.advance()`.
* **Akar Masalah:**
  Pada [useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts#L223):
  ```typescript
  const advance = useCallback(async () => {
    ...
    if (!crisisId) return; // KELUAR LANGSUNG KARENA CRISISID BELUM ADA!
  ```
  Karena demo belum diinisialisasi melalui `demoState.start()`, `crisisId` masih bernilai `null`. Akibatnya, pemanggilan `advance()` pada Stage 0 **berhenti tanpa melakukan apa pun**, dan demo tidak bergerak maju kecuali dipicu ulang secara eksternal.
* **Solusi:**
  Ubah handler tombol Stage 0 pada `GuidedDemoPanel.tsx` agar secara eksplisit memanggil `onStart()` saat `stage === 0`:
  ```tsx
  onClick={(e) => {
    if (stage === 0) {
      onStart({ origin: selectedOrigin, destination: selectedDestination });
    } else {
      onAdvance();
    }
  }}
  ```

---

### Masalah 3: Rute RUN DEMO Tahap 3 Memotong Lurus & Dampak Ekonomi Kosong

#### A. Bukti Diagnostik Lapangan
* **Tampilan Tahap 3:** Rute awal (garis hijau) berupa garis patah-patah melintang laut dan daratan, bukan garis jalan raya Mapbox.
* **Tampilan Tahap 5:** Rute jalan raya pengalihan (hijau bypass) telah aktif, namun kartu *Dampak Ekonomi* pada sidebar krisis menampilkan:
  `Proyeksi inflasi belum diterbitkan untuk krisis ini. Riwayat harga PIHPS belum tersedia.`
  Dan kartu bawah berbunyi:
  `Belum ada temuan ekonomi (proyeksi inflasi / preseden LTM) untuk skenario ini.`

#### B. Akar Masalah Teknis
1. **Waypoints Kasar pada Fallback State:**
   Pada [useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts#L187-L203), saat demo berjalan offline atau sebelum Mapbox API merespons, rute awal diisi oleh 10 koordinat statis:
   `[{ lat: 3.7922, lon: 98.6776 }, { lat: 3.7300, lon: 98.7200 }, { lat: 3.7300, lon: 98.8000 }...]`.
   Koordinat ini ditarik lurus antartitik sehingga membentuk garis diagonal kaku yang tidak mengikuti kontur jalan (*"rutenya ngasal"*).
2. **Ketiadaan Data Inflasi pada Demo State:**
   Pada [useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts#L172-L218), objek `setFullCrisisState` yang dibuat untuk mode demo **sama sekali tidak mendefinisikan field `inflation_forecast` dan `ltm_episodes`**.
3. **Ketidaksesuaian Struktur Root vs Nested:**
   Pada [EconomicTab.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/EconomicTab.tsx#L12), komponen membaca `crisis.inflation_forecast` langsung di tingkat root. Karena di root nilainya bernilai `undefined`, kartu proyeksi harga pangan dan estimasi kerugian logistik tidak di-render.
   Padahal, sesuai sifat RUN DEMO, data simulasi terpadu (proyeksi inflasi +17.1%, komoditas beras & minyak goreng, potensi kerugian kargo Rp 210 juta) harus selalu tampil utuh demi penilaian juri.

---

### Masalah 4: Panel Berita Kosong (0 Sumber Terverifikasi)

#### A. Bukti Diagnostik Lapangan
* **Gejala Pengguna:** Panel berita kiri menampilkan teks *"0 Sumber Terverifikasi"* dan *"Tidak ada berita yang cocok."*
* **Hasil Uji E2E Live:**
  Ketika backend FastAPI diaktifkan di port 8000, pemanggilan API `curl http://localhost:8000/api/v1/news/live` dan Playwright menghasilkan **60 artikel berita valid** dari LKBN ANTARA dan BMKG (termasuk berita banjir Aceh Timur dan kebijakan pangan).

#### B. Akar Masalah Teknis
1. **Server Backend Tidak Berjalan Saat Pengujian Pengguna:**
   Frontend Next.js berjalan di port 3000, tetapi backend FastAPI (`uvicorn app.main:app` pada port 8000) belum dihidupkan di latar belakang. Hook [useNewsVerification.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useNewsVerification.ts#L55-L60) memanggil `api.news.live()`, mengalami kegagalan koneksi (*network error*), lalu mengosongkan state `newsFeed: []`.
2. **Scraping Sinkron Saat Akses Awal (Cold Start Latency):**
   Pada [news_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/news_router.py#L55-L60), jika cache backend kosong, fungsi `get_live_news` memanggil `await unified_news_ingestor.run_ingestion_cycle()` secara sinkron di dalam thread request HTTP. Proses scraping 10 biro memakan waktu 20-30 detik sehingga browser pengguna dapat mengalami *request timeout* sebelum data sempat ditampilkan.

---

### Masalah 5: Error pada Halaman Simulasi & Perbedaan Dua Jenis Simulasi

#### A. Bukti Diagnostik Error
* **Tampilan Pengguna:** Toast merah berbunyi `Gagal Menerapkan Skenario: Failed to fetch`.
* **Hasil Log Console Playwright E2E:**
  `Failed to deploy unified action plan: Error: API /api/v1/approvals -> 403 Forbidden`
* **Akar Masalah:**
  1. Jika backend mati, browser memunculkan `Failed to fetch`.
  2. Jika backend aktif, fungsi `create_approval` di [approvals.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/approvals.py#L38-L47) memvalidasi izin operator:
     `if "approvals:write" not in current_user.permissions: raise HTTPException(403, detail="Akses ditolak: Hanya operator dengan wewenang 'approvals:write' (Dispatcher)...")`.
     Pengguna dalam mode Tamu atau Evaluator ditolak dengan status 403 karena tidak memiliki izin tersebut.

#### B. Perbedaan Mendasar Dua Fitur Simulasi dalam Sistem

| Aspek Komparasi | 1. Simulasi Bencana Taktis Koridor (Peta Operasi / Bilah Bawah) | 2. Simulasi Kebijakan Terpadu (Tab Atas "Simulasi") |
|---|---|---|
| **Lokasi Antarmuka** | Bilah kontrol dock bawah pada kanvas peta 3D (*Peta Operasi*). | Tab navigasi atas (*Peta Operasi \| Analitik \| Simulasi \| Laporan \| Evaluasi*). |
| **Tingkat Fokus** | **Mikro-Spasial (Taktis Operasional):** Titik bencana fisik dan rute truk spesifik. | **Makro-Kebijakan (Lintas Instansi B2G):** Koordinasi mitigasi dampak bencana pada skala pulau. |
| **Parameter Input** | - Titik Asal & Tujuan (O-D pair, misal Belawan ke Tebing Tinggi)<br>- Tipe Bencana (Banjir, Longsor, Macet)<br>- Radius Bahaya (5 km, 8 km, 15 km, 25 km) | - Durasi penutupan jalan (jam)<br>- Tonase bahan pangan terancam (ton)<br>- Toggle rekayasa tol Dishub<br>- Alokasi cadangan pangan BULOG |
| **Output / Dampak** | - Lingkaran shockwave bencana di peta<br>- Perhitungan rute bypass Mapbox (menghindari genangan air via jalan arteri/pantai)<br>- Estimasi pertambahan jarak (km) dan waktu tempuh (menit) | - Rencana Aksi Terpadu (*Unified Action Plan*) untuk instansi gabungan<br>- Alokasi stok penyangga beras dari gudang BULOG terdekat<br>- Rekayasa pembatasan tarif tol untuk truk logistik sembako |
| **Peran yang Berwenang** | Dispatcher Armada, Pengemudi Truk, Penguji Demo | Tim Gabungan Kementerian (Bapanas, Kemenhub, Dishub, BULOG) |

---

### Masalah 6: Peringatan GPU ReadPixels Stall pada WebGL Canvas

#### A. Bukti Diagnostik Lapangan
Log konsol Chromium menangkap pesan berulang dari pengemudi grafis:
`[.WebGL-0x99402185a00]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels`
#### B. Akar Masalah Teknis
Terjadi ketika thread JavaScript meminta data piksel langsung dari buffer GPU (misalnya pada operasi `canvas.toDataURL()` atau pembacaan warna piksel interaktif) saat WebGL sedang melakukan rendering 60 FPS layer Deck.gl / Mapbox.
#### C. Solusi Teknis
Batasi frekuensi pembacaan raster dan hindari pemanggilan sinkron `getImageData` atau `toDataURL` pada loop animasi utama.

---

## 3. Rencana Solusi & Perbaikan Terstruktur (Actionable Blueprint)

### Solusi 1: Pembenahan Banner Tamu & Akun Demo Multi-Tenant
1. **Tambahkan Tombol Tutup (X) pada [GuestEvaluationBanner.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/GuestEvaluationBanner.tsx):**
   - Tambahkan state `isDismissed` yang disimpan ke `sessionStorage`.
   - Tambahkan tombol ikon `X` di sudut kanan banner sehingga pengguna dapat menutup bubble notifikasi kapan saja.
2. **Sediakan Akun Demo 1-Klik Siap Pakai di [AuthModal.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/auth/AuthModal.tsx):**
   - Sediakan tombol pintas login instan dengan kredensial bawaan:
     - `dispatcher@poslogistik.co.id` (Peran: Dispatcher Logistik, Perusahaan: PT Pos Logistik Indonesia)
     - `regulator@bapanas.go.id` (Peran: Regulator Pemerintah, Badan Pangan Nasional)
     - `evaluator@kompetisi-lrip.id` (Peran: Evaluator Sandbox)
3. **Penerapan Isolasi Armada (Company Tenant Filtering):**
   - Pada [useFleetVehicles.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useFleetVehicles.ts), tambahkan filter berbasis profil pengguna: jika `user.role === 'DISPATCHER'`, tampilkan hanya armada yang memiliki `company_id === user.org_id`. Jika `user.role === 'REGULATOR'` atau `GUEST`, tampilkan seluruh armada koridor strategis.

---

### Solusi 2: Penyempurnaan Rute, Logic Advance & Data Ekonomi RUN DEMO
1. **Koreksi Handler Pemajuan Stage 0 di [GuidedDemoPanel.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/demo/GuidedDemoPanel.tsx):**
   - Pastikan klik tombol Stage 0 mengeksekusi `onStart()` untuk menginisialisasi `crisisId` sebelum beralih ke `onAdvance()`.
2. **Gunakan Rute Jalan Asli pada Tahap 1 s.d. 3 Demo:**
   - Pada [useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts), ganti array waypoint kasar dengan rute jalan raya resmi (koridor Belawan - Medan - Tebing Tinggi) sehingga tidak ada lagi garis lurus yang memotong perairan/daratan secara sembarangan.
3. **Lengkapi Data Mock Ekonomi pada Demo State:**
   - Masukkan struktur `inflation_forecast` dan `ltm_episodes` secara lengkap ke dalam fallback crisis state di [useDemoState.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useDemoState.ts):
     ```typescript
     inflation_forecast: {
       headline_inflation_pct: 17.1,
       confidence_pct: 91,
       top_risk_commodities: [
         { name: 'Minyak Goreng Curah', price_jump_pct: 18.4, current_price: 16500, projected_price: 19500 },
         { name: 'Beras Medium BULOG', price_jump_pct: 15.2, current_price: 13500, projected_price: 15500 }
       ],
       spoilage_risk_idr: 230873,
       cargo_loss_valuation_idr: 210000000
     }
     ```
   - Pastikan field ini disalin ke root krisis agar [EconomicTab.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/sidebar/EconomicTab.tsx) dan kartu panel demo langsung menampilkan angka dampak inflasi dan grafik harga secara visual.

---

### Solusi 3: Stabilisasi Konsumsi Berita & Asynchronous Ingestion
1. **Jalankan Ingestion di Latar Belakang (Non-Blocking):**
   - Pada [news_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/news_router.py), ubah pemanggilan `run_ingestion_cycle()` menjadi background task via `asyncio.create_task()`.
   - Endpoint `GET /api/v1/news/live` harus segera mengembalikan data yang ada di database Supabase tanpa membuat browser pengguna menunggu proses scraping eksternal selesai.
2. **Sediakan Fallback Berita Offline di Frontend:**
   - Pada [useNewsVerification.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/hooks/useNewsVerification.ts), jika API backend tidak dapat dihubungi, jangan biarkan array berita kosong. Gunakan data baseline 8 artikel berita terverifikasi LKBN ANTARA/BMKG yang sudah tersimpan di cache lokal sehingga dashboard tidak pernah terlihat kosong.

---

### Solusi 4: Perbaikan Alur Simulasi Kebijakan & Toleransi Peran Tamu
1. **Dukungan Mode Sandbox pada Eksekusi Skenario:**
   - Pada [approvals.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/approvals.py), jika `current_user.role === 'GUEST'`, jangan kembalikan error `403 Forbidden`. Alihkan ke logging lokal atau catat sebagai `SANDBOX_APPROVAL` dengan flag simulasi aktif.
   - Hal ini memungkinkan juri dan penguji mengevaluasi tombol *"Terapkan Skenario Terpadu"* tanpa harus login akun resmi.
2. **Pemberian Edukasi Kontekstual di Halaman Simulasi:**
   - Tambahkan kartu panduan singkat di bagian atas [SimulationSection.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/SimulationSection.tsx) yang menjelaskan secara tegas bahwa halaman ini adalah simulator kebijakan makro antar-instansi (Bapanas, Kemenhub, Dishub, BULOG), berbeda dari simulasi rute taktis armada pada peta utama.

---

## 4. Matriks Ringkasan Audit E2E & Tindak Lanjut

| No | Gejala Masalah | Status Pengujian E2E | Akar Masalah Utama | Tindak Lanjut Perbaikan |
|---|---|---|---|---|
| 1 | Bubble Tamu tanpa tombol close & akun demo tidak ada | **TERKONFIRMASI** | Tidak ada handler dismiss di `GuestEvaluationBanner.tsx` dan tidak ada kredensial demo di `AuthModal.tsx`. | Tambahkan tombol dismiss `X` dan tombol 1-klik akun demo peran terpisah (Dispatcher vs Regulator vs Tamu). |
| 2 | Stage 0 Demo Button macet / logic advance blocker | **TERKONFIRMASI** | Tombol `Mulai Simulasi Disrupsi` memanggil `onAdvance()` padahal `crisisId` masih null. | Ubah klik Stage 0 agar memanggil `onStart()` untuk menginisialisasi session demo. |
| 3 | RUN DEMO Tahap 3 rute ngasal & ekonomi kosong | **TERKONFIRMASI** | Waypoints offline berupa 10 titik kasar dan objek krisis demo tidak memiliki field `inflation_forecast`. | Terapkan polyline rute jalan asli pada awal demo dan masukkan payload inflasi (+17.1%) lengkap pada mock demo. |
| 4 | Berita kosong (0 Sumber Terverifikasi) | **TERKONFIRMASI (Saat backend mati / cold timeout)** | Server backend port 8000 belum menyala saat pengujian lokal dan endpoint scraping memblokir request awal. | Pastikan backend berjalan, ubah scraping menjadi background task asinkron, dan sediakan fallback lokal. |
| 5 | Error 403 / Failed to fetch di tab Simulasi | **TERKONFIRMASI** | Backend menolak peran tamu dengan HTTP 403 pada `/api/v1/approvals`, serta backend mati memicu Failed to fetch. | Izinkan penyimpanan persetujuan mode sandbox untuk peran tamu dan berikan kartu edukasi fungsi simulasi. |
| 6 | Isolasi armada untuk perusahaan logistik | **ANALISIS VALID** | Belum ada pemfilteran `company_id` pada hook armada; semua 45 kendaraan saat ini tampil ke seluruh peran. | Tambahkan filter kepemilikan armada: Dispatcher PT Pos Logistik hanya melihat truk Pos Logistik; Regulator melihat semua. |
| 7 | GPU Stall & Style Abort pada WebGL | **TERDOKUMENTASI** | Operasi synchronous raster querying pada WebGL dan re-request style Mapbox saat navigasi cepat. | Debounce style loading dan isolasi rendering canvas dari blocking calls. |

Laporan hasil audit menyeluruh dan cetak biru solusi ini telah tersimpan dan siap digunakan sebagai panduan eksekusi perbaikan sistem.

---

## 5. Laporan Implementasi & Verifikasi Track B (Phase 57)

Fokus Pekerjaan Track B: Ketahanan Backend (*Backend Resilience*), Penegakan Multi-Tenancy Armada (*Fleet Tenancy Enforcement*), Penguatan Otentikasi Akun Pilot (*Pilot Auth Hardening*), dan Konsumsi Berita Asinkron Tanpa Hambatan (*Non-Blocking News Ingestion*).

Seluruh implementasi Track B mematuhi guardrail integritas Phase 56 & Phase 57: tanpa mock resurrection, tanpa em dashes, validasi strict RBAC, dan tanpa rekayasa data palsu (*zero fake figures*).

### Ringkasan Eksekusi per Work Package:

1. **WP-B1: News Non-Blocking Ingestion (Keputusan D5)**
   - **Diagnosis**: Endpoint `GET /api/v1/news/live` mengeksekusi `await unified_news_ingestor.run_ingestion_cycle()` secara synchronous di dalam request handler, memicu blocking I/O dan timeout 20-30 detik pada kondisi cold start.
   - **Perubahan Kode**:
     - `backend/app/routers/news_router.py`: Diterapkan FastAPI `BackgroundTasks` dan concurrency lock `_ingestion_lock` / `_is_ingesting` untuk mencegah stampede request paralel.
     - Mode Cold Start: Mengembalikan status jujur `"warming"` secara instan (<1s) dengan `articles: []` dan pesan informatif, tanpa menyuntikkan artikel palsu. Ingestion scraper berjalan di latar belakang.
     - Mode Normal: Mengembalikan data live dari database Supabase / in-memory cache secara instan.
     - `frontend/hooks/useNewsVerification.ts`: Menerima status `"warming"` dan `"live"` serta timestamp `last_updated`, mempertahankan integritas honest loading tanpa fallback artikel tiruan.
   - **Bukti Pengujian**: 13 unit tests di `backend/tests/test_news_pipeline.py` dan router test di `test_api_routers.py` lulus 100%.

2. **WP-B2: Pilot Auth Hardening & Metadata Perusahaan (Keputusan D2/D3)**
   - **Diagnosis**: Registrasi publik mandiri sebelumnya mengizinkan pengguna memilih peran `DISPATCHER` secara bebas tanpa otorisasi institusi logistik.
   - **Perubahan Kode**:
     - `backend/app/auth/supabase_auth.py`: Model `UserSession` diperluas dengan field `company_id`. Pemetaan default `DEFAULT_ROLE_COMPANIES` (`pos_logistik`, `bapanas`, `demo_sandbox`) disematkan. Fungsi `create_guest_token` dan `decode_and_verify_token` mempropagasi klaim `company_id` dari JWT `app_metadata` / `user_metadata`.
     - `backend/app/routers/auth_router.py`: Endpoint `/api/v1/auth/me`, `/session`, dan `/guest-session` mendukung input dan serialisasi `company_id`.
     - `frontend/components/auth/AuthModal.tsx` & `frontend/lib/authContext.tsx`:
       - Menutup self-grant `DISPATCHER` terbuka: Pendaftaran mandiri baru otomatis berstatus `GUEST` (Sandbox preview).
       - Menambahkan selector institusi mitra pilot (`pos_logistik`, `pelindo_belawan`, `jne_sumut`, `bapanas`, `kemenhub`, `demo_sandbox`) yang dikirimkan melalui `options.data.company_id` saat registrasi Supabase Auth.
       - Menampilkan catatan tata kelola bahwa wewenang operasional penuh memerlukan undangan resmi atau persetujuan operator.
   - **Bukti Pengujian**: 28 unit tests di `backend/tests/test_auth_rbac.py` lulus 100%, memverifikasi integritas RBAC dan propagasi tenancy `company_id`.

3. **WP-B3: Fleet Tenancy Enforcement (Keputusan D3)**
   - **Diagnosis**: Seluruh 45 kendaraan baseline tampil ke semua pengguna tanpa filter kepemilikan armada korporasi.
   - **Perubahan Kode**:
     - `backend/app/services/telemetry_service.py`: Baseline 45 unit armada ditandai tenancy secara deterministik (`pos_logistik`, `jne_sumut`, `pelindo_belawan`, `bapanas`). Method `get_unified_fleet` menerima filter `company_id` untuk menyaring armada kustom SQLite dan armada baseline.
     - `backend/app/routers/vehicles_router.py`: Endpoint `/api/v1/fleet/vehicles` menerima query `company_id` dan secara otomatis membatasi data armada bagi pengguna dengan peran `DISPATCHER` ke `company_id` miliknya. Peran `REGULATOR` dan `GUEST` tetap melihat armada koridor makro (45 unit).
     - `backend/app/routers/fleet_ingest_router.py`: Normalisasi `company_id` pada registrasi armada perorangan dan impor manifest CSV batch.
     - `frontend/lib/api.ts` & `frontend/hooks/useFleetVehicles.ts`: Mengirimkan parameter `company_id` ke API secara dinamis berdasarkan profil pengguna aktif.
   - **Bukti Pengujian**: 7 unit tests di `backend/tests/test_vehicles_telemetry.py` dan 9 tests di `test_fleet_ingest.py` lulus 100%.

### Verifikasi Gerbang Kualitas (Verification Gate):
- **Backend Test Suite**: 191/191 tests passed (`pytest backend/tests`).
- **Frontend Type Safety**: `npx tsc --noEmit` exited cleanly dengan 0 error.
- **Frontend Production Build**: `npm run build` sukses 100% tanpa kompilasi gagal.
- **Integritas Gaya Bahasa**: Zero em dashes di seluruh berkas kode dan dokumentasi.
- **Isolasi Track A**: Seluruh file milik rekan kerja (Track A) tidak tersentuh sama sekali.

---

## 6. Audit Lanjutan Pasca-Pengujian Pengguna (Temuan E2E Sesi 14 Oktober 2026)

Dokumentasi lengkap dan mendalam telah dikompilasi pada berkas tersendiri: [PILOT_BUGS_AND_E2E_AUDIT_REPORT.md](file:///c:/Farras/DIGDAYA/peta-nadi/PILOT_BUGS_AND_E2E_AUDIT_REPORT.md).

### Ringkasan 3 Masalah Kritis Pengoperasian:

1. **Autentikasi & Tampilan Profil Pengguna (RBAC UX):**
   - **Gejala**: Pengguna yang sudah masuk (misal: `regulator@bapanas.go.id`) mendapati klik pada lencana header kanan atas tetap membuka form input email/kata sandi login, bukannya Kartu Profil Pengguna aktif.
   - **Kebocoran Peran**: Pengguna korporat resmi masih dapat berpindah peran via tab "1-Klik Persona", padahal peralihan instan hanya untuk evaluator sandbox.
   - **Ketiadaan Visual Terkunci**: Pengguna Tamu (GUEST) atau Regulator tidak melihat indikator gembok pada fitur yang dibatasi (seperti tombol Onboard Armada dan persetujuan rute operasional).

2. **Kegagalan Jalur Rute Run Demo & Ketiadaan Dampak Ekonomi:**
   - **Gejala**: Pada tahap 2 dan 3, rute berupa 4 titik garis lurus kasar melintasi daratan (`buildHazardBypassRoute`). Backend memetakan rute hingga ke Duri, Riau (457 km) meski pengguna memilih Belawan ke Tebing Tinggi karena skema Pydantic `StartDemoPayload` tidak membaca parameter simpul asal dan tujuan.
   - **Dampak Ekonomi Kosong**: Tab Dampak Ekonomi tidak menampilkan estimasi nilai karena aturan sanitasi D6 memutus aliran data model ekonometrika pada fallback demo.

3. **Anomali Sakelar Mode Simulasi Armada:**
   - **Gejala**: Mematikan sakelar "Mode Simulasi" memunculkan notifikasi mati, tetapi 45 kendaraan sintetis tetap aktif di peta.
   - **Akar Masalah**: `useFleetVehicles.ts` selalu menerima 45 armada baseline dari backend tanpa menyaring status simulasi, dan perubahan state sakelar tidak memicu pembaruan armada yang ditampilkan.
