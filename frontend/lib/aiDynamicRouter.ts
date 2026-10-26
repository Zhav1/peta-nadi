import type { LonLat } from './pathDensifier';
export type { LonLat };
import type { RouteRecommendation, CongestionSegment, RouteLeg, HoldVsRerouteEconomics, CrisisType, HazardImpactProfile, RouteTradeoffAnalysis } from './types';
import { getCachedDynamicRoutes, setCachedDynamicRoutes, findPrecomputedHubCorridor } from './hubCorridorCache';
import {
  DEPOT_HOURLY_FEE_IDR,
  DRIVER_LABOR_HOURLY_RATE,
  REEFER_GENSET_HOURLY_RATE,
  calculateTotalTripCost,
  resolveFuelEfficiencyKmpl,
  resolveFuelRateIdr,
} from './tripCostCalculator';

export type TransportModality = 'best' | 'truck' | 'maritime' | 'air' | 'multimodal' | 'auto';

export const HAZARD_RADIUS_OPTIONS_KM = [5, 8, 15] as const;
export const DEFAULT_HAZARD_RADIUS_KM = 8;
export const TOLL_CORRIDOR_BUFFER_KM = 2.0;

/**
 * Verified Real Arterial Road Network Nodes: Sumatra Logistics Corridors
 */
export const HIGHWAY_JUNCTION_NODES: Array<{ id: string; name: string; coords: LonLat; region: string; isTollGate?: boolean }> = [
  // North Sumatra / Belawan - Medan - Tebing - Siantar
  { id: 'jl_yos_sudarso_utara', name: 'Jl. Yos Sudarso (Pelabuhan Belawan)', coords: [98.6868, 3.7831], region: 'belawan' },
  { id: 'jl_kl_yos_sudarso_marelan', name: 'Jl. KL. Yos Sudarso - Marelan Junction', coords: [98.6742, 3.7201], region: 'belawan' },
  { id: 'jl_adam_malik_utara', name: 'Jl. Adam Malik (Titik Utara)', coords: [98.6712, 3.6901], region: 'medan_utara' },
  { id: 'jl_adam_malik_tengah', name: 'Jl. Adam Malik (Persimpangan Gatot)', coords: [98.6680, 3.6701], region: 'medan_utara' },
  { id: 'jl_gagak_hitam_helvetia', name: 'Jl. Gagak Hitam / Ring Road Helvetia', coords: [98.6601, 3.6512], region: 'medan_utara' },
  { id: 'jl_tb_simatupang', name: 'Jl. TB Simatupang (Bypass Barat)', coords: [98.6543, 3.6321], region: 'medan_barat' },
  { id: 'jl_gatot_subroto', name: 'Jl. Gatot Subroto (Ring Road Barat)', coords: [98.6599, 3.6155], region: 'medan_barat' },
  { id: 'simpang_pos_medan', name: 'Simpang Pos / Jl. Listrik', coords: [98.6712, 3.6013], region: 'medan_kota' },
  { id: 'jl_sisingamangaraja_utara', name: 'Jl. Sisingamangaraja (Utara Amplas)', coords: [98.6891, 3.5801], region: 'medan_selatan' },
  { id: 'interchange_amplas', name: 'Gerbang Tol Amplas', coords: [98.7050, 3.5511], region: 'medan_selatan', isTollGate: true },
  { id: 'jl_ar_hakim', name: 'Jl. AR. Hakim / Jl. Cemara', coords: [98.7101, 3.6312], region: 'medan_timur' },
  { id: 'jl_letda_sujono', name: 'Jl. Letda Sujono (Kecamatan Percut)', coords: [98.7321, 3.6021], region: 'percut' },
  { id: 'jl_williem_iskandar', name: 'Jl. Williem Iskandar / Medan Area', coords: [98.7201, 3.5811], region: 'medan_timur' },
  { id: 'kualanamu_junction', name: 'Interchange Kualanamu (Tol Belmera)', coords: [98.8780, 3.6421], region: 'deli_serdang', isTollGate: true },
  { id: 'lubuk_pakam_interchange', name: 'Interchange Lubuk Pakam', coords: [98.8650, 3.5601], region: 'deli_serdang', isTollGate: true },
  { id: 'perbaungan_artlrd', name: 'Jalinsum Perbaungan', coords: [98.9501, 3.5701], region: 'serdang_bedagai' },
  { id: 'sei_rampah_interchange', name: 'Interchange Sei Rampah', coords: [99.1501, 3.4801], region: 'serdang_bedagai', isTollGate: true },
  { id: 'tebing_tinggi_toll', name: 'Gerbang Tol Tebing Tinggi', coords: [99.1621, 3.3251], region: 'tebing_tinggi', isTollGate: true },
  { id: 'galang_junction', name: 'Junction Galang (Bypass Lubuk Pakam)', coords: [98.9050, 3.4450], region: 'deli_serdang', isTollGate: true },
  { id: 'dolok_masihul_jct', name: 'Simpang Dolok Masihul', coords: [99.0480, 3.3850], region: 'serdang_bedagai' },
  { id: 'pantai_cermin_coastal', name: 'Jalur Pesisir Pantai Cermin', coords: [99.0350, 3.6420], region: 'serdang_bedagai' },
  { id: 'bangun_purba_jct', name: 'Simpang Bangun Purba', coords: [98.8500, 3.3800], region: 'deli_serdang' },
  // Trans-Sumatra Highway Corridors
  { id: 'banda_aceh_arterial', name: 'Simpang Lima Banda Aceh', coords: [95.3190, 5.5528], region: 'aceh' },
  { id: 'lhokseumawe_jct', name: 'Simpang Empat Lhokseumawe', coords: [97.1420, 5.1780], region: 'aceh' },
  { id: 'langsa_gate', name: 'Gerbang Jalintim Langsa', coords: [97.9620, 4.4720], region: 'aceh' },
  { id: 'kuala_tanjung_jct', name: 'Simpang Kuala Tanjung', coords: [99.4500, 3.3600], region: 'batu_bara' },
  { id: 'rantauprapat_jct', name: 'Simpang Lintas Timur Rantauprapat', coords: [100.0000, 2.1000], region: 'labuhan_batu' },
  { id: 'pekanbaru_tol_in', name: 'Gerbang Tol Pekanbaru', coords: [101.4478, 0.5071], region: 'riau', isTollGate: true },
  { id: 'dumai_tol_out', name: 'Gerbang Tol Dumai', coords: [101.4533, 1.6811], region: 'riau', isTollGate: true },
  { id: 'jambi_arterial', name: 'Simpang Tugu Juang Jambi', coords: [103.6131, -1.6100], region: 'jambi' },
  { id: 'bengkulu_jalinbar', name: 'Simpang Lima Ratu Samban Bengkulu', coords: [102.2655, -3.8004], region: 'bengkulu' },
  { id: 'padang_by_pass', name: 'By Pass Kota Padang', coords: [100.3543, -0.9492], region: 'sumbar' },
  { id: 'bukittinggi_sentral', name: 'Simpang Aur Kuning Bukittinggi', coords: [100.3692, -0.3056], region: 'sumbar' },
  { id: 'sitinjau_lauik_apex', name: 'Panorama Sitinjau Lauik Apex', coords: [100.5200, -0.9500], region: 'sumbar' },
  { id: 'palembang_kramasan', name: 'Interchange Kramasan Palembang', coords: [104.7565, -2.9909], region: 'sumsel', isTollGate: true },
  { id: 'terbanggi_besar_tol', name: 'Interchange Terbanggi Besar', coords: [105.1800, -4.8500], region: 'lampung', isTollGate: true },
  { id: 'panjang_port_gate', name: 'Gerbang Logistik Pelabuhan Panjang', coords: [105.3167, -5.4667], region: 'lampung' },
  { id: 'bakauheni_tol_gate', name: 'Gerbang Tol Pelabuhan Bakauheni', coords: [105.7533, -5.8711], region: 'lampung', isTollGate: true },
];

/**
 * Strategic Cargo Airport Hubs across Sumatra
 */
export const CARGO_AIRPORT_NODES: Array<{ id: string; name: string; code: string; coords: LonLat }> = [
  { id: 'kualanamu_air', name: 'Bandara Kualanamu Cargo Hub (KNO)', code: 'KNO', coords: [98.8780, 3.6421] },
  { id: 'iskandar_muda_air', name: 'Bandara Sultan Iskandar Muda Cargo (BTJ)', code: 'BTJ', coords: [95.4194, 5.5222] },
  { id: 'malikussaleh_air', name: 'Bandara Malikussaleh Cargo (LSW)', code: 'LSW', coords: [96.9500, 5.2300] },
  { id: 'pekanbaru_air', name: 'Bandara Sultan Syarif Kasim II Cargo (PKU)', code: 'PKU', coords: [101.4447, 0.4619] },
  { id: 'minangkabau_air', name: 'Bandara Minangkabau Cargo (BIM)', code: 'BIM', coords: [100.2811, -0.7869] },
  { id: 'sultan_thaha_air', name: 'Bandara Sultan Thaha Cargo (DJB)', code: 'DJB', coords: [103.6444, -1.6389] },
  { id: 'palembang_air', name: 'Bandara Sultan Mahmud Badaruddin II (PLM)', code: 'PLM', coords: [104.7000, -2.8983] },
  { id: 'radin_inten_air', name: 'Bandara Radin Inten II Cargo (TKG)', code: 'TKG', coords: [105.1783, -5.2417] },
];

/**
 * Verified Pelindo Cargo Seaport Nodes across Sumatra Island
 */
export const CARGO_SEAPORT_NODES: Array<{ id: string; name: string; coords: LonLat }> = [
  { id: 'belawan_port', name: 'Pelabuhan Belawan (Medan)', coords: [98.6776, 3.7922] },
  { id: 'kuala_tanjung_port', name: 'Pelabuhan Kuala Tanjung (Batu Bara)', coords: [99.4500, 3.3600] },
  { id: 'lhokseumawe_port', name: 'Pelabuhan Krueng Geukueh (Lhokseumawe)', coords: [97.0200, 5.2400] },
  { id: 'dumai_port', name: 'Pelabuhan Dumai (Terminal Curah & Kontainer)', coords: [101.4533, 1.6811] },
  { id: 'teluk_bayur_port', name: 'Pelabuhan Teluk Bayur (Padang)', coords: [100.3700, -0.9980] },
  { id: 'palembang_port', name: 'Pelabuhan Boom Baru (Palembang)', coords: [104.7833, -2.9750] },
  { id: 'panjang_port', name: 'Pelabuhan Panjang (Bandar Lampung)', coords: [105.3167, -5.4667] },
  { id: 'bakauheni_port', name: 'Pelabuhan Penyeberangan Bakauheni', coords: [105.7533, -5.8711] },
];

/**
 * Strategic Safe Staging Depots / BULOG Cold-Storage Buffer Hubs across Sumatra
 */
export const SAFE_BUFFER_DEPOTS: Array<{ id: string; name: string; coords: LonLat; type: 'hold_depot' }> = [
  { id: 'depo_amplas_medan', name: 'Depo Buffer Logistik Amplas Medan', coords: [98.7050, 3.5511], type: 'hold_depot' },
  { id: 'depo_kualanamu', name: 'Pergudangan & Cold Storage Kualanamu Hub', coords: [98.8780, 3.6421], type: 'hold_depot' },
  { id: 'depo_tebing_tinggi', name: 'Depo Penyangga Tebing Tinggi', coords: [99.1621, 3.3251], type: 'hold_depot' },
  { id: 'depo_siantar', name: 'Pergudangan Hortikultura Pematang Siantar', coords: [99.0687, 2.9595], type: 'hold_depot' },
  { id: 'depo_rantauprapat', name: 'Depo Transit Lintas Timur Rantauprapat', coords: [100.0000, 2.1000], type: 'hold_depot' },
  { id: 'depo_pekanbaru', name: 'Kawasan Pergudangan Arengka Pekanbaru', coords: [101.4478, 0.5071], type: 'hold_depot' },
  { id: 'depo_bukittinggi', name: 'Sentra Distribusi Cabai Padang Luar Bukittinggi', coords: [100.3692, -0.3056], type: 'hold_depot' },
  { id: 'depo_padang', name: 'Depo Logistik By Pass Kota Padang', coords: [100.3543, -0.9492], type: 'hold_depot' },
  { id: 'depo_jambi', name: 'Depo BULOG & Distribusi Pangan Jambi', coords: [103.6131, -1.6100], type: 'hold_depot' },
  { id: 'depo_palembang', name: 'Kawasan Pergudangan Soekarno-Hatta Palembang', coords: [104.7565, -2.9909], type: 'hold_depot' },
  { id: 'depo_lampung', name: 'Pusat Distribusi Regional Way Halim Bandar Lampung', coords: [105.2667, -5.4294], type: 'hold_depot' },
  { id: 'depo_banda_aceh', name: 'Depo Logistik Sentral Banda Aceh', coords: [95.3193, 5.5483], type: 'hold_depot' },
];

