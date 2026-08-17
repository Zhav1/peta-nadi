import type { LonLat } from './pathDensifier';
import type { RouteRecommendation } from './types';

// Strategic Sumatra Logistics Hub Nodes (Ports, Airports, Production Centers, Interchanges)
export interface HubNode {
  id: string;
  name: string;
  coords: LonLat;
  type: 'port' | 'city' | 'hub' | 'interchange' | 'airport';
  province?: string;
}

export const HUB_NODES: Record<string, HubNode> = {
  // Seaports
  belawan: {
    id: 'belawan',
    name: 'Pelabuhan Belawan',
    coords: [98.6776, 3.7922],
    type: 'port',
    province: 'Sumatera Utara',
  },
  dumai_port: {
    id: 'dumai_port',
    name: 'Pelabuhan Dumai (Terminal CPO & Pangan)',
    coords: [101.4533, 1.6811],
    type: 'port',
    province: 'Riau',
  },
  teluk_bayur: {
    id: 'teluk_bayur',
    name: 'Pelabuhan Teluk Bayur',
    coords: [100.3700, -0.9980],
    type: 'port',
    province: 'Sumatera Barat',
  },
  boom_baru: {
    id: 'boom_baru',
    name: 'Pelabuhan Boom Baru (Sungai Musi)',
    coords: [104.7833, -2.9750],
    type: 'port',
    province: 'Sumatera Selatan',
  },
  panjang_port: {
    id: 'panjang_port',
    name: 'Pelabuhan Panjang (Terminal Peti Kemas)',
    coords: [105.3167, -5.4667],
    type: 'port',
    province: 'Lampung',
  },
  bakauheni_port: {
    id: 'bakauheni_port',
    name: 'Pelabuhan Bakauheni (Gerbang Ferry Jawa-Sumatra)',
    coords: [105.7533, -5.8711],
    type: 'port',
    province: 'Lampung',
  },
  malahayati_port: {
    id: 'malahayati_port',
    name: 'Pelabuhan Malahayati (Krueng Raya)',
    coords: [95.5186, 5.5897],
    type: 'port',
    province: 'Aceh',
  },
  kuala_tanjung: {
    id: 'kuala_tanjung',
    name: 'Pelabuhan Kuala Tanjung (Deep Sea Port & KEK)',
    coords: [99.4500, 3.3600],
    type: 'port',
    province: 'Sumatera Utara',
  },
  sibolga_port: {
    id: 'sibolga_port',
    name: 'Pelabuhan Sibolga (Pantai Barat)',
    coords: [98.7800, 1.7400],
    type: 'port',
    province: 'Sumatera Utara',
  },
  pulau_baai: {
    id: 'pulau_baai',
    name: 'Pelabuhan Pulau Baai',
    coords: [102.2900, -3.8900],
    type: 'port',
    province: 'Bengkulu',
  },

  // Cargo Airports
  kualanamu_air: {
    id: 'kualanamu_air',
    name: 'Bandara Kualanamu Cargo Hub (KNO)',
    coords: [98.8780, 3.6421],
    type: 'airport',
    province: 'Sumatera Utara',
  },
  pekanbaru_air: {
    id: 'pekanbaru_air',
    name: 'Bandara Sultan Syarif Kasim II Cargo (PKU)',
    coords: [101.4447, 0.4619],
    type: 'airport',
    province: 'Riau',
  },
  minangkabau_air: {
    id: 'minangkabau_air',
    name: 'Bandara Minangkabau Cargo (BIM/PDG)',
    coords: [100.2811, -0.7869],
    type: 'airport',
    province: 'Sumatera Barat',
  },
  palembang_air: {
    id: 'palembang_air',
    name: 'Bandara Sultan Mahmud Badaruddin II (PLM)',
    coords: [104.7000, -2.8983],
    type: 'airport',
    province: 'Sumatera Selatan',
  },
  radin_inten_air: {
    id: 'radin_inten_air',
    name: 'Bandara Radin Inten II (TKG)',
    coords: [105.1783, -5.2417],
    type: 'airport',
    province: 'Lampung',
  },
  sultan_thaha_air: {
    id: 'sultan_thaha_air',
    name: 'Bandara Sultan Thaha Cargo (DJB)',
    coords: [103.6444, -1.6389],
    type: 'airport',
    province: 'Jambi',
  },
  iskandar_muda_air: {
    id: 'iskandar_muda_air',
    name: 'Bandara Sultan Iskandar Muda Cargo (BTJ)',
    coords: [95.4194, 5.5222],
    type: 'airport',
    province: 'Aceh',
  },

  // Cities, Agricultural Hubs & Interchanges
  medan: {
    id: 'medan',
    name: 'Hub Utama Pergudangan Medan',
    coords: [98.6722, 3.5952],
    type: 'city',
    province: 'Sumatera Utara',
  },
  binjai: {
    id: 'binjai',
    name: 'Hub Logistik Binjai (Koridor Langkat)',
    coords: [98.4850, 3.6000],
    type: 'hub',
    province: 'Sumatera Utara',
  },
  tebingtinggi: {
    id: 'tebingtinggi',
    name: 'Interchange Tol Tebing Tinggi',
    coords: [98.9560, 3.5680],
    type: 'interchange',
    province: 'Sumatera Utara',
  },
  siantar: {
    id: 'siantar',
    name: 'Pematang Siantar (Sentra Hortikultura)',
    coords: [99.0687, 2.9595],
    type: 'city',
    province: 'Sumatera Utara',
  },
  bukittinggi: {
    id: 'bukittinggi',
    name: 'Bukittinggi (Sentra Sayur & Cabai Agam)',
    coords: [100.3692, -0.3056],
    type: 'hub',
    province: 'Sumatera Barat',
  },
  padang: {
    id: 'padang',
    name: 'Kota Padang (Pasar Raya & Pergudangan)',
    coords: [100.3543, -0.9492],
    type: 'city',
    province: 'Sumatera Barat',
  },
  pekanbaru: {
    id: 'pekanbaru',
    name: 'Kota Pekanbaru (Hub Distribusi Sentral Riau)',
    coords: [101.4478, 0.5071],
    type: 'city',
    province: 'Riau',
  },
  dumai: {
    id: 'dumai',
    name: 'Kota Dumai (Kawasan Industri)',
    coords: [101.4450, 1.6850],
    type: 'city',
    province: 'Riau',
  },
  jambi: {
    id: 'jambi',
    name: 'Kota Jambi (Simpang Lintas Timur & Tengah)',
    coords: [103.6131, -1.6100],
    type: 'city',
    province: 'Jambi',
  },
  palembang: {
    id: 'palembang',
    name: 'Kota Palembang (Sentra Beras & Logistik Musi)',
    coords: [104.7565, -2.9909],
    type: 'city',
    province: 'Sumatera Selatan',
  },
  bandar_lampung: {
    id: 'bandar_lampung',
    name: 'Kota Bandar Lampung (Hub Tol Trans-Sumatra)',
    coords: [105.2667, -5.4294],
    type: 'city',
    province: 'Lampung',
  },
  banda_aceh: {
    id: 'banda_aceh',
    name: 'Kota Banda Aceh (KM 0 Lintas Sumatra)',
    coords: [95.3193, 5.5483],
    type: 'city',
    province: 'Aceh',
  },
  lhokseumawe: {
    id: 'lhokseumawe',
    name: 'Kota Lhokseumawe (Pantai Timur Aceh)',
    coords: [97.1422, 5.1800],
    type: 'city',
    province: 'Aceh',
  },
  bengkulu: {
    id: 'bengkulu',
    name: 'Kota Bengkulu (Lintas Barat Sumatra)',
    coords: [102.2655, -3.8004],
    type: 'city',
    province: 'Bengkulu',
  },
};

