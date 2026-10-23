# Phase 98 — Mapbox Mercator Projection Synchronization & Floating Deck.gl Layer Anchoring

**Milestone:** M6 — Turn-by-Turn Road Snapping, Offline Fleet Precomputation & Dual-Layer Hazard Avoidance  
**Status:** READY TO EXECUTE  
**Created:** 2026-10-23  
**Root Cause:** Camera/viewport matrix desynchronization between Mapbox GL JS v3 `projection: { name: 'globe' }` and Deck.gl v9 `GlobeViewport` (ignoring `pitch: 35` and `bearing`, and masking Web Mercator transition at zoom 6.0–12.0).  

---

## 1. Executive Summary & Problem Diagnosis

### Fenomena Anomali:
- Saat globe di-zoom out, seluruh titik armada truk/kapal (Deck.gl dots), garis rute oranye, dan cincin pulse melayang di angkasa luar di atas wilayah Kamboja dan Vietnam.
- Saat peta dimiringkan (`pitch: 35`) atau diputar (`bearing`), kanvas Deck.gl tetap mematung di ruang hampa sementara bola bumi 3D berputar di bawahnya.
- Saat di-zoom in mendekati Sumatera (zoom 6–12), elemen mendekati daratan tetapi mengalami *parallax drift* (meluncur dan bergeser lepas dari aspal jalan saat peta digeser).
- Kotak bidik `TargetLockReticle` menembak koordinat jalan di Sumatera, terpisah ratusan piksel dari ikon truk yang melayang di angkasa.

