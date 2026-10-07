# LEARNINGS — Phase 15: Google Maps-Grade Multi-Alternative AI Routing, Hazard Detection & Modality Intelligence

**Phase:** 15  
**Date:** 2026-07-22  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Ingested Skills:** `mapbox-geospatial-operations`, `logistics-routing-vrp`, `mapbox-google-maps-migration`, `nextjs-mapbox-deckgl`, `mapbox-data-visualization-patterns`

---

## 💡 Executive Summary & Core Architectural Insights

Phase 15 adalah sesi debugging dan feature engineering terpanjang dalam proyek ini — mencakup 4 iterasi perbaikan engine hazard bypass, 3 root-cause analysis mendalam, dan rewrite total `aiDynamicRouter.ts`. Hasilnya adalah sistem routing yang benar-benar terintegrasi dengan Mapbox API (bukan simulasi frontend) dan detection logic yang match dengan apa yang user lihat secara visual di peta.

Lesson terpenting dari phase ini: **jangan percaya bahwa karena kode "terlihat benar", sistem sudah bekerja seperti yang diharapkan.** Setiap layer abstraksi (UI → state → engine → API → polyline → detection) bisa menyembunyikan mismatch yang tidak terlihat sampai dilakukan tracing end-to-end.

---

## 🔑 Key Technical Lessons

### 1. Mapbox Waypoints: Hint vs Mandatory Stop — Perbedaan Kritis

**Problem:**  
`fetchMapboxAlternativeDrivingRoutes(origin, destination, [waypointCoord])` meneruskan waypoint sebagai parameter opsional. Mapbox Directions API memperlakukan ini sebagai *hint* — jika ada rute lebih cepat yang tidak melewati waypoint tersebut, Mapbox **bebas mengabaikannya**. Hasilnya: engine bypass memanggil Mapbox dengan bypass waypoint, tapi Mapbox tetap mengembalikan rute yang sama menembus hazard zone, `isBypassClean` selalu `false`, tidak ada rute hijau yang pernah terbuat.

**Solution:**  
Buat fungsi terpisah `fetchMapboxRouteWithForcedWaypoint(origin, dest, forcedWaypoint, token)` yang meng-encode **3 koordinat eksplisit** dalam satu URL path:

```
GET /directions/v5/mapbox/driving-traffic/
  lon_origin,lat_origin;        ← titik 1
  lon_waypoint,lat_waypoint;    ← titik 2 (MANDATORY — bukan hint)
  lon_dest,lat_dest             ← titik 3
```

Dengan format ini, Mapbox **wajib** membuat rute melalui titik tengah. Titik tengah adalah intermediate stop, bukan preference.

**Rule of Thumb:**  
- `?waypoints=...` parameter → hint, bisa diabaikan
- `;coordinate;` dalam URL path → mandatory stop, tidak bisa dilewati

---

### 2. Math-Offset Waypoints Jatuh di Luar Jaringan Jalan

**Problem:**  
Engine bypass lama menghitung waypoint dari perpendicular vector matematika:

```
offsetDeg = (radius + 3.0) / 111.0
waypoint = [hazardLon + nx * offsetDeg, hazardLat + ny * offsetDeg]
```

Untuk hazard di Lubuk Pakam dengan radius 15 km:
- `clearanceKm = 18 km` → `offsetDeg = 0.162°`
- Perpendicular dari Belawan→Medan = arah barat
- Hasilnya: `[98.87 - 0.162, 3.56]` = `[98.708, 3.56]`

Koordinat `[98.708, 3.56]` jatuh di **Kecamatan Percut Sei Tuan** — persawahan, bukan jalan arteri. Mapbox snap ke jalan terdekat yang jauh, menghasilkan rute yang "terlalu muter" atau bahkan melalui permukiman kecil.

**Solution:**  
Ganti semua math-offset dengan **database 18 simpul jalan nyata** yang divalidasi dari OSM/Google Maps:

```typescript
export const HIGHWAY_JUNCTION_NODES = [
  { id: 'jl_adam_malik_tengah', name: 'Jl. Adam Malik (Persimpangan Gatot)',
    coords: [98.6680, 3.6701], region: 'medan_utara' },
  { id: 'jl_gagak_hitam_helvetia', name: 'Jl. Gagak Hitam / Ring Road Helvetia',
    coords: [98.6601, 3.6512], region: 'medan_utara' },
  // ... 16 lainnya
];
```

