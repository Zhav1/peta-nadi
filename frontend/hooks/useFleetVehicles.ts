'use client';

import { useState, useEffect } from 'react';
import type { FleetVehicle } from '@/lib/types';
import { api } from '@/lib/api';

const FALLBACK_FLEET: FleetVehicle[] = [
  {
    vehicle_id: 'MV-001-SRIWIJAYA',
    name: 'KM Sriwijaya Express (Selat Malaka)',
    modality: 'maritime',
    path: [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]],
    },
    speed_kmh: 22.5,
    status: 'moving',
    progress: 0.42,
    cargo: '1.800 Ton Beras BULOG',
    origin: 'Pelabuhan Belawan (Sumut)',
    destination: 'Pelabuhan Dumai (Riau)',
  },
  {
    vehicle_id: 'MV-002-BATUMANDI',
    name: 'KMP Batu Mandi (Ro-Ro Selat Sunda)',
    modality: 'maritime',
    path: [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]],
    },
    speed_kmh: 28.0,
    status: 'moving',
    progress: 0.65,
    cargo: '45 Truk Sembako Antar-Pulau',
    origin: 'Pelabuhan Bakauheni (Lampung)',
    destination: 'Pelabuhan Merak (Banten)',
  },
  {
    vehicle_id: 'TRK-001-BAKAUHENI-PLM',
    name: 'Truk Logistik Pangan 01 (Tol Bakauheni-Palembang)',
    modality: 'truck',
    path: [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]],
    },
    speed_kmh: 85.0,
    status: 'moving',
    progress: 0.52,
    cargo: '24 Ton Beras BULOG Lampung',
    origin: 'Pelabuhan Bakauheni',
    destination: 'Kota Palembang (Sumsel)',
  },
  {
    vehicle_id: 'TRK-002-HORTI-SUMBAR',
    name: 'Truk Sayur & Cabai 02 (Bukittinggi-Pekanbaru)',
    modality: 'truck',
    path: [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]],
    },
    speed_kmh: 68.0,
    status: 'moving',
    progress: 0.38,
    cargo: '14 Ton Cabai Merah & Sayur Agam',
    origin: 'Bukittinggi (Sumbar)',
    destination: 'Kota Pekanbaru (Riau)',
  },
  {
    vehicle_id: 'TRK-003-BELAWAN-TEBING',
    name: 'Truk Distribusi Sembako 03 (Tol Medan-Tebing)',
    modality: 'truck',
    path: [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]],
    },
    speed_kmh: 78.0,
    status: 'moving',
    progress: 0.60,
    cargo: '20 Ton Minyak Goreng Curah',
    origin: 'Pelabuhan Belawan',
    destination: 'Pematang Siantar',
  },
  {
    vehicle_id: 'AIR-001-GARUDA-CARGO',
    name: 'GA-Freight-701 (Airway KNO-PKU-BIM)',
    modality: 'air',
    path: [[98.8780, 3.6421], [99.8000, 2.2000], [101.4447, 0.4619], [100.9000, -0.2000], [100.2811, -0.7869]],
    route_geometry: {
      type: 'LineString',
      coordinates: [[98.8780, 3.6421], [99.8000, 2.2000], [101.4447, 0.4619], [100.9000, -0.2000], [100.2811, -0.7869]],
    },
    speed_kmh: 680.0,
    status: 'moving',
    progress: 0.65,
    cargo: '6.5 Ton Kargo Cepat & Vaksin',
    origin: 'Bandara Kualanamu (KNO)',
    destination: 'Bandara Minangkabau (BIM)',
  },
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
            const prevSignature = JSON.stringify(prev.map((v) => ({ id: v.vehicle_id, s: v.status, p: v.progress })));
            const newSignature = JSON.stringify(data.vehicles.map((v) => ({ id: v.vehicle_id, s: v.status, p: v.progress })));
            return prevSignature === newSignature ? prev : data.vehicles;
          });
        }
      } catch (err) {
        console.warn('Backend fleet API call fallback:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { vehicles, isLoading };
}
