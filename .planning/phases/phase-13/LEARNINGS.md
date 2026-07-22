# LEARNINGS — Phase 13: Mapbox/Deck.gl Spatiotemporal Layers & Drawing Tool

Dokumen ini mencatat kendala proyeksi peta 3D globe, penanganan event pointer Deck.gl vs MapboxDraw, kalkulasi kurvatur rute Great Circle, dan penggantian browser `alert()` pada Phase 13.

---

## 1. Deck.gl ScatterplotLayer Floating pada Mapbox 3D Globe

### Masalah
Saat globe 3D diputar, di-tilt (pitch), atau di-zoom, node/pin krisis pada `ScatterplotLayer` terlihat melayang di atas permukaan tanah atau bergeser dari koordinat aslinya.
- **Akar Masalah**: Deck.gl `ScatterplotLayer` semula dirender tanpa atribut `billboard: true` dan tanpa elevasi ter-anchor (`[d.lon, d.lat]`), sehingga kalkulasi bounding box dalam ruang kamera 3D mengalami distorsi proyeksi terhadap terrain/globe Mapbox.

### Solusi Teknis (Dari Benchmark Spatial Matrix Anchor)
1. Di [layers.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/layers.ts), tambahkan `positionFormat: 'XYZ'`, `billboard: true`, dan tetapkan elevasi 0 eksplisit pada `getPosition: (d) => [d.lon!, d.lat!, 0]`.
2. Di [CrisisMap.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx), tetapkan proyeksi Mapbox secara eksplisit ke `projection: { name: 'globe' }`.

---

## 2. Event Pointer & MapboxDraw Interaction Isolation

### Masalah
Ketika tombol "SIMULATE DISRUPTION" diklik (`drawModeActive = true`), kursor mouse tidak berubah menjadi crosshair dan pengguna kesulitan menggambar poligon karena dragging mouse justru menggeser (pan) peta.
- **Akar Masalah**: Kontainer canvas Mapbox GL menangkap mouse drag sebagai gesture `dragPan` sehingga MapboxDraw tidak bisa membuat segmen garis poligon secara mulus.

### Solusi Teknis (Dari Benchmark Event Isolation)
1. Di `CrisisMap.tsx`, saat `drawModeActive` bernilai `true`:
   - Panggil `map.dragPan.disable()` untuk mencegah geser peta saat drawing aktif.
   - Setel kursor canvas Mapbox ke `'crosshair'`.
   - Tampilkan floating status badge `SIMULATING DISRUPTION AREA...`.
2. Saat `drawModeActive` bernilai `false` atau drawing selesai (`draw.create` event):
   - Panggil `map.dragPan.enable()`.
   - Reset kursor ke default (`''`).
3. Tambahkan guard threshold 5px pergeseran mouse pada event click pin krisis untuk membedakan klik intentional dari drag peta.

---

## 3. Densifikasi Lintasan Rute Logistik (Great Circle Arc)

### Masalah
Garis rute pengalihan armada pada peta terlihat zig-zag melompati wilayah (*hallucinated lines*) ketika waypoint berjarak jauh.

### Solusi Teknis (Dari Benchmark Geometry Densifier)
1. Buat modul [pathDensifier.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/pathDensifier.ts) yang mengimplementasikan Haversine distance, `shortestDeltaLongitude`, dan `normalizeLongitude` untuk mendensifikasi waypoints setiap ~30km sepanjang busur lingkar besar (Great Circle Arc).
2. Di `buildRoutePathsLayer` ([layers.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/layers.ts)), aktifkan `wrapLongitude: true`, `jointRounded: true`, `capRounded: true`, dan jalankan `densifyPath` pada waypoints rute maupun rute maritim Selat Malaka.

---

## 4. Eliminasi Native Browser Alert() & Sistem Toast UI

### Masalah
Beberapa komponen UI (seperti `SimulationSection.tsx` dan `GuidedDemoPanel.tsx`) memanggil `window.alert()` browser native yang merusak pengalaman antarmuka *glassmorphic command center*.

### Solusi Teknis
1. Ganti panggilan `alert()` dengan state notification Toast di `SimulationSection.tsx` dan `GuidedDemoPanel.tsx`.
2. Tampilkan Toast di layer `z-[10000]` dengan backdrop blur `bg-[#090a0f]/95` bertema *Command Center*.