Ditambah **detour cost scoring** — node dipilih bukan dari yang pertama lulus filter, tapi yang menghasilkan **total detour terpendek**:

```typescript
const score = dist(origin, node) + dist(node, destination);
// Pilih node dengan score terkecil
```

**Impact:** Mapbox snap dalam hitungan meter ke persimpangan jalan nyata, bukan ratusan meter ke arah field/sungai.

---

### 3. Deteksi Hazard Harus Match dengan Visual — Danger Buffer + Segment Projection

**Problem (diidentifikasi oleh user):**  
Ketika user memilih radius 5 km di UI dan memicu hazard, visual lingkaran orange tampak besar di peta. Tapi rute Tol Belmera yang lewat 5.5 km dari pusat hazard dianggap **aman** oleh engine (`dist > 5 km`), sehingga `foundCleanRoute = true` dari awal dan bypass engine tidak pernah aktif.

Ada dua layer bug tersembunyi:

**Bug A — Point-only check misses sparse polylines:**  
Mapbox mengembalikan polyline dengan vertex setiap 500m–1km. Rute bisa "melewati" hazard circle antara dua vertex tanpa ada vertex yang jatuh di dalam circle. Kode lama:
```typescript
polyline.some(pt => dist(pt, hazardCenter) <= radiusKm)
```
Tidak mendeteksi kasus ini.

**Bug B — Tidak ada margin untuk "hampir kena":**  
Rute yang lewat 5.1 km dari hazard radius 5 km secara matematis aman, tapi secara visual terlihat menembus zona bahaya.

**Solution — Segment closest-point projection + danger buffer:**

```typescript
function isPolylineIntersectingHazardCircle(
  polyline: LonLat[],
  hazardCenter: LonLat,
  radiusKm: number,
  dangerBufferKm: number = 2.0   // ← margin visual
): boolean {
  const effectiveRadius = radiusKm + dangerBufferKm;

  for (let i = 0; i < polyline.length; i++) {
    // Method 1: vertex check
    if (dist(polyline[i], hazardCenter) <= effectiveRadius) return true;

    // Method 2: segment closest-point (handles sparse polylines)
    if (i < polyline.length - 1) {
      const A = polyline[i], B = polyline[i + 1];
      const t = clamp(dot(H - A, B - A) / dot(B - A, B - A), 0, 1);
      const closest = A + t * (B - A);
      if (dist(closest, hazardCenter) <= effectiveRadius) return true;
    }
  }
  return false;
}
```

**Rule of Thumb:**  
*Visual radius yang user lihat ≠ radiusKm yang dikirim ke engine jika tidak ada danger buffer.* Selalu tambahkan buffer setidaknya 1–2 km agar apa yang terlihat di peta match dengan apa yang dideteksi algoritma.

---

### 4. Satu Fungsi untuk Dua Kebutuhan Berbeda = Bug Tersembunyi

**Problem:**  
`fetchMapboxAlternativeDrivingRoutes` dirancang untuk mengambil **3 rute alternatif** antara O dan D. Ketika fungsi ini dipakai untuk bypass dengan waypoint tambahan, Mapbox alternatives engine mengoptimalkan semua 3 rute langsung dari O ke D — waypoint tengah tidak masuk dalam routing constraint alternatives.

**Solution:**  
Pisahkan concern:
- `fetchMapboxAlternativeDrivingRoutes(O, D)` → 3 rute alternatif normal
- `fetchMapboxRouteWithForcedWaypoint(O, D, W, token)` → 1 rute dengan mandatory waypoint

**Prinsip:** Jangan overload satu fungsi untuk kebutuhan yang secara semantik berbeda, meski parameternya mirip.

---

### 5. Modality Intelligence: Kriteria Otomatis Lebih Baik dari Pilihan Manual

**Problem:**  
User bisa memilih "Kapal" untuk rute Belawan → Tebing Tinggi yang sepenuhnya di darat. Atau memilih "Pesawat" untuk rute 20 km di dalam kota. Ini menghasilkan rute yang tidak masuk akal.

**Solution — `best` mode auto-selector:**

```typescript
if (modality === 'best') {
  const distKm = getHaversineDistanceKm(origin, destination);
  if (distKm < 50) return 'truck';        // kota/kabupaten
  if (distKm < 500) return 'truck';       // Trans-Sumatra highway
  return 'multimodal';                    // antar pulau → Truk + Air Cargo
}
```

User tetap bisa override ke modality spesifik, tapi default `(Best)` selalu cerdas.