export function findClosestSeaport(pt: LonLat) {
  let best = CARGO_SEAPORT_NODES[0];
  let minD = Infinity;
  for (const sp of CARGO_SEAPORT_NODES) {
    const d = getHaversineDistanceKm(pt, sp.coords);
    if (d < minD) {
      minD = d;
      best = sp;
    }
  }
  return { seaport: best, distanceKm: minD };
}

export function findClosestSafeHoldDepot(
  origin: LonLat,
  hazardCenter: LonLat | null,
  radiusKm: number
): { depot: typeof SAFE_BUFFER_DEPOTS[0]; distanceKm: number } {
  let best = SAFE_BUFFER_DEPOTS[0];
  let minD = Infinity;
  for (const depot of SAFE_BUFFER_DEPOTS) {
    if (hazardCenter && getHaversineDistanceKm(depot.coords, hazardCenter) < radiusKm + 3.0) {
      continue;
    }
    const d = getHaversineDistanceKm(origin, depot.coords);
    if (d < minD) {
      minD = d;
      best = depot;
    }
  }
  return { depot: best, distanceKm: minD };
}

/**
 * Modality Awareness: which transport modalities are affected by a hazard.
 * Uses explicit impact_profile when provided, otherwise derives from hazardType.
 */
export function getAffectedModalities(
  hazardType: CrisisType = 'flood',
  impactProfile?: HazardImpactProfile
): Array<'land' | 'sea' | 'air'> {
  if (impactProfile?.affected_modalities && impactProfile.affected_modalities.length > 0) {
    return [...impactProfile.affected_modalities];
  }
  switch (hazardType) {
    case 'port_closure':
      return ['sea', 'land'];
    case 'marine_wave':
      return ['sea'];
    case 'volcanic_eruption':
      return ['air', 'land'];
    case 'wildfire':
      return ['land', 'air'];
    case 'flood':
    case 'landslide':
    case 'earthquake':
    case 'road_closure':
    case 'congestion':
    case 'other_disruption':
    default:
      return ['land'];
  }
}

/**
 * Checks whether a seaport is blocked by a hazard circle.
 * Sea-affecting hazards use a generous capture radius (max(radiusKm + 8, 22) km)
 * because users clicking "near Pelabuhan Asal" often click harbor water or
 * adjacent coast 5–20 km from the exact port pin coordinate.
 */
export function isSeaportBlockedByHazard(
  portCoords: LonLat,
  hazardCenter: LonLat | null,
  radiusKm: number,
  hazardType: CrisisType = 'flood',
  affectedModalities: Array<string> = ['land']
): boolean {
  if (!hazardCenter) return false;
  const distKm = getHaversineDistanceKm(portCoords, hazardCenter);
  const seaAffecting =
    hazardType === 'port_closure' ||
    hazardType === 'marine_wave' ||
    affectedModalities.includes('sea');
  if (seaAffecting) {
    return distKm <= Math.max(radiusKm + 8, 22);
  }
  return distKm <= radiusKm + 2.0;
}

/**
 * Finds the closest seaport NOT blocked by the hazard, optionally excluding ports.
 */
export function findClosestOpenSeaport(
  target: LonLat,
  hazardCenter: LonLat | null,
  radiusKm: number,
  hazardType: CrisisType = 'flood',
  affectedModalities: Array<string> = ['land'],
  excludePortIds: string[] = []
): typeof CARGO_SEAPORT_NODES[0] | null {
  const sorted = [...CARGO_SEAPORT_NODES].sort(
    (a, b) => getHaversineDistanceKm(target, a.coords) - getHaversineDistanceKm(target, b.coords)
  );
  for (const port of sorted) {
    if (excludePortIds.includes(port.id)) continue;
    if (!isSeaportBlockedByHazard(port.coords, hazardCenter, radiusKm, hazardType, affectedModalities)) {
      return port;
    }
  }
  return null;
}

/**
 * Bows nautical waypoints further offshore so the sea lane visually and
 * mathematically detours around a maritime hazard circle (radiusKm + 10 km).
 */
export function bowNauticalPathAroundHazard(
  path: LonLat[],
  hazardCenter: LonLat | null,
  radiusKm: number,
  extraMarginKm: number = 10
): LonLat[] {
  if (!hazardCenter || path.length === 0) return path;
  const avoidRadius = radiusKm + extraMarginKm;
  return path.map(([lon, lat]) => {
    const d = getHaversineDistanceKm([lon, lat], hazardCenter);
    if (d >= avoidRadius) return [lon, lat] as LonLat;
    const pushKm = avoidRadius - d + 2;
    const dx = lon - hazardCenter[0];
    const dy = lat - hazardCenter[1];
    const len = Math.hypot(dx, dy) || 1;
    const kmPerLon = 111.32 * Math.cos((hazardCenter[1] * Math.PI) / 180) || 1;
    const kmPerLat = 110.574;
    return [
      lon + (dx / len) * (pushKm / kmPerLon),
      lat + (dy / len) * (pushKm / kmPerLat),
    ] as LonLat;
  });
}

export interface HoldRerouteCostSpec {
  fuelEfficiencyKmpl?: number | null;
  fuelRateIdr?: number | null;
  vehicleGolongan?: string | null;
}

export function calculateHoldVsRerouteEconomics(
  origin: LonLat,
  destination: LonLat,
  primaryDistKm: number,
  detourDistKm: number,
  hazardCenter: LonLat | null,
  radiusKm: number,
  hazardType: string = 'flood',
  costSpec?: HoldRerouteCostSpec
): HoldVsRerouteEconomics {
  const safeDepot = findClosestSafeHoldDepot(origin, hazardCenter, radiusKm).depot;
  const clearanceByHazard: Record<string, number> = {
    earthquake: 36,
    landslide: 24,
    volcanic_eruption: 24,
    port_closure: 18,
    road_closure: 16,
    marine_wave: 12,
    flood: 14,
    wildfire: 10,
    congestion: 5,
    other_disruption: 12,
  };
  const estimated_clearance_hours = clearanceByHazard[hazardType] ?? 12;

  const deltaKm = Math.max(0, detourDistKm - primaryDistKm);
  // Shared calculator provenance: fuel priced as (Δkm / eff) × rate, never
  // the legacy 1 km/L bug (Δkm × 6800). Defaults resolve GOL_II 3.5 km/L.
  const { effKmpl } = resolveFuelEfficiencyKmpl(costSpec?.fuelEfficiencyKmpl, costSpec?.vehicleGolongan);
  const { rateIdr } = resolveFuelRateIdr(costSpec?.fuelRateIdr);
  const fuelAndMaintenanceCost = Math.round((deltaKm / effKmpl) * rateIdr);
  const tollDifferential = 85000;
  const driverOvertimeBonus = Math.round((deltaKm / 45) * DRIVER_LABOR_HOURLY_RATE);
  const isSeaPortHazard = hazardType === 'port_closure' || hazardType === 'marine_wave';
  // Alternate-port failover incurs feeder trucking + stevedoring transfer fee.
  const alternatePortTransferFee = isSeaPortHazard ? 450000 : 0;
  const reroute_total_cost_idr = Math.max(750000, fuelAndMaintenanceCost + tollDifferential + driverOvertimeBonus + alternatePortTransferFee);

  const reeferPlugCost = estimated_clearance_hours * REEFER_GENSET_HOURLY_RATE;
  const demurrageCost = estimated_clearance_hours * DEPOT_HOURLY_FEE_IDR;
  // Port closure / marine wave adds container stacking & port demurrage exposure.
  const containerStackingCost = isSeaPortHazard ? estimated_clearance_hours * 85000 : 0;
  const baseCargoValue = 180000000;
  const spoilageLoss = Math.round(baseCargoValue * (1 - Math.exp(-0.006 * estimated_clearance_hours)));
  const hold_total_cost_idr = reeferPlugCost + demurrageCost + containerStackingCost + spoilageLoss;

  const isRerouteBetter = reroute_total_cost_idr <= hold_total_cost_idr;
  const recommended_action: 'REROUTE' | 'HOLD' = isRerouteBetter ? 'REROUTE' : 'HOLD';
  const net_savings_idr = Math.abs(reroute_total_cost_idr - hold_total_cost_idr);

  const rationale_id = isRerouteBetter
    ? `Reroute bypass (${Math.round(detourDistKm)} km) menghemat Rp ${(net_savings_idr / 1000000).toFixed(1)} Juta dibanding biaya penundaan & risiko susut komoditas selama ${estimated_clearance_hours} jam di ${safeDepot.name}.`
    : `Menahan muatan di ${safeDepot.name} (${estimated_clearance_hours} jam) menghemat Rp ${(net_savings_idr / 1000000).toFixed(1)} Juta dibanding biaya ekspedisi memutar jauh (${Math.round(detourDistKm)} km).`;

  return {
    reroute_total_cost_idr,
    hold_total_cost_idr,
    hold_depot_name: safeDepot.name,
    hold_depot_coords: safeDepot.coords,
    estimated_clearance_hours,
    recommended_action,
    net_savings_idr,
    rationale_id,
  };
}

/**
 * Authentic Nautical Coastal Sea-Lane Waypoints around Sumatra Island
 * (Ordered counter-clockwise loop: East Coast Malacca Strait -> Sunda Strait -> West Coast Indian Ocean -> Aceh Cape)
 */
export const SUMATRA_NAUTICAL_PERIMETER: LonLat[] = [
  // 0: Aceh North Cape
  [95.4000, 5.7500],
  // 1: Lhokseumawe Offshore (Malacca Strait entrance)
  [97.2500, 5.3500],
  // 2: Peureulak Offshore Fairway
  [97.8000, 5.1500],
  // 3: Langsa Outer Sea Lane
  [98.2500, 4.6500],
  // 4: Teluk Aru / Pangkalan Brandan Offshore
  [98.6000, 4.2500],
  // 5: Belawan Navigational Pilot Fairway
  [98.8200, 4.0200],
  // 6: Langkat / Belawan Offshore Approach
  [98.7800, 3.9500],
  // 7: Kuala Tanjung Sea Fairway
  [99.5500, 3.5000],
  // 8: Asahan / Tanjung Balai Sea Lane
  [100.1000, 3.1000],
  // 9: Dumai Offshore Fairway
  [101.4800, 1.7800],
  // 10: Selat Bengkalis / Selat Rupat Waterway
  [102.3500, 1.4000],
  // 11: Riau Islands / Batam - Singapore Strait Approach
  [103.9500, 1.1500],
  // 12: Selat Berhala / Jambi Estuary
  [104.4500, -0.7500],
  // 13: Selat Bangka North Entrance
  [105.0500, -1.8500],
  // 14: Selat Bangka South (Musi River Entrance for Boom Baru)
  [105.2500, -2.7500],
  // 15: Lampung East Coast Sea Fairway
  [106.1000, -4.7500],
  // 16: Sunda Strait North / Panjang Port Entrance
  [105.4500, -5.6000],
  // 17: Bakauheni - Merak Ferry Nautical Corridor
  [105.8200, -5.9200],
  // 18: Sunda Strait West Ocean Fairway
  [105.5000, -6.1000],
  // 19: Teluk Semangka South
  [104.6500, -5.9000],
  // 20: Krui / Lampung Barat Offshore (Indian Ocean)
  [103.7500, -5.2500],
  // 21: Bengkulu / Pulau Baai Fairway (Indian Ocean)
  [102.1500, -3.9500],
  // 22: Mukomuko Offshore
  [101.0500, -2.6000],
  // 23: Teluk Bayur (Padang) Fairway (Indian Ocean)
  [100.2500, -1.0500],
  // 24: Nias Strait / Pasaman West Waters
  [99.4500, 0.1000],
  // 25: Sibolga Bay Ocean Entrance (Indian Ocean)
  [98.6500, 1.6500],
  // 26: Tapaktuan Offshore Waters
  [97.0500, 3.1500],
  // 27: Meulaboh Offshore Waters
  [95.9500, 4.0500],
  // 28: Banda Aceh West Coast (Indian Ocean)
  [95.1500, 5.4500],
];

/**
 * Calculates Haversine distance in km between two [lon, lat] coordinates
 */
export function getHaversineDistanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const R = 6371.0;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Nautical Estuary & Channel Fairways connecting inland/coastal river ports to open water
 */
export interface PortChannelSpec {
  name: string;
  coords: LonLat;
  // Waypoints from port dock out to the nearest open-water perimeter fairway
  channelWaypoints: LonLat[];
  perimeterIndex: number;
}

