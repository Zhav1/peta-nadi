# PLAN — Phase 25: Animated Multi-Modal Fleet Layer & Dynamic Vehicle Trajectories (Kapal, Pesawat, Truk)

**Phase:** 25  
**Milestone:** M1 — Hackathon MVP (North Sumatra Corridor)  
**Goal:** Membangun dan mengintegrasikan layer animasi kendaraan multi-moda real-time (Kapal 🚢, Pesawat ✈️, dan Truk 🚚) di atas kanvas Mapbox/Deck.gl 4D Crisis Command Center. Layer ini terhubung secara langsung dengan streaming AISstream WebSocket API, telemetry backend FastAPI, serta engine simulasi `run_demo.py` & Guided Demo Stepper, sehingga seluruh pergerakan armada fisik terlihat bergerak secara mulus, interaktif, dan langsung merespon skenario bencana/rerouting secara live.

---

## 🔍 Context & Technical Requirements Analysis

### 1. Root Cause & Gap Analysis (Mengapa Kendaraan Belum Muncul Saat Ini)

Berdasarkan audit mendalam terhadap basis kode PetaNadi:

1. **`CrisisMap.tsx` L26 & L89:** Prop `maritimeVectors: MaritimeVector[]` sudah didefinisikan dalam interface `CrisisMapProps`, tetapi **TIDAK MEMILIKI LOGIKA RENDERING SAMA SEKALI** di dalam komponen. Tidak ada Mapbox Source, Layer, atau HTML Marker yang dibuat dari prop ini. Prop tersebut bernilai dead code.
2. **`DashboardClient.tsx` L862:** Prop `maritimeVectors` di-pass secara hardcoded dengan array kosong: `maritimeVectors={[]}`. Tidak ada state kendaraan armada di level dashboard.
3. **`lib/types.ts` L133-137:** Tipe data `MaritimeVector` yang ada hanya mendukung jalur laut dasar tanpa field status, muatan, asal, tujuan, atau tipe moda truk/pesawat.
4. **`backend/app/adapters/aisstream_adapter.py`:** Backend adapter untuk streaming AISstream WebSocket `wss://stream.aisstream.io/v0/stream` **SUDAH TERPASANG DAN BERJALAN** (dilengkapi registri kapal, filter SOG, & publikasi Redis). `AISSTREAM_API_KEY` juga sudah tersedia di `.env`. Namun, data ini belum memiliki router REST API untuk dikonsumsi oleh frontend.
5. **`api.ts`:** Belum ada endpoint API ketersediaan kendaraan armada `GET /api/v1/fleet/vehicles`.
6. **`run_demo.py` & Guided Demo Stepper:** Belum menyertakan payload armada kendaraan sintetis saat menyimulasikan krisis Belawan/Trans-Sumatra.

---

### 2. Kebutuhan Estetika & Kepatuhan Design System (`design-system/MASTER.md`)

* **Anti-AI-Slop Strict Rules:** 
  * ❌ **Dilarang keras memakai Emoji** sebagai ikon kendaraan di peta.
  * ✅ **Wajib menggunakan SVG murni (Lucide-compatible paths)** untuk 3 jenis moda (Kapal ⚓, Pesawat ✈️, Truk 🚚).
* **Color System Tokens (Dark Tactical Command Theme):**
  * 🚢 **Kapal Laut (Maritime):** `--cyan-primary` (`#00f0ff` / `bg-cyan-950/90 text-cyan-300 border-cyan-500/60`).
  * 🚚 **Truk Logistik (Truck):** `--emerald-success` (`#10b981` / `bg-emerald-950/90 text-emerald-300 border-emerald-500/60`).
  * ✈️ **Pesawat Kargo (Air Cargo):** `--purple-air` (`#8b5cf6` / `bg-purple-950/90 text-purple-300 border-purple-500/60`).
  * ⚠️ **Armada Rerouting/Terjebak:** `--amber-warning` (`#f59e0b` / `bg-amber-950/90 text-amber-300 border-amber-500 animate-pulse`).
  * ⚓ **Kapal Labuh/Anchored:** `--text-muted` (`#64748b` / `bg-slate-800/90 text-slate-400 border-slate-600`).
