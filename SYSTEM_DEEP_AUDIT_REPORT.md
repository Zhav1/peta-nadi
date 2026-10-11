# SYSTEM DEEP AUDIT: TRUTH, REALITY VS. MOCKUPS, & STRUCTURAL INTEGRITY

> [!WARNING]
> **SUPERSEDED:** This audit is superseded by [`POST_IMPLEMENTATION_AUDIT_REPORT.md`](POST_IMPLEMENTATION_AUDIT_REPORT.md). Its core findings have been remediated: Next.js route middleware now exists (`frontend/middleware.ts` guards `/dashboard`), invalid JWT signatures are rejected (no unverified-signature fallback), and strict RBAC guest lockdown is enforced.

Tanggal Audit: 11 Oktober 2026  
Auditor: Lead Systems Architect & AI Engineering Auditor  
Cakupan: Validasi Klaim Proposal vs Realita Kode Sumber, Keamanan RBAC, Keaslian Telemetri Armada, Modus Prospektif, dan Integritas Antar-Halaman  

---

## 1. Ringkasan Eksekutif & Jawaban Langsung Atas 5 Pertanyaan Pengguna

Berdasarkan investigasi menyeluruh pada frontend (`Next.js`), backend (`FastAPI`), database (`Supabase`/`PostgreSQL`), dan dokumen perencanaan di `planning/`, berikut adalah jawaban jujur, faktual, dan transparan atas 5 pertanyaan utama:

### 1.1 "Saya bisa ubah role dll tanpa login di dashboard"
* **Fakta Kode:** **100% Benar.** Sistem RBAC (Role-Based Access Control) saat ini **hampir murni kosmetik di sisi pengguna (demo sandbox mode)**.
* **Akar Masalah:**
  1. Di `frontend/lib/authContext.tsx`, sistem secara otomatis membuat sesi tamu (`DEFAULT_GUEST_PROFILE`) saat aplikasi dibuka, menyetel `token !== null`, sehingga `isAuthenticated` selalu bernilai `true` secara instan.
  2. Tombol `1-Klik Persona (Evaluator)` di `AuthModal.tsx` memanggil `switchRole()`. Jika backend offline atau tidak ada otentikasi nyata, fungsi ini menerapkan *mock profile* di memori lokal (`Budi Santoso - Lead Dispatcher`, `Dr. Hendra Wijaya - Analis Ketahanan Pangan`).
  3. Di backend (`backend/app/auth/supabase_auth.py`), saat token memiliki signature invalid, terdapat *fallback* yang men-decode token tanpa verifikasi signature (`jwt.decode(token, options={"verify_signature": False})`).
  4. Tidak ada middleware Next.js (`middleware.ts`) yang melindungi rute dashboard; semua proteksi bersifat client-side render conditional (`activeSection`).
* **Mengapa Dibuat Demikian:** Arsitektur ini sengaja didesain untuk **juri kompetisi/evaluator sandbox** agar juri dapat berganti perspektif dari operator lapangan ke kementerian dalam 1 klik tanpa harus registrasi ulang atau mengisi form login.

---

### 1.2 "Saya bisa tambah telemetry / route tapi tidak ada dampaknya sama sekali"
* **Fakta Kode:** **100% Benar.**
* **Akar Masalah:**
  1. Hook `useCorridorContext.ts` melakukan polling mandiri setiap 30 detik ke `/api/v1/corridor/context`. Hook ini **tidak memiliki event listener atau subscription** terhadap state penambahan rute baru atau penambahan unit armada kustom.
  2. Saat pengguna menambahkan rute kustom atau titik bencana, perhitungan rute Mapbox berjalan lokal, namun **tidak menghitung ulang metrik inflasi harga cabai/beras secara makro** di bilah ringkasan koridor.
  3. Modul *Impact Assessment* (`/api/v1/incidents/impact-assessment`) hanya dijalankan jika pengguna menekan tombol spesifik pada simulasi krisis aktif, bukan otomatis merefleksikan perubahan pada seluruh widget koridor.

---

### 1.3 "Apakah armada truk, kapal laut, dan pesawat di Sumatra sebanyak itu di kenyataan?"
* **Fakta Kode:** **Armada yang tampil adalah 45 unit sintetis (Master Fleet Baseline), bukan seluruh armada riil se-pulau Sumatra.**
* **Rincian Data Aktual di `telemetry_service.py`:**
  - **Kapal Laut (Maritime):** Tepat **14 unit** kapal (misal: *KM Sriwijaya Express*, *KMP Batu Mandi*, *KM Meratus*).
  - **Truk Logistik (Truck):** Tepat **24 unit** truk berpendingin / sembako (misal: *Truk Sayur Berastagi*, *Truk Beras BULOG*).
  - **Kargo Udara (Air):** Tepat **7 unit** pesawat kargo (misal: *Garuda Cargo GA-7101 KNO-CGK*, *Cardig Air Cargo 802*).
  - **Total:** Tepat **45 unit baseline**.