export const SUMATRA_PORT_CHANNELS: PortChannelSpec[] = [
  // Palembang Boom Baru (Musi River -> Selat Bangka Entrance)
  {
    name: 'Palembang Boom Baru',
    coords: [104.7833, -2.9750],
    channelWaypoints: [
      [104.7833, -2.9750],
      [104.9200, -2.8500],
      [105.0800, -2.6200],
      [105.1800, -2.3500],
      [105.1200, -2.1500],
      [105.0500, -1.9500],
    ],
    perimeterIndex: 13, // Selat Bangka North Entrance [105.0500, -1.8500]
  },
  // Pekanbaru Siak (Siak River -> Selat Bengkalis / Malacca Strait)
  {
    name: 'Pekanbaru Siak',
    coords: [101.4500, 0.5333],
    channelWaypoints: [
      [101.4500, 0.5333],
      [101.7500, 0.7200],
      [102.0500, 0.9500],
      [102.1500, 1.2200],
      [102.2500, 1.3500],
    ],
    perimeterIndex: 10, // Selat Bengkalis [102.3500, 1.4000]
  },
  // Jambi Talang Duku (Batanghari River -> Selat Berhala)
  {
    name: 'Jambi Talang Duku',
    coords: [103.6500, -1.5500],
    channelWaypoints: [
      [103.6500, -1.5500],
      [103.8800, -1.3500],
      [104.1200, -1.1800],
      [104.3500, -0.9800],
      [104.4200, -0.8500],
    ],
    perimeterIndex: 12, // Selat Berhala [104.4500, -0.7500]
  },
  // Pelabuhan Belawan (Navigational dredged channel out to Malacca Strait)
  {
    name: 'Pelabuhan Belawan',
    coords: [98.6776, 3.7922],
    channelWaypoints: [
      [98.6776, 3.7922],
      [98.7100, 3.8400],
      [98.7400, 3.8900],
    ],
    perimeterIndex: 6, // Belawan Offshore Approach [98.7800, 3.9500]
  },
  // Pelabuhan Kuala Tanjung
  {
    name: 'Pelabuhan Kuala Tanjung',
    coords: [99.4500, 3.3600],
    channelWaypoints: [
      [99.4500, 3.3600],
      [99.5000, 3.4200],
    ],
    perimeterIndex: 7, // Kuala Tanjung Sea Fairway [99.5500, 3.5000]
  },
  // Pelabuhan Dumai
  {
    name: 'Pelabuhan Dumai',
    coords: [101.4533, 1.6811],
    channelWaypoints: [
      [101.4533, 1.6811],
      [101.4650, 1.7200],
    ],
    perimeterIndex: 9, // Dumai Offshore Fairway [101.4800, 1.7800]
  },
  // Pelabuhan Krueng Geukueh / Lhokseumawe
  {
    name: 'Pelabuhan Krueng Geukueh',
    coords: [97.0200, 5.2400],
    channelWaypoints: [
      [97.0200, 5.2400],
      [97.1200, 5.2900],
    ],
    perimeterIndex: 1, // Lhokseumawe Offshore [97.2500, 5.3500]
  },
  // Pelabuhan Teluk Bayur (Padang)
  {
    name: 'Pelabuhan Teluk Bayur',
    coords: [100.3700, -0.9980],
    channelWaypoints: [
      [100.3700, -0.9980],
      [100.3400, -1.0200],
      [100.2800, -1.0350],
    ],
    perimeterIndex: 23, // Teluk Bayur Indian Ocean Fairway [100.2500, -1.0500]
  },
  // Pelabuhan Panjang (Bandar Lampung)
  {
    name: 'Pelabuhan Panjang',
    coords: [105.3167, -5.4667],
    channelWaypoints: [
      [105.3167, -5.4667],
      [105.3600, -5.5200],
      [105.4000, -5.5600],
    ],
    perimeterIndex: 16, // Sunda Strait North / Panjang [105.4500, -5.6000]
  },
  // Pelabuhan Penyeberangan Bakauheni
  {
    name: 'Pelabuhan Bakauheni',
    coords: [105.7533, -5.8711],
    channelWaypoints: [
      [105.7533, -5.8711],
      [105.7800, -5.8950],
    ],
    perimeterIndex: 17, // Bakauheni Ferry Corridor [105.8200, -5.9200]
  },
  // Pelabuhan Malahayati / Banda Aceh
  {
    name: 'Pelabuhan Malahayati',
    coords: [95.5186, 5.5897],
    channelWaypoints: [
      [95.5186, 5.5897],
      [95.4800, 5.6500],
    ],
    perimeterIndex: 0, // Aceh North Cape [95.4000, 5.7500]
  },
  // Pelabuhan Sibolga
  {
    name: 'Pelabuhan Sibolga',
    coords: [98.7800, 1.7400],
    channelWaypoints: [
      [98.7800, 1.7400],
      [98.7200, 1.7000],
    ],
    perimeterIndex: 25, // Sibolga Bay Entrance [98.6500, 1.6500]
  },
  // Pelabuhan Pulau Baai (Bengkulu)
  {
    name: 'Pelabuhan Pulau Baai',
    coords: [102.2900, -3.8900],
    channelWaypoints: [
      [102.2900, -3.8900],
      [102.2200, -3.9200],
    ],
    perimeterIndex: 21, // Bengkulu Fairway [102.1500, -3.9500]
  },
];

/**
 * Finds closest nautical perimeter waypoint index
 */
export function findClosestNauticalIndex(pt: LonLat): number {
  let bestIdx = 0;
  let minDistance = Infinity;
  for (let i = 0; i < SUMATRA_NAUTICAL_PERIMETER.length; i++) {
    const d = getHaversineDistanceKm(pt, SUMATRA_NAUTICAL_PERIMETER[i]);
    if (d < minDistance) {
      minDistance = d;
      bestIdx = i;
    }
  }
  return bestIdx;
}

/**
 * Matches coordinate to known seaport estuary or river navigation channel
 */
export function matchPortChannel(pt: LonLat): { channelWaypoints: LonLat[]; perimeterIndex: number } | null {
  for (const port of SUMATRA_PORT_CHANNELS) {
    if (getHaversineDistanceKm(pt, port.coords) <= 30.0) {
      return {
        channelWaypoints: port.channelWaypoints,
        perimeterIndex: port.perimeterIndex,
      };
    }
  }
  return null;
}

/**
 * Generates an authentic coastal maritime path following open water sea-lanes around Sumatra.
 * Inland/river estuary ports first follow explicit estuary channels out to open water.
 * Never cuts a Euclidean line across Sumatra mainland.
 */
export function buildNauticalPath(origin: LonLat, destination: LonLat): LonLat[] {
  const originMatch = matchPortChannel(origin);
  const destMatch = matchPortChannel(destination);

  const startIdx = originMatch ? originMatch.perimeterIndex : findClosestNauticalIndex(origin);
  const endIdx = destMatch ? destMatch.perimeterIndex : findClosestNauticalIndex(destination);
  const N = SUMATRA_NAUTICAL_PERIMETER.length;

  const exitPath: LonLat[] = originMatch ? [...originMatch.channelWaypoints] : [origin];
  const enterPath: LonLat[] = destMatch ? [...destMatch.channelWaypoints].reverse() : [destination];

  // Case 1: Same perimeter waypoint (nearby or same estuary channel)
  if (startIdx === endIdx) {
    const directDist = getHaversineDistanceKm(origin, destination);
    if (directDist < 5.0) {
      return [origin, destination];
    }
    const combinedRaw = [...exitPath, SUMATRA_NAUTICAL_PERIMETER[startIdx], ...enterPath];
    // Deduplicate consecutive points
    const result: LonLat[] = [];
    for (const p of combinedRaw) {
      if (result.length === 0) {
        result.push(p);
      } else {
        const last = result[result.length - 1];
        if (Math.hypot(last[0] - p[0], last[1] - p[1]) > 0.001) {
          result.push(p);
        }
      }
    }
    return result;
  }

  // Calculate Forward (counter-clockwise) path distance along sea perimeter
  const forwardPerimeter: LonLat[] = [];
  let curr = startIdx;
  let forwardDist = 0;
  let prevPt = exitPath[exitPath.length - 1];
  while (true) {
    const pt = SUMATRA_NAUTICAL_PERIMETER[curr];
    forwardDist += getHaversineDistanceKm(prevPt, pt);
    forwardPerimeter.push(pt);
    prevPt = pt;
    if (curr === endIdx) break;
    curr = (curr + 1) % N;
  }
  forwardDist += getHaversineDistanceKm(prevPt, enterPath[0]);

  // Calculate Backward (clockwise) path distance along sea perimeter
  const backwardPerimeter: LonLat[] = [];
  curr = startIdx;
  let backwardDist = 0;
  prevPt = exitPath[exitPath.length - 1];
  while (true) {
    const pt = SUMATRA_NAUTICAL_PERIMETER[curr];
    backwardDist += getHaversineDistanceKm(prevPt, pt);
    backwardPerimeter.push(pt);
    prevPt = pt;
    if (curr === endIdx) break;
    curr = (curr - 1 + N) % N;
  }
  backwardDist += getHaversineDistanceKm(prevPt, enterPath[0]);

  const bestPerimeter = forwardDist <= backwardDist ? forwardPerimeter : backwardPerimeter;
  const combinedRaw = [...exitPath, ...bestPerimeter, ...enterPath];

  // Clean and deduplicate consecutive identical points
  const cleanPath: LonLat[] = [];
  for (const pt of combinedRaw) {
    if (cleanPath.length === 0) {
      cleanPath.push(pt);
    } else {
      const last = cleanPath[cleanPath.length - 1];
      if (Math.hypot(last[0] - pt[0], last[1] - pt[1]) > 0.001) {
        cleanPath.push(pt);
      }
    }
  }

  return cleanPath;
}

export const generateNauticalCoastalRoute = buildNauticalPath;

/**
 * Checks if a polyline intersects a hazard circle.
 */
export function isPolylineIntersectingHazardCircle(
  polyline: LonLat[],
  hazardCenter: LonLat,
  radiusKm: number,
  dangerBufferKm: number = 2.0
): boolean {
  if (!polyline || polyline.length === 0) return false;

  const effectiveRadius = radiusKm + dangerBufferKm;

  for (let i = 0; i < polyline.length; i++) {
    if (getHaversineDistanceKm(polyline[i], hazardCenter) <= effectiveRadius) return true;

    if (i < polyline.length - 1) {
      const A = polyline[i];
      const B = polyline[i + 1];
      const H = hazardCenter;

      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) continue;

      const t = Math.max(0, Math.min(1, ((H[0] - A[0]) * dx + (H[1] - A[1]) * dy) / lenSq));
      const closest: LonLat = [A[0] + t * dx, A[1] + t * dy];

      if (getHaversineDistanceKm(closest, hazardCenter) <= effectiveRadius) return true;
    }
  }

  return false;
}

export interface HazardExposureMetrics {
  isIntersecting: boolean;
  exposureKm: number;
  penetrationRatio: number;
  minDistanceToCenterKm: number;
  maxProximity: number; // 0 (at/outside edge) to 1 (at epicenter)
  riskPenaltyScore: number;
}

/**
 * Calculates continuous quantitative hazard exposure metrics for a polyline:
 * - exposureKm: cumulative length of segments lying within hazard radius
 * - penetrationRatio: proportion of route exposed to hazard
 * - minDistanceToCenterKm: closest distance the route approaches the hazard center
 * - maxProximity: continuous index of closeness to epicenter (1 = direct center hit)
 * - riskPenaltyScore: continuous composite cost for least-risk ranking
 */
export function calculateHazardExposureMetrics(
  polyline: LonLat[],
  hazardCenter: LonLat,
  radiusKm: number,
  dangerBufferKm: number = 2.0
): HazardExposureMetrics {
  if (!polyline || polyline.length === 0) {
    return {
      isIntersecting: false,
      exposureKm: 0,
      penetrationRatio: 0,
      minDistanceToCenterKm: 9999,
      maxProximity: 0,
      riskPenaltyScore: 0,
    };
  }

  const effectiveRadius = radiusKm + dangerBufferKm;
  let totalLengthKm = 0;
  let exposedLengthKm = 0;
  let minDistance = Infinity;

  for (let i = 0; i < polyline.length; i++) {
    const distToCenter = getHaversineDistanceKm(polyline[i], hazardCenter);
    if (distToCenter < minDistance) minDistance = distToCenter;

    if (i < polyline.length - 1) {
      const segLength = getHaversineDistanceKm(polyline[i], polyline[i + 1]);
      totalLengthKm += segLength;

      const A = polyline[i];
      const B = polyline[i + 1];
      const H = hazardCenter;
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const lenSq = dx * dx + dy * dy;

      let closestDist = distToCenter;
      if (lenSq > 0) {
        const t = Math.max(0, Math.min(1, ((H[0] - A[0]) * dx + (H[1] - A[1]) * dy) / lenSq));
        const closest: LonLat = [A[0] + t * dx, A[1] + t * dy];
        closestDist = getHaversineDistanceKm(closest, hazardCenter);
        if (closestDist < minDistance) minDistance = closestDist;
      }

      if (closestDist <= effectiveRadius) {
        exposedLengthKm += segLength;
      }
    }
  }

  const isIntersecting = minDistance <= effectiveRadius;
  const penetrationRatio = totalLengthKm > 0 ? Math.min(1.0, exposedLengthKm / totalLengthKm) : 0;
  const maxProximity = isIntersecting
    ? Math.max(0, Math.min(1.0, 1.0 - minDistance / effectiveRadius))
    : 0;

  // Composite risk penalty: heavily penalizes routes passing deep near the center
  const riskPenaltyScore = isIntersecting
    ? exposedLengthKm * 3.0 + Math.pow(maxProximity, 2) * 60.0
    : 0;

  return {
    isIntersecting,
    exposureKm: Math.round(exposedLengthKm * 10) / 10,
    penetrationRatio: Math.round(penetrationRatio * 100) / 100,
    minDistanceToCenterKm: Math.round(minDistance * 10) / 10,
    maxProximity: Math.round(maxProximity * 100) / 100,
    riskPenaltyScore: Math.round(riskPenaltyScore * 10) / 10,
  };
}

