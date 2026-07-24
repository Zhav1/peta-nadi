# PLAN — Phase 28: Smooth 60 FPS Route-Bound Fleet Vector Layer & Rotation Engine

**Phase:** 28  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** Merombak total sistem animasi pergerakan kendaraan logistik (Truck, Cargo Ship, Aircraft) pada komponen peta Mapbox GL JS / Deck.gl di dashboard PetaNadi. Mengeliminasi 100% penggunaan `mapboxgl.Marker` HTML DOM yang kaku & flickering, menggantinya dengan **Mapbox WebGL Native Symbol & Path Layer**, pergerakan terikat rute GeoJSON LineString (*Route-Bound Path Animation*) dengan interpolasi 60 FPS (`@turf/along`), serta rotasi otomatis 0°–360° yang presisi mengikuti arah tikungan rute (`@turf/bearing`).

---

## 🔍 Context & Problem Analysis

### 1. Masalah Utama pada Sistem Armada Saat Ini
1. **Flickering & Lag (HTML DOM Markers):**  
   Penggunaan `mapboxgl.Marker` berbasis elemen DOM HTML menyebabkan glitch visual, flickering saat melakukan zoom/pan, serta lag performa karena DOM repainting pada framerate tinggi.
2. **Pergerakan Melayang / Teleportasi Lurus (Unbound Movement):**  
   Kendaraan sebelumnya berpindah titik tanpa terikat rute jaringan jalan raya (*Road Network*). Truk berpotensi menembus daratan/lautan secara melenceng dari koridor jalan.
3. **Ikon Menghadap Satu Arah (Static Bearing):**  
   Ikon kendaraan tidak berputar (0°–360°) mengikuti tikungan jalan, alur pelayaran laut, atau arah haluan pesawat.

---

## 🛠️ Arsitektur Solusi & Aturan Desain (`design-system/MASTER.md`)

```
+-----------------------------------------------------------------------------------+
|                        PetaNadi Fleet Vector Layer Pipeline                       |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [REST API / WebSocket] -> Fleet Vehicle Payload ({ id, type, route_geometry })   |
|                                       |                                           |
|                                       v                                           |
|                   [Turf.js Route Interpolation Engine]                            |
|             Calculates current [lng, lat] via @turf/along(distance)              |
|             Calculates exact heading angle via @turf/bearing(p1, p2)              |
|                                       |                                           |
|                                       v                                           |
|                    [Mapbox Native WebGL Symbol Layer]                             |
|          - Canvas-generated SVG Sprites (Truck 🚚, Ship ⚓, Aircraft ✈️)           |
|          - Dynamic GeoJSON setData() at 60 FPS requestAnimationFrame              |
|          - Property 'icon-rotate' = calculated bearing                            |
|          - Property 'icon-rotation-alignment' = 'map'                             |
|                                       |                                           |
|                                       v                                           |
|                    [Glassmorphism Hover Telemetry Tooltip]                        |
|          Displays Fleet ID, Speed, Cargo, Route Progress %, Status               |
+-----------------------------------------------------------------------------------+
```

---

## 🛠️ Detailed Technical Deliverables

### DELIVERABLE 1 — Geospatial Path Interpolation & Bearing Utility (`frontend/lib/geoUtils.ts`)

**Tujuan:** Menyediakan fungsi perhitungan jarak, koordinat posisi real-time pada rute LineString (`@turf/along`), dan sudut arah haluan (`@turf/bearing`).

```typescript
import along from '@turf/along';
import bearing from '@turf/bearing';
import length from '@turf/length';
import { lineString, point } from '@turf/helpers';

export interface InterpolatedVehicleState {
  currentPosition: [number, number]; // [lng, lat]
  bearing: number;                   // 0 to 360 degrees
  progress: number;                  // 0.0 to 1.0
  totalDistanceKm: number;
}

/**
 * Calculates current vehicle position and bearing along a GeoJSON LineString route.
 */
export function calculateRouteProgressPosition(
  coordinates: number[][],
  progressRatio: number
): InterpolatedVehicleState {
  if (!coordinates || coordinates.length < 2) {
    const fallback = coordinates[0] || [98.67, 3.58];
    return {
      currentPosition: [fallback[0], fallback[1]],
      bearing: 0,
      progress: progressRatio,
      totalDistanceKm: 0
    };
  }

  const line = lineString(coordinates);
  const totalKm = length(line, { units: 'kilometers' });
  const clampedProgress = Math.max(0, Math.min(1, progressRatio));
  const currentDistanceKm = totalKm * clampedProgress;

  // Position at current distance
  const currentPt = along(line, currentDistanceKm, { units: 'kilometers' });
  const currentPos = currentPt.geometry.coordinates as [number, number];

  // Next position slightly ahead (10 meters / 0.01 km) to calculate precise bearing
  const lookAheadDistanceKm = Math.min(totalKm, currentDistanceKm + 0.02);
  const nextPt = along(line, lookAheadDistanceKm, { units: 'kilometers' });
  const nextPos = nextPt.geometry.coordinates as [number, number];

  // Calculate forward azimuth bearing (-180 to +180 -> normalized to 0..360)
  let rawBearing = bearing(point(currentPos), point(nextPos));
  let normalizedBearing = (rawBearing + 360) % 360;

  return {
    currentPosition: currentPos,
    bearing: normalizedBearing,
    progress: clampedProgress,
    totalDistanceKm: totalKm
  };
}
```