* **Spatial Z-Index Matrix Alignment:**
  ```
  z-[50]: Fixed Top Header Navbar
  z-[40]: Floating Sidebars & Modals
  z-[30]: Map Hub Node Markers (Belawan ⚓ / Medan 🏙️)
  z-[25]: Fleet Vehicle Markers (Kapal, Pesawat, Truk) <--- NEW PHASE 25 LAYER
  z-[20]: Route ETA Floating Badges
  z-[15]: Weather Regional Badges
  z-[10]: TomTom Traffic Congestion Polylines
  z-[0] : Mapbox GL JS Base Canvas
  ```
* **Spatial Node Collision Prevention:**
  * Penempatan posisi kapal labuh di Pelabuhan Belawan diberikan offset kontekstual `+0.005` garis lintang utara agar tidak bertumpukan dengan Hub Node Marker Pelabuhan Belawan (`z-30`).

---

### 3. Arsitektur Performa Animation Engine (10 FPS Interpolated Markers)

* **Kenapa Menggunakan Mapbox HTML Markers + `setInterval` (bukan React `useState`):**
  Mengubah koordinat 11 armada kendaraan 10 kali per detik menggunakan React `useState` akan memicu 600+ re-render komponen per menit, yang akan menghancurkan performa Mapbox canvas.
* **Solusi Performa Tinggi:**
  1. Menggunakan **`useRef` mutable state** (`fleetProgressRef.current`) untuk menyimpan progress animasi `0.0` s/d `1.0` tanpa me-re-render komponen React.
  2. Pembaruan koordinat dilakukan via manipulasi DOM langsung menggunakan `marker.setLngLat(interpolatedCoords)` di dalam interval 100ms (~10 FPS).
  3. Memasang **Document Visibility Guard** (`document.visibilityState === 'hidden'`) agar loop animasi berhenti saat tab browser tidak aktif untuk menghemat daya GPU/CPU.

---

## 🛠️ Detailed Technical Deliverables

---

### DELIVERABLE 1 — Data Contracts & Frontend Types Update

**File:** `frontend/lib/types.ts` [MODIFY]

**Tujuan:** Menambahkan entitas tipe data armada kendaraan multi-moda (`FleetVehicle`) dan tipe moda transportasi (`VehicleModality`).

**Spesifikasi Kode:**
```ts
// Phase 25: Multi-Modal Fleet Vehicle Types
export type VehicleModality = 'truck' | 'maritime' | 'air';

export interface FleetVehicle {
  vehicle_id: string;
  name: string;
  modality: VehicleModality;
  path: [number, number][];        // Trajectory polyline: [[lon, lat], ...], min 2 points
  speed_kmh: number;               // Speed in km/h or knots converted
  status: 'moving' | 'anchored' | 'rerouting';
  cargo?: string;                  // e.g., "1.200 Ton Beras BULOG"
  origin?: string;                 // e.g., "Pelabuhan Belawan"
  destination?: string;            // e.g., "Hub Logistik Medan"
  progress?: number;               // 0.0-1.0 internal progress tracking
}
```

---

### DELIVERABLE 2 — Backend Fleet Vehicles Router

**File:** `backend/app/routers/vehicles_router.py` [NEW]  
**File:** `backend/app/main.py` [MODIFY]

**Tujuan:** Menyediakan endpoint REST `GET /api/v1/fleet/vehicles` yang menggabungkan data kapal live dari `aisstream_adapter.py` dengan armada sintetis realistis (truk & pesawat) untuk koridor Sumatera Utara.