export interface MapboxRouteManeuver {
  instruction: string;
  distance_meters: number;
  duration_seconds: number;
}

export interface MapboxRouteResult {
  coordinates: LonLat[];
  distanceKm: number;
  durationMinutes: number;
  congestionSegments: CongestionSegment[];
  summary: string;
  // Phase 57 WP-A3 (D4 live-first): provenance of the polyline. 'live' =
  // Mapbox Directions road geometry; 'offline-interpolated' = straight-line
  // estimate shown ONLY with a SIMULASI/OFFLINE label, never as a live road route.
  source: 'live' | 'offline-interpolated';
  maneuvers?: MapboxRouteManeuver[];
}

export interface MapboxStep {
  maneuver: { instruction: string; type?: string; location?: [number, number] };
  distance: number;
  duration: number;
  name?: string;
}

export interface MapboxDirectionsLeg {
  summary?: string;
  annotation?: {
    congestion?: string[];
    distance?: number[];
    duration?: number[];
    speed?: number[];
  };
  steps?: MapboxStep[];
}

export interface MapboxDirectionsRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: LonLat[] };
  legs?: MapboxDirectionsLeg[];
}

export interface MapboxDirectionsResponse {
  code?: string;
  message?: string;
  routes?: MapboxDirectionsRoute[];
}

export type MapboxDirectionsProfile = 'driving' | 'driving-traffic';

const MAPBOX_DIRECTIONS_ENDPOINT = 'https://api.mapbox.com/directions/v5/mapbox';

export interface CachedDirectionsEntry {
  data: MapboxDirectionsResponse;
  expiresAt: number;
}

// In-memory cache guarding Mapbox Free Tier quota (100,000 requests/month)
export const directionsCache = new Map<string, CachedDirectionsEntry>();
export const DIRECTIONS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes TTL
const MAX_CACHE_ENTRIES = 200;

export function getCachedDirections(key: string): MapboxDirectionsResponse | null {
  const entry = directionsCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    directionsCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCachedDirections(key: string, data: MapboxDirectionsResponse): void {
  if (directionsCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = directionsCache.keys().next().value;
    if (oldestKey) directionsCache.delete(oldestKey);
  }
  directionsCache.set(key, {
    data,
    expiresAt: Date.now() + DIRECTIONS_CACHE_TTL_MS,
  });
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function createAbortError(): Error {
  const err = new Error('Perhitungan rute dibatalkan');
  err.name = 'AbortError';
  return err;
}

/** Throws an AbortError so cancelled route computations stop between network legs. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}


/**
 * Toll corridors are only avoided when the hazard actually threatens a toll gate or
 * interchange (radius + 2 km buffer), per D2.
 */
export function isHazardNearTollCorridor(
  hazardCenter: LonLat,
  radiusKm: number,
  bufferKm: number = TOLL_CORRIDOR_BUFFER_KM
): boolean {
  return HIGHWAY_JUNCTION_NODES.some(
    (node) => node.isTollGate === true && getHaversineDistanceKm(hazardCenter, node.coords) <= radiusKm + bufferKm
  );
}

export interface ExcludeOptions {
  excludeToll?: boolean;
  excludeMotorway?: boolean;
  excludePoints?: [number, number][];
}

/**
 * Builds the URL exclude query parameter: &exclude=point(lon lat),point(lon lat),toll
 * Caps points at 8 to prevent URL overflow.
 */
export function buildExcludeParam(options: ExcludeOptions): string {
  const parts: string[] = [];
  if (options.excludeToll) parts.push('toll');
  if (options.excludeMotorway) parts.push('motorway');
  if (options.excludePoints && options.excludePoints.length > 0) {
    const pts = options.excludePoints.slice(0, 8);
    for (const [lon, lat] of pts) {
      parts.push(`point(${lon.toFixed(5)} ${lat.toFixed(5)})`);
    }
  }
  return parts.join(',');
}

/**
 * Requests Mapbox Directions with memoized cache and fail-safe auto-retry.
 * If `excludePoints` triggers NoRoute, retries instantly without excludePoints.
 * If `excludeToll` triggers NoRoute, retries without toll.
 * Results are cached in-memory to prevent burning the 100k free tier monthly quota.
 */
export async function requestMapboxDirections(
  coordString: string,
  profile: MapboxDirectionsProfile,
  params: string,
  token: string,
  exclude: boolean | ExcludeOptions = false,
  signal?: AbortSignal
): Promise<MapboxDirectionsResponse | null> {
  const initialOpts: ExcludeOptions =
    typeof exclude === 'boolean' ? { excludeToll: exclude } : { ...exclude };

  const initialExcludeParam = buildExcludeParam(initialOpts);
  const cacheKey = `${profile}:${coordString}:${params}:${initialExcludeParam}`;
  const cached = getCachedDirections(cacheKey);
  if (cached) return cached;

  const buildUrl = (opts: ExcludeOptions) => {
    const exStr = buildExcludeParam(opts);
    const exQuery = exStr ? `&exclude=${encodeURIComponent(exStr)}` : '';
    return `${MAPBOX_DIRECTIONS_ENDPOINT}/${profile}/${coordString}?${params}${exQuery}&access_token=${token}`;
  };

  const attempt = async (opts: ExcludeOptions) => {
    throwIfAborted(signal);
    try {
      const res = await fetch(buildUrl(opts), { signal });
      const data = (await res.json().catch(() => null)) as MapboxDirectionsResponse | null;
      const isNoRoute = data?.code === 'NoRoute' || (res.ok && !data?.routes?.length);
      return { data, isNoRoute };
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw createAbortError();
      return { data: null, isNoRoute: true };
    }
  };

  let currentOpts = { ...initialOpts };
  let result = await attempt(currentOpts);

  // Auto-retry 1: If NoRoute occurs and excludePoints was supplied, retry without excludePoints
  if (result.isNoRoute && currentOpts.excludePoints && currentOpts.excludePoints.length > 0) {
    currentOpts = { ...currentOpts, excludePoints: undefined };
    const retryResult = await attempt(currentOpts);
    if (!retryResult.isNoRoute && retryResult.data?.routes?.length) {
      result = retryResult;
      if (result.data) {
        (result.data as any).warning = 'excludePoints caused NoRoute; retried without point exclusion';
      }
    }
  }

  // Auto-retry 2: If still NoRoute and excludeToll was supplied, retry without toll exclusion
  if (result.isNoRoute && currentOpts.excludeToll) {
    currentOpts = { ...currentOpts, excludeToll: false };
    const retryResult = await attempt(currentOpts);
    if (!retryResult.isNoRoute && retryResult.data?.routes?.length) {
      result = retryResult;
      if (result.data) {
        (result.data as any).warning = 'excludeToll caused NoRoute; retried without toll exclusion';
      }
    }
  }

  const finalData = result.data;
  if (finalData && finalData.routes && finalData.routes.length > 0) {
    setCachedDirections(cacheKey, finalData);
  }
  return finalData;
}

/**
 * Computes a tangential avoidance waypoint around a hazard polygon perpendicular to the corridor vector.
 * @param origin - Trip origin [lon, lat]
 * @param destination - Trip destination [lon, lat]
 * @param hazardCenter - Center coordinate of the hazard [lon, lat]
 * @param clearanceKm - Safe clearance distance in km (calibrated to radiusKm + 2.0 km)
 * @param angleRad - Angle relative to corridor vector (e.g. +PI/2, -PI/2, +PI/4, -PI/4)
 */
export function computeTangentialWaypoint(
  origin: LonLat,
  destination: LonLat,
  hazardCenter: LonLat,
  clearanceKm: number,
  angleRad: number = Math.PI / 2
): LonLat {
  const [hazardLon, hazardLat] = hazardCenter;
  const kmPerLonDegree = 111.32 * Math.cos((hazardLat * Math.PI) / 180);
  const kmPerLatDegree = 110.574;
  const odLonKm = (destination[0] - origin[0]) * kmPerLonDegree;
  const odLatKm = (destination[1] - origin[1]) * kmPerLatDegree;
  const odLengthKm = Math.sqrt(odLonKm * odLonKm + odLatKm * odLatKm) || 1;
  const dirLon = odLonKm / odLengthKm;
  const dirLat = odLatKm / odLengthKm;

  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);
  const rotLon = dirLon * cosA - dirLat * sinA;
  const rotLat = dirLon * sinA + dirLat * cosA;
  const offsetLon = (rotLon * clearanceKm) / kmPerLonDegree;
  const offsetLat = (rotLat * clearanceKm) / kmPerLatDegree;
  return [Number((hazardLon + offsetLon).toFixed(6)), Number((hazardLat + offsetLat).toFixed(6))];
}

async function fetchMapboxRouteWithForcedWaypoint(
  origin: LonLat,
  destination: LonLat,
  forcedWaypoint: LonLat,
  token: string,
  exclude: boolean | ExcludeOptions = false,
  signal?: AbortSignal
): Promise<MapboxRouteResult | null> {
  const coordString = [
    `${origin[0].toFixed(6)},${origin[1].toFixed(6)}`,
    `${forcedWaypoint[0].toFixed(6)},${forcedWaypoint[1].toFixed(6)}`,
    `${destination[0].toFixed(6)},${destination[1].toFixed(6)}`,
  ].join(';');

  try {
    const data = await requestMapboxDirections(
      coordString,
      'driving-traffic',
      'overview=full&geometries=geojson&steps=true&annotations=distance,duration,congestion,speed',
      token,
      exclude,
      signal
    );
    if (!data?.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coords: LonLat[] = route.geometry.coordinates;
    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const durationMinutes = Math.round(route.duration / 60);

    const maneuvers: MapboxRouteManeuver[] =
      route.legs?.flatMap((leg) => leg.steps || []).map((step) => ({
        instruction: step.maneuver.instruction,
        distance_meters: Math.round(step.distance),
        duration_seconds: Math.round(step.duration),
      })) || [];

    const congestionSegments: CongestionSegment[] = [];
    const annotations = route.legs?.flatMap((leg) => leg.annotation?.congestion || []) || [];
    if (annotations.length > 0 && coords.length > 1) {
      for (let i = 0; i < annotations.length - 1; i++) {
        const raw = annotations[i];
        const level: 'low' | 'moderate' | 'heavy' =
          raw === 'heavy' || raw === 'severe' ? 'heavy' : raw === 'moderate' ? 'moderate' : 'low';
        if (level !== 'low') {
          congestionSegments.push({
            coordinates: [
              { lat: coords[i][1], lon: coords[i][0] },
              { lat: coords[i + 1][1], lon: coords[i + 1][0] },
            ],
            level,
          });
        }
      }
    }

    return {
      coordinates: coords,
      distanceKm,
      durationMinutes,
      congestionSegments,
      summary: route.legs?.[0]?.summary || 'Bypass Route',
      source: 'live',
      maneuvers,
    };
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) throw createAbortError();
    return null;
  }
}

export async function fetchMapboxAlternativeDrivingRoutes(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = [],
  exclude: boolean | ExcludeOptions = false,
  signal?: AbortSignal
): Promise<MapboxRouteResult[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const fallbackCoords = [origin, ...waypoints, destination];
  const fallbackDistance = getHaversineDistanceKm(origin, destination) * 1.15;
  const results: MapboxRouteResult[] = [];

  if (token) {
    const allCoords = [origin, ...waypoints, destination];
    const coordString = allCoords.map(([lon, lat]) => `${lon.toFixed(6)},${lat.toFixed(6)}`).join(';');

    try {
      const data = await requestMapboxDirections(
        coordString,
        'driving-traffic',
        'alternatives=true&annotations=congestion,distance,duration,speed&geometries=geojson&overview=full&steps=true',
        token,
        exclude,
        signal
      );
      if (data?.routes && data.routes.length > 0) {
        for (let index = 0; index < data.routes.length; index++) {
          const route = data.routes[index];
          const coords: LonLat[] = route.geometry.coordinates;
          const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
          const durationMinutes = Math.round(route.duration / 60);

          const maneuvers: MapboxRouteManeuver[] =
            route.legs?.flatMap((leg) => leg.steps || []).map((step) => ({
              instruction: step.maneuver.instruction,
              distance_meters: Math.round(step.distance),
              duration_seconds: Math.round(step.duration),
            })) || [];

          const congestionSegments: CongestionSegment[] = [];
          const annotations = route.legs?.flatMap((leg) => leg.annotation?.congestion || []) || [];
          if (annotations && annotations.length > 0 && coords.length > 1) {
            let currentLevel: 'low' | 'moderate' | 'heavy' = 'low';
            let currentCoords: Array<{ lat: number; lon: number }> = [];
            for (let i = 0; i < annotations.length; i++) {
              const level: 'low' | 'moderate' | 'heavy' =
                annotations[i] === 'heavy' || annotations[i] === 'severe' ? 'heavy'
                : annotations[i] === 'moderate' ? 'moderate' : 'low';
              const pt = coords[Math.min(i, coords.length - 1)];
              const pointObj = { lat: pt[1], lon: pt[0] };
              if (i === 0) { currentLevel = level; currentCoords.push(pointObj); }
              else if (level !== currentLevel) {
                if (currentCoords.length > 1) congestionSegments.push({ coordinates: currentCoords, level: currentLevel });
                currentLevel = level;
                currentCoords = [currentCoords[currentCoords.length - 1], pointObj];
              } else { currentCoords.push(pointObj); }
            }
            if (currentCoords.length > 1) congestionSegments.push({ coordinates: currentCoords, level: currentLevel });
          }

          const routeName = index === 0 ? 'Rute Utama (Jalan Tol / Jalinsum)' : index === 1 ? 'Alternatif 1 (Jalur Arteri)' : 'Alternatif 2 (Bypass Sekunder)';
          results.push({
            coordinates: coords,
            distanceKm,
            durationMinutes,
            congestionSegments,
            summary: route.legs?.[0]?.summary || routeName,
            source: 'live',
            maneuvers,
          });
        }
      }
    } catch (err) {
      if (isAbortError(err) || signal?.aborted) throw createAbortError();
      console.warn('Mapbox Directions API call failed:', err);
    }
  }

  // A cancelled route computation must not fabricate an offline polyline.
  throwIfAborted(signal);

  if (results.length === 0) {
    const precomputed = findPrecomputedHubCorridor(origin, destination);
    if (precomputed) {
      results.push({
        coordinates: precomputed.coordinates,
        distanceKm: precomputed.distanceKm,
        durationMinutes: precomputed.durationMinutes,
        congestionSegments: [],
        summary: precomputed.name,
        source: 'live',
      });
    } else {
      // Phase 57 WP-A3 (D4): honest unavailable path. Straight-line estimate is
      // labeled SIMULASI/OFFLINE at every render site: never presented as live.
      results.push({
        coordinates: fallbackCoords,
        distanceKm: Math.round(fallbackDistance),
        durationMinutes: Math.round((fallbackDistance / 60) * 60),
        congestionSegments: [],
        summary: 'SIMULASI/OFFLINE: garis lurus, bukan geometri jalan live',
        source: 'offline-interpolated',
      });
    }
  }

  results.sort((a, b) => a.durationMinutes - b.durationMinutes);
  return results.slice(0, 3);
}

export async function fetchMapboxDrivingRoute(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = [],
  modality: TransportModality = 'truck',
  signal?: AbortSignal
): Promise<LonLat[]> {
  throwIfAborted(signal);
  if (modality === 'maritime') {
    return generateNauticalCoastalRoute(origin, destination);
  }
  if (modality === 'air') {
    // Airway corridor with curvature
    const midLon = (origin[0] + destination[0]) / 2 + 0.12;
    const midLat = (origin[1] + destination[1]) / 2 + 0.08;
    return [origin, [midLon, midLat], destination];
  }
  const results = await fetchMapboxAlternativeDrivingRoutes(origin, destination, waypoints, false, signal);
  return results[0]?.coordinates || [origin, ...waypoints, destination];
}

/**
 * Fast simplified feeder route fetcher for first/last-mile intermodal legs.
 * Uses overview=simplified with zero congestion/step annotations to cut latency from seconds to <200ms.
 */
export async function fetchMapboxFeederRoute(
  origin: LonLat,
  destination: LonLat,
  signal?: AbortSignal
): Promise<LonLat[]> {
  throwIfAborted(signal);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) return [origin, destination];

  const coordString = `${origin[0].toFixed(5)},${origin[1].toFixed(5)};${destination[0].toFixed(5)},${destination[1].toFixed(5)}`;
  const cacheKey = `feeder:${coordString}`;
  const cached = getCachedDirections(cacheKey);
  if (cached?.routes?.[0]?.geometry?.coordinates) {
    return cached.routes[0].geometry.coordinates;
  }

  try {
    const res = await requestMapboxDirections(
      coordString,
      'driving',
      'overview=simplified&geometries=geojson',
      token,
      false,
      signal
    );
    if (res?.routes?.[0]?.geometry?.coordinates) {
      setCachedDirections(cacheKey, res);
      return res.routes[0].geometry.coordinates;
    }
  } catch (err) {
    if (isAbortError(err)) throw createAbortError();
  }
  return [origin, destination];
}