// Strategic Trans-Sumatra Baseline Logistics Corridors (GeoJSON FeatureCollection)
export const STRATEGIC_BASELINE_CORRIDORS: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        id: 'corridor-jalinsum-north',
        name: 'Koridor Tol & Jalinsum Sumatera Utara (Belawan - Medan - Tebing Tinggi - Siantar)',
        type: 'highway',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [98.6776, 3.7922], // Belawan
          [98.6742, 3.7201], // Marelan
          [98.6712, 3.6901], // Medan Utara
          [98.6712, 3.6013], // Medan Kota
          [98.7050, 3.5511], // Amplas
          [98.8780, 3.6421], // Kualanamu
          [98.8650, 3.5601], // Lubuk Pakam
          [98.9560, 3.5680], // Tebing Tinggi
          [99.0687, 2.9595], // Siantar
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'corridor-lintas-timur',
        name: 'Koridor Lintas Timur (Tebing Tinggi - Pekanbaru - Jambi - Palembang)',
        type: 'highway',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [98.9560, 3.5680], // Tebing Tinggi
          [99.4500, 3.3600], // Kuala Tanjung
          [100.1000, 2.1000], // Rantauprapat
          [101.4478, 0.5071], // Pekanbaru
          [103.6131, -1.6100], // Jambi
          [104.7565, -2.9909], // Palembang
          [105.2667, -5.4294], // Bandar Lampung
          [105.7533, -5.8711], // Bakauheni
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'corridor-lintas-barat',
        name: 'Koridor Lintas Barat & Tengah (Banda Aceh - Medan - Padang - Bengkulu)',
        type: 'highway',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [95.3193, 5.5483], // Banda Aceh
          [97.1422, 5.1800], // Lhokseumawe
          [98.4850, 3.6000], // Binjai
          [98.6722, 3.5952], // Medan
          [98.7800, 1.7400], // Sibolga
          [100.3692, -0.3056], // Bukittinggi
          [100.3543, -0.9492], // Padang
          [102.2655, -3.8004], // Bengkulu
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        id: 'corridor-sea-selat-malaka',
        name: 'Alur Laut Kepulauan Selat Malaka (Belawan - Dumai - Batam)',
        type: 'maritime',
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [98.6776, 3.7922],
          [99.1500, 3.6500],
          [99.7500, 3.2500],
          [100.4000, 2.6000],
          [101.1000, 2.0500],
          [101.4533, 1.6811],
        ],
      },
    },
  ],
};