* **Keaslian Data:**
  - Di backend, terdapat modul koneksi ke stream AIS (*AISstream*) dan ADS-B (*OpenSky*), namun jika feed publik tersebut offline atau API key habis, backend menjalankan **simulasi pergerakan berbasis interpolasi geometri Turf.js (`path` dan `speed_kmh`)**.
  - Angka ini didesain sebagai **representasi armada prioritas strategis bahan pangan pokok (cabai, beras, minyak goreng)** di sepanjang Koridor Trans-Sumatera dan Selat Malaka/ALKI I, **bukan** total populasi seluruh kendaraan komersial di pulau Sumatra.

---

### 1.4 "Apa itu mode Future dan Predicted?"
* **Fakta Kode:**
  - **Past (Arsip Historis 2022-2024):** Memuat data kejadian masa lalu dari endpoint `/api/v1/incidents/historical/episodes` (seperti Banjir Bandang Tebing Tinggi 2024 dan Longsor Sitinjau Lauik 2024) atau fallback `FALLBACK_HISTORICAL`.
  - **Future (Proyeksi Dini 24-48 Jam):** Memuat data `/api/v1/incidents/predictive/risks` yang mensimulasikan peringatan dini akumulasi curah hujan BMKG dan potensi bottleneck lalu lintas sebelum armada diberangkatkan.
  - **Predict (Mode Prediksi Multi-Model):** Mengaktifkan overlay prakiraan cuaca Open-Meteo / BMKG dan menghubungkan simulasi disrupsi pelabuhan Belawan untuk melihat potensi perambatan harga cabai 48 jam ke depan.
* **Tingkat Realitas:** Endpoint ini mengembalikan data terstruktur dari file backend/mock fixture (`PRED-001`, `PRED-002`) yang menggabungkan prediksi statistik cuaca dengan skenario dampak inflasi, **bukan inferensi neural network real-time yang memproses miliaran data titik per detik di frontend**.

---

### 1.5 "Rasanya halaman lain selain dashboard cuma mockup"
* **Fakta Kode:** Sebagian halaman memang didesain sebagai visual showcase:
  - **Landing Page (`/` / `OnboardingHome.tsx`):** Berfungsi sebagai **halaman presentasi & storytelling interaktif** (121-frame scroll-driven canvas sequence) untuk meyakinkan audiens/stakeholder mengenai visi PetaNadi.
  - **Demo Remote (`/demo-remote`):** Merupakan **aplikasi pengontrol jarak jauh berbasis mobile web** untuk presenter/evaluator, yang benar-benar memanggil API backend (`/api/demo/start`, `/api/demo/advance`, `/api/demo/status`) guna memajukan tahapan demo di layar utama.
  - **Dashboard Tabs:**
    - `Map`: 100% interaktif (Mapbox GL, Deck.gl, WebGL symbol layers, route solver).
    - `AnalyticsSection`: Mengambil data harga komoditas riil/tersimpan via `api.commodities.prices()`.
    - `SimulationSection`: Terkoneksi ke `api.approvals.create()` dan sinkron ke peta.
    - `ReportsSection`: Menghitung agregasi dari `activeRoutes`, `corridorContext`, dan memiliki fungsi cetak dokumen kabinet (`window.print()`).
    - `EvaluationSection`: Memiliki komponen benchmark akurasi routing dan reliability diagram, tetapi data historis verifikasinya mengandalkan array baseline `FALLBACK_OUTCOMES`.

---

## 2. Matriks Temuan & Rekomendasi Solusi

| Area / Komponen | Temuan Masalah | Akar Masalah | Solusi Rekomendasi |
| :--- | :--- | :--- | :--- |
| **Auth & Persona Switching** | Bebas ganti role tanpa login | Dirancang sebagai sandbox kompetisi tanpa strict JWT validation | Berikan banner jelas: *"MODE EVALUATOR SANDBOX AKTIF: Akses Persona Terbuka untuk Penilaian"*, atau pasang mode proteksi ketat via flag environment. |
| **Sinkronisasi Telemetri Koridor** | Rute baru tidak mengubah metrik koridor | Hook `useCorridorContext` berjalan statis via polling terisolasi | Hubungkan trigger re-kalkulasi ketika rute baru disetujui operator. |
| **Klaim Volume Armada** | Pengguna mengira seluruh armada Sumatra | Master fleet berisi 45 unit strategis | Perjelas label UI menjadi: *"45 Armada Prioritas Pangan Nasional (Sample Koridor Strategis Trans-Sumatera & ALKI I)"*. |
| **Halaman Non-Dashboard** | Dianggap mockup pasif | Sebagian berupa storytelling showcase | Hubungkan live status badge pada landing page dan sediakan panduan interaktivitas jelas. |

---

## 3. Kesimpulan

PetaNadi adalah platform yang **sangat fungsional pada inti arsitekturnya** (engine routing tangensial, WebGL rendering 60 FPS, multi-agent reasoning, dan Mapbox directions). Namun, terdapat kesenjangan antara **ekspektasi pengguna terhadap sistem produksi skala penuh** dengan **desain aplikasi saat ini yang dioptimasi untuk demonstrasi dan evaluasi kompetisi tingkat tinggi**. 

Transparansi label, guardrail yang jujur, dan sinkronisasi reaktif antar-komponen adalah kunci untuk menutup celah ini.