/**
 * Official ICAO ATS Airway Navigation Waypoints (Medan FIR & Jakarta FIR)
 * Aligns air cargo corridors with real published airways (e.g. W12, W21) avoiding arbitrary mountain traversal.
 */
export const ICAO_MEDAN_FIR_WAYPOINTS: Record<string, LonLat> = {
  BND: [95.4180, 5.5180], // Banda Aceh VOR
  LKA: [97.1000, 5.2000], // Lhokseumawe NDB/VOR (W12 / W21)
  PBI: [98.3000, 4.0500], // Pangkalan Brandan Waypoint (W12 / W21)
  KNO: [98.8780, 3.6421], // Kualanamu VOR/DME
  KSR: [99.6200, 3.0100], // Kisaran / Asahan Waypoint (W12)
  DMI: [101.4500, 1.6800], // Dumai Waypoint (W12 / W21)
  PKU: [101.4447, 0.4619], // Pekanbaru VOR/DME
};

/**
 * Generates an ICAO-aligned airway corridor connecting two airport hubs along published ATS routes.
 */
export function getIcaoAirwayCorridor(
  depCode: string,
  arrCode: string,
  depCoords: LonLat,
  arrCoords: LonLat
): LonLat[] {
  // W12 / W21 Malacca Strait coastal airway corridor (North Sumatra & Aceh)
  if ((depCode === 'BTJ' || depCode === 'LSW') && arrCode === 'KNO') {
    const path: LonLat[] = [depCoords];
    if (depCode === 'BTJ') path.push(ICAO_MEDAN_FIR_WAYPOINTS.LKA);
    path.push(ICAO_MEDAN_FIR_WAYPOINTS.PBI);
    path.push(arrCoords);
    return path;
  }
  if (depCode === 'KNO' && (arrCode === 'BTJ' || arrCode === 'LSW')) {
    const path: LonLat[] = [depCoords, ICAO_MEDAN_FIR_WAYPOINTS.PBI];
    if (arrCode === 'BTJ') path.push(ICAO_MEDAN_FIR_WAYPOINTS.LKA);
    path.push(arrCoords);
    return path;
  }
  if (depCode === 'BTJ' && arrCode === 'LSW') {
    return [depCoords, ICAO_MEDAN_FIR_WAYPOINTS.LKA, arrCoords];
  }
  if (depCode === 'LSW' && arrCode === 'BTJ') {
    return [depCoords, ICAO_MEDAN_FIR_WAYPOINTS.LKA, arrCoords];
  }
  if (depCode === 'KNO' && arrCode === 'PKU') {
    return [depCoords, ICAO_MEDAN_FIR_WAYPOINTS.KSR, ICAO_MEDAN_FIR_WAYPOINTS.DMI, arrCoords];
  }
  if (depCode === 'PKU' && arrCode === 'KNO') {
    return [depCoords, ICAO_MEDAN_FIR_WAYPOINTS.DMI, ICAO_MEDAN_FIR_WAYPOINTS.KSR, arrCoords];
  }

  // Standard Great Circle airway corridor with intermediate geodesic points
  const numPts = 6;
  const path: LonLat[] = [depCoords];
  for (let i = 1; i < numPts; i++) {
    const t = i / numPts;
    const lon = Number((depCoords[0] + (arrCoords[0] - depCoords[0]) * t).toFixed(4));
    const lat = Number((depCoords[1] + (arrCoords[1] - depCoords[1]) * t).toFixed(4));
    path.push([lon, lat]);
  }
  path.push(arrCoords);
  return path;
}

/**
 * Finds closest airport to given coordinate
 */
function findClosestAirport(pt: LonLat) {
  let best = CARGO_AIRPORT_NODES[0];
  let minD = Infinity;
  for (const ap of CARGO_AIRPORT_NODES) {
    const d = getHaversineDistanceKm(pt, ap.coords);
    if (d < minD) {
      minD = d;
      best = ap;
    }
  }
  return { airport: best, distanceKm: minD };
}

/**
 * Computes Authentic 3-Leg Maritime + Land Intermodal Logistics Chain (Truck -> Pelindo Seaport -> Pelindo Seaport -> Truck)
 * Hazard-aware: reroutes via the nearest OPEN alternate seaport when the
 * nearest port is blocked by a port_closure / marine_wave / sea hazard.
 */
