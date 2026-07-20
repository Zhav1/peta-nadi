# LEARNINGS — Phase 13: Mapbox/Deck.gl Spatiotemporal Layers & Drawing Tool

Dokumen ini mencatat kendala proyeksi peta 3D globe, penanganan event pointer Deck.gl vs MapboxDraw, dan perbaikan visualisasi rute logistik pada Phase 13.

---

## 1. Deck.gl ScatterplotLayer Floating pada Mapbox 3D Globe

### Masalah
Saat globe 3D diputar, di-tilt (pitch), atau di-zoom, node/pin krisis pada `ScatterplotLayer` terlihat melayang di atas permukaan tanah atau bergeser dari koordinat aslinya.
- **Akar Masalah**: Deck.gl `ScatterplotLayer` semula dirender tanpa atribut `billboard: true` dan tanpa elevasi ter-anchor (`[d.lon, d.lat]`), sehingga kalkulasi bounding box dalam ruang kamera 3D mengalami distorsi proyeksi terhadap terrain/globe Mapbox.

### Solusi Teknis
1. Di [layers.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/layers.ts), tambahkan `billboard: true` dan tetapkan elevasi 0 eksplisit pada `getPosition: (d) => [d.lon!, d.lat!, 0]`.
2. Di [CrisisMap.tsx](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/components/map/CrisisMap.tsx), tetapkan proyeksi Mapbox secara eksplisit ke `projection: { name: 'globe' }`.

---

## 2. Deck.gl Overlay Intercepting Mouse Events pada MapboxDraw

### Masalah
Ketika tombol "SIMULATE DISRUPTION" diklik (`drawModeActive = true`), kursor mouse tidak berubah menjadi pen/crosshair dan pengguna tidak bisa menggambarkan poligon di atas peta.
- **Akar Masalah**: Kontainer canvas `MapboxOverlay` milik Deck.gl berada di atas canvas Mapbox GL dengan `pointer-events: auto`, sehingga menyerap event mouse (`mousedown`, `mousemove`, `mouseup`) dan menghalangi MapboxDraw dari menerima input menggambar.

### Solusi Teknis
1. Di `CrisisMap.tsx`, saat `drawModeActive` bernilai `true`, cari elemen kontainer canvas Deck.gl overlay dan setel `pointer-events: none`, serta setel kursor canvas Mapbox ke `'crosshair'`.
2. Saat `drawModeActive` bernilai `false`, kembalikan `pointer-events: auto` pada Deck.gl dan reset kursor ke default.
3. Pada event `draw.create`, tangkap GeoJSON polygon, eksekusi callback simulasi, dan panggil `draw.deleteAll()` untuk membersihkan shape temporer secara rapi.

---

## 3. Perapihan Visual Rute Logistik & Penataan Waypoints

### Masalah
Garis rute pengalihan pada peta terlihat zig-zag melompati wilayah (*hallucinated lines*).
- **Akar Masalah**: Fixture `mock_crisis_state.json` dan fallback hook hanya menyimpan 4 titik waypoints yang jaraknya sangat berjauhan (contoh: Belawan langsung melompat ke Tebing Tinggi lalu memutar balik ke barat).

### Solusi Teknis
1. Perbarui daftar waypoints pada `mock_crisis_state.json`, `demo_router.py`, dan `useDemoState.ts` dengan koordinat beresolusi tinggi yang mengikuti geometris koridor Jalan Tol Medan-Tebing Tinggi / Jalinsum (Belawan -> Tanjung Mulia -> Amplas -> Lubuk Pakam -> Perbaungan -> Tebing Tinggi -> Pematangsiantar).
2. Di `buildRoutePathsLayer` ([layers.ts](file:///c:/Farras/DIGDAYA/peta-nadi/frontend/lib/layers.ts)), aktifkan `jointRounded: true`, `capRounded: true`, `billboard: true`, dan defaultkan rute index 0 sebagai cyan aktif jika `activeIdx` tidak ditetapkan.