### Akar Masalah Matematis:
1. [`CrisisMap.tsx:634`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx#L634) menginisialisasi Mapbox dengan `projection: { name: 'globe' }`.
2. `@deck.gl/mapbox` mendeteksi ini dan menetapkan `GlobeView` dengan `GlobeViewport`.
3. `GlobeViewport` Deck.gl **tidak mendukung parameter `pitch` maupun `bearing`** (dihitung murni flat top-down `pitch = 0°`). Selisih sudut kemiringan 35° (`pitch: 35`) melempar proyeksi piksel armada Sumatera (~0.5° LU) melenceng ~350 piksel ke arah utara (12°–15° LU di atas Indochina).
4. Pada zoom $\ge 6.0$, Mapbox GL JS v3 sebenarnya telah meratakan bola bumi menjadi bidang Web Mercator (`mercatorFromTransition`), tetapi method `map.getProjection()` di Mapbox tetap melaporkan `{ name: 'globe' }`. Deck.gl tertipu dan tetap menggunakan rumus bola `GlobeViewport` hingga zoom 12.0, memicu *parallax slipping* saat digeser.

**Tujuan Phase 98:**  
Mengunci 100% seluruh elemen grafis (armada truk, kapal, pesawat, rute oranye, cincin pulse, label teks, dan reticle bidik) menempel sempurna di atas aspal jalan raya dan perairan Sumatera di seluruh level zoom, kemiringan 3D (pitch 0°–85°), dan rotasi kompas (bearing 0°–360°).

---

## 2. Locked Decisions

1. **D-01: Migrasi Proyeksi Mapbox ke Web Mercator.**
   - Di [`frontend/components/map/CrisisMap.tsx:634`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx#L634), ganti `projection: { name: 'globe' }` menjadi `projection: { name: 'mercator' }`.
   - *Rasional:* PreHub adalah sistem operasional logistik koridor Sumatera (rentang operasional zoom 6.0–12.0). Proyeksi Web Mercator (EPSG:3857) adalah standar industri navigasi yang menjamin `@deck.gl/mapbox` menginstansiasi `MapView` dengan `WebMercatorViewport`.
2. **D-02: Sinkronisasi Matriks Proyeksi 1:1 Pixel-Perfect.**
   - `WebMercatorViewport` Deck.gl mengonsumsi `center`, `zoom`, `pitch`, dan `bearing` secara simultan dengan rumus yang identik $1:1$ dengan `Transform.calcMatrices()` internal Mapbox GL JS v3.
   - Kanvas Deck.gl bergerak, miring, dan berputar dalam satu kesatuan sinkron (*lockstep*) dengan layer dasar Mapbox.
3. **D-03: Sinkronisasi Target Lock Reticle.**
   - Reticle bidik pada [`TargetLockReticle.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/TargetLockReticle.tsx) membidik tepat di atas ikon armada tanpa offset piksel sedikit pun.

---

## 3. Scope Lock

### Berkas yang Boleh Dimodifikasi (In-Scope):
- [`frontend/components/map/CrisisMap.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx): Ubah konfigurasi proyeksi peta dari `globe` ke `mercator`.
- [`frontend/components/dashboard/AnalyticsSection.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/AnalyticsSection.tsx): Tambahkan konfigurasi `projection: { name: 'mercator' }` secara eksplisit sebagai defensive guard.
- [`frontend/e2e/mapbox-turn-by-turn.spec.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/e2e/mapbox-turn-by-turn.spec.ts): Tambahkan pengujian E2E verifikasi anchoring elemen (memastikan `map.getProjection().name === 'mercator'` dan elemen tidak mengalami pergeseran viewport).
- [`.planning/ROADMAP.md`](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/ROADMAP.md) & [`.planning/STATE.md`](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/STATE.md): Catat Phase 98 di Milestone M6.

### Berkas yang DILARANG Disentuh (Locked):
- [`frontend/components/map/FleetVehicleLayer.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/FleetVehicleLayer.tsx): Arsitektur `MapboxOverlay` dan shader Deck.gl sudah benar; tidak perlu diubah.
- [`backend/app/adapters/cpu_routing_adapter.py`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/adapters/cpu_routing_adapter.py): Solver CPU deterministik tetap terkunci.
- Seluruh modul pada direktori [`agents/`](file:///c:/Farras/DIGDAYA/peta-nadi/agents/).

---

## 4. Work Packages (WPs)

### WP1: Projection Cutover to Mercator on CrisisMap
- Di [`frontend/components/map/CrisisMap.tsx:634`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx#L634):
  - Ubah:
    ```typescript
    projection: { name: 'globe' },
    ```
    Menjadi:
    ```typescript
    projection: { name: 'mercator' },
    ```
- Di [`frontend/components/dashboard/AnalyticsSection.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/dashboard/AnalyticsSection.tsx):
  - Pastikan instance peta analitik juga menggunakan `projection: { name: 'mercator' }`.

### WP2: Automated Projection & Layer Anchoring E2E Spec
- Di [`frontend/e2e/mapbox-turn-by-turn.spec.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/e2e/mapbox-turn-by-turn.spec.ts) (atau spec baru):
  - Tambahkan assertion otomatis:
    1. Periksa `window.mapboxMap.getProjection().name === 'mercator'`.
    2. Jalankan simulasi gestur pitch (`map.setPitch(45)`), bearing (`map.setBearing(60)`), dan zoom out (`map.setZoom(3)`).
    3. Verifikasi bahwa koordinat hasil proyeksi `map.project([lng, lat])` sinkron dengan posisi rendered canvas Deck.gl tanpa drifting.

### WP3: Typecheck & Full Pipeline Validation
- Jalankan `tsc --noEmit` untuk menjamin 0 error kompilasi.
- Jalankan Playwright E2E suite untuk memvalidasi rendering antarmuka.

---

## 5. Verification Gate (Kriteria Selesai)

1. **Konfirmasi API Mapbox**:
   - `map.getProjection().name` mengembalikan `"mercator"`.
2. **Kompilasi TypeScript**:
   - `node frontend/node_modules/typescript/bin/tsc --noEmit -p frontend/tsconfig.json` exit code 0.
3. **Automated E2E Testing**:
   - Test suite Playwright lulus 100%.
4. **Visual Anchoring Verification**:
   - Saat zoom out, dot armada tidak lagi terbang ke angkasa di atas Kamboja/Vietnam, melainkan tetap berada di posisi geografis aslinya di Sumatera.
   - Saat zoom in, pan, tilt pitch 35°, dan rotasi bearing, rute oranye dan dot truk terkunci rapat di atas jalan raya tanpa meluncur (*0 pixel drift*).