export async function calculateSeaIntermodalCorridor(
  origin: LonLat,
  destination: LonLat,
  hazardCenter: LonLat | null = null,
  radiusKm: number = DEFAULT_HAZARD_RADIUS_KM,
  hazardType: CrisisType = 'flood',
  affectedModalities?: Array<'land' | 'sea' | 'air'>,
  signal?: AbortSignal
): Promise<RouteRecommendation> {
  throwIfAborted(signal);
  const odDistanceKm = getHaversineDistanceKm(origin, destination);
  const modalities = affectedModalities ?? getAffectedModalities(hazardType);
  const nearestOriginPort = findClosestSeaport(origin).seaport;
  const nearestDestPort = findClosestSeaport(destination).seaport;

  const originBlocked = isSeaportBlockedByHazard(nearestOriginPort.coords, hazardCenter, radiusKm, hazardType, modalities);
  const destBlocked = isSeaportBlockedByHazard(nearestDestPort.coords, hazardCenter, radiusKm, hazardType, modalities);

  let originPort = nearestOriginPort;
  let destPort = nearestDestPort;
  let altOriginPort: typeof CARGO_SEAPORT_NODES[0] | null = null;
  let altDestPort: typeof CARGO_SEAPORT_NODES[0] | null = null;
  if (originBlocked) {
    altOriginPort = findClosestOpenSeaport(origin, hazardCenter, radiusKm, hazardType, modalities, [nearestOriginPort.id]);
    if (altOriginPort) originPort = altOriginPort;
  }
  if (destBlocked) {
    const exclude = destPort.id === originPort.id ? [destPort.id, nearestOriginPort.id] : [nearestDestPort.id];
    // Avoid picking the (possibly already alternate) origin port as destination unless no choice.
    if (originPort.id !== nearestDestPort.id) exclude.push(originPort.id);
    altDestPort = findClosestOpenSeaport(destination, hazardCenter, radiusKm, hazardType, modalities, exclude);
    if (!altDestPort && originBlocked && altOriginPort) {
      // Fallback: try any open port distinct from originPort
      altDestPort = findClosestOpenSeaport(destination, hazardCenter, radiusKm, hazardType, modalities, [originPort.id]);
    }
    if (altDestPort) destPort = altDestPort;
  }
  const usedAlternatePort = originBlocked || destBlocked;
  const closedPortName = originBlocked ? nearestOriginPort.name : destBlocked ? nearestDestPort.name : undefined;
  const altPortName = altOriginPort && altDestPort
    ? `${altOriginPort.name} → ${altDestPort.name}`
    : altOriginPort ? altOriginPort.name : altDestPort ? altDestPort.name : undefined;

  // Same-Port / Short-Distance Guard
  if (originPort.id === destPort.id || odDistanceKm < 120) {
    return {
      id: 'corridor-sea-intermodal',
      route_name: 'Intermodal Laut + Darat',
      description: `Pelabuhan terdekat sama (${originPort.name}) — Rute darat langsung lebih efisien.`,
      waypoints: [],
      distance_km: Math.round(odDistanceKm),
      eta_minutes: Math.round((odDistanceKm / 55) * 60),
      fuel_increase_pct: 0,
      risk_score: 0.04,
      is_compromised: false,
      safety_status: 'SAFE_DETOUR',
      safety_tag: 'RUTE DARAT LEBIH EFISIEN',
      modality: 'maritime',
      corridor_type: 'sea_intermodal',
      viable: false,
      non_viable_reason: `Pelabuhan terdekat sama (${originPort.name}) — Rute darat langsung lebih efisien`,
      legs: [],
      color: '#3B82F6',
    };
  }

  // True 3-Leg Chain:
  // Parallel fetch for first-mile and last-mile feeder legs using fast simplified profile
  const [leg1Coords, leg3Coords] = await Promise.all([
    fetchMapboxFeederRoute(origin, originPort.coords, signal),
    fetchMapboxFeederRoute(destPort.coords, destination, signal),
  ]);
  const leg1Dist = Math.round(getHaversineDistanceKm(origin, originPort.coords) * 1.15);
  const leg1Eta = Math.round((leg1Dist / 50) * 60);

  // Leg 2: Coastal Maritime Sea Lane along SUMATRA_NAUTICAL_PERIMETER
  // Bow the nautical lane offshore when it crosses a maritime hazard circle.
  const rawSeaFairway = generateNauticalCoastalRoute(originPort.coords, destPort.coords);
  const seaFairwayCoords =
    hazardCenter && (modalities.includes('sea'))
      ? bowNauticalPathAroundHazard(rawSeaFairway, hazardCenter, radiusKm, 10)
      : rawSeaFairway;
  let seaDist = 0;
  for (let i = 0; i < seaFairwayCoords.length - 1; i++) {
    seaDist += getHaversineDistanceKm(seaFairwayCoords[i], seaFairwayCoords[i + 1]);
  }
  const leg2Dist = Math.round(seaDist);
  const leg2Eta = Math.round((leg2Dist / 26) * 60) + 120; // 26 km/h (~14 knots) + 120 min Pelindo port handling buffer

  const leg3Dist = Math.round(getHaversineDistanceKm(destPort.coords, destination) * 1.15);
  const leg3Eta = Math.round((leg3Dist / 50) * 60);

  const totalWaypoints: Array<{ lat: number; lon: number }> = [];
  leg1Coords.forEach(([lon, lat]) => totalWaypoints.push({ lat, lon }));
  seaFairwayCoords.forEach(([lon, lat]) => totalWaypoints.push({ lat, lon }));
  leg3Coords.forEach(([lon, lat]) => totalWaypoints.push({ lat, lon }));

  const legs: RouteLeg[] = [
    {
      title: `Leg 1: Feeder Darat -> ${originPort.name}`,
      mode: 'truck',
      modality: 'truck',
      distance_km: leg1Dist,
      eta_minutes: leg1Eta,
      from_name: 'Titik Asal Logistik',
      to_name: originPort.name,
      coordinates: leg1Coords,
      color: '#10B981', // Emerald Green
      transfer_hub: {
        id: originPort.id,
        name: originPort.name,
        type: 'seaport',
        coords: originPort.coords,
      },
    },
    {
      title: `Leg 2: Alur Laut ALKI (${originPort.name.split('(')[0].trim()} -> ${destPort.name.split('(')[0].trim()})`,
      mode: 'maritime',
      modality: 'maritime',
      distance_km: leg2Dist,
      eta_minutes: leg2Eta,
      from_name: originPort.name,
      to_name: destPort.name,
      coordinates: seaFairwayCoords,
      color: '#3B82F6', // Royal Blue
      transfer_hub: {
        id: destPort.id,
        name: destPort.name,
        type: 'seaport',
        coords: destPort.coords,
      },
    },
    {
      title: `Leg 3: Last-Mile Darat (${destPort.name.split('(')[0].trim()} -> Tujuan)`,
      mode: 'truck',
      modality: 'truck',
      distance_km: leg3Dist,
      eta_minutes: leg3Eta,
      from_name: destPort.name,
      to_name: 'Titik Tujuan Logistik',
      coordinates: leg3Coords,
      color: '#10B981', // Emerald Green
    },
  ];

  return {
    id: 'corridor-sea-intermodal',
    route_name: usedAlternatePort && altPortName
      ? `Pengalihan Pelabuhan Alternatif via ${altPortName.split('(')[0].trim()}`
      : `Intermodal Laut (${originPort.name.split('(')[0].trim()} -> ${destPort.name.split('(')[0].trim()})`,
    description: usedAlternatePort
      ? `Alih muat pelabuhan alternatif menghindari penutupan ${closedPortName ?? 'pelabuhan'} via ${originPort.name} ke ${destPort.name} (jalur laut didetour keluar radius bahaya ${radiusKm}km)`
      : `Bypass Maritim Pesisir Alur Laut Kepulauan Indonesia (ALKI) via ${originPort.name} ke ${destPort.name}`,
    waypoints: totalWaypoints,
    distance_km: leg1Dist + leg2Dist + leg3Dist,
    eta_minutes: leg1Eta + leg2Eta + leg3Eta,
    fuel_increase_pct: usedAlternatePort ? 12.0 : 0,
    risk_score: usedAlternatePort ? 0.12 : 0.04,
    is_compromised: false,
    safety_status: 'SAFE_DETOUR',
    safety_tag: usedAlternatePort ? 'ALIH MUAT PELABUHAN ALTERNATIF' : 'MULTI-MODA LAUT + DARAT',
    modality: 'maritime',
    corridor_type: 'sea_intermodal',
    viable: true,
    affected_port_name: closedPortName,
    alternate_port_name: altPortName,
    legs,
    color: '#3B82F6',
  };
}

/**
 * Computes Authentic 3-Leg Air Cargo + Land Intermodal Logistics Chain (Truck -> Airport -> Airport -> Truck)
 */
export async function calculateAirIntermodalCorridor(
  origin: LonLat,
  destination: LonLat,
  signal?: AbortSignal
): Promise<RouteRecommendation> {
  throwIfAborted(signal);
  const odDistanceKm = getHaversineDistanceKm(origin, destination);
  const depInfo = findClosestAirport(origin);
  const arrInfo = findClosestAirport(destination);
  const depAirport = depInfo.airport;
  const arrAirport = arrInfo.airport;
  const leg1DistKm = depInfo.distanceKm;

  // Same-Airport / Short-Distance Guard
  if (depAirport.id === arrAirport.id || odDistanceKm < 120) {
    return {
      id: 'corridor-air-intermodal',
      route_name: 'Intermodal Udara + Darat',
      description: `Rute udara tidak direkomendasikan untuk jarak ${Math.round(odDistanceKm)} km atau bandara terdekat sama (${depAirport.code}).`,
      waypoints: [],
      distance_km: Math.round(odDistanceKm),
      eta_minutes: Math.round((odDistanceKm / 55) * 60),
      fuel_increase_pct: 0,
      risk_score: 0.05,
      is_compromised: false,
      safety_status: 'SAFE_DETOUR',
      safety_tag: 'RUTE DARAT LEBIH EFISIEN',
      modality: 'air',
      corridor_type: 'air_intermodal',
      viable: false,
      non_viable_reason: `Bandara terdekat sama (${depAirport.code}) — Rute darat langsung lebih efisien`,
      legs: [],
      color: '#00F0FF',
    };
  }

  // Directionality / Backtracking Guard:
  // If truck feeder distance to departure airport exceeds 40% of total origin-to-destination distance,
  // mark the air corridor as non-viable.
  if (leg1DistKm > 0.40 * odDistanceKm) {
    return {
      id: 'corridor-air-intermodal',
      route_name: `Intermodal Udara (${depAirport.code} -> ${arrAirport.code})`,
      description: `Rute udara tidak efisien: jarak feeder truk (${Math.round(leg1DistKm)} km) melebihi 40% total jarak rute (${Math.round(odDistanceKm)} km).`,
      waypoints: [],
      distance_km: Math.round(odDistanceKm),
      eta_minutes: Math.round((odDistanceKm / 55) * 60),
      fuel_increase_pct: 0,
      risk_score: 0.15,
      is_compromised: false,
      safety_status: 'SAFE_DETOUR',
      safety_tag: 'RUTE UDARA TIDAK EFISIEN (FEEDER TERLALU JAUH)',
      modality: 'air',
      corridor_type: 'air_intermodal',
      viable: false,
      non_viable_reason: `Feeder darat mundur terlalu jauh (${Math.round(leg1DistKm)} km > 40% dari ${Math.round(odDistanceKm)} km). Gunakan rute darat atau laut.`,
      legs: [],
      color: '#00F0FF',
    };
  }

  // True 3-Leg Chain:
  // Leg 1 & 3: Parallel fetch using fast simplified feeder profile
  const [leg1Coords, leg3Coords] = await Promise.all([
    fetchMapboxFeederRoute(origin, depAirport.coords, signal),
    fetchMapboxFeederRoute(arrAirport.coords, destination, signal),
  ]);
  const leg1Dist = Math.round(leg1DistKm * 1.15);
  const leg1Eta = Math.round((leg1Dist / 55) * 60);

  // Leg 2: ICAO Airway Corridor Flight Path
  const leg2Coords = getIcaoAirwayCorridor(depAirport.code, arrAirport.code, depAirport.coords, arrAirport.coords);
  let flightDistCalc = 0;
  for (let i = 0; i < leg2Coords.length - 1; i++) {
    flightDistCalc += getHaversineDistanceKm(leg2Coords[i], leg2Coords[i + 1]);
  }
  const flightDist = Math.round(flightDistCalc);
  const flightEta = Math.round((flightDist / 620) * 60) + 40; // 40m loading/handling buffer

  const leg3Dist = Math.round(getHaversineDistanceKm(arrAirport.coords, destination) * 1.15);
  const leg3Eta = Math.round((leg3Dist / 55) * 60);

  const totalWaypoints: Array<{ lat: number; lon: number }> = [];
  leg1Coords.forEach(([lon, lat]) => totalWaypoints.push({ lat, lon }));
  leg2Coords.forEach(([lon, lat]) => totalWaypoints.push({ lat, lon }));
  leg3Coords.forEach(([lon, lat]) => totalWaypoints.push({ lat, lon }));

  const legs: RouteLeg[] = [
    {
      title: `Leg 1: Feeder Darat -> ${depAirport.code}`,
      mode: 'truck',
      modality: 'truck',
      distance_km: leg1Dist,
      eta_minutes: leg1Eta,
      from_name: 'Titik Asal Logistik',
      to_name: depAirport.name,
      coordinates: leg1Coords,
      color: '#10B981', // Emerald Green
      transfer_hub: {
        id: depAirport.id,
        name: depAirport.name,
        type: 'airport',
        coords: depAirport.coords,
      },
    },
    {
      title: `Leg 2: Penerbangan Kargo (${depAirport.code} -> ${arrAirport.code})`,
      mode: 'air',
      modality: 'air',
      distance_km: flightDist,
      eta_minutes: flightEta,
      from_name: depAirport.name,
      to_name: arrAirport.name,
      coordinates: leg2Coords,
      color: '#00F0FF', // Sky Cyan
      transfer_hub: {
        id: arrAirport.id,
        name: arrAirport.name,
        type: 'airport',
        coords: arrAirport.coords,
      },
    },
    {
      title: `Leg 3: Last-Mile Darat (${arrAirport.code} -> Tujuan)`,
      mode: 'truck',
      modality: 'truck',
      distance_km: leg3Dist,
      eta_minutes: leg3Eta,
      from_name: arrAirport.name,
      to_name: 'Titik Tujuan Logistik',
      coordinates: leg3Coords,
      color: '#10B981', // Emerald Green
    },
  ];

  return {
    id: 'corridor-air-intermodal',
    route_name: `Intermodal Udara (${depAirport.code} -> ${arrAirport.code})`,
    description: `Koridor Udara Cepat Multi-Moda via ${depAirport.name} ke ${arrAirport.name}`,
    waypoints: totalWaypoints,
    distance_km: leg1Dist + flightDist + leg3Dist,
    eta_minutes: leg1Eta + flightEta + leg3Eta,
    fuel_increase_pct: 18.0,
    risk_score: 0.05,
    is_compromised: false,
    safety_status: 'SAFE_DETOUR',
    safety_tag: 'MULTI-MODA UDARA + DARAT',
    modality: 'air',
    corridor_type: 'air_intermodal',
    viable: true,
    legs,
    color: '#00F0FF',
  };
}

/**
 * Backward compatibility wrapper for calculateMultiModalLogisticsChain
 */
export async function calculateMultiModalLogisticsChain(
  origin: LonLat,
  destination: LonLat
): Promise<RouteRecommendation[]> {
  const air = await calculateAirIntermodalCorridor(origin, destination);
  return [air];
}

/**
 * Builds a structured tradeoff analysis (pros/cons + delay & cost breakdown)
 * for a single route corridor against the normal baseline.
 */
