# Phase 97 — Mapbox Directions API Street Snapping, Fleet Precomputation & Dual-Layer Hazard Avoidance

**Milestone:** M6 — Turn-by-Turn Road Snapping, Offline Fleet Precomputation & Dual-Layer Hazard Avoidance  
**Status:** COMPLETE  
**Created:** 2026-10-23  
**Decisions Source:** User Grill-Me Alignment Session (2026-10-23) & Implementation Plan  
**Dependencies:** Phase 87, Phase 88, Phase 90, Phase 92-95  

---

## 1. Executive Summary & Goal

PreHub saat ini memiliki dua anomali garis lurus (*straight-line polylines*):
1. **Garis Oranye pada Dot Hijau Truk (`deck-fleet-estimated-routes`):** Truk yang bergerak dengan status `ROUTE_ESTIMATED` menarik garis oranye lurus menembus gedung, permukiman, dan sungai karena skrip pembuat koridor [`scripts/generate_snapped_fleet_corridors.py`](file:///c:/Farras/DIGDAYA/peta-nadi/scripts/generate_snapped_fleet_corridors.py) menggunakan interpolasi linier sederhana (`lerp`) antar 3–5 kota dan bukan geometri jalan raya riil.
2. **Garis Rute Darat Dinamis pada Peta (`CrisisMap.tsx`):** Rute darat antar simpul makro graf CPU solver sering kali digambar sebagai garis lurus antartitik jika koordinat simpul tidak disambungkan dengan jaringan jalan raya nyata.

**Tujuan Phase 97:**
Menghilangkan seluruh garis lurus memotong gedung pada peta dengan mengintegrasikan Mapbox Directions API (`mapbox/driving` atau `mapbox/driving-traffic`) secara presisi, sekaligus memproteksi kuota Free Tier (100.000 req/bulan) dari risiko kehabisan melalui strategi **Prekomputasi Offline Koridor Armada**, menerapkan **Dual-Layer Hazard Avoidance** (`exclude=point` + *Forced Tangential Waypoint*), dan menyambungkan rekomendasi simpul CPU solver ke jalan raya nyata (*Macro-Node Street Stitcher*).

---

## 2. Locked Architectural Decisions (Hasil Konsensus Grill-Me)

Berdasarkan wawancara terarah `/grill-me` bersama pengguna pada 2026-10-23:

1. **D-01 (Fleet Corridors Strategy): Precompute Offline ke JSON.**
   - Generator skrip [`scripts/generate_snapped_fleet_corridors.py`](file:///c:/Farras/DIGDAYA/peta-nadi/scripts/generate_snapped_fleet_corridors.py) memanggil Mapbox Directions API satu kali (*one-shot offline batch*) untuk menghasilkan GeoJSON LineString resolusi tinggi (>100–300 titik jalan per koridor).
   - Hasil disimpan ke [`backend/data/fleet_corridors_snapped.json`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/data/fleet_corridors_snapped.json) dan [`frontend/public/data/fleet_corridors_snapped.json`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/public/data/fleet_corridors_snapped.json).
   - *Rasional:* Mencegah 24–480 kendaraan memanggil API saat setiap page load, menghemat 100% kuota runtime (0 API calls per refresh), latensi muat 0 ms, dan animasi truk bergerak mulus di atas aspal.
2. **D-02 (Hazard Avoidance Engine): Dual-Layer Mechanism.**
   - *Layer 1 (Rintangan Titik / Jembatan Rusak / Longsor Titik)*: Menggunakan parameter `&exclude=point(lon lat)`.
   - *Layer 2 (Poligon Bencana Luas / Banjir BMKG / Titik Api FIRMS)*: Menggunakan **Forced Tangential Waypoint** ($R + 2.0\text{ km}$ clearance tegak lurus sumbu koridor) yang disisipkan sebagai 3-stop waypoints (`origin;waypoint;destination`).
   - *Rasional:* Mapbox API menolak `exclude=polygon(...)` (HTTP 422). Sedangkan `exclude=point(lon lat)` hanya memblokir segmen jalan terdekat (~25-50m) sehingga jika dipakai sendirian pada area banjir 2 km, kendaraan hanya dibelokkan ke gang sebelah yang tetap terendam air. Kombinasi keduanya menjamin rute ditarik sepenuhnya keluar dari poligon bahaya.
3. **D-03 (Macro-Node Stitching): Penyambungan Simpul Rekomendasi CPU Solver.**
   - Simpul-simpul makro hasil rekomendasi graf CPU deterministik (`r.legs[0].coordinates`) disambungkan ke aspal jalan raya via Mapbox Directions API (`geometries=geojson`, `overview=full`, `steps=true`) dengan in-memory cache 15 menit (`directionsCache`).
   - Jika offline atau tanpa token, rute darat tetap menampilkan status jujur `COMPROMISED` dengan tag `"TANPA GEOMETRI LIVE — GUNAKAN HOLD / ANTARMODA"` sesuai kaidah Phase 88 Hotfix.
4. **D-04 (Benchmark Scope): Manhattan Times Square Medan $\to$ USU.**
   - Simpul Manhattan Times Square Medan (`[98.6253, 3.5855]`) dan Kampus USU (`[98.6570, 3.5650]`) dipertahankan pada automated E2E test ([`frontend/e2e/mapbox-turn-by-turn.spec.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/e2e/mapbox-turn-by-turn.spec.ts)) dan script benchmark direct node, tanpa mengubah dropdown produksi `HUB_NODES`.

---

## 3. Scope Lock

### Berkas yang Boleh Dimodifikasi (In-Scope):
- [`scripts/generate_snapped_fleet_corridors.py`](file:///c:/Farras/DIGDAYA/peta-nadi/scripts/generate_snapped_fleet_corridors.py): Ganti interpolasi `lerp` dengan fungsi pemanggil Mapbox Directions API.
- [`backend/data/fleet_corridors_snapped.json`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/data/fleet_corridors_snapped.json): File target output koordinat jalan raya armada.
- [`frontend/public/data/fleet_corridors_snapped.json`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/public/data/fleet_corridors_snapped.json): Mirror frontend untuk fallback offline.
- [`frontend/lib/aiDynamicRouter.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts): Antarmuka `ExcludeOptions`, query builder `exclude`, fail-safe retry jika `NoRoute`.
- [`frontend/components/map/CrisisMap.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx): Verifikasi koordinat jalan raya pada layer `routes-source`.
- [`frontend/e2e/mapbox-turn-by-turn.spec.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/e2e/mapbox-turn-by-turn.spec.ts): Uji E2E kepatuhan satu arah, median Ring Road, dan parameter exclude.
- [`.planning/ROADMAP.md`](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/ROADMAP.md) & [`.planning/STATE.md`](file:///c:/Farras/DIGDAYA/peta-nadi/.planning/STATE.md): Sinkronisasi milestone M6 dan status fase 97.

### Berkas yang DILARANG Disentuh (Locked):
- [`backend/app/adapters/cpu_routing_adapter.py`](file:///c:/Farras/DIGDAYA/peta-nadi/backend/app/adapters/cpu_routing_adapter.py): Solver CPU deterministik 56 node tetap utuh. Dilarang memasukkan GPU solver.
- [`frontend/lib/mapboxRoutingService.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/mapboxRoutingService.ts): Daftar `HUB_NODES` produksi tidak diubah.
- Seluruh modul pada direktori [`agents/`](file:///c:/Farras/DIGDAYA/peta-nadi/agents/).

---

## 4. Work Packages (WPs)

### WP1: Offline Fleet Corridors Precomputation Script & Data Generation
- Perbarui [`scripts/generate_snapped_fleet_corridors.py`](file:///c:/Farras/DIGDAYA/peta-nadi/scripts/generate_snapped_fleet_corridors.py):
  - Ekstrak token dari `frontend/.env.local` atau argumen CLI.
  - Untuk setiap koridor armada (11 rute utama Trans-Sumatera), lakukan HTTP GET ke:
    `https://api.mapbox.com/directions/v5/mapbox/driving/{lon1,lat1;lon2,lat2}?geometries=geojson&overview=full&steps=true&access_token={token}`
  - Simpan array koordinat GeoJSON LineString hasil snapping ke `backend/data/fleet_corridors_snapped.json`.
  - Salin hasil ke `frontend/public/data/fleet_corridors_snapped.json`.
  - Sertakan rate limiter ringan (500ms delay antar-panggilan) agar tidak terkena burst rate limit Mapbox.

### WP2: Hardening Mapbox Client Router & Dynamic Exclude Builder
- Perbarui [`frontend/lib/aiDynamicRouter.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts):
  - Definisikan antarmuka `ExcludeOptions`:
    ```typescript
    export interface ExcludeOptions {
      excludeToll?: boolean;
      excludeMotorway?: boolean;
      excludePoints?: [number, number][];
    }
    ```
  - Bangun parameter URL dinamis: `&exclude=point(lon lat),point(lon lat),toll` (maksimal 8 titik terdekat untuk mencegah overflow URL).
  - Tambahkan try-catch auto-retry: jika respons Mapbox adalah `NoRoute` saat menggunakan `excludePoints`, jalankan retry instan tanpa `excludePoints` dan beri flag peringatan pada hasil rute.

### WP3: Dual-Layer Hazard Avoidance Integration
- Pada fungsi `calculateAIDynamicDetourRoutes` di [`frontend/lib/aiDynamicRouter.ts`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/aiDynamicRouter.ts):
  - Deteksi jenis bahaya:
    - Jika bahaya berskala titik (radius $< 500\text{ m}$): masukkan koordinatnya ke `excludeOptions.excludePoints`.
    - Jika bahaya berskala luas (radius $\ge 500\text{ m}$): hitung koordinat normal tangensial ($R + 2.0\text{ km}$) dan sisipkan sebagai forced waypoint di tengah-tengah rute.
  - Pastikan kalkulasi `calculateHazardExposureMetrics` mengonfirmasi eksposur bahaya $= 0\text{ km}$.

### WP4: Macro-Node Street Stitcher pada CrisisMap
- Di [`frontend/components/map/CrisisMap.tsx`](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx):
  - Periksa rute darat (`corridorClass === 'land'`). Jika rute yang diterima dari backend atau krisis hanya memiliki $\le 5$ titik simpul makro, hubungkan simpul-simpul tersebut menggunakan `fetchMapboxAlternativeDrivingRoutes`.
  - Masukkan array koordinat GeoJSON hasil snapping ke data source `routes-source`.

### WP5: Automated Verification & E2E Test Suite
- Perbarui dan jalankan tes otomatis:
  - `frontend/scripts/test_turn_by_turn.ts`: Validasi Manhattan Times Square Medan $\to$ USU menghasilkan $>200$ koordinat, mematuhi belokan satu arah / U-turn, dan eksposur $= 0\text{ km}$.
  - `frontend/e2e/mapbox-turn-by-turn.spec.ts`: Pastikan seluruh assertion Playwright lulus.
  - Typecheck `tsc --noEmit` bersih tanpa error.

---

## 5. Verification Gate (Kriteria Pembuktian Selesai)

1. **Integritas Geometri Armada (`fleet_corridors_snapped.json`):**
   - File JSON berisi koordinat aspal nyata (>50 titik per koridor).
   - Nilai delta koordinat bervariasi mengikuti lekuk jalan (bukan konstanta lerp linier).
2. **Kompilasi & Type Safety:**
   - `rtk npx tsc -p frontend/tsconfig.json --noEmit` exit code 0.
   - `python -m py_compile scripts/generate_snapped_fleet_corridors.py` exit code 0.
3. **Automated Benchmark Test:**
   - Eksekusi `frontend/scripts/test_turn_by_turn.ts` lulus 4/4 assertions.
   - Eksekusi `npx playwright test frontend/e2e/mapbox-turn-by-turn.spec.ts` lulus tanpa kegagalan.
4. **Visual & Runtime Proof:**
   - Garis oranye pada dot hijau truk di dashboard menempel di atas jalan raya, tidak menembus gedung atau perumahan.
