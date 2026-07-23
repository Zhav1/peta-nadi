# PLAN — Phase 24: Google Flow-Style Onboarding Landing Page, Video Background, 121-Frame Canvas Sequence & High-Performance Routing

**Phase:** 24  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** Membangun halaman **Onboarding Landing Page** tingkat dunia berbasis bahasa desain **Google Flow / Google Labs** pada rute utama (`/`) sebelum pengguna masuk ke **4D Crisis Command Center** (`/dashboard`). Halaman ini mengombinasikan latar belakang video ambient (`hero-bg.mp4`), kanvas animasi *scroll-driven* **121-frame image sequence** (`action-sequence/`), *kinetic split-typography* dengan lencana geometris kontras tinggi, kartu fitur interaktif *glassmorphic*, serta performa 60 FPS tanpa *memory leak*.

---

## 🔍 Context & Technical Requirements Analysis

### 1. Kebutuhan Estetika (Google Flow + Anti-AI-Slop Hybrid)
Berdasarkan sampel desain Google Flow / Google Labs dan panduan skill `ui-ux-pro-max` & `ui-styling`:
* **Kinetic Typography & Shape Accents:** Headlines berukuran ekstra besar (*exaggerated minimalism*) dengan potongan kata yang di-highlight menggunakan bentuk geometris organik (*pastels & vibrant shapes*: lime green pill, tactical cyan circle, bright orange hexagon, amber yellow badge).
* **Dark Glassmorphism Base:** Warna latar belakang dasar `#080d14` (Deep Space Navy) yang selaras dengan tema dashboard PetaNadi, dipadukan dengan kartu *glassmorphism 2.0* (`backdrop-blur-xl bg-[#0c0e12]/80 border border-white/10`).
* **Interactive Feature Carousel:** Modul kartu interaktif yang menampilkan 6 Agen LangGraph, cuOpt GPU Routing, GraphRAG Causal Engine, dan Telemetri Real-Time PIHPS/BMKG.
* **Kepatuhan AGENTS.md:** 100% menggunakan Lucide SVG icons (bebas emoji), `cursor-pointer` di seluruh elemen interaktif, transisi `150ms - 300ms ease-in-out`, dan bebas gradient ungu/pink AI generik.

### 2. Aset & Pipeline Media Berkinerja Tinggi
Aset yang disediakan di folder `onboard/`:
* `onboard/hero-bg.mp4` (4.85 MB video) $\rightarrow$ Disalin ke `frontend/public/onboard/hero-bg.mp4`.
* `onboard/action-sequence/` (121 frame: `ezgif-frame-001.jpg` s/d `ezgif-frame-121.jpg`) $\rightarrow$ Disalin ke `frontend/public/onboard/action-sequence/`.

**Tantangan Performa & Solusi:**
1. **Memory Thrashing & Canvas Render Delay:** Memuat 121 gambar secara langsung ke DOM akan menghancurkan performa browser. Solusinya: Pre-instantiate 121 objek `HTMLImageElement` di dalam memori array `useRef` saat *mount*.
2. **Scroll Lag & Main Thread Blocking:** Pemanggilan `drawImage` pada setiap pixel *scroll* membuat browser patah-patah. Solusinya: Menggunakan *passive scroll listener* (`{ passive: true }`) + `requestAnimationFrame` (RAF) loop yang hanya menggambar ke kanvas ketika **indeks frame terhitung berubah** (`Math.floor(scrollRatio * 120)`).
3. **Hardware Offloading saat Unfocused:** Menjeda (*pause*) RAF loop kanvas dan `video.pause()` secara otomatis menggunakan `IntersectionObserver` ketika bagian kanvas/hero terdorong keluar dari *viewport*.
4. **Aspect Ratio Cover Math:** Menghitung skala kanvas dinamis (`Math.max(canvasWidth / imgWidth, canvasHeight / imgHeight)`) di dalam konteks 2D agar frame gambar selalu *cover* sempurna tanpa distorsi rasio pada layar 375px hingga 4K.

### 3. Arsitektur Rute & Navigasi
* `app/page.tsx` $\rightarrow$ Halaman Onboarding Landing Page (`OnboardingHome.tsx`).
* `app/dashboard/page.tsx` $\rightarrow$ Halaman 4D Crisis Command Center (`DashboardClient.tsx`).
* Navigasi Seamless: Tombol CTA `[ Buka Command Center 4D ➔ ]` di Onboarding akan mendorong Next.js router (`router.push('/dashboard')`) atau me-load komponen secara halus. Tambahkan tombol `[ ◄ Landing Page ]` di top-bar `DashboardClient` agar pengguna dapat kembali ke halaman Onboarding.

---

## 🛠️ Detailed Technical Deliverables

---

### DELIVERABLE 1 — Aset Synchronization & Asset Pipeline Setup

**Lokasi:** Root `onboard/` $\rightarrow$ `frontend/public/onboard/`

**Tujuan:** Memastikan `hero-bg.mp4` dan 121 frame JPEG dari `onboard/action-sequence/` dapat diakses oleh Next.js static asset server dengan HTTP caching header yang optimal.

