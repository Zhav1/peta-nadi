# LEARNINGS — Phase 11: Proposal Migration & Dynamic UI Integration

Dokumen ini mencatat kendala teknis (gotchas), akar masalah, dan solusi teknis yang ditemukan selama eksekusi Phase 11. Informasi ini berfungsi sebagai jangkar memori agar agen/subagen di fase berikutnya tidak mengulangi kesalahan serupa.

---

## 1. Docker Backend Context & Import Resolution (`agents/` Module)

### Masalah
Saat menjalankan pytest atau service backend di dalam container Docker, import Python `from agents.xyz import ...` mengalami `ModuleNotFoundError` atau gagal menemukan module `agents`. Hal ini terjadi karena root project (`/app`) di Docker backend hanya mengcopy isi folder `backend/`, sehingga folder `agents/` yang terletak di level monorepo (`../agents`) tidak terbawa ke dalam build context default.

### Solusi Teknis
1. **Mount Volume & Build Context:**
   Di [docker-compose.yml](file:///c:/Farras/DIGDAYA/peta-nadi/docker-compose.yml), pastikan build context backend menunjuk ke root repository (`.`) atau mount folder `./agents` ke `/app/agents` dalam container:
   ```yaml
   volumes:
     - ./backend:/app
     - ./agents:/app/agents
   ```
2. **Setup `PYTHONPATH`:**
   Tetapkan environment variable `PYTHONPATH=/app` di dalam container Dockerfile/Compose agar Python dapat menemukan module `agents` secara global.

---

## 2. Next.js Frontend Assets & Missing `public/` Folder

### Masalah
Proses Next.js production build (`next build`) memerlukan direktori `frontend/public` untuk asset statis, favicon, dan font. Jika direktori ini tidak terbuat atau kosong tanpa berkas pelengkap, beberapa route/asset loader statis bisa gagal saat penyusunan artifact image Docker (`Dockerfile.frontend`).

### Solusi Teknis
1. Pastikan folder `frontend/public/` selalu didaftarkan dan memiliki setidaknya satu berkas valid (seperti `favicon.ico` atau `.gitkeep`).
2. Jangan menghapus atau mengabaikan folder `public/` saat pembersihan direktori atau penataan ulang struktur monorepo.

---

## 3. Frontend Type Contracts & Interception Handlers (`CrisisState` & `SourceStatus`)

### Masalah
1. **Unused States / Unhandled Types:** Saat menyambungkan komponen UI seperti `AnalyticsSection.tsx`, `ReportsSection.tsx`, dan `EvidenceTab.tsx`, terjadi type-checking error saat Next.js melakukan production build. Contohnya:
   - Variabel state yang di-declare tetapi tidak terpakai (`@typescript-eslint/no-unused-vars`).
   - Perbandingan string literal yang salah ketik (misal: `source.status === 'ok'` alih-alih `'healthy'` sesuai union `SourceStatus`).
   - Property opsional seperti `evidence` belum didaftarkan di interface `CrisisState` di `lib/types.ts`.
2. **State Crash pada Event Click:** Ketika tombol navigasi sidebar atau bottombar time filter (PAST, FUTURE, PREDICT) diklik, komponen sempat crash karena mencoba memanggil API backend dengan ID mock (seperti `mock-past-1`) yang tidak tersimpan di database real.

### Solusi Teknis
1. **Interface Contract Synchronization:**
   Setiap kali menambah properti dinamis baru di UI (seperti CCTV label, OSINT text, atau delay history), segera daftarkan tipe tersebut di [types.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/types.ts):
   ```typescript
   export interface CrisisState {
     // ...
     evidence?: {
       cctv_url?: string;
       cctv_label?: string;
       osint_author?: string;
       osint_text?: string;
       delay_minutes?: string;
       delay_history?: number[];
     };
   }
   ```
2. **Mock Interception Pattern:**
   Pada handler klik utama ([DashboardClient.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/DashboardClient.tsx)), cegah error 404/network crash dengan melakukan pencegatan (interception) untuk ID yang berawalan `mock-`:
   ```typescript
   if (id.startsWith('mock-')) {
     setSelectedCrisis(mockIncidentsMap[id] || null);
     return;
   }
   ```
3. **Strict Type-Checking Before Container Build:**
   Selalu verifikasi type & lint secara lokal sebelum melakukan build container untuk menghemat waktu iterasi.

---

## Ringkasan Aturan untuk Subagen Masa Depan
- ⚠️ **Selalu cek `PYTHONPATH` & mount volume** jika membuat endpoint/script baru yang mengimpor dari `/agents`.
- ⚠️ **Update `types.ts` terlebih dahulu** sebelum memperbarui komponen React dengan data/prop baru.
- ⚠️ **Sediakan fallback data/interception** untuk mode demo/mock agar UI tidak crash saat offline atau saat berinteraksi dengan fixture data.