**Spesifikasi Teknis Kode Backend:**
```python
from fastapi import APIRouter
from datetime import datetime, timezone
import logging

router = APIRouter(tags=["fleet"])
logger = logging.getLogger(__name__)

# Synthetic Fallback Datasets (4 Maritime, 5 Trucks, 2 Air Cargo)
SYNTHETIC_FLEET = [
    # Ships
    {
        "vehicle_id": "MV-001-SRIWIJAYA",
        "name": "MV SRIWIJAYA CARGO",
        "modality": "maritime",
        "path": [[98.6776, 3.7922], [98.6900, 3.8100], [98.7200, 3.8500], [98.7800, 3.9000]],
        "speed_kmh": 18.5,
        "status": "moving",
        "cargo": "1.200 Ton Beras BULOG",
        "origin": "Pelabuhan Belawan",
        "destination": "Selat Malaka"
    },
    {
        "vehicle_id": "MV-002-MERATUS",
        "name": "KM MERATUS SORONG",
        "modality": "maritime",
        "path": [[98.7100, 3.8300], [98.6950, 3.8050], [98.6776, 3.7922]],
        "speed_kmh": 12.0,
        "status": "moving",
        "cargo": "800 Ton Minyak Goreng",
        "origin": "Selat Malaka",
        "destination": "Pelabuhan Belawan"
    },
    {
        "vehicle_id": "MV-003-TANTO",
        "name": "MV TANTO PRATAMA",
        "modality": "maritime",
        "path": [[98.6720, 3.7980], [98.6720, 3.7980]],
        "speed_kmh": 0.0,
        "status": "anchored",
        "cargo": "600 Ton Gula Pasir",
        "origin": "Pelabuhan Belawan",
        "destination": "-"
    },
    {
        "vehicle_id": "MV-004-CARAKA",
        "name": "KM CARAKA JAYA III",
        "modality": "maritime",
        "path": [[98.6690, 3.7910], [98.6690, 3.7910]],
        "speed_kmh": 0.0,
        "status": "anchored",
        "cargo": "550 Ton Cabai",
        "origin": "Pelabuhan Belawan",
        "destination": "-"
    },
    # Trucks on Trans-Sumatra Highway
    {
        "vehicle_id": "TRK-001-RMS-A",
        "name": "Truk RMS-Belawan-01",
        "modality": "truck",
        "path": [
            [98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800],
            [98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520],
            [98.8750, 3.5600], [98.9560, 3.5680]
        ],
        "speed_kmh": 80.0,
        "status": "moving",
        "cargo": "20 Ton Minyak Goreng",
        "origin": "Pelabuhan Belawan",
        "destination": "Interchange Tebing Tinggi"
    },
    {
        "vehicle_id": "TRK-002-RMS-B",
        "name": "Truk RMS-Belawan-02",
        "modality": "truck",
        "path": [
            [98.6750, 3.7500], [98.6710, 3.6800], [98.6730, 3.6200],
            [98.7180, 3.5410], [98.8050, 3.5520], [98.8750, 3.5600],
            [98.9560, 3.5680], [99.0450, 3.4850]
        ],
        "speed_kmh": 75.0,
        "status": "moving",
        "cargo": "18 Ton Beras",
        "origin": "Pelabuhan Belawan",
        "destination": "Pematang Siantar"
    },
    {
        "vehicle_id": "TRK-003-KONS-A",
        "name": "Truk Konsorsium-03",
        "modality": "truck",
        "path": [[98.8050, 3.5520], [98.8750, 3.5600], [98.9560, 3.5680], [99.0450, 3.4850], [99.0687, 2.9595]],
        "speed_kmh": 70.0,
        "status": "moving",
        "cargo": "15 Ton Gula",
        "origin": "Hub Utama Medan",
        "destination": "Pematang Siantar"
    },
    {
        "vehicle_id": "TRK-004-KONS-B",
        "name": "Truk Konsorsium-04",
        "modality": "truck",
        "path": [[98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520]],
        "speed_kmh": 60.0,
        "status": "rerouting",
        "cargo": "12 Ton Cabai",
        "origin": "Hub Binjai",
        "destination": "Hub Utama Medan"
    },
    {
        "vehicle_id": "TRK-005-RMS-C",
        "name": "Truk RMS-Belawan-05",
        "modality": "truck",
        "path": [[98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800]],
        "speed_kmh": 55.0,
        "status": "moving",
        "cargo": "22 Ton Beras BULOG",
        "origin": "Pelabuhan Belawan",
        "destination": "Gudang BULOG Medan"
    },
    # Aircraft (Cargo Flights)
    {
        "vehicle_id": "AIR-001-GARUDA",
        "name": "GA-KARGO-6201",
        "modality": "air",
        "path": [[98.8792, 3.6419], [98.9200, 3.6500], [99.0000, 3.6400], [99.0687, 3.6200], [99.1500, 3.5800]],
        "speed_kmh": 650.0,
        "status": "moving",
        "cargo": "5 Ton Daging Sapi",
        "origin": "KNO Kualanamu",
        "destination": "Cargo Hub Siantar"
    },
    {
        "vehicle_id": "AIR-002-LIONAIR",
        "name": "JT-FREIGHT-142",
        "modality": "air",
        "path": [[99.0000, 3.7000], [98.9500, 3.6800], [98.9100, 3.6600], [98.8792, 3.6419]],
        "speed_kmh": 580.0,
        "status": "moving",
        "cargo": "3 Ton Obat-obatan",
        "origin": "Cargo Hub Jakarta",
        "destination": "KNO Kualanamu"
    }
]

@router.get("/api/v1/fleet/vehicles")
async def get_fleet_vehicles():
    """Retrieve combined live AISstream vessels and synthetic logistics fleet."""
    vehicles = []
    
    # Try fetching active vessels from AISstream adapter singleton
    try:
        from app.adapters.aisstream_adapter import AISstreamAdapter
        if hasattr(AISstreamAdapter, 'instance') and AISstreamAdapter.instance.vessels:
            for mmsi, info in AISstreamAdapter.instance.vessels.items():
                vehicles.append({
                    "vehicle_id": f"MMSI:{mmsi}",
                    "name": info.get("name", f"VESSEL-{mmsi}"),
                    "modality": "maritime",
                    "path": [[info.get("lon", 98.6776), info.get("lat", 3.7922)], [98.6776, 3.7922]],
                    "speed_kmh": round(info.get("sog", 0.0) * 1.852, 1),
                    "status": "anchored" if info.get("sog", 0.0) < 0.5 else "moving",
                    "cargo": "Muatan Kontainer Kargo",
                    "origin": "Selat Malaka",
                    "destination": "Pelabuhan Belawan"
                })
    except Exception as e:
        logger.warning(f"AISstream adapter read error: {e}")

    # Fallback to full synthetic dataset if live vessel count is 0
    if not vehicles:
        vehicles = SYNTHETIC_FLEET
    else:
        # Merge synthetic trucks & aircraft to live maritime data
        vehicles.extend([v for v in SYNTHETIC_FLEET if v["modality"] != "maritime"])

    return {
        "vehicles": vehicles,
        "total": len(vehicles),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
```