**Aksi Komando:**
1. Buat direktori `frontend/public/onboard/action-sequence/`.
2. Salin `hero-bg.mp4` dan seluruh `ezgif-frame-*.jpg` ke `frontend/public/onboard/`.

---

### DELIVERABLE 2 — High-Performance Scroll-Driven Image Sequence Canvas Component

**File:** `frontend/components/onboard/ImageSequenceCanvas.tsx` [NEW]

**Tujuan:** Me-render 121 frame gambar secara responsif di atas HTML5 `<canvas>` 60 FPS yang dikendalikan oleh posisi *scroll* pengguna.

**Spesifikasi Teknis Kode:**
```tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';

const TOTAL_FRAMES = 121;

export default function ImageSequenceCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imagesRef = useRef<HTMLImageElement[]>([]);
  const currentFrameRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);
  const [loadedCount, setLoadedCount] = useState<number>(0);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);

  // 1. Preload 121 frame images into memory array
  useEffect(() => {
    let loaded = 0;
    const imgs: HTMLImageElement[] = [];

    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      const frameNum = String(i).padStart(3, '0');
      img.src = `/onboard/action-sequence/ezgif-frame-${frameNum}.jpg`;
      img.onload = () => {
        loaded++;
        setLoadedCount(loaded);
        if (loaded === TOTAL_FRAMES) {
          setIsLoaded(true);
        }
      };
      imgs.push(img);
    }
    imagesRef.current = imgs;
  }, []);

  // 2. Render Frame with Cover Aspect Ratio
  const drawFrame = (frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = imagesRef.current[frameIndex];
    if (!img || !img.complete) return;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Calculate aspect ratio cover math
    const imgWidth = img.naturalWidth || 1920;
    const imgHeight = img.naturalHeight || 1080;
    const scale = Math.max(canvasWidth / imgWidth, canvasHeight / imgHeight);
    const x = (canvasWidth - imgWidth * scale) / 2;
    const y = (canvasHeight - imgHeight * scale) / 2;

    ctx.drawImage(img, x, y, imgWidth * scale, imgHeight * scale);
  };

  // 3. Resize Canvas Handler
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (canvas && container) {
        canvas.width = container.clientWidth;
        canvas.height = container.clientHeight;
        drawFrame(currentFrameRef.current);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isLoaded]);

  // 4. Passive Scroll Event Listener & RAF Throttling
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isLoaded) return;

    const handleScroll = () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);

      rafIdRef.current = requestAnimationFrame(() => {
        const rect = container.getBoundingClientRect();
        const windowHeight = window.innerHeight;
        const totalScrollable = container.clientHeight - windowHeight;

        if (totalScrollable <= 0) return;

        // Calculate progress from 0.0 to 1.0 within container bounds
        const scrollProgress = Math.min(Math.max(-rect.top / totalScrollable, 0), 1);
        const frameIndex = Math.min(
          Math.floor(scrollProgress * (TOTAL_FRAMES - 1)),
          TOTAL_FRAMES - 1
        );

        if (frameIndex !== currentFrameRef.current) {
          currentFrameRef.current = frameIndex;
          drawFrame(frameIndex);
        }
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isLoaded]);

  return (
    <div ref={containerRef} className="relative w-full h-[300vh] bg-[#080d14]">
      <div className="sticky top-0 w-full h-screen overflow-hidden flex items-center justify-center">
        <canvas ref={canvasRef} className="w-full h-full object-cover block" />
        
        {/* Loading Overlay State */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-[#080d14]/90 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-20">
            <div className="w-10 h-10 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            <div className="text-slate-400 text-xs font-mono tracking-widest uppercase">
              Loading Sequence... {Math.round((loadedCount / TOTAL_FRAMES) * 100)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### DELIVERABLE 3 — Google Flow Kinetic Hero Section Component

**File:** `frontend/components/onboard/OnboardHero.tsx` [NEW]

**Tujuan:** Menyediakan Hero Section berkelas tinggi dengan latar belakang video `hero-bg.mp4`, *kinetic split-typography* dengan lencana geometris (lime green pill & cyan blob), serta tombol penyeruan tindakan (CTA) utama.

**Spesifikasi Fitur Utama:**
* **Video Loop Container:** Video HTML5 `hero-bg.mp4` dengan atribut `muted loop autoPlay playsInline`.
* **Dark Radial Gradient Mask:** Overlay `bg-gradient-to-b from-[#080d14]/40 via-[#080d14]/80 to-[#080d14]` untuk menjamin tingkat keterbacaan teks 100%.
* **Kinetic Headline Typography:**
  * *"Be the fir<span className="bg-emerald-400 text-slate-950 px-2 py-0.5 rounded-full inline-block transform -rotate-2 font-black">st</span> to experi<span className="bg-cyan-400 text-slate-950 px-2 py-0.5 rounded-full inline-block transform rotate-1 font-black">ment</span> with 4D Logistics Intelligence."*
* **CTA Buttons:**
  * Primary Button: `[ 🚀 Launch Command Center 4D ➔ ]` (berpindah rute ke `/dashboard`).
  * Secondary Button: `[ ⚡ Explore Agent Swarm ]` (*smooth scroll* ke bagian kanvas sequence).

---

### DELIVERABLE 4 — Interactive Feature Grid & Live Telemetry Showcase Components

**File:** `frontend/components/onboard/KineticFeatureGrid.tsx` [NEW]  
**File:** `frontend/components/onboard/LiveTelemetryShowcase.tsx` [NEW]

**Tujuan:** Menyajikan fitur-fitur unggulan PetaNadi dalam bentuk kartu interaktif ala Google Labs dengan *hover elevation* dan lencana geometris berwarna.

**Detail Kartu Fitur (Kinetic Feature Grid):**
1. **Card 1 — 4D Spatial GIS Mapbox:** High-resolution dynamic route polyline, organic hazard polygons, 3D Globe anchor. (Lencana: Lime Green Pill)
2. **Card 2 — LangGraph 6-Agent Swarm:** Data Collection, OSINT, TFT Prediction, cuOpt Routing, Economic Intel, Copilot XAI. (Lencana: Tactical Cyan Blob)
3. **Card 3 — NVIDIA cuOpt Avoidance Router:** 18 verified OSM intersection nodes, $R+2\text{km}$ tangential danger clearance. (Lencana: Warm Orange Hexagon)
4. **Card 4 — GraphRAG Causal Chain:** Supply chain dependency graph, Belawan port closure cascade model. (Lencana: Purple Air Badge)
5. **Card 5 — PIHPS Economic Intelligence:** Inflation multiplier forecasts, commodity price anomaly alerts. (Lencana: Amber Warning Quad)
6. **Card 6 — Consensus Gate (>85%):** Multi-sensor validation pipeline, zero false alarms guarantee. (Lencana: Emerald Success Shield)

---

### DELIVERABLE 5 — Onboarding Master Page & Footer Components

**File:** `frontend/components/onboard/OnboardNav.tsx` [NEW]  
**File:** `frontend/components/onboard/OnboardFooter.tsx` [NEW]  
**File:** `frontend/components/onboard/OnboardingHome.tsx` [NEW]

**Detail OnboardNav:**
* Top navigation bar melayang (`sticky top-0 z-50 backdrop-blur-xl bg-[#080d14]/80 border-b border-white/10`).
* Logo PetaNadi 4D dengan indikator *live pulse status* (`● SYSTEM ONLINE`).
* Link navigasi cepat: `[ Features ]`, `[ Architecture ]`, `[ Live Telemetry ]`.
* CTA Button: `[ Launch Dashboard ➔ ]`.

**Detail OnboardFooter:**
* Menampilkan teks macro typography ala Google Labs: **PetaNadi** dalam font ultra-bold berukuran raksasa (`text-[10vw] font-black tracking-tighter text-white/10 select-none`).
* Informasi hak cipta, kredit teknologi (Next.js, Mapbox, Deck.gl, NVIDIA cuOpt, LangGraph, Supabase), dan tautan dokumentasi.

---

### DELIVERABLE 6 — Route Architecture Migration

**File:** `frontend/app/page.tsx` [MODIFY]  
**File:** `frontend/app/dashboard/page.tsx` [NEW]  
**File:** `frontend/components/dashboard/DashboardClient.tsx` [MODIFY]

**Langkah Migrasi Rute:**
1. Buat `frontend/app/dashboard/page.tsx` yang memuat `DashboardClient`.
2. Ubah `frontend/app/page.tsx` untuk me-render `OnboardingHome`.
3. Di dalam `DashboardClient.tsx`, tambahkan tombol navigasi balik `[ ◄ Onboarding Landing ]` pada top header bar agar pengguna dapat kembali ke Onboarding kapan saja.

---

## 🧪 Verification & Quality Control Checklist

- [ ] **Asset Pipeline Verification:**
  - `http://localhost:3000/onboard/hero-bg.mp4` dapat diputar di browser.
  - `http://localhost:3000/onboard/action-sequence/ezgif-frame-001.jpg` s/d `121.jpg` terakses sempurna.
- [ ] **Canvas Performance Audit:**
  - Sequence canvas memuat 121 frame tanpa memicu *out of memory* error.
  - Smooth 60 FPS scrolling dikonfirmasi melalui Chrome DevTools Performance tab.
  - RAF loop dan video dipause secara otomatis saat elemen berada di luar *viewport*.
- [ ] **Kinetic Typography & Design Audit:**
  - Headings mengikuti estetika Google Flow dengan lencana geometris (lime, cyan, orange, yellow).
  - 100% menggunakan ikon Lucide SVG (zero emoji).
  - Seluruh tombol/kartu memiliki `cursor-pointer` dan transisi `150ms-300ms`.
- [ ] **Navigation & Routing Test:**
  - Membuka `/` menampilkan Halaman Onboarding Google Flow.
  - Menglik `[ Launch Dashboard ➔ ]` berpindah ke `/dashboard` (Command Center).
  - Mengklik `[ ◄ Onboarding ]` di `/dashboard` kembali ke `/`.
- [ ] **TypeScript Build Check:**
  - `npm run build` di folder `frontend/` berhasil tanpa error TypeScript / ESLint.