export function buildRouteTradeoffAnalysis(
  route: RouteRecommendation,
  baselineEtaMinutes: number,
  baselineDistKm: number,
  econ: HoldVsRerouteEconomics | undefined,
  opts: { hazardType?: CrisisType; closedPortName?: string; altPortName?: string; costSpec?: HoldRerouteCostSpec } = {}
): RouteTradeoffAnalysis {
  const time_delta_minutes = Math.max(0, Math.round(route.eta_minutes - baselineEtaMinutes));
  const deltaKm = Math.max(0, route.distance_km - baselineDistKm);
  const { effKmpl } = resolveFuelEfficiencyKmpl(opts.costSpec?.fuelEfficiencyKmpl, opts.costSpec?.vehicleGolongan);
  const { rateIdr } = resolveFuelRateIdr(opts.costSpec?.fuelRateIdr);
  const corridor = route.corridor_type;
  const closed = opts.closedPortName ?? route.affected_port_name;
  const alt = opts.altPortName ?? route.alternate_port_name;

  if (corridor === 'land_detour') {
    const fuelCost = Math.round((deltaKm / effKmpl) * rateIdr);
    const tollDiff = 85000;
    const overtime = Math.round((deltaKm / 45) * DRIVER_LABOR_HOURLY_RATE);
    return {
      time_delta_minutes,
      additional_cost_idr: fuelCost + tollDiff + overtime,
      cost_breakdown_items: [
        { label: 'BBM & Perawatan', amount_idr: fuelCost },
        { label: 'Diferensial Tol', amount_idr: tollDiff },
        { label: 'Lembur Supir', amount_idr: overtime },
      ],
      pros: [
        'Menghindari zona bahaya via jalur arteri yang aman',
        'Armada tetap bergerak tanpa menunggu jalur dibuka',
        'Risiko armada terjebak genangan / blokade minimal',
      ],
      cons: [
        `Waktu tempuh bertambah +${time_delta_minutes} menit dibanding jalur normal`,
        `Tambahan jarak tempuh ${Math.round(deltaKm)} km memicu konsumsi BBM & tol`,
        'Ketergantungan pada kepadatan arteri alternatif',
      ],
    };
  }

  if (corridor === 'sea_intermodal') {
    const isAlt = Boolean(alt || closed);
    const feederTruck = isAlt ? 850000 + Math.round(deltaKm * 2600) : Math.round(deltaKm * 2600);
    const portHandling = 650000;
    const stevedoring = isAlt ? 450000 : 0;
    const charterDiff = Math.round(Math.max(0, route.distance_km - baselineDistKm) * 1600);
    const additional_cost_idr = feederTruck + portHandling + stevedoring + charterDiff;
    return {
      time_delta_minutes,
      additional_cost_idr,
      cost_breakdown_items: [
        { label: 'Feeder Truk Pelabuhan', amount_idr: feederTruck },
        { label: 'Handling Pelabuhan', amount_idr: portHandling + stevedoring },
        { label: 'Diferensial Charter Kapal', amount_idr: charterDiff },
      ],
      pros: isAlt
        ? [
            `Menghindari penutupan ${closed ?? 'pelabuhan'} melalui alih muat di ${alt ?? 'pelabuhan alternatif'}`,
            'Mempertahankan pengiriman via jalur laut tanpa menunggu buka pelabuhan',
            'Kapasitas bulk besar, cocok untuk muatan tonase tinggi',
          ]
        : [
            'Bypass maritim kapasitas besar menghindari blokade darat',
            'Biaya per ton-km efisien untuk jarak jauh antar pelabuhan',
            'Tidak terdampak kemacetan / banjir koridor darat',
          ],
      cons: [
        'Tambahan biaya feeder truk darat & bongkar-muat pelabuhan alternatif',
        `Waktu tempuh bertambah +${time_delta_minutes} menit dibanding jalur normal`,
        'Butuh koordinasi jadwal kapal & alih muat antar pelabuhan',
      ],
    };
  }

  if (corridor === 'air_intermodal') {
    const uplift = 4500000;
    const airportHandling = 1200000;
    const extraFuel = Math.round((deltaKm / effKmpl) * rateIdr);
    return {
      time_delta_minutes,
      additional_cost_idr: uplift + airportHandling + extraFuel,
      cost_breakdown_items: [
        { label: 'Uplift Kargo Udara', amount_idr: uplift },
        { label: 'Handling Bandara', amount_idr: airportHandling },
        { label: 'Feeder Darat Bandara', amount_idr: extraFuel },
      ],
      pros: [
        'Waktu tempuh tercepat untuk muatan bernilai tinggi / perishable',
        'Menghindari seluruh blokade darat & laut sekaligus',
        'SLA & cold-chain paling aman untuk komoditas sensitif',
      ],
      cons: [
        'Biaya uplift kargo udara paling mahal di antara semua opsi',
        'Kapasitas tonase terbatas & butuh handling bandara khusus',
        `Diferensial operasional +Rp ${(uplift + airportHandling + extraFuel).toLocaleString('id-ID')} dibanding jalur normal`,
      ],
    };
  }

  if (corridor === 'hold_staging') {
    const clearanceH = econ?.estimated_clearance_hours ?? 12;
    const holdTotal = econ?.hold_total_cost_idr ?? 2500000;
    const reefer = clearanceH * REEFER_GENSET_HOURLY_RATE;
    const demurrage = clearanceH * DEPOT_HOURLY_FEE_IDR;
    const spoilage = Math.max(0, holdTotal - reefer - demurrage);
    return {
      time_delta_minutes,
      additional_cost_idr: holdTotal,
      cost_breakdown_items: [
        { label: `Reefer Plug (${clearanceH} jam)`, amount_idr: reefer },
        { label: `Demurrage & Stacking (${clearanceH} jam)`, amount_idr: demurrage },
        { label: 'Risiko Susut Muatan / Spoilage', amount_idr: spoilage },
      ],
      pros: [
        'Menghindari risiko armada terjebak / rusak di zona bahaya',
        'Menjaga kualitas muatan perishable di cold storage depo',
        'Hemat dibanding memutar jauh bila jalur cepat dibuka',
      ],
      cons: [
        `Pengiriman tertunda ~${clearanceH} jam hingga jalur dibuka`,
        'Biaya reefer & demurrage berjalan per jam selama penahanan',
        'Risiko susut muatan bila komoditas sangat perishable',
      ],
    };
  }

  // land_primary (default)
  if (route.is_compromised) {
    const penalty = 3200000;
    const delayCost = time_delta_minutes * 12000;
    return {
      time_delta_minutes,
      additional_cost_idr: penalty + delayCost,
      cost_breakdown_items: [
        { label: 'Penalti Keterlambatan & Eksposur Risiko', amount_idr: penalty },
        { label: 'Risiko Susut / Kerusakan Muatan', amount_idr: delayCost },
        { label: 'Biaya Darurat & Eskalasi', amount_idr: 450000 },
      ],
      pros: [
        'Tetap di koridor utama tanpa memutar jauh',
        'Cocok bila gangguan cepat surut / akses segera dibuka',
      ],
      cons: [
        `Waktu tempuh bertambah +${time_delta_minutes} menit dibanding jalur normal`,
        'Risiko armada terjebak banjir / blokade & biaya darurat',
        'Potensi susut muatan perishable selama tertahan',
      ],
    };
  }
  return {
    time_delta_minutes,
    additional_cost_idr: 0,
    cost_breakdown_items: [
      { label: 'Jalur Normal', amount_idr: 0 },
    ],
    pros: [
      'Jalur tercepat & termurah pada kondisi normal',
      'Tanpa biaya tambahan operasional & alih muat',
    ],
    cons: [
      'Tidak ada redundansi bila kondisi gangguan memburuk',
      'Rentan terdampak bila radius bahaya meluas',
    ],
  };
}

/**
 * Simultaneous Multi-Color Intermodal Router:
 * Simultaneously computes all four corridors (Land Primary, Land Detour, Sea Intermodal, Air Intermodal)
 * with authentic per-leg multi-color coordinates and grounded Hold-vs-Reroute economics.
 */
/**
 * Attaches first-principles trip operational costs (BBM Biosolar, driver labor, reefer genset, tolls)
 * and harmonizes detour corridor totals with baseline delta economics.
 */
function attachOperationalCostsToCorridors(
  corridors: RouteRecommendation[],
  costOptions?: {
    commodity?: string | null;
    vehicleGolongan?: string | null;
    tollCostIdr?: number | null;
  }
): void {
  if (corridors.length === 0) return;

  // 1. Primary Corridor (corridors[0]) - Authentic first-principles baseline
  const primary = corridors[0];
  const baselineTrip = calculateTotalTripCost({
    distanceKm: primary.distance_km,
    durationMinutes: primary.eta_minutes,
    commodity: costOptions?.commodity,
    vehicleGolongan: costOptions?.vehicleGolongan,
    tollCostIdr: costOptions?.tollCostIdr ?? 0,
  });
  primary.total_operational_cost_idr = baselineTrip.total_operational_cost_idr;
  primary.operational_cost_breakdown = baselineTrip.operational_cost_breakdown;

  // 2. Detour & Intermodal Corridors - Synchronize with baseline delta economics
  for (let i = 1; i < corridors.length; i++) {
    const route = corridors[i];
    const rawTrip = calculateTotalTripCost({
      distanceKm: route.distance_km,
      durationMinutes: route.eta_minutes,
      commodity: costOptions?.commodity,
      vehicleGolongan: costOptions?.vehicleGolongan,
      tollCostIdr: costOptions?.tollCostIdr ?? 0,
    });

    // Detour additional cost hierarchy
    const additionalCost =
      route.hedging?.reroute_policy?.cost_idr ??
      route.hedging?.reroute_cost_idr ??
      (route.corridor_type === 'land_detour' ? route.economic_comparison?.reroute_total_cost_idr : undefined) ??
      route.tradeoff_analysis?.additional_cost_idr;

    if (additionalCost != null && additionalCost > 0) {
      // Total operational cost is baseline total + additional detour surcharge
      const alignedTotal = primary.total_operational_cost_idr + additionalCost;
      route.total_operational_cost_idr = Math.max(rawTrip.total_operational_cost_idr, alignedTotal);

      // Adjust operational cost breakdown to keep items internally consistent
      const deltaOverhead = Math.max(0, route.total_operational_cost_idr - rawTrip.total_operational_cost_idr);
      route.operational_cost_breakdown = {
        ...rawTrip.operational_cost_breakdown,
        toll_cost_idr: rawTrip.operational_cost_breakdown.toll_cost_idr + deltaOverhead,
        total_operational_cost_idr: route.total_operational_cost_idr,
      };
    } else {
      route.total_operational_cost_idr = rawTrip.total_operational_cost_idr;
      route.operational_cost_breakdown = rawTrip.operational_cost_breakdown;
    }
  }
}

