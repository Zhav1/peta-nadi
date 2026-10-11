# POST-IMPLEMENTATION CRITICAL AUDIT & PLOTHOLE ANALYSIS (COMMIT `fd95609`)

**Status:** RESOLVED (Done 2026-10-11)

Tanggal Audit: 11 Oktober 2026  
Auditor / Orchestrator: Antigravity Lead Architect  
Subagent Engine: `cmdc` (`deepseek-v4.1-flash`)  
Cakupan Berkas: `frontend/middleware.ts`, `frontend/lib/authContext.tsx`, `frontend/components/auth/AuthModal.tsx`, `frontend/hooks/useCorridorContext.ts`, `frontend/components/dashboard/DashboardClient.tsx`, `backend/app/auth/supabase_auth.py`, `backend/app/routers/auth_router.py`.

---

## 1. Ringkasan Eksekutif

Audit mendalam terhadap hasil implementasi `fd95609` (Strict RBAC, Route Middleware, & Reactive Corridor Recalculation) mengungkapkan bahwa secara struktural fitur-fitur baru berhasil lulus kompilasi TypeScript dan tes unit dasar. Namun, terdapat **sejumlah celah logika kritis (plotholes), ketidaksesuaian kontrak variabel (contract mismatches), dan inkonsistensi siklus hidup state (lifecycle bugs)** yang masih mengganjal alur kerja produksi end-to-end.

---

## 2. Temuan Kritis (Detailed Breakdown)

### A. Kontrak & Semantik Variabel (Contract Mismatches)

1. **Inflasi Nilai Keterlambatan (`delayMinutes` vs `eta_minutes`)**:
   - **Lokasi:** `frontend/components/dashboard/DashboardClient.tsx:595` dan `DashboardClient.tsx:1137`
   - **Masalah:** Fungsi `applyOperationalImpact` dipanggil dengan `delayMinutes: Math.round(approvedRoute?.eta_minutes ?? 38)`. Nilai `eta_minutes` adalah **total durasi perjalanan rute** (misal 38–90 menit), **bukan** penambahan delay akibat pengalihan bencana (detour delay delta).
   - **Dampak:** Parameter keterlambatan di `corridorContext` langsung melonjak drastis dan berlebihan karena menjumlahkan total waktu tempuh ke dalam akumulasi delay lalu lintas. Seharusnya yang dimasukkan adalah `Math.max(0, (approvedRoute?.eta_minutes ?? 0) - baselineEta)`.

2. **Divergensi Definisi Permission GUEST (Frontend vs Backend)**:
   - **Lokasi:** `frontend/lib/authContext.tsx:8` vs `backend/app/auth/supabase_auth.py:50`
   - **Masalah:** Di frontend, `DEFAULT_GUEST_PROFILE.permissions` diubah menjadi array kosong `[]` untuk mode tamu terkunci. Namun di backend, role `GUEST` tetap memiliki wewenang luas (`approvals:write`, `scenarios:run`, `fleet:read`). Dua sisi sistem memiliki pemahaman berbeda atas arti peran "GUEST".

3. **Status Sensor Badge Selalu `LIVE` (Mati Cabang `FALLBACK`)**:
   - **Lokasi:** `frontend/components/dashboard/DashboardClient.tsx:1637-1651`
   - **Masalah:** Indikator BMKG, TomTom, dan PIHPS di header samping mengecek `corridorContext?.weather ? 'LIVE' : isCorridorLoading ? 'MEMUAT' : 'FALLBACK'`. Karena `useCorridorContext` selalu mengisi `DEFAULT_FALLBACK_CORRIDOR` ketika fetch gagal, `corridorContext.weather` **selalu bernilai truthy**. Cabang tampilan `FALLBACK` secara teknis tidak akan pernah tercapai.

---

### B. Siklus Hidup & Runtime Edge-Cases (Runtime Bugs)

1. **Efek Rekalkulasi Reaktif Dihapus Setiap 30 Detik (Overwritten by Poller)**:
   - **Lokasi:** `frontend/hooks/useCorridorContext.ts:106` vs `useCorridorContext.ts:160`
   - **Masalah:** Saat operator menyetujui rute, `applyOperationalImpact` memperbarui `corridorContext` di state lokal React. Namun, interval poller `fetchCorridor` yang berjalan setiap 30 detik menimpa kembali state tersebut dengan data mentah dari backend `/api/v1/corridor/context`.
   - **Dampak:** Efek lonjakan harga dan kemacetan yang baru saja dihitung langsung lenyap dan kembali ke baseline statis dalam waktu maksimal 30 detik.

