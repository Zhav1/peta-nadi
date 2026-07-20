# LEARNINGS — Phase 12: Backend Demo Engine & AI Advisor Localization

Dokumen ini mencatat kendala runtime, infinite rendering loop, penanganan fallback backend, dan lokalisasi AI Advisor yang diselesaikan pada Phase 12.

---

## 1. Infinite Re-render Loop & Socket Resource Exhaustion (`net::ERR_INSUFFICIENT_RESOURCES`)

### Masalah
Saat aplikasi dijalankan, browser mengalami pembekuan dan memunculkan error beruntun `GET http://localhost:8000/api/v1/incidents?limit=100 net::ERR_INSUFFICIENT_RESOURCES`.
- **Akar Masalah**: Komponen `GuidedDemoPanel` di `DashboardClient.tsx` menerima callback inline tanpa memoization: `onCrisisReady={(crisis) => { setSelectedCrisis(crisis); refetch(); }}`.
- Fungsi callback inline ini dimasukkan ke dalam dependency array `useEffect` di `useDemoState.ts`.
- Setiap kali re-render terjadi di `DashboardClient`, referensi fungsi `onCrisisReady` diperbarui. `useEffect` di `useDemoState` mendeteksi referensi baru ini lalu memanggil `onCrisisReady` kembali.
- Panggilan `onCrisisReady` memicu `refetch()` yang mengeksekusi request `api.incidents.list({ limit: 100 })`, menderivasi state update baru yang memicu siklus **infinite re-render loop** ratusan kali per detik hingga koneksi socket HTTP browser habis.

### Solusi Teknis
1. **Memoization Handler**: Bungkus handler `handleDemoCrisisReady` di `DashboardClient.tsx` dengan `useCallback` agar referensi fungsinya stabil.
2. **Hook Execution Guard (`notifiedKeyRef`)**: Di `useDemoState.ts`, gunakan `useRef` (`notifiedKeyRef`) untuk mencatat string kunci krisis & stage (`${crisis_id}_${stage}`). Callback `onCrisisReady` **hanya dipanggil tepat 1 kali** saat terjadi transisi stage/krisis baru, mengisolasi efek samping re-render komponen induk.

---

## 2. Robust Backend Demo Fallback & Suppression Error 404

### Masalah
- Panggilan `POST /api/demo/start` melempar HTTP 500 saat API key eksternal (TomTom, BMKG, LLM) atau koneksi database live tidak tersedia.
- Saat `/api/demo/start` melempar error 500, `useDemoState.ts` mengaktifkan ID fallback client-side (`belawan-demo-offline-XXX`). Namun, fungsi `pollStatus` terus melakukan HTTP GET request `GET /api/demo/status/belawan-demo-offline-XXX` ke FastAPI setiap 2 detik, yang berujung pada error HTTP 404 berulang kali di console log.

### Solusi Teknis
1. **Fallback Anggun Backend (`demo_router.py`)**: Set default `mock_agents=True` untuk demo mode. Bungkus eksekusi real agent worker dalam blok `try/except` yang secara otomatis me-load `mock_crisis_state.json` saat terjadi kendala koneksi/kredensial, menjamin `POST /api/demo/start` **selalu mengembalikan HTTP 200 OK**.
2. **Polling Guard Offline ID (`useDemoState.ts`)**: Tambahkan pemeriksaan `crisisId.startsWith('belawan-demo-offline')` di `pollStatus`. Jika krisis berjalan dalam mode offline client-side, polling HTTP ke backend langsung dihentikan (`return`), menghapus error 404 console secara permanen.

---

## 3. Multilingual System Instruction Adaptation untuk AI Advisor

### Masalah
Prompt `/api/simulation/chat` di `agent_router.py` semula mengunci instruksi jawaban dalam Bahasa Inggris (`Provide a brief, tactical response (max 3 sentences) in English.`), sehingga AI Advisor tetap merespon Bahasa Inggris meskipun pengguna bertanya dalam Bahasa Indonesia.

### Solusi Teknis
1. Ubah system instruction prompt menjadi dynamic language matching: `Respond in the EXACT same language as the user message (Indonesian if the user asks in Indonesian, English if in English).`
2. Pada mode offline/fallback, gunakan deteksi kata kunci Bahasa Indonesia (`bagaimana`, `apa`, `rute`, `stok`, `mitigasi`, `pelabuhan`) untuk mengembalikan pesan taktis ber-Bahasa Indonesia (contoh: *"REKOMENDASI: Alihkan 40% kargo logistik sekunder dari koridor Belawan ke Jalur Tol Medan-Tebing Tinggi."*).

---

## 4. Pola Generator Dokumen Cetak & Ekspor Data (PDF Export)

### Masalah
Tombol "Generate PDF Report" di `ReportsSection.tsx` hanya memicu browser `alert('PDF report compilation started...')` tanpa menghasilkan berkas laporan fisik.

### Solusi Teknis
1. Implementasikan pola `window.open("", "_blank")` dengan stylesheet `@media print` bergaya laporan kabinet sektor publik (*PetaNadi National Logistics Cabinet Briefing*) yang secara otomatis memicu dialog cetak/PDF browser (`window.print()`).
2. Tambahkan handler `handleExportRawData` untuk mengunduh telemetry raw report dalam format JSON (`PetaNadi_Raw_Report_YYYY-MM-DD.json`).
