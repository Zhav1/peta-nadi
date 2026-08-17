'use client';

import { useState, useEffect } from 'react';
import type { FleetVehicle } from '@/lib/types';
import { api } from '@/lib/api';

const FALLBACK_FLEET: FleetVehicle[] = [
  // Maritime
  {
    vehicle_id: 'MV-001-SRIWIJAYA',
    name: 'KM Sriwijaya Express (Selat Malaka)',
    modality: 'maritime',
    path: [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]],
    route_geometry: { type: 'LineString', coordinates: [[98.6776, 3.7922], [99.1500, 3.6500], [99.7500, 3.2500], [100.4000, 2.6000], [101.1000, 2.0500], [101.4533, 1.6811]] },
    speed_kmh: 22.5, status: 'moving', progress: 0.42, cargo: '1.800 Ton Beras BULOG', origin: 'Pelabuhan Belawan', destination: 'Pelabuhan Dumai'
  },
  {
    vehicle_id: 'MV-002-BATUMANDI',
    name: 'KMP Batu Mandi (Ro-Ro Selat Sunda)',
    modality: 'maritime',
    path: [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]],
    route_geometry: { type: 'LineString', coordinates: [[105.7533, -5.8711], [105.8200, -5.8900], [105.9000, -5.9100], [105.9800, -5.9250], [106.0050, -5.9300]] },
    speed_kmh: 28.0, status: 'moving', progress: 0.65, cargo: '45 Truk Sembako Antar-Pulau', origin: 'Pelabuhan Bakauheni', destination: 'Pelabuhan Merak'
  },
  {
    vehicle_id: 'MV-003-CARAKA',
    name: 'KM Caraka Jaya (Pantai Barat)',
    modality: 'maritime',
    path: [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]],
    route_geometry: { type: 'LineString', coordinates: [[100.3700, -0.9980], [100.0500, -0.5000], [99.6000, 0.2000], [99.1000, 0.9500], [98.7800, 1.7400]] },
    speed_kmh: 19.0, status: 'moving', progress: 0.28, cargo: '1.200 Ton Tepung Terigu & Gula', origin: 'Pelabuhan Teluk Bayur', destination: 'Pelabuhan Sibolga'
  },
  {
    vehicle_id: 'MV-004-MERATUS',
    name: 'KM Meratus Belawan (Kuala Tanjung)',
    modality: 'maritime',
    path: [[98.6776, 3.7922], [99.0500, 3.6500], [99.4500, 3.3600]],
    route_geometry: { type: 'LineString', coordinates: [[98.6776, 3.7922], [99.0500, 3.6500], [99.4500, 3.3600]] },
    speed_kmh: 14.5, status: 'moving', progress: 0.55, cargo: '950 Ton Minyak Goreng Kemasan', origin: 'Pelabuhan Belawan', destination: 'Kuala Tanjung'
  },
  {
    vehicle_id: 'MV-005-BANGKA-EXP',
    name: 'KMP Menumbing Raya (Selat Bangka)',
    modality: 'maritime',
    path: [[104.7833, -2.9750], [105.0500, -2.6000], [105.2500, -2.0500], [105.3500, -1.8500]],
    route_geometry: { type: 'LineString', coordinates: [[104.7833, -2.9750], [105.0500, -2.6000], [105.2500, -2.0500], [105.3500, -1.8500]] },
    speed_kmh: 21.0, status: 'moving', progress: 0.40, cargo: '800 Ton Beras & Pangan Segar', origin: 'Palembang Boom Baru', destination: 'Tanjung Kalian (Bangka)'
  },
  {
    vehicle_id: 'MV-006-PANJANG-CARGO',
    name: 'KM Nusantara Sejahtera (Teluk Lampung)',
    modality: 'maritime',
    path: [[105.3167, -5.4667], [105.4500, -5.6000], [105.8000, -5.8800]],
    route_geometry: { type: 'LineString', coordinates: [[105.3167, -5.4667], [105.4500, -5.6000], [105.8000, -5.8800]] },
    speed_kmh: 20.0, status: 'moving', progress: 0.70, cargo: '1.500 Ton Jagung & Bahan Pakan', origin: 'Pelabuhan Panjang', destination: 'Bakauheni'
  },
  {
    vehicle_id: 'MV-007-MALAHAYATI',
    name: 'KM Sabuk Nusantara 110 (Tol Laut Aceh)',
    modality: 'maritime',
    path: [[95.5186, 5.5897], [96.2000, 5.4000], [97.2000, 5.3000], [98.2000, 4.5000], [98.6776, 3.7922]],
    route_geometry: { type: 'LineString', coordinates: [[95.5186, 5.5897], [96.2000, 5.4000], [97.2000, 5.3000], [98.2000, 4.5000], [98.6776, 3.7922]] },
    speed_kmh: 18.0, status: 'moving', progress: 0.35, cargo: '600 Ton Bawang & Komoditas Pangan', origin: 'Pelabuhan Malahayati', destination: 'Pelabuhan Belawan'
  },
  {
    vehicle_id: 'MV-008-BENGKULU-BAAI',
    name: 'KM Pulau Baai Pioneer (Samudera Hindia)',
    modality: 'maritime',
    path: [[102.2900, -3.8900], [101.5000, -3.0000], [100.3700, -0.9980]],
    route_geometry: { type: 'LineString', coordinates: [[102.2900, -3.8900], [101.5000, -3.0000], [100.3700, -0.9980]] },
    speed_kmh: 22.0, status: 'moving', progress: 0.50, cargo: '900 Ton Minyak Sawit & Turunan Pangan', origin: 'Pelabuhan Pulau Baai', destination: 'Pelabuhan Teluk Bayur'
  },

  // Strategic Trucks
  {
    vehicle_id: 'TRK-001-BAKAUHENI-PLM',
    name: 'Truk Pangan 01 (Tol Bakauheni-Palembang)',
    modality: 'truck',
    path: [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]],
    route_geometry: { type: 'LineString', coordinates: [[105.7533, -5.8711], [105.5900, -5.7300], [105.2667, -5.4294], [105.1800, -4.8500], [104.9800, -4.1500], [104.8500, -3.3800], [104.7565, -2.9909]] },
    speed_kmh: 75.0, status: 'moving', progress: 0.52, cargo: '24 Ton Beras BULOG Lampung', origin: 'Pelabuhan Bakauheni', destination: 'Palembang'
  },
  {
    vehicle_id: 'TRK-002-HORTI-SUMBAR',
    name: 'Truk Hortikultura 02 (Bukittinggi-Pekanbaru)',
    modality: 'truck',
    path: [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]],
    route_geometry: { type: 'LineString', coordinates: [[100.3692, -0.3056], [100.6300, -0.2200], [100.7000, -0.1500], [100.8200, 0.0500], [101.0300, 0.3300], [101.4478, 0.5071]] },
    speed_kmh: 62.0, status: 'moving', progress: 0.38, cargo: '14 Ton Cabai Merah & Sayur Agam', origin: 'Bukittinggi (Sumbar)', destination: 'Pekanbaru (Riau)'
  },
  {
    vehicle_id: 'TRK-003-BELAWAN-TEBING',
    name: 'Truk Sembako 03 (Tol Medan-Tebing)',
    modality: 'truck',
    path: [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]],
    route_geometry: { type: 'LineString', coordinates: [[98.6776, 3.7922], [98.6742, 3.7201], [98.6712, 3.6901], [98.6601, 3.6512], [98.6712, 3.6013], [98.7050, 3.5511], [98.8780, 3.6421], [98.9560, 3.5680], [99.0687, 2.9595]] },
    speed_kmh: 70.0, status: 'moving', progress: 0.60, cargo: '20 Ton Minyak Goreng Curah', origin: 'Pelabuhan Belawan', destination: 'Pematang Siantar'
  },
  {
    vehicle_id: 'TRK-004-CPO-DUMAI',
    name: 'Truk Tangki CPO 04 (Tol Permai Pekanbaru-Dumai)',
    modality: 'truck',
    path: [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]],
    route_geometry: { type: 'LineString', coordinates: [[101.4478, 0.5071], [101.4300, 0.7200], [101.2800, 0.9500], [101.2100, 1.2800], [101.3500, 1.5200], [101.4533, 1.6811]] },
    speed_kmh: 68.0, status: 'moving', progress: 0.44, cargo: '28 Ton Minyak Sawit Mentah', origin: 'Pekanbaru', destination: 'Kawasan Industri Dumai'
  },
  {
    vehicle_id: 'TRK-005-BANDA-ACEH-MEDAN',
    name: 'Truk Pangan 05 (Jalinsum Banda Aceh-Medan)',
    modality: 'truck',
    path: [[95.3238, 5.5483], [95.9500, 5.2500], [97.1400, 5.1800], [97.9600, 4.4700], [98.6722, 3.5952]],
    route_geometry: { type: 'LineString', coordinates: [[95.3238, 5.5483], [95.9500, 5.2500], [97.1400, 5.1800], [97.9600, 4.4700], [98.6722, 3.5952]] },
    speed_kmh: 65.0, status: 'moving', progress: 0.32, cargo: '16 Ton Beras & Komoditas Aceh', origin: 'Banda Aceh', destination: 'Medan'
  },
  {
    vehicle_id: 'TRK-006-JAMBI-PALEMBANG',
    name: 'Truk Distribusi 06 (Lintas Timur Jambi-Palembang)',
    modality: 'truck',
    path: [[103.6131, -1.6100], [103.9500, -2.1500], [104.3500, -2.5500], [104.7565, -2.9909]],
    route_geometry: { type: 'LineString', coordinates: [[103.6131, -1.6100], [103.9500, -2.1500], [104.3500, -2.5500], [104.7565, -2.9909]] },
    speed_kmh: 60.0, status: 'moving', progress: 0.58, cargo: '18 Ton Gula & Tepung Terigu', origin: 'Kota Jambi', destination: 'Palembang'
  },
  {
    vehicle_id: 'TRK-007-PADANG-BENGKULU',
    name: 'Truk Logistik 07 (Lintas Barat Padang-Bengkulu)',
    modality: 'truck',
    path: [[100.3543, -0.9492], [100.5800, -1.3500], [101.1200, -2.5500], [101.7800, -3.2500], [102.2655, -3.8004]],
    route_geometry: { type: 'LineString', coordinates: [[100.3543, -0.9492], [100.5800, -1.3500], [101.1200, -2.5500], [101.7800, -3.2500], [102.2655, -3.8004]] },
    speed_kmh: 55.0, status: 'moving', progress: 0.40, cargo: '15 Ton Minyak Goreng & Pangan Pokok', origin: 'Kota Padang', destination: 'Kota Bengkulu'
  },
  {
    vehicle_id: 'TRK-008-MEDAN-BERASTAGI',
    name: 'Truk Sayur Segar 08 (Medan-Kabanjahe)',
    modality: 'truck',
    path: [[98.6722, 3.5952], [98.5800, 3.3500], [98.5067, 3.1833]],
    route_geometry: { type: 'LineString', coordinates: [[98.6722, 3.5952], [98.5800, 3.3500], [98.5067, 3.1833]] },
    speed_kmh: 45.0, status: 'moving', progress: 0.70, cargo: '12 Ton Kol, Kentang, Wortel Karo', origin: 'Kabanjahe (Karo)', destination: 'Pasar Induk Lau Cih Medan'
  },
  {
    vehicle_id: 'TRK-009-LAMPUNG-KOTABUMI',
    name: 'Truk Pangan 09 (Bandar Lampung-Kotabumi)',
    modality: 'truck',
    path: [[105.2667, -5.4294], [105.1800, -5.0500], [104.8800, -4.8200]],
    route_geometry: { type: 'LineString', coordinates: [[105.2667, -5.4294], [105.1800, -5.0500], [104.8800, -4.8200]] },
    speed_kmh: 65.0, status: 'moving', progress: 0.35, cargo: '16 Ton Beras Pengadaan Lokal', origin: 'Bandar Lampung', destination: 'Kotabumi'
  },
  {
    vehicle_id: 'TRK-010-PEKANBARU-DURI',
    name: 'Truk Logistik 10 (Pekanbaru-Duri)',
    modality: 'truck',
    path: [[101.4478, 0.5071], [101.3500, 0.8500], [101.2100, 1.2800]],
    route_geometry: { type: 'LineString', coordinates: [[101.4478, 0.5071], [101.3500, 0.8500], [101.2100, 1.2800]] },
    speed_kmh: 70.0, status: 'moving', progress: 0.62, cargo: '18 Ton Sembako Campuran', origin: 'Pekanbaru', destination: 'Duri'
  },
  {
    vehicle_id: 'TRK-011-RANTAUPRAPAT-KISARAN',
    name: 'Truk Pangan 11 (Jalinsum Rantauprapat-Kisaran)',
    modality: 'truck',
    path: [[100.0000, 2.1000], [99.8500, 2.4500], [99.6200, 2.9800]],
    route_geometry: { type: 'LineString', coordinates: [[100.0000, 2.1000], [99.8500, 2.4500], [99.6200, 2.9800]] },
    speed_kmh: 60.0, status: 'moving', progress: 0.50, cargo: '15 Ton Minyak Goreng Curah', origin: 'Rantauprapat', destination: 'Kisaran'
  },
  {
    vehicle_id: 'TRK-012-LUBUKLINGGAU-PLM',
    name: 'Truk Sembako 12 (Lubuklinggau-Palembang)',
    modality: 'truck',
    path: [[102.8600, -3.2900], [103.5500, -3.2000], [104.1500, -3.1000], [104.7565, -2.9909]],
    route_geometry: { type: 'LineString', coordinates: [[102.8600, -3.2900], [103.5500, -3.2000], [104.1500, -3.1000], [104.7565, -2.9909]] },
    speed_kmh: 58.0, status: 'moving', progress: 0.45, cargo: '20 Ton Beras & Palawija', origin: 'Lubuklinggau', destination: 'Palembang'
  },

  // Air Cargo
  {
    vehicle_id: 'AIR-001-KNO-CGK',
    name: 'Garuda Cargo GA-7101 (KNO -> CGK)',
    modality: 'air',
    path: [[98.8780, 3.6421], [101.5000, 0.5000], [104.5000, -3.0000], [106.6500, -6.1256]],
    route_geometry: { type: 'LineString', coordinates: [[98.8780, 3.6421], [101.5000, 0.5000], [104.5000, -3.0000], [106.6500, -6.1256]] },
    speed_kmh: 620.0, status: 'moving', progress: 0.35, cargo: '8.5 Ton Daging Beku & Vaksin', origin: 'Bandara Kualanamu (KNO)', destination: 'Soekarno-Hatta (CGK)'
  },
  {
    vehicle_id: 'AIR-002-PKU-BIM',
    name: 'Cardig Air Cargo 802 (PKU -> BIM)',
    modality: 'air',
    path: [[101.4447, 0.4619], [100.8500, -0.1500], [100.2811, -0.7869]],
    route_geometry: { type: 'LineString', coordinates: [[101.4447, 0.4619], [100.8500, -0.1500], [100.2811, -0.7869]] },
    speed_kmh: 540.0, status: 'moving', progress: 0.58, cargo: '5.2 Ton Sayur Segar & Medis', origin: 'Bandara Sultan Syarif Kasim II (PKU)', destination: 'Bandara Minangkabau (BIM)'
  },
  {
    vehicle_id: 'AIR-003-PLM-TKG',
    name: 'Tri-MG Cargo Flight 301 (PLM -> TKG)',
    modality: 'air',
    path: [[104.7000, -2.8983], [104.9500, -4.0500], [105.1783, -5.2417]],
    route_geometry: { type: 'LineString', coordinates: [[104.7000, -2.8983], [104.9500, -4.0500], [105.1783, -5.2417]] },
    speed_kmh: 510.0, status: 'moving', progress: 0.42, cargo: '6.0 Ton Benih Pangan & Sembako Ekspres', origin: 'Bandara Sultan Mahmud Badaruddin II (PLM)', destination: 'Bandara Radin Inten II (TKG)'
  },
  {
    vehicle_id: 'AIR-004-BTJ-KNO',
    name: 'Lion Cargo Express 404 (BTJ -> KNO)',
    modality: 'air',
    path: [[95.4194, 5.5222], [97.1000, 4.6000], [98.8780, 3.6421]],
    route_geometry: { type: 'LineString', coordinates: [[95.4194, 5.5222], [97.1000, 4.6000], [98.8780, 3.6421]] },
    speed_kmh: 580.0, status: 'moving', progress: 0.65, cargo: '4.8 Ton Pangan Hortikultura & Bumbu', origin: 'Bandara Sultan Iskandar Muda (BTJ)', destination: 'Bandara Kualanamu (KNO)'
  },
  {
    vehicle_id: 'AIR-005-DJB-PLM',
    name: 'My Indo Airlines 505 (DJB -> PLM)',
    modality: 'air',
    path: [[103.6444, -1.6389], [104.1500, -2.2500], [104.7000, -2.8983]],
    route_geometry: { type: 'LineString', coordinates: [[103.6444, -1.6389], [104.1500, -2.2500], [104.7000, -2.8983]] },
    speed_kmh: 490.0, status: 'moving', progress: 0.30, cargo: '5.5 Ton Komoditas Pangan Segar', origin: 'Bandara Sultan Thaha (DJB)', destination: 'Bandara Sultan Mahmud Badaruddin II (PLM)'
  },
];

export function useFleetVehicles(modality?: string) {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>(FALLBACK_FLEET);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchFleet() {
      try {
        const res = await api.fleet.vehicles(modality);
        if (isMounted && res.vehicles && res.vehicles.length > 0) {
          setVehicles(res.vehicles);
          setError(null);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Gagal memuat telemetri armada');
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchFleet();
    const interval = setInterval(fetchFleet, 10000); // 10s sync

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [modality]);

  return { vehicles, isLoading, error };
}