---

### DELIVERABLE 3 — Frontend API Client & Custom Hook

**File:** `frontend/lib/api.ts` [MODIFY]  
**File:** `frontend/hooks/useFleetVehicles.ts` [NEW]

**1. Update `lib/api.ts`:**
```ts
fleet: {
  vehicles: () =>
    request<{ vehicles: import('./types').FleetVehicle[]; total: number; timestamp: string }>(
      '/api/v1/fleet/vehicles'
    ),
},
```

**2. Implement `useFleetVehicles.ts`:**
```ts
'use client';
import { useState, useEffect } from 'react';
import type { FleetVehicle } from '@/lib/types';
import { api } from '@/lib/api';

const FALLBACK_FLEET: FleetVehicle[] = [
  {
    vehicle_id: 'MV-001-SRIWIJAYA',
    name: 'MV SRIWIJAYA CARGO',
    modality: 'maritime',
    path: [[98.6776, 3.7922], [98.6900, 3.8100], [98.7200, 3.8500], [98.7800, 3.9000]],
    speed_kmh: 18.5,
    status: 'moving',
    cargo: '1.200 Ton Beras BULOG',
    origin: 'Pelabuhan Belawan',
    destination: 'Selat Malaka',
  },
  {
    vehicle_id: 'TRK-001-RMS-A',
    name: 'Truk RMS-Belawan-01',
    modality: 'truck',
    path: [
      [98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800],
      [98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520],
      [98.8750, 3.5600], [98.9560, 3.5680]
    ],
    speed_kmh: 80.0,
    status: 'moving',
    cargo: '20 Ton Minyak Goreng',
    origin: 'Pelabuhan Belawan',
    destination: 'Interchange Tebing Tinggi',
  },
  {
    vehicle_id: 'AIR-001-GARUDA',
    name: 'GA-KARGO-6201',
    modality: 'air',
    path: [[98.8792, 3.6419], [98.9200, 3.6500], [99.0000, 3.6400], [99.0687, 3.6200], [99.1500, 3.5800]],
    speed_kmh: 650.0,
    status: 'moving',
    cargo: '5 Ton Daging Sapi',
    origin: 'KNO Kualanamu',
    destination: 'Cargo Hub Siantar',
  }
];

export function useFleetVehicles() {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(FALLBACK_FLEET);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const data = await api.fleet.vehicles();
        if (isMounted && data.vehicles && data.vehicles.length > 0) {
          setVehicles(data.vehicles);
        }
      } catch (err) {
        console.warn('Backend fleet API call fallback to client-side fixture:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { vehicles, isLoading };
}
```

---

### DELIVERABLE 4 — Dashboard Client State Wiring

**File:** `frontend/components/dashboard/DashboardClient.tsx` [MODIFY]

**Tujuan:** Menggunakan hook `useFleetVehicles` dan mengumpankan data `activeFleet` ke komponen `CrisisMap`.

