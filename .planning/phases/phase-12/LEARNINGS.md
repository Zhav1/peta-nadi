# LEARNINGS — Phase 12: UI/UX Refinement & Runtime State Fixes

Dokumen ini mencatat kendala visual, tata letak CSS, dan penanganan event handler yang diselesaikan pada Phase 12.

---

## 1. Top Navbar vs Floating Panel Overlap (`top-20` vs `top-4`)

### Masalah
Komponen `CrisisSidebar` semula menggunakan kelas CSS `absolute top-4 right-4`. Karena kontainer utama `DashboardClient.tsx` menggunakan header fixed dengan tinggi 64px (`fixed top-0 h-16`), posisi `top-4` (y=16px) menempatkan bagian atas `CrisisSidebar` tepat di atas header navbar, menutupi judul dan indikator `UTC+00:00`.

### Solusi Teknis
1. Ubah positioning `CrisisSidebar` dari `absolute top-4` menjadi `fixed top-20 right-6 w-96 max-h-[calc(100vh-12rem)] z-40`.
2. Posisi `top-20` (80px) memberikan jarak vertikal sebesar 16px di bawah header fixed 64px.
3. Batasan `max-h-[calc(100vh-12rem)]` memastikan panel detail tidak menutupi kontrol bottombar dan Guided Demo Panel di kanan bawah.

---

## 2. Transition Easing untuk Hover Sidebar

### Masalah
Expand sidebar kiri pada hover (`w-20` ke `w-64`) terasa kasar dan mendadak tanpa kurva transisi CSS.

### Solusi Teknis
Gunakan `transition-all duration-300 ease-in-out` pada elemen `<aside>` dan `transition-opacity duration-300 ease-in-out` pada label teks tersembunyi agar animasi expansi dan pemunculan teks berjalan secara simultan dan halus.

---

## 3. Form Submission & Event Bubbling Guards pada Tombol React

### Masalah
Tombol bawaan `<button>` tanpa atribut `type="button"` dapat memicu pengiriman form (form submission) atau event bubbling yang tidak disengaja jika diletakkan di dalam hierarki komponen tertentu, yang dapat menyebabkan reload halaman secara tidak sengaja.

### Solusi Teknis
Selalu tetapkan `type="button"` dan panggil `e.preventDefault()` serta `e.stopPropagation()` pada event `onClick` tombol kontrol interaktif seperti "Run Demo", "Load Replay", dan tombol stepper.

---

## 4. Demo Router Prefix Mismatch (`/api/demo/start` 404) & 1 ms UI Reset

### Masalah
Ketika tombol "Run Demo" diklik, browser menampilkan error `POST http://localhost:8000/api/demo/start 404 (Not Found)` dan komponen guided demo runner langsung berkedip/reset dalam <1ms.
- **Akar Masalah Router:** `backend/app/routers/demo_router.py` didefinisikan dengan `prefix="/demo"` dan di-include ke `main.py` tanpa `/api` prefix (`app.include_router(demo_router.router)`), sehingga FastAPI mendaftarkan route di `/demo/start` bukan `/api/demo/start`. Frontend `api.ts` menembak `/api/demo/start`, menyebabkan HTTP 404.
- **Akar Masalah Reset 1ms:** Saat `api.demo.start()` melemparkan exception 404, fungsi `start()` di `useDemoState.ts` mengeksekusi `setIsRunning(true)` tepat sebelum fetch dan `setIsRunning(false)` di dalam block `catch`, sehingga tampilan running hanya bertahan selama 1ms sebelum di-reset secara kasar.

### Solusi Teknis
1. Ubah router prefix di [demo_router.py](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/routers/demo_router.py) menjadi `prefix="/api/demo"`.
2. Di `useDemoState.ts`, tambahkan fallback otomatis ke state fixture mock lokal (`belawan-demo-offline`) saat backend tidak terjangkau atau bermasalah dalam mode demo offline, sehingga antarmuka Guided Demo Runner tidak pernah berkedip/reset 1ms.
