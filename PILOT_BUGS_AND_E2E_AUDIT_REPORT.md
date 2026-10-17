# Laporan Komprehensif Audit E2E: Investigasi Bug Hak Akses, Kegagalan Rute Run Demo, Anomali Simulasi Armada, dan Evaluasi Antarmuka Sistem

**Tanggal:** 14 Oktober 2026  
**Status Audit:** Audit Mendalam Hasil Pengujian Pengguna & Pengujian Otomatis E2E Playwright  
**Dokumen Terkait:** [SYSTEM_AUDIT_AND_ROOT_CAUSE_ANALYSIS.md](file:///c:/Farras/DIGDAYA/peta-nadi/SYSTEM_AUDIT_AND_ROOT_CAUSE_ANALYSIS.md), [57-WALKTHROUGH.md](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/phases/57-pilot-hardening-e2e-audit-remediation/57-WALKTHROUGH.md)

---

## 1. Ringkasan Eksekutif Temuan Pengujian

Berdasarkan pengujian mandiri pengguna serta eksekusi otomatis E2E Playwright mendalam (`scratch/deep_e2e_audit.js` dan `scratch/extended_e2e_audit.js`), teridentifikasi 9 masalah sistemik kritis dan anomali logika:

1. **Bug 1 (Pemblokir Interaksi Kritis): `GuestEvaluationBanner` Menimpa dan Memblokir HUD Kontrol Atas**
   * Spanduk evaluasi tamu berada di koordinat `fixed top-16 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-3xl pointer-events-auto`.
   * Spanduk ini secara fisik menutupi dan mengintersepsi event klik pada tombol kontrol navigasi utama (`HITL REVIEW`, `RUTE`, `LALULINTAS`, `BMKG`, dan tombol modalitas), menyebabkan pengujian otomatis maupun pengguna manusia mengalami freeze atau timeout hingga 30 detik saat mencoba berinteraksi dengan kontrol atas.

2. **Bug 2: Ketiadaan Kartu Profil Pengguna Saat Sesi Telah Terautentikasi**
   * Pengguna yang telah berhasil masuk (seperti `regulator@bapanas.go.id`) mendapati bahwa mengklik lencana profil/peran di pojok kanan atas kembali menampilkan form login tab "Password" dengan input email dan kata sandi, bukan kartu informasi profil pengguna aktif.
   * `AuthModal` tidak memiliki percabangan tampilan profil ketika `isAuthenticated === true`.

3. **Bug 3: Kebocoran Fitur Peralihan Persona 1-Klik bagi Akun Resmi Korporat**
   * Pengguna terautentikasi resmi masih diberikan opsi berpindah peran (1-Klik Persona ke DISPATCHER atau GUEST) tanpa batas.
   * Dalam tata kelola multi-tenant yang aman, perpindahan persona hanya boleh diakses oleh akun tamu sandbox/evaluator. Akun instansi resmi wajib dikunci sesuai klaim token JWT.

4. **Bug 4: Ketiadaan Indikator Visual Fitur Terkunci (Locked State) bagi Pengguna Non-Dispatcher**
   * Tombol *Onboard Armada* dan tombol eksekusi mitigasi di sidebar tidak memiliki penanda visual gembok atau badge `[Khusus Dispatcher]`.
   * Akibatnya, pengguna Tamu atau Regulator dapat mengisi seluruh form pendaftaran armada dan baru menerima pesan penolakan HTTP 403 setelah form dikirimkan, membingungkan pengguna mengenai batasan hak aksesnya.

5. **Bug 5: Kegagalan Logika & Geometri Rute Run Demo (Rute Garis Lurus & Salah Simpul)**
   * Rute alternatif tahap 2 demo dirender menggunakan fungsi `buildHazardBypassRoute` yang hanya menghasilkan 4 koordinat garis lurus memotong daratan dan rawa di udara, tanpa mengikuti koridor jalan raya Pulau Sumatera.
   * Koordinat rute demo offline pada `useDemoState.ts` dan fixture `mock_crisis_state.json` berakhir di latitude `2.9595` dan longitude `99.0687` (wilayah Danau Toba / Parapat), padahal pengguna memilih simpul tujuan Tebing Tinggi (`3.3285, 99.1625`).
   * Endpoint backend `POST /api/v1/demo/start` tidak menerima parameter `origin` dan `destination`, sehingga selalu memuat skenario baku yang mengarah ke Duri, Riau.

6. **Bug 6: Data Dampak Ekonomi Kosong pada Mode Demo**
   * Tab Dampak Ekonomi menampilkan keterangan kosong tanpa data proyeksi, karena proses sanitasi mock data menghapus payload ekonometrika di sisi klien.
   * Padahal backend memiliki model ekonometrika terkalibrasi (+15% lonjakan harga minyak goreng, penghematan Rp 1.045.284 melalui penahanan laju armada) yang seharusnya disalurkan ke antarmuka.

7. **Bug 7: Anomali Sakelar Mode Simulasi Armada (45 Truk Tetap Tampil Saat Dimatikan)**
   * Menekan sakelar *Mode Simulasi* memicu pesan toast "Mode Simulasi dimatikan", namun 45 armada dasar (truk, kapal, dan pesawat) tetap terpampang di peta.
   * Di dalam `useFleetVehicles.ts`, evaluasi `res.vehicles.length > 0` selalu bernilai benar sehingga state armada tidak pernah difilter saat sakelar simulasi dimatikan.

8. **Bug 8: Perulangan Polling 404 Tanpa Batas pada Pengendali Jarak Jauh (/demo-remote)**
   * Halaman `/demo-remote` secara agresif melakukan polling ke `/api/v1/demo/belawan-demo-offline/status` setiap 2 detik.
   * Ketika sesi demo belum dimulai di memori backend, terjadi rentetan log galat HTTP 404 tanpa mekanisme backoff eksponensial.

9. **Bug 9: Tumpang Tindih Pesan Toast Ganda pada Penerapan Rencana Simulasi**
   * Menekan tombol terapkan rencana mitigasi pada `SimulationSection.tsx` memunculkan pesan toast sukses hijau secara bersamaan dengan toast informasi abu-abu dari komponen induk `DashboardClient.tsx`.

---

## 2. Analisis Akar Masalah (Root Cause Analysis)

### 2.1 Bug 1: Pemblokiran Interaksi oleh `GuestEvaluationBanner`
* **File Terkait:** `frontend/components/dashboard/GuestEvaluationBanner.tsx` (baris 38 - 40).
* **Mekanisme Galat:**
  Spanduk dirender dengan kelas Tailwind:
  ```tsx
  <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[550] w-[95%] max-w-3xl pointer-events-auto">
  ```
  Karena bilah HUD kontrol atas (`TopNavTelemetry.tsx`) diletakkan pada posisi `top-3.5` di bawah header 64px (efektif pada `y = 78px`), kontainer spanduk selebar 95% dengan `pointer-events-auto` secara langsung menimpa area kontrol tersebut. Setiap klik yang ditujukan ke tombol `HITL REVIEW`, `RUTE`, atau `BMKG` terhalang oleh pembungkus transparan spanduk.

### 2.2 Bug 2: Ketiadaan Kartu Profil Pengguna Saat Sesi Telah Terautentikasi
* **File Terkait:** `frontend/components/auth/AuthModal.tsx` (baris 42, 61 - 105).
* **Mekanisme Galat:**
  Komponen `AuthModal` menginisialisasi state tab dengan `activeTab = 'password'`. Ketika pengguna terautentikasi menekan tombol profil di header, komponen tetap membuka form login untuk input email dan password. Tidak ada komponen tampilan profil pengguna yang menyajikan nama, email, perusahaan, hak akses aktif, dan tombol keluar (logout).

### 2.3 Bug 3: Kebocoran Fitur Peralihan Persona 1-Klik bagi Akun Resmi Korporat
* **File Terkait:** `frontend/components/auth/AuthModal.tsx` (baris 61 - 76).
* **Mekanisme Galat:**
  Fungsi `handlePersonaSelect` hanya mengecek `if (!isAuthenticated) return;`. Selama pengguna masuk, pergantian peran diizinkan tanpa memvalidasi apakah akun tersebut adalah akun tamu evaluator atau akun instansi resmi pemerintah/BUMN.

### 2.4 Bug 4: Ketiadaan Indikator Visual Fitur Terkunci (Locked State)
* **File Terkait:** `frontend/components/dashboard/DashboardClient.tsx` (baris 1345 - 1360), `frontend/components/fleet/FleetOnboardingModal.tsx` (baris 180 - 188).
* **Mekanisme Galat:**
  Tombol `Onboard Armada` di header tidak memeriksa peran pengguna aktif. Di dalam modal pendaftaran armada, pengecekan hanya dilakukan terhadap peran REGULATOR (`if (isRegulator)`), sementara peran GUEST diabaikan. Akibatnya, pengguna tamu diizinkan mengisi form dan baru menerima pesan galat HTTP 403 setelah melakukan request jaringan.

### 2.5 Bug 5: Kegagalan Logika & Geometri Rute Run Demo
* **File Terkait:** `frontend/components/dashboard/DashboardClient.tsx` (baris 210 - 268), `frontend/hooks/useDemoState.ts` (baris 195 - 207), `backend/app/routers/demo_router.py` (baris 54 - 60).
* **Mekanisme Galat:**
  1. `buildHazardBypassRoute` menghitung offset tangensial sederhana dan menghasilkan array 4 titik: `[origin, bend1, bend2, destination]`. Hal ini menghasilkan garis lurus yang memotong kontur alam.
  2. Waypoint rute bypass offline di `useDemoState.ts` dan fixture `mock_crisis_state.json` memiliki titik koordinat akhir di `{ lat: 2.9595, lon: 99.0687 }` (wilayah Danau Toba), bukan Tebing Tinggi (`3.3285, 99.1625`).
  3. Skema `StartDemoPayload` di FastAPI backend mengabaikan field `origin` dan `destination`.

### 2.6 Bug 6: Data Dampak Ekonomi Kosong pada Mode Demo
* **File Terkait:** `frontend/hooks/useDemoState.ts` (baris 160 - 175), `frontend/components/sidebar/EconomicTab.tsx`.
* **Mekanisme Galat:**
  Pembersihan mock data pada Phase 57 WP-A2 menghapus data ekonometrika pada fallback klien, sehingga objek `inflation_forecast` bernilai null dan antarmuka menampilkan pesan statis "Proyeksi inflasi belum diterbitkan".

### 2.7 Bug 7: Anomali Sakelar Mode Simulasi Armada
* **File Terkait:** `frontend/hooks/useFleetVehicles.ts` (baris 234 - 249).
* **Mekanisme Galat:**
  Endpoint `api.fleet.vehicles()` selalu mengembalikan 45 armada dasar dari master definisi. Di dalam hook klien:
  ```ts
  if (res.vehicles && res.vehicles.length > 0) {
    setVehicles(res.vehicles);
  } else {
    if (isSimulationMode) { ... }
  }
  ```
  Kondisi `res.vehicles.length > 0` selalu terpenuhi, sehingga blok evaluasi `isSimulationMode` tidak pernah dijalankan.

### 2.8 Bug 8: Perulangan Polling 404 pada Pengendali Jarak Jauh (/demo-remote)
* **File Terkait:** `frontend/app/demo-remote/page.tsx` (baris 34 - 45).
* **Mekanisme Galat:**
  Polling periodik dilakukan ke backend tanpa memverifikasi keberadaan data skenario. Jika backend mengembalikan 404, klien tetap melakukan request ulang setiap 2 detik tanpa jeda atau peringatan penghentian.

### 2.9 Bug 9: Tumpang Tindih Pesan Toast Ganda pada Penerapan Rencana Simulasi
* **File Terkait:** `frontend/components/dashboard/SimulationSection.tsx` (baris 104), `frontend/components/dashboard/DashboardClient.tsx` (baris 613).
* **Mekanisme Galat:**
  `SimulationSection` memanggil fungsi internal untuk memicu toast sukses, sementara fungsi callback `onDeployActionPlan` di `DashboardClient` juga memicu toast lokal secara terpisah.

---

## 3. Matriks Tata Kelola Peran (RBAC) & Visual Locking

| Fitur / Modul Antarmuka | GUEST / EVALUATOR (Sandbox) | REGULATOR (Bapanas / Kemenhub) | DISPATCHER (Operator Logistik) |
| :--- | :--- | :--- | :--- |
| **Cakupan Armada pada Peta** | 45 Armada Simulasi (Makro) | Seluruh Armada Lintas Operator (Makro Koridor) | Armada Milik Perusahaan Terdaftar (Multi-Tenant) |
| **Onboard Armada & Unggah Manifest** | Terkunci (Badge: *Khusus Dispatcher*) | Terkunci (Hak Akses Regulasi: Read-Only) | Akses Penuh (Pendaftaran Truk & CSV Manifest) |
| **Eksekusi Rute Mitigasi Koridor** | Mode Sandbox (Tersimpan Lokal di Peramban) | Terkunci (Pengawasan Makro, Tanpa Eksekusi Operasional) | Akses Penuh (Komando Armada & Penerbitan Surat Jalan) |
| **Human-in-the-Loop (HITL) Review** | Tinjau Saja (Tombol Setujui/Tolak Nonaktif) | Tinjau Saja (Rekomendasi Kebijakan Publik) | Otoritas Persetujuan Operasional Lapangan |
| **Peralihan Persona (1-Klik Switch)** | Aktif untuk Evaluasi Skenario Demo | Terkunci (Terikat Akun Resmi Organisasi) | Terkunci (Terikat Akun Resmi Perusahaan) |

---

## 4. Rencana Kerja Perbaikan Sistem (Remediation Plan)

### Gelombang 1: Tata Kelola Autentikasi, Profil & Spanduk Interaksi
1. **Perbaikan Spanduk Tamu (`GuestEvaluationBanner.tsx`):**
   * Mengubah kontainer luar menjadi `pointer-events-none`, dan hanya memberikan `pointer-events-auto` pada kartu spanduk di dalamnya.
   * Menyesuaikan penempatan vertikal agar tidak menutupi bilah HUD kontrol navigasi atas.
2. **Kartu Profil Pengguna (`AuthModal.tsx`):**
   * Menambahkan tampilan khusus Profil Akun ketika `isAuthenticated === true`.
   * Menampilkan nama pengguna, email, lencana peran, nama organisasi/perusahaan, dan tombol keluar (logout) yang membersihkan sesi.
3. **Penguncian Persona Korporat:**
   * Membatasi tab peralihan persona 1-klik hanya untuk pengguna dengan flag `is_offline_guest === true` atau email evaluasi kompetisi.
4. **Indikator Visual Terkunci (Lock Badges):**
   * Menambahkan ikon gembok kecil dan penanda `[Khusus Dispatcher]` pada tombol *Onboard Armada* untuk peran selain Dispatcher.
   * Menyesuaikan label dan state tombol aksi mitigasi berdasarkan peran pengguna.

### Gelombang 2: Perbaikan Sakelar Mode Simulasi Armada
1. **Filter Armada Kustom vs Simulasi (`useFleetVehicles.ts`):**
   * Saat `isSimulationMode === false`, saring armada agar hanya menyertakan kendaraan kustom (`v.is_custom === true`).
   * Jika belum ada kendaraan kustom yang didaftarkan, kembalikan array kosong dengan keterangan visual yang jelas pada peta.
   * Saat `isSimulationMode === true`, tampilkan seluruh 45 armada dasar simulasi.

### Gelombang 3: Perbaikan Rute Run Demo & Penyaluran Dampak Ekonomi
1. **Kurasi Geometri Koridor Pesisir:**
   * Menggantikan poligon garis lurus kasar `buildHazardBypassRoute` dengan koordinat jalur arteri pesisir Pantai Cermin yang sesungguhnya (melintasi Belawan, Marelan, Percut Sei Tuan, Pantai Cermin, hingga simpang susun Tebing Tinggi).
   * Menyesuaikan titik akhir rute demo offline agar berhenti tepat di Simpang Susun Tol Tebing Tinggi (`3.3285, 99.1625`).
2. **Dukungan Simpul Koridor Dinamis di Backend:**
   * Menambahkan field `origin` dan `destination` pada skema `StartDemoPayload` di `backend/app/routers/demo_router.py`.
3. **Penyaluran Metrik Ekonometrika Terkalibrasi:**
   * Menghubungkan estimasi inflasi (+15% Minyak Goreng) dan evaluasi lindung nilai pembusukan (penghematan Rp 1.045.284) dari backend ke state demo klien dengan label `[Simulasi Model Ekonometrika]`.

### Gelombang 4: Polling Pengendali Jarak Jauh & Notifikasi Antarmuka
1. **Pencegahan Perulangan 404 pada `/demo-remote`:**
   * Menghentikan polling agresif ketika backend mengembalikan status 404, disertai instruksi memulai skenario demo baru.
2. **Penyatuan Pesan Toast Simulasi:**
   * Menghilangkan duplikasi pemicu toast antara `SimulationSection.tsx` dan `DashboardClient.tsx`.

---

## 5. Ringkasan Bukti Tangkapan Layar Pengujian

* `scratch/audit_ext_01_landing.png`: Halaman awal (Landing Page) berhasil dimuat dengan video latar belakang dan kanvas urutan frame operasional.
* `scratch/audit_ext_02_tab_bukti.png` & `audit_ext_03_tab_mitigasi.png`: Tampilan sidebar kanan saat insiden banjir Belawan dipilih.
* `scratch/audit_ext_04_tab_ekonomi.png`: Tampilan tab dampak ekonomi yang memerlukan integrasi data ekonometrika.
* `scratch/audit_ext_06_hitl_opened.png`: Laci tinjauan keputusan Human-in-the-Loop berhasil dibuka.
* `scratch/audit_ext_08_onboard_modal.png` & `audit_ext_09_onboard_filled.png`: Modal pendaftaran armada mandiri dan formulir verifikasi.
* `scratch/audit_ext_12_demo_stage1.png`: Tahap awal aktivasi skenario demonstrasi koridor Belawan ke Tebing Tinggi.
* `scratch/audit_ext_14_demo_remote.png`: Antarmuka pengendali jarak jauh demonstrasi.