**Aksi Komando:**
1. Import `useFleetVehicles` dari `@/hooks/useFleetVehicles`.
2. Panggil hook di dalam `DashboardClient`:
   ```tsx
   const { vehicles: activeFleetVehicles } = useFleetVehicles();
   ```
3. Update pemanggilan `<CrisisMap />` (Hapus prop `maritimeVectors={[]}`):
   ```tsx
   <CrisisMap
     incidents={activeIncidents}
     selectedCrisisId={selectedCrisisId}
     ...
     activeFleet={activeFleetVehicles}
     demoStage={isRunning ? stage : null}
     ...
   />
   ```

---

### DELIVERABLE 5 — CrisisMap Animated Vehicle Engine

**File:** `frontend/components/map/CrisisMap.tsx` [MODIFY]

**Tujuan:** Menghapus dead prop `maritimeVectors`, mengimplementasikan `activeFleet: FleetVehicle[]`, serta menjalankan loop animasi 10 FPS untuk menggeser posisi HTML Marker secara mulus tanpa re-render React.

**Spesifikasi Teknis Kode Component:**

1. **Update Interface Props:**
   ```ts
   export interface CrisisMapProps {
     ...
     activeFleet?: FleetVehicle[];
     demoStage?: number | null;
     ...
   }
   ```

