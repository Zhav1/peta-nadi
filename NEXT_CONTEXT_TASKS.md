# MASTER TASK BACKLOG & EXECUTION BLUEPRINT (NEXT CONTEXT WINDOW)

Dokumen ini mengonsolidasikan seluruh temuan audit, celah logika (plotholes), ketidaksesuaian kontrak, dan tugas perbaikan sistemik yang siap dieksekusi pada sesi/context window berikutnya.

---

## 1. Kategori A: Kontrak & Semantik Variabel (High Priority)

- [ ] **A1. Koreksi Perhitungan Inflasi Keterlambatan (`delayMinutes` Delta)**
  - **Berkas:** [`frontend/components/dashboard/DashboardClient.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx#L595) & line 1137
  - **Akar Masalah:** `applyOperationalImpact` saat ini menerima seluruh nilai `eta_minutes` (38–90 menit) rute, bukan selisih penambahan keterlambatan (*incremental delay delta*).
  - **Tindakan:** Ganti passing argumen menjadi `delayMinutes: Math.max(0, (approvedRoute?.eta_minutes ?? 38) - 35)` atau selisih dari baseline rute tercepat.

- [ ] **A2. Penyelarasan Hak Akses `ROLE_GUEST` (Backend vs Frontend)**
  - **Berkas:** [`backend/app/auth/supabase_auth.py`](file:///d:/College/Pidi.id/backend/app/auth/supabase_auth.py#L50) vs [`frontend/lib/authContext.tsx`](file:///d:/College/Pidi.id/frontend/lib/authContext.tsx#L8)
  - **Akar Masalah:** Di frontend, `DEFAULT_GUEST_PROFILE.permissions` diubah menjadi `[]` (read-only terkunci), namun di backend `ROLE_GUEST` masih memegang wewenang luas (`approvals:write`, `scenarios:run`, `fleet:read`).
  - **Tindakan:** Batasi izin `ROLE_GUEST` di `supabase_auth.py` menjadi hanya `['benchmark:read', 'reports:read']` sehingga operasi mutasi kargo dan approval rute benar-benar tertolak di tingkat server.

- [ ] **A3. Koreksi Cabang Evaluasi Sensor Telemetri (`LIVE` vs `FALLBACK`)**
  - **Berkas:** [`frontend/components/dashboard/DashboardClient.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx#L1637-L1651) & [`frontend/hooks/useCorridorContext.ts`](file:///d:/College/Pidi.id/frontend/hooks/useCorridorContext.ts)
  - **Akar Masalah:** Badge sensor BMKG, TomTom, dan PIHPS di header samping mengecek `corridorContext?.weather`. Karena `useCorridorContext` selalu mengisi objek fallback saat fetch gagal, badge selalu menampilkan teks `LIVE` dan cabang `FALLBACK` mati.
  - **Tindakan:** Tambahkan field boolean `is_fallback: boolean` pada `CorridorContext` (disetel `true` pada `DEFAULT_FALLBACK_CORRIDOR`) dan gunakan properti ini untuk membedakan data live vs fallback di UI.

---

## 2. Kategori B: Siklus Hidup & State Runtime (Critical Priority)

- [ ] **B1. Persistensi Rekalkulasi Koridor dari Tindihan Poller 30 Detik**
  - **Berkas:** [`frontend/hooks/useCorridorContext.ts`](file:///d:/College/Pidi.id/frontend/hooks/useCorridorContext.ts#L106-L160)
  - **Akar Masalah:** Efek penyesuaian kemacetan, kecepatan, dan inflasi harga komoditas yang dihitung via `applyOperationalImpact` hilang dan kembali ke baseline setiap kali interval 30 detik `fetchCorridor` terpanggil.
  - **Tindakan:** Simpan `activeImpact` dalam state `useCorridorContext`. Saat `fetchCorridor` berhasil menarik data baru dari backend, aplikasikan ulang `activeImpact` di atas data baru tersebut sebelum menyetel `corridorContext`.

- [ ] **B2. Pencegahan 404 Round-Trip pada Tombol Prediktif**
  - **Berkas:** [`frontend/components/dashboard/DashboardClient.tsx`](file:///d:/College/Pidi.id/frontend/components/dashboard/DashboardClient.tsx#L800-L830)
  - **Akar Masalah:** Mengklik skenario prediktif memanggil `handleCrisisClick('pred-rob-belawan-48h')` yang mencoba menarik data dari `/api/v1/incidents/pred-rob-belawan-48h` (selalu 404 karena ID ini hanya ada di katalog risiko prediktif).
  - **Tindakan:** Cek prefix ID terlebih dahulu; jika ID diawali dengan `pred-`, langsung gunakan data prediktif lokal/katalog tanpa melakukan panggilan fetch `api.incidents.get()`.

- [ ] **B3. Penanganan Race Condition Auth State pada Unmount / Loading**
  - **Berkas:** [`frontend/lib/authContext.tsx`](file:///d:/College/Pidi.id/frontend/lib/authContext.tsx)
  - **Akar Masalah:** Terdapat satu state `isLoading` bersama yang digunakan oleh `switchRole`, `login`, `signUp`, dan `loginWithMagicLink`. Panggilan konkuren atau interupsi dapat memicu setState setelah komponen unmount.
  - **Tindakan:** Pasang `AbortController` atau boolean ref `isMountedRef` pada flow otentikasi.

---

## 3. Kategori C: Alur Pengguna & Guardrails Antarmuka (UX Priority)

- [ ] **C1. Penghapusan Bypass Offline Guest Login**
  - **Berkas:** [`frontend/lib/authContext.tsx`](file:///d:/College/Pidi.id/frontend/lib/authContext.tsx#L180-L195)
  - **Akar Masalah:** Jika Supabase offline atau belum diisi, form login menerima sembarang email/password dan membuatkan sesi `DISPATCHER` melalui `createGuestSession`, sehingga proteksi login dapat di-bypass dengan mudah.
  - **Tindakan:** Berikan pesan error eksplisit *"Layanan autentikasi database sedang tidak tersedia"* dan tolak membuat sesi dispatcher secara sembunyi-sembunyi.

- [ ] **C2. Perbaikan Ikon Alert Error pada Modal Autentikasi**
  - **Berkas:** [`frontend/components/auth/AuthModal.tsx`](file:///d:/College/Pidi.id/frontend/components/auth/AuthModal.tsx#L183)
  - **Akar Masalah:** Alert status error (`statusMessage.type === 'error'`) masih menggunakan ikon `CheckCircle2` (centang), menimbulkan kebingungan visual.
  - **Tindakan:** Gunakan `AlertCircle` dari Lucide untuk status error dan `CheckCircle2` khusus untuk status sukses.

- [ ] **C3. Pembersihan Otomatis Query URL `?guest=1` Pasca-Login**
  - **Berkas:** [`frontend/components/auth/AuthModal.tsx`](file:///d:/College/Pidi.id/frontend/components/auth/AuthModal.tsx#L55)
  - **Akar Masalah:** Setelah pengguna login dan token tersimpan di cookie, URL browser tetap memuat parameter `?guest=1`.
  - **Tindakan:** Panggil `router.replace(window.location.pathname)` setelah login berhasil untuk membersihkan parameter tamu dari bilah alamat.

- [ ] **C4. Penyesuaian Teks Salinan Kartu Persona Tamu**
  - **Berkas:** [`frontend/components/auth/AuthModal.tsx`](file:///d:/College/Pidi.id/frontend/components/auth/AuthModal.tsx#L290-L330)
  - **Akar Masalah:** Teks kartu tamu masih tertulis *"Akses terbuka penuh tanpa batasan"* padahal mode tamu kini sengaja dikunci untuk evaluasi terbatas.
  - **Tindakan:** Ubah teks menjadi *"Mode Pratinjau Terbatas (Evaluasi Tamu): Akses pemantauan peta dasar tanpa hak wewenang persetujuan atau mutasi rute operasional."*

---

## 4. Rencana Eksekusi di Sesi Berikutnya

Urutan eksekusi yang disarankan saat memulai di konteks baru:
1. **Langkah 1:** Perbaiki logika kalkulasi delta delay dan persistensi poller 30s (`A1`, `B1`).
2. **Langkah 2:** Selaraskan izin `ROLE_GUEST` di backend dan hilangkan bypass offline login (`A2`, `C1`).
3. **Langkah 3:** Poles interaksi modal auth, ikon, dan pembersihan URL (`C2`, `C3`, `C4`, `B2`).
4. **Langkah 4:** Jalankan `npx tsc --noEmit` dan `pytest` untuk verifikasi regresi penuh.