---

### DELIVERABLE 2 — Vehicle REST API & GeoJSON Route Schema Update (`backend/app/routers/vehicles_router.py`)

**Tujuan:** Memastikan backend menyuplai rute presisi (`route_geometry` GeoJSON LineString) untuk setiap armada logistik.

```python
# Payload Schema Example for GET /api/v1/fleet/vehicles
{
    "vehicles": [
        {
            "id": "TRK-001-BELAWAN",
            "name": "Truk RMS Logistik #01",
            "type": "truck",  # "truck" | "vessel" | "aviation"
            "status": "active",
            "speed_kmh": 65.0,
            "progress": 0.42, # Current route progress 0.0 -> 1.0
            "cargo": "20 Ton Minyak Goreng",
            "origin": "Pelabuhan Belawan",
            "destination": "Hub Medan",
            "route_geometry": {
                "type": "LineString",
                "coordinates": [
                    [98.6776, 3.7922],
                    [98.6750, 3.7500],
                    [98.6710, 3.6800],
                    [98.6730, 3.6200],
                    [98.7180, 3.5410]
                ]
            }
        }
    ]
}
```

---

### DELIVERABLE 3 — Mapbox WebGL Native Vehicle Vector Layer (`frontend/components/map/FleetVehicleLayer.tsx`)

**Tujuan:** Mengganti HTML DOM Marker dengan Mapbox WebGL Native `symbol` & `line` layer.

* **Sprite Icons Loading:** Membuat canvas SVG sprite untuk Truck (🚚), Cargo Ship (⚓), dan Aircraft (✈️), kemudian mendaftarkannya via `map.addImage('truck-icon', ...)` dengan `pixelRatio: 2`.
* **60 FPS Animation Loop:** Menggunakan `requestAnimationFrame` untuk menggerakkan `progress` secara halus menyusuri rute, memperbarui GeoJSON source `map.getSource('fleet-vehicles-source').setData(geojson)` pada setiap frame.
* **Vector Rotation:** Menggunakan properti Mapbox WebGL `icon-rotate: ['get', 'bearing']` dan `icon-rotation-alignment: 'map'`.

---

### DELIVERABLE 4 — Interactive Glassmorphic Telemetry Tooltip

**Tujuan:** Menampilkan popup telemetry futuristik saat hover / click pada kendaraan.

* **Teknologi:** Canvas hover listener `map.on('mouseenter', 'fleet-vehicles-layer')` & Glassmorphism 2.0 UI:
  ```html
  +--------------------------------------------------------+
  | 🚚 TRK-001-BELAWAN                                     |
  | Status: ACTIVE | Speed: 65.0 km/h                      |
  | Cargo: 20 Ton Minyak Goreng                            |
  | Route: Pelabuhan Belawan -> Hub Medan (Progress 42%)   |
  +--------------------------------------------------------+
  ```

---

## 🧪 Verification Plan

1. **Pengujian Visual & Performa (60 FPS):**
   - Buka `http://localhost:3000/dashboard`.
   - Amati pergerakan Truk, Kapal, dan Pesawat. Pastikan pergerakan meluncur mulus 60 FPS tanpa flickering, jumping, atau node kotak kaku.
2. **Pengujian Rotasi Bearing (0°–360°):**
   - Saat truk melewati tikungan jalan raya (misal di simpang tol), perhatikan ikon truk berputar presisi menghadap searah belokan jalan.
3. **Pengujian Pergerakan Terikat Rute (Route-Bound Path):**
   - Truk 100% berada di atas garis jalan raya, Kapal di alur pelayaran laut, Pesawat di jalur udara.
4. **Pengujian Tooltip Telemetry:**
   - Hover kursor di atas kendaraan. Tooltip Glassmorphism menampilkan data ID, kecepatan, cargo, dan persentase rute.