---

### 6. Google Maps-Style Route Cards: On-Map Selection yang Benar

**Problem:**  
Rute hanya bisa dilihat di sidebar, tidak bisa diklik langsung di peta. Tidak ada cara intuitif untuk membandingkan rute secara visual.

**Solution:**  
- Setiap rute dirender sebagai **Mapbox layer terpisah** dengan `id` unik (`route-opt-1`, `route-opt-2`, dll.)
- Event listener `map.on('click', layerId)` menangkap klik per-rute
- `onSelectRoute(idx)` callback diteruskan dari `CrisisMap → DashboardClient → activeRouteIdx state`
- Sidebar MitigationTab bereaksi terhadap `activeRouteIdx` dan menampilkan breakdown leg dari rute yang dipilih

**Pattern untuk multiple clickable map layers:**
```typescript
routeLayers.forEach((layerId, idx) => {
  map.on('click', layerId, () => onSelectRoute?.(idx));
  map.on('mouseenter', layerId, () => map.getCanvas().style.cursor = 'pointer');
  map.on('mouseleave', layerId, () => map.getCanvas().style.cursor = '');
});
```

---

## 🛠️ Reusable Code Patterns

### Segment Closest-Point Projection (City-Scale Accuracy)
```typescript
function closestPointOnSegment(A: LonLat, B: LonLat, H: LonLat): LonLat {
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return A;
  const t = Math.max(0, Math.min(1,
    ((H[0] - A[0]) * dx + (H[1] - A[1]) * dy) / lenSq
  ));
  return [A[0] + t * dx, A[1] + t * dy];
}
```
Cukup akurat untuk jarak dalam kota (< 50 km). Untuk jarak > 1000 km, perlu proyeksi spherical.

### Detour Cost Scoring Pattern
```typescript
const ranked = nodes
  .filter(n => dist(n.coords, hazardCenter) >= minClearance)
  .map(n => ({ ...n, score: dist(origin, n.coords) + dist(n.coords, dest) }))
  .sort((a, b) => a.score - b.score)
  .slice(0, 5);
```
Sederhana, O(n log n), dan menghasilkan kandidat yang minimizes total detour — tidak perlu graph search untuk kasus ini.

---

## ⚠️ Anti-Patterns yang Ditemukan

| Anti-Pattern | Konsekuensi | Fix |
|---|---|---|
| Waypoint sebagai URL query parameter | Mapbox mengabaikannya → bypass tidak berfungsi | Encode sebagai intermediate stop dalam URL path |
| Math-offset perpendicular ke empty space | Rute halusinasi ke sawah/sungai | Database node OSM nyata |
| Point-only polyline check | Miss rute yang skip hazard antara vertex | Segment closest-point projection |
| Tidak ada danger buffer | Visual ≠ deteksi → bypass tidak aktif | `effectiveRadius = radius + 2 km` |
| Satu fungsi untuk alternatives & forced waypoint | Mapbox alternatives mengabaikan waypoint constraint | Pisahkan ke dua fungsi berbeda |
| Safety buffer terlalu besar (`radius + 3 km`) | Rute bypass 18 km lateral dari hazard — terlalu jauh | Buffer `radius + 1.5 km` untuk bypass candidates |

---

## 🚀 Verification Evidence

```
✓ Next.js 14.2.35 Compiled successfully
✓ Type checking: PASS (no errors, warnings only)
✓ Generating static pages (6/6)
✓ Finalizing page optimization
```

**Git commit:** `f138c4f` — 35 files changed, 3197 insertions, 947 deletions

---

## 📋 Checklist untuk Phase Routing Berikutnya

- [ ] Ketika menambah bypass logic baru: selalu tracing end-to-end dari UI value → state → engine parameter → Mapbox URL → polyline → detection. Jangan asumsi setiap layer pass nilai yang sama.
- [ ] Setiap kali menggunakan Mapbox Directions API untuk rute dengan mandatory waypoint: pastikan waypoint di-encode sebagai intermediate coordinate dalam URL path, bukan query parameter.
- [ ] Semua node koordinat yang dipakai sebagai waypoint: validasi terhadap Google Maps/OSM sebelum hardcode. Jangan derive dari perhitungan matematis saja.
- [ ] Intersection check: selalu pakai segment projection + danger buffer, terutama jika radius hazard kecil (< 10 km).
- [ ] `best` modality: review threshold distance jika corridor diperluas ke luar Sumatra Utara.