export async function calculateAIDynamicDetourRoutes(
  hazardCenter: LonLat | null,
  radiusKm: number = DEFAULT_HAZARD_RADIUS_KM,
  origin: LonLat,
  destination: LonLat,
  _modality: TransportModality = 'best',
  hazardType: CrisisType = 'flood',
  impactProfile?: HazardImpactProfile,
  zoneTier: 'RED_CONFIRMED' | 'YELLOW_CLARIFY' = 'RED_CONFIRMED',
  signal?: AbortSignal,
  costOptions?: {
    commodity?: string | null;
    vehicleGolongan?: string | null;
    tollCostIdr?: number | null;
  }
): Promise<RouteRecommendation[]> {
  void zoneTier;
  throwIfAborted(signal);
  // Fast in-memory quantized cache check (<1 ms)
  const cached = getCachedDynamicRoutes<RouteRecommendation>(origin, destination, hazardCenter, radiusKm, _modality);
  if (cached && cached.length > 0) {
    attachOperationalCostsToCorridors(cached, costOptions);
    return cached;
  }
  const affectedModalities = getAffectedModalities(hazardType, impactProfile);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const excludeToll = hazardCenter ? isHazardNearTollCorridor(hazardCenter, radiusKm) : false;

  // STEP 1: Compute Land Routes (Primary & Alternative / Bypass)
  const mapboxResults = await fetchMapboxAlternativeDrivingRoutes(origin, destination, [], excludeToll, signal);
  const primaryRes = mapboxResults[0];
  const primaryMetrics = hazardCenter
    ? calculateHazardExposureMetrics(primaryRes.coordinates, hazardCenter, radiusKm)
    : { isIntersecting: false, exposureKm: 0, penetrationRatio: 0, minDistanceToCenterKm: 9999, maxProximity: 0, riskPenaltyScore: 0 };
  // Port-closure near origin/destination blocks port access roads even when the
  // polyline itself skirts the circle: users often click "near Pelabuhan Asal".
  const portAccessThresholdKm = Math.max(radiusKm + 6, 18);
  const portAccessBlocked =
    hazardCenter != null &&
    hazardType === 'port_closure' &&
    (getHaversineDistanceKm(origin, hazardCenter) <= portAccessThresholdKm ||
      getHaversineDistanceKm(destination, hazardCenter) <= portAccessThresholdKm);
  const isPrimaryCompromised = primaryMetrics.isIntersecting || portAccessBlocked;

  // Corridor 1: Fastest Direct Land Corridor
  const isPrimaryOffline = primaryRes.source === 'offline-interpolated';
  // Pilot honesty rule: interpolated straight-line geometry is never a verified-driveable
  // corridor. Without live Mapbox geometry the land corridors are flagged COMPROMISED with
  // the cause stated, instead of presenting green SAFE_DETOUR on an estimate. Sea/air
  // corridors are graph-based (no Mapbox needed) and HOLD carries real depot economics,
  // so the pilot still gets applicable options.
  const landPrimaryName = isPrimaryOffline ? '[SIMULASI] Koridor Darat Utama (Tol / Jalinsum)' : 'Koridor Darat Utama (Tol / Jalinsum)';
  const landPrimaryColor = isPrimaryCompromised || isPrimaryOffline ? '#EF4444' : '#10B981';

  const landPrimary: RouteRecommendation = {
    id: 'corridor-land-primary',
    route_name: landPrimaryName,
    description: isPrimaryOffline
      ? `[SIMULASI/OFFLINE: garis lurus] Jalur langsung via ${primaryRes.summary}`
      : `Jalur darat langsung tercepat via ${primaryRes.summary}`,
    waypoints: primaryRes.coordinates.map(([lon, lat]) => ({ lat, lon })),
    distance_km: primaryRes.distanceKm,
    eta_minutes: primaryRes.durationMinutes + (isPrimaryCompromised ? 60 : 0),
    fuel_increase_pct: isPrimaryCompromised ? 25.0 : 0,
    risk_score: isPrimaryCompromised ? 0.90 : 0.05,
    is_compromised: isPrimaryCompromised || isPrimaryOffline,
    safety_status: isPrimaryCompromised || isPrimaryOffline ? 'COMPROMISED' : 'CLEAR',
    safety_tag: portAccessBlocked
      ? 'AKSES PELABUHAN ASAL TUTUP — PERLU RUTE ALTERNATIF'
      : isPrimaryOffline
        ? 'TANPA GEOMETRI LIVE — GUNAKAN HOLD / ANTARMODA'
        : isPrimaryCompromised
          ? 'TERDAMPAK ZONA BAHAYA (+60m Delay)'
          : 'RUTE DARAT TERCEPAT',
    traffic_level: primaryRes.congestionSegments.some((s) => s.level === 'heavy') ? 'heavy' : 'low',
    congestion_segments: primaryRes.congestionSegments,
    modality: 'truck',
    corridor_type: 'land_primary',
    viable: true,
    color: landPrimaryColor,
    legs: [
      {
        title: 'Koridor Darat Langsung',
        mode: 'truck',
        distance_km: primaryRes.distanceKm,
        eta_minutes: primaryRes.durationMinutes,
        from_name: 'Titik Asal Logistik',
        to_name: 'Titik Tujuan Logistik',
        coordinates: primaryRes.coordinates,
        color: landPrimaryColor,
        maneuvers: primaryRes.maneuvers,
      },
    ],
  };

  // Corridor 2: Alternative Land / Hazard Detour Corridor
  let landDetourResult: MapboxRouteResult = mapboxResults[1] || primaryRes;
  let landDetourColor = '#34D399';
  let landDetourTag = 'RUTE ALTERNATIF ARTERI';
  let isDetourCompromised = false;

  // If primary route intersects hazard shockwave (or port access is blocked),
  // actively solve detour around hazard / closed-port perimeter via Dual-Layer Hazard Avoidance.
  if (hazardCenter && isPrimaryCompromised && token) {
    let foundDetour = false;
    const isPointObstacle = radiusKm < 0.5; // Scale < 500m (e.g. point landslide, bridge outage)
    const evalBufferKm = isPointObstacle ? 0.05 : 0.1; // 50m margin for point obstacles, 100m for wide polygons

    // LAYER 1: Point Obstacle Avoidance via &exclude=point(lon lat)
    if (isPointObstacle) {
      throwIfAborted(signal);
      const pointExcludeOpts: ExcludeOptions = {
        excludeToll,
        excludePoints: [hazardCenter],
      };
      const pointBypassResults = await fetchMapboxAlternativeDrivingRoutes(
        origin,
        destination,
        [],
        pointExcludeOpts,
        signal
      );
      if (pointBypassResults && pointBypassResults.length > 0) {
        for (const bypass of pointBypassResults) {
          const m = calculateHazardExposureMetrics(bypass.coordinates, hazardCenter, radiusKm, evalBufferKm);
          if (!m.isIntersecting && m.exposureKm === 0) {
            landDetourResult = bypass;
            landDetourColor = '#10B981';
            landDetourTag = 'PENGALIHAN BEBAS BENCANA (TITIK RINTANGAN)';
            foundDetour = true;
            break;
          }
        }
      }
    }

    // A. Priority Bypass: Safe arterial junctions outside hazard zone
    // Port closures need a wider perimeter buffer around the closed terminal.
    if (!foundDetour) {
      const nodeBufferKm = hazardType === 'port_closure' ? 6.0 : 2.0;
      const safeNodes = HIGHWAY_JUNCTION_NODES.filter(
        (node) => getHaversineDistanceKm(node.coords, hazardCenter) >= radiusKm + nodeBufferKm
      );
      const scoredNodes = safeNodes.map((node) => ({
        name: node.name,
        coords: node.coords,
        score: getHaversineDistanceKm(origin, node.coords) + getHaversineDistanceKm(node.coords, destination),
      })).sort((a, b) => a.score - b.score);

      const bypassExcludeOpts: ExcludeOptions = {
        excludeToll,
        excludePoints: [hazardCenter],
      };

      for (const cand of scoredNodes.slice(0, 4)) {
        throwIfAborted(signal);
        const bypass = await fetchMapboxRouteWithForcedWaypoint(origin, destination, cand.coords, token, bypassExcludeOpts, signal);
        if (bypass) {
          const m = calculateHazardExposureMetrics(bypass.coordinates, hazardCenter, radiusKm, evalBufferKm);
          if (!m.isIntersecting && m.exposureKm === 0) {
            landDetourResult = bypass;
            landDetourColor = '#10B981';
            landDetourTag = `PENGALIHAN AMAN (${cand.name.toUpperCase()})`;
            foundDetour = true;
            break;
          }
        }
      }
    }

    // LAYER 2: Wide Hazard Polygon Avoidance via Forced Tangential Waypoint (R + 2.0 km)
    if (!foundDetour) {
      // Calibrated tangential clearance: R + 2.0 km (strictly avoids hazard while keeping waypoints snug to road network)
      const clearanceKm = radiusKm + 2.0;
      const candidateAngles = [Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];
      const validTangents: Array<{ result: MapboxRouteResult; angle: number }> = [];

      const tangentExcludeOpts: ExcludeOptions = {
        excludeToll,
        excludePoints: [hazardCenter],
      };

      for (const ang of candidateAngles) {
        throwIfAborted(signal);
        const waypoint = computeTangentialWaypoint(origin, destination, hazardCenter, clearanceKm, ang);
        const radial = await fetchMapboxRouteWithForcedWaypoint(origin, destination, waypoint, token, tangentExcludeOpts, signal);
        if (radial) {
          const m = calculateHazardExposureMetrics(radial.coordinates, hazardCenter, radiusKm, evalBufferKm);
          if (!m.isIntersecting && m.exposureKm === 0) {
            validTangents.push({ result: radial, angle: ang });
          }
        }
      }

      if (validTangents.length > 0) {
        // Pick detour with shortest duration / distance
        validTangents.sort((a, b) => a.result.durationMinutes - b.result.durationMinutes || a.result.distanceKm - b.result.distanceKm);
        landDetourResult = validTangents[0].result;
        landDetourColor = '#10B981';
        landDetourTag = 'RUTE PENGALIHAN BEBAS BENCANA (TANGENSIAL)';
        foundDetour = true;
      }
    }

    if (!foundDetour) {
      landDetourColor = '#F59E0B';
      landDetourTag = 'DETOUR RISIKO MINIMAL (FRINGE)';
      isDetourCompromised = true;
    }
  }

  const landDetour: RouteRecommendation = {
    id: 'corridor-land-detour',
    route_name: isPrimaryCompromised ? 'Rute Pengalihan Darat (Detour)' : 'Alternatif Darat (Jalur Arteri)',
    description: isPrimaryCompromised
      ? `Jalur pengalihan darat melingkari radius bahaya ${radiusKm}km via ${landDetourResult.summary}`
      : `Jalur alternatif arteri bebas hambatan via ${landDetourResult.summary}`,
    waypoints: landDetourResult.coordinates.map(([lon, lat]) => ({ lat, lon })),
    distance_km: landDetourResult.distanceKm,
    eta_minutes: landDetourResult.durationMinutes,
    fuel_increase_pct: isPrimaryCompromised ? 14.0 : 8.0,
    risk_score: isDetourCompromised ? 0.35 : 0.08,
    is_compromised: isDetourCompromised || isPrimaryOffline,
    safety_status: isDetourCompromised || isPrimaryOffline ? 'COMPROMISED' : 'SAFE_DETOUR',
    safety_tag: isPrimaryOffline ? 'TANPA GEOMETRI LIVE — GUNAKAN HOLD / ANTARMODA' : landDetourTag,
    traffic_level: landDetourResult.congestionSegments.some((s) => s.level === 'heavy') ? 'heavy' : 'low',
    congestion_segments: landDetourResult.congestionSegments,
    modality: 'truck',
    corridor_type: 'land_detour',
    viable: true,
    color: isPrimaryOffline ? '#EF4444' : landDetourColor,
    legs: [
      {
        title: isPrimaryCompromised ? 'Pengalihan Darat / Detour' : 'Jalur Arteri Sekunder',
        mode: 'truck',
        distance_km: landDetourResult.distanceKm,
        eta_minutes: landDetourResult.durationMinutes,
        from_name: 'Titik Asal Logistik',
        to_name: 'Titik Tujuan Logistik',
        coordinates: landDetourResult.coordinates,
        color: landDetourColor,
        maneuvers: landDetourResult.maneuvers,
      },
    ],
  };

  // STEP 2: Simultaneously Compute Intermodal Corridors (Sea & Air)
  // Sea corridor is hazard-aware: blocked ports fail over to the nearest open port.
  const [seaCorridor, airCorridor] = await Promise.all([
    calculateSeaIntermodalCorridor(origin, destination, hazardCenter, radiusKm, hazardType, affectedModalities, signal),
    calculateAirIntermodalCorridor(origin, destination, signal),
  ]);

  // Baseline normal ETA / distance: fastest direct land time before hazard delay.
  const baselineEtaMinutes = primaryRes.durationMinutes;
  const baselineDistKm = primaryRes.distanceKm;

  // STEP 3: Grounded Hold vs Reroute Economic Decision Engine
  let holdCorridor: RouteRecommendation | null = null;
  if (hazardCenter) {
    const econ = calculateHoldVsRerouteEconomics(
      origin,
      destination,
      landPrimary.distance_km,
      landDetour.distance_km,
      hazardCenter,
      radiusKm,
      hazardType
    );

    landPrimary.economic_comparison = econ;
    landDetour.economic_comparison = econ;
    seaCorridor.economic_comparison = econ;
    airCorridor.economic_comparison = econ;

    holdCorridor = {
      id: 'corridor-hold-staging',
      route_name: `Tahan Muatan di Depo Buffer (${econ.hold_depot_name.split('(')[0].trim()})`,
      description: `Rekomendasi Taktis: Tahan armada di ${econ.hold_depot_name} (~${econ.estimated_clearance_hours} jam) hingga air surut / jalan dibuka. Hemat Rp ${(econ.net_savings_idr / 1000000).toFixed(1)} Juta dibanding reroute.`,
      waypoints: [],
      distance_km: landPrimary.distance_km,
      eta_minutes: landPrimary.eta_minutes + econ.estimated_clearance_hours * 60,
      fuel_increase_pct: 0,
      risk_score: 0.10,
      is_compromised: false,
      safety_status: 'HOLD_DELAY',
      safety_tag: `TAHAN MUATAN • REKOMENDASI ${econ.recommended_action}`,
      modality: 'truck',
      corridor_type: 'hold_staging',
      viable: true,
      economic_comparison: econ,
      color: '#F59E0B',
      legs: [
        {
          title: `Feeder ke ${econ.hold_depot_name}`,
          mode: 'truck',
          distance_km: Math.round(getHaversineDistanceKm(origin, econ.hold_depot_coords)),
          eta_minutes: Math.round((getHaversineDistanceKm(origin, econ.hold_depot_coords) / 45) * 60),
          from_name: 'Titik Asal Logistik',
          to_name: econ.hold_depot_name,
          color: '#F59E0B',
          transfer_hub: {
            id: 'safe_hold_depot',
            name: econ.hold_depot_name,
            type: 'hold_depot',
            coords: econ.hold_depot_coords,
          },
        },
      ],
    };
  }

  const allCorridors: RouteRecommendation[] = [landPrimary, landDetour, seaCorridor, airCorridor];
  if (holdCorridor) {
    allCorridors.push(holdCorridor);
  }

  // STEP 4: Attach structured tradeoff analysis (pros/cons + delay & cost) to EVERY option.
  const sharedEcon = allCorridors.find((r) => r.economic_comparison)?.economic_comparison;
  for (const route of allCorridors) {
    route.tradeoff_analysis = buildRouteTradeoffAnalysis(route, baselineEtaMinutes, baselineDistKm, sharedEcon, {
      hazardType,
      closedPortName: route.affected_port_name ?? seaCorridor.affected_port_name,
      altPortName: route.alternate_port_name ?? seaCorridor.alternate_port_name,
    });
  }

  // STEP 5 (Phase 106): Attach first-principles trip operational cost engine to ALL corridors
  attachOperationalCostsToCorridors(allCorridors, costOptions);

  setCachedDynamicRoutes(origin, destination, hazardCenter, radiusKm, _modality, allCorridors);
  return allCorridors;
}