2. **Verifikasi Token di Middleware Hanya Struktural, Bukan Kriptografis**:
   - **Lokasi:** `frontend/middleware.ts:8-27`
   - **Masalah:** Next.js Edge Middleware hanya mem-parse 3 bagian token dan mengecek `exp`. Jika token dibuat dengan payload JSON valid tetapi secret key palsu, middleware menganggapnya lolos (`200 OK`). Namun ketika browser sampai di komponen client dan memanggil `/api/auth/me`, backend FastAPI menolaknya dengan `401 Unauthorized`. Terjadi inkonsistensi di mana middleware menganggap pengguna terotentikasi, tetapi dashboard langsung menurunkan status menjadi tamu.

3. **Komplikasi Pemanggilan ID Risiko Prediktif (`404 Round-trip`)**:
   - **Lokasi:** `frontend/components/dashboard/DashboardClient.tsx:800`
   - **Masalah:** Menekan tombol prediktif memanggil `handleCrisisClick('pred-rob-belawan-48h')`, yang pertama kali mengeksekusi `api.incidents.get(id)`. Karena ID prediktif tidak tersimpan di tabel `incidents` riil, request backend selalu menghasilkan `404 Not Found` sebelum akhirnya jatuh ke blok catch fallback.

---

### C. Alur Pengguna & Desain Antarmuka (UX & Guardrail Plotholes)

1. **Bypass Autentikasi Melalui Offline Guest Fallback**:
   - **Lokasi:** `frontend/lib/authContext.tsx:180-190`
   - **Masalah:** Ketika Supabase offline atau belum dikonfigurasi, pengguna yang memasukkan email dan password sembarang pada tab "Masuk / Akun" otomatis dialihkan ke `api.auth.createGuestSession({ role: 'DISPATCHER' })`. Akibatnya, siapapun dapat "login" dengan kredensial palsu, badge "Terkunci" hilang, dan role escalation terbuka.

2. **Ikon Checkmark pada Pesan Error di Modal Auth**:
   - **Lokasi:** `frontend/components/auth/AuthModal.tsx:183`
   - **Masalah:** Alert status error (`statusMessage.type === 'error'`) tetap menggunakan ikon SVG `CheckCircle2` (centang hijau/merah), bukan `AlertCircle` atau `XCircle`.

3. **Parameter URL `?guest=1` Tidak Dihapus Pasca-Login**:
   - **Lokasi:** `frontend/components/auth/AuthModal.tsx:55`
   - **Masalah:** Setelah pengguna berhasil login melalui modal, URL browser tetap mempertahankan query parameter `?guest=1`.

4. **Teks Kartu Persona Tamu Bertentangan dengan Status Terkunci**:
   - **Lokasi:** `frontend/components/auth/AuthModal.tsx:290-330`
   - **Masalah:** Kartu persona tamu masih memuat teks promosi *"Akses terbuka penuh tanpa batasan"* padahal di saat yang sama role switching dikunci dan dibatasi.

---

## 3. Matriks Rekomendasi Solusi & Rencana Aksi

| Masalah | Tingkat Urgensi | Tindakan Perbaikan Terencana |
| :--- | :--- | :--- |
| **Kalkulasi `delayMinutes`** | **Tinggi (Logic)** | Ubah parameter di `DashboardClient` menjadi selisih detour: `Math.max(0, route.eta_minutes - 35)`. |
| **Reset 30s Poller** | **Tinggi (State)** | Simpan state `activeOperationalImpact` di dalam hook `useCorridorContext`, lalu aplikasikan kembali di atas data hasil polling backend. |
| **Ikon Modal Error** | **Rendah (UI)** | Gunakan `AlertCircle` saat `statusMessage.type === 'error'`. |
| **Query `?guest=1` Stale** | **Sedang (UX)** | Jalankan `router.replace(pathname)` setelah login berhasil untuk membersihkan query string. |
| **Penyelarasan Permission GUEST** | **Sedang (Contract)** | Samakan `ROLE_GUEST` di backend `supabase_auth.py` agar strictly read-only tanpa hak mutasi armada. |
