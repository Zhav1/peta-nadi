'use client';

import { useState, useEffect } from 'react';
import type { FleetVehicle } from '@/lib/types';
import { api } from '@/lib/api';

const FALLBACK_FLEET: FleetVehicle[] = [
  // Ships
  {
    vehicle_id: 'MV-001-SRIWIJAYA',
    name: 'MV SRIWIJAYA CARGO',
    modality: 'maritime',
    path: [[98.6776, 3.7922], [98.6900, 3.8100], [98.7200, 3.8500], [98.7800, 3.9000]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.6776, 3.7922], [98.6900, 3.8100], [98.7200, 3.8500], [98.7800, 3.9000]],
    },
    speed_kmh: 18.5,
    status: 'moving',
    progress: 0.45,
    cargo: '1.200 Ton Beras BULOG',
    origin: 'Pelabuhan Belawan',
    destination: 'Selat Malaka',
  },
  {
    vehicle_id: 'MV-002-MERATUS',
    name: 'KM MERATUS SORONG',
    modality: 'maritime',
    path: [[98.7100, 3.8300], [98.6950, 3.8050], [98.6776, 3.7922]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.7100, 3.8300], [98.6950, 3.8050], [98.6776, 3.7922]],
    },
    speed_kmh: 12.0,
    status: 'moving',
    progress: 0.30,
    cargo: '800 Ton Minyak Goreng',
    origin: 'Selat Malaka',
    destination: 'Pelabuhan Belawan',
  },
  {
    vehicle_id: 'MV-003-TANTO',
    name: 'MV TANTO PRATAMA',
    modality: 'maritime',
    path: [[98.6720, 3.7980], [98.6720, 3.7980]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.6720, 3.7980], [98.6720, 3.7980]],
    },
    speed_kmh: 0.0,
    status: 'anchored',
    progress: 0.0,
    cargo: '600 Ton Gula Pasir',
    origin: 'Pelabuhan Belawan',
    destination: '-',
  },
  {
    vehicle_id: 'MV-004-CARAKA',
    name: 'KM CARAKA JAYA III',
    modality: 'maritime',
    path: [[98.6690, 3.7910], [98.6690, 3.7910]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.6690, 3.7910], [98.6690, 3.7910]],
    },
    speed_kmh: 0.0,
    status: 'anchored',
    progress: 0.0,
    cargo: '550 Ton Cabai',
    origin: 'Pelabuhan Belawan',
    destination: '-',
  },
  // Trucks
  {
    vehicle_id: 'TRK-001-RMS-A',
    name: 'Truk RMS-Belawan-01',
    modality: 'truck',
    path: [
      [98.6868, 3.7831], [98.6742, 3.7201], [98.6712, 3.6901],
      [98.6601, 3.6512], [98.6599, 3.6155], [98.6712, 3.6013],
      [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680]
    ],
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [98.6868, 3.7831], [98.6742, 3.7201], [98.6712, 3.6901],
        [98.6601, 3.6512], [98.6599, 3.6155], [98.6712, 3.6013],
        [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680]
      ],
    },
    speed_kmh: 80.0,
    status: 'moving',
    progress: 0.55,
    cargo: '20 Ton Minyak Goreng',
    origin: 'Pelabuhan Belawan',
    destination: 'Interchange Tebing Tinggi',
  },
  {
    vehicle_id: 'TRK-002-RMS-B',
    name: 'Truk RMS-Belawan-02',
    modality: 'truck',
    path: [
      [98.6868, 3.7831], [98.6742, 3.7201], [98.6712, 3.6901],
      [98.6601, 3.6512], [98.6599, 3.6155], [98.6712, 3.6013],
      [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]
    ],
    route_geometry: {
      type: 'LineString',
      coordinates: [
        [98.6868, 3.7831], [98.6742, 3.7201], [98.6712, 3.6901],
        [98.6601, 3.6512], [98.6599, 3.6155], [98.6712, 3.6013],
        [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]
      ],
    },
    speed_kmh: 75.0,
    status: 'moving',
    progress: 0.40,
    cargo: '18 Ton Beras',
    origin: 'Pelabuhan Belawan',
    destination: 'Pematang Siantar',
  },
  {
    vehicle_id: 'TRK-003-KONS-A',
    name: 'Truk Konsorsium-03',
    modality: 'truck',
    path: [[98.8050, 3.5520], [98.8750, 3.5600], [98.9560, 3.5680], [99.0450, 3.4850], [99.0687, 2.9595]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.8050, 3.5520], [98.8750, 3.5600], [98.9560, 3.5680], [99.0450, 3.4850], [99.0687, 2.9595]],
    },
    speed_kmh: 70.0,
    status: 'moving',
    progress: 0.65,
    cargo: '15 Ton Gula',
    origin: 'Hub Utama Medan',
    destination: 'Pematang Siantar',
  },
  {
    vehicle_id: 'TRK-004-KONS-B',
    name: 'Truk Konsorsium-04',
    modality: 'truck',
    path: [[98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.6730, 3.6200], [98.7180, 3.5410], [98.8050, 3.5520]],
    },
    speed_kmh: 60.0,
    status: 'rerouting',
    progress: 0.50,
    cargo: '12 Ton Cabai',
    origin: 'Hub Binjai',
    destination: 'Hub Utama Medan',
  },
  {
    vehicle_id: 'TRK-005-RMS-C',
    name: 'Truk RMS-Belawan-05',
    modality: 'truck',
    path: [[98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.6776, 3.7922], [98.6750, 3.7500], [98.6710, 3.6800]],
    },
    speed_kmh: 55.0,
    status: 'moving',
    progress: 0.20,
    cargo: '22 Ton Beras BULOG',
    origin: 'Pelabuhan Belawan',
    destination: 'Gudang BULOG Medan',
  },
  // Aircraft
  {
    vehicle_id: 'AIR-001-GARUDA',
    name: 'GA-KARGO-6201',
    modality: 'air',
    path: [[98.8792, 3.6419], [98.9200, 3.6500], [99.0000, 3.6400], [99.0687, 3.6200], [99.1500, 3.5800]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.8792, 3.6419], [98.9200, 3.6500], [99.0000, 3.6400], [99.0687, 3.6200], [99.1500, 3.5800]],
    },
    speed_kmh: 650.0,
    status: 'moving',
    progress: 0.70,
    cargo: '5 Ton Daging Sapi',
    origin: 'KNO Kualanamu',
    destination: 'Cargo Hub Siantar',
  },
  {
    vehicle_id: 'AIR-002-LIONAIR',
    name: 'JT-FREIGHT-142',
    modality: 'air',
    path: [[99.0000, 3.7000], [98.9500, 3.6800], [98.9100, 3.6600], [98.8792, 3.6419]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[99.0000, 3.7000], [98.9500, 3.6800], [98.9100, 3.6600], [98.8792, 3.6419]],
    },
    speed_kmh: 580.0,
    status: 'moving',
    progress: 0.35,
    cargo: '3 Ton Obat-obatan',
    origin: 'Cargo Hub Jakarta',
    destination: 'KNO Kualanamu',
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
          setVehicles((prev) => {
            const prevSignature = JSON.stringify(prev.map((v) => ({ id: v.vehicle_id, s: v.status, path: v.path })));
            const newSignature = JSON.stringify(data.vehicles.map((v) => ({ id: v.vehicle_id, s: v.status, path: v.path })));
            return prevSignature === newSignature ? prev : data.vehicles;
          });
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