2. **Add Animation Refs & Helper Functions:**
   ```ts
   const fleetMarkersRef = useRef<mapboxgl.Marker[]>([]);
   const fleetIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
   const fleetProgressRef = useRef<Map<string, number>>(new Map());

   function interpolatePosition(path: [number, number][], progress: number): [number, number] {
     if (path.length < 2) return path[0];
     const totalSegments = path.length - 1;
     const scaled = progress * totalSegments;
     const segIdx = Math.min(Math.floor(scaled), totalSegments - 1);
     const t = scaled - segIdx;
     const [lon1, lat1] = path[segIdx];
     const [lon2, lat2] = path[segIdx + 1];
     return [lon1 + (lon2 - lon1) * t, lat1 + (lat2 - lat1) * t];
   }

   function createVehicleMarkerElement(vehicle: FleetVehicle, isCrisisActive = false): HTMLDivElement {
     const el = document.createElement('div');

     const iconSvg = vehicle.modality === 'maritime'
       ? `<svg class="w-3.5 h-3.5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="22" x2="12" y2="8"/><path d="M5 12H2a10 10 0 0 0 20 0h-3"/></svg>`
       : vehicle.modality === 'air'
         ? `<svg class="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5 0 1 .4 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.2c.3.4.8.6 1.3.4l.5-.3c.4-.2.6-.6.5-1.1z"/></svg>`
         : `<svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`;

     const isRerouting = vehicle.status === 'rerouting' || (isCrisisActive && vehicle.vehicle_id.includes('TRK-004'));
     const isAnchored = vehicle.status === 'anchored';

     const colorClass = isRerouting
       ? 'bg-amber-950/90 text-amber-300 border-amber-500 ring-2 ring-amber-500/30 animate-pulse'
       : isAnchored
         ? 'bg-slate-900/90 text-slate-400 border-slate-700'
         : vehicle.modality === 'maritime'
           ? 'bg-cyan-950/90 text-cyan-300 border-cyan-500/60 ring-2 ring-cyan-500/20'
           : vehicle.modality === 'air'
             ? 'bg-purple-950/90 text-purple-300 border-purple-500/60 ring-2 ring-purple-500/20'
             : 'bg-emerald-950/90 text-emerald-300 border-emerald-500/60 ring-2 ring-emerald-500/20';

     el.className = `cursor-pointer z-[25] transition-all transform hover:scale-110 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold shadow-2xl border backdrop-blur-md ${colorClass}`;
     el.style.zIndex = '25';

     const shortName = vehicle.name.split('-').pop() || vehicle.name;
     el.innerHTML = `
       <span>${iconSvg}</span>
       <span>${shortName}</span>
       ${isRerouting ? '<span class="px-1 bg-amber-400 text-slate-950 rounded text-[8px] font-black">DETOUR</span>' : ''}
     `;

     el.title = `${vehicle.name}\nStatus: ${vehicle.status.toUpperCase()}\nMuatan: ${vehicle.cargo || '-'}\nAsal: ${vehicle.origin || '-'}\nTujuan: ${vehicle.destination || '-'}\nKecepatan: ${vehicle.speed_kmh} km/h`;

     return el;
   }
   ```

3. **Animation Loop `useEffect`:**
   ```ts
   useEffect(() => {
     const map = mapRef.current;
     if (!map || !isMapLoadedRef.current || !activeFleet || activeFleet.length === 0) return;

     if (fleetIntervalRef.current) {
       clearInterval(fleetIntervalRef.current);
       fleetIntervalRef.current = null;
     }

     fleetMarkersRef.current.forEach((m) => m.remove());
     fleetMarkersRef.current = [];

     const isCrisisActive = (demoStage ?? 0) >= 3;

     const markers = activeFleet.map((vehicle) => {
       const initialProgress = fleetProgressRef.current.get(vehicle.vehicle_id) ?? (Math.random() * 0.5);
       fleetProgressRef.current.set(vehicle.vehicle_id, initialProgress);

       const initialPos = interpolatePosition(vehicle.path, initialProgress);
       const el = createVehicleMarkerElement(vehicle, isCrisisActive);
       const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
         .setLngLat(initialPos)
         .addTo(map);

       return { marker, vehicle };
     });

     fleetMarkersRef.current = markers.map((m) => m.marker);

     // 100ms Animation Loop (~10 FPS)
     fleetIntervalRef.current = setInterval(() => {
       if (typeof document !== 'undefined' && documentvisibilityState === 'hidden') return;

       markers.forEach(({ marker, vehicle }) => {
         if (vehicle.path.length < 2 || vehicle.status === 'anchored') return;

         const prev = fleetProgressRef.current.get(vehicle.vehicle_id) ?? 0;
         const DEMO_SPEED_FACTOR = 0.0003;
         const increment = (vehicle.speed_kmh * DEMO_SPEED_FACTOR);
         const next = (prev + increment) % 1.0;
         fleetProgressRef.current.set(vehicle.vehicle_id, next);

         const nextPos = interpolatePosition(vehicle.path, next);
         marker.setLngLat(nextPos);
       });
     }, 100);

     return () => {
       if (fleetIntervalRef.current) {
         clearInterval(fleetIntervalRef.current);
         fleetIntervalRef.current = null;
       }
       fleetMarkersRef.current.forEach((m) => m.remove());
       fleetMarkersRef.current = [];
     };
   }, [activeFleet, demoStage]);
   ```

---

## 🧪 Verification Plan & Automated Acceptance Tests

### 1. Verification Endpoint Backend (FastAPI)
```bash
# Uji endpoint ketersediaan armada kendaraan
curl -s http://localhost:8000/api/v1/fleet/vehicles | jq .
```
* **Hasil Diharapkan:** Mengembalikan JSON yang berisi minimal 11 armada kendaraan (4 kapal, 5 truk, 2 pesawat kargo) dengan status `moving`/`anchored`/`rerouting` serta array koordinat `path`.

### 2. Manual Visual Verification di Peta (Frontend)
1. Buka browser ke `http://localhost:3000/dashboard`.
2. Amati kanvas peta 3D Mapbox.
3. **Ekspektasi Visual:**
   - 4 Ikon Kapal ⚓ (Cyan & Slate) di wilayah Selat Malaka & Pelabuhan Belawan.
   - 5 Ikon Truk 🚚 (Emerald & Amber) bergerak menyusuri Tol Belmera & Jalinsum Medan-Tebing Tinggi.
   - 2 Ikon Pesawat ✈️ (Purple) melintas di udara Kualanamu (KNO).
4. Gerakkan kursor (*hover*) di atas ikon kendaraan $\rightarrow$ Tooltip detail armada, muatan (Beras/Minyak/Cabai), dan kecepatan akan muncul.
5. Biarkan peta terbuka selama 10 detik $\rightarrow$ Ikon truk dan kapal terlihat bergeser secara mulus di sepanjang rute.

### 3. Verification Skenario Demo Krisis
1. Klik tombol **"Start Demo"** pada Guided Demo Panel.
2. Advance stepper hingga mencapai **Stage 3 (Crisis Validated)**.
3. **Ekspektasi Visual:** Truk `TRK-004` otomatis berubah menjadi lencana Oranye berpulsasi dengan label **`DETOUR`**, memperlihatkan reaksi sistem terhadap zona krisis secara real-time.

---

## 🛑 Out of Scope (Phase 25)
* Pengeditan manual posisi koordinat truk oleh operator (akan ditangani di v2 Driver Mobile App).
* Rendering 3D Mesh GLTF model truk 3D kompleks di Deck.gl `ScenegraphLayer` (cukup menggunakan SVG HTML Markers dengan z-index `25` untuk efisiensi GPU).