/**
 * Fetches real-world turn-by-turn road network routing using Mapbox Directions API.
 */
export async function fetchMapboxDirections(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = []
): Promise<LonLat[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!token) {
    return fallbackHighwayRoute(origin, destination, waypoints);
  }

  const allCoords = [origin, ...waypoints, destination];
  const coordString = allCoords.map(([lon, lat]) => `${lon},${lat}`).join(';');

  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordString}?geometries=geojson&overview=full&access_token=${token}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Mapbox Directions API status ${res.status}`);
    }

    const data = await res.json();
    if (data.routes && data.routes.length > 0 && data.routes[0].geometry) {
      const coords: [number, number][] = data.routes[0].geometry.coordinates;
      return coords;
    }
  } catch (err) {
    console.warn('Failed to fetch Mapbox Directions API, using highway fallback:', err);
  }

  return fallbackHighwayRoute(origin, destination, waypoints);
}

function fallbackHighwayRoute(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = []
): LonLat[] {
  const highwayNodes: LonLat[] = [
    origin,
    [98.6750, 3.7500],
    [98.6710, 3.6800],
    [98.6730, 3.6200],
    [98.7180, 3.5410],
    [98.8050, 3.5520],
    [98.8750, 3.5600],
    [98.9560, 3.5680],
    [99.0450, 3.4850],
    [99.1100, 3.2200],
    destination,
  ];

  if (waypoints.length > 0) {
    return [origin, ...waypoints, destination];
  }

  return highwayNodes;
}

export async function calculateRoadNetworkDetourRoutes(
  hazardCenter: LonLat,
  radiusKm: number = 15,
  origin: LonLat = HUB_NODES.belawan.coords,
  destination: LonLat = HUB_NODES.siantar.coords
): Promise<RouteRecommendation[]> {
  const [hLon, hLat] = hazardCenter;

  const minClearanceKm = radiusKm + 12;
  const offsetLon = (minClearanceKm / 111) * 1.3;
  const offsetLat = minClearanceKm / 111;

  const isEastDetour = hLon <= 98.75;
  const tangentLon1 = isEastDetour ? hLon + offsetLon : hLon - offsetLon;
  const tangentLat1 = hLat > 3.5 ? hLat - offsetLat * 0.4 : hLat + offsetLat * 0.4;

  const detourWaypoints1: LonLat[] = [[tangentLon1, tangentLat1]];
  const detourWaypoints2: LonLat[] = [
    [isEastDetour ? hLon + offsetLon * 1.5 : hLon - offsetLon * 1.5, hLat + 0.05],
  ];

  const [coordsPrimary, coordsAlternative] = await Promise.all([
    fetchMapboxDirections(origin, destination, detourWaypoints1),
    fetchMapboxDirections(origin, destination, detourWaypoints2),
  ]);

  return [
    {
      description: `Rute Pengalihan Tangensial Jalan Tol (Menghindari Zona Krisis ${radiusKm}km)`,
      waypoints: coordsPrimary.map(([lon, lat]) => ({ lat, lon })),
      distance_km: 118,
      eta_minutes: 112,
      fuel_increase_pct: 12.5,
      risk_score: 0.15,
    },
    {
      description: `Rute Arteri Pesisir Timur (Jalur Alternatif 2)`,
      waypoints: coordsAlternative.map(([lon, lat]) => ({ lat, lon })),
      distance_km: 136,
      eta_minutes: 145,
      fuel_increase_pct: 22.0,
      risk_score: 0.35,
    },
  ];
}
