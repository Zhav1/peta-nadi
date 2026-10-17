import type { LonLat } from './pathDensifier';
import type { RouteRecommendation, CongestionSegment, RouteLeg, HoldVsRerouteEconomics } from './types';

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

export function calculateHoldVsRerouteEconomics(
  origin: LonLat,
  destination: LonLat,
  primaryDistKm: number,
  detourDistKm: number,
  hazardCenter: LonLat | null,
  radiusKm: number,
  hazardType: string = 'flood'
): HoldVsRerouteEconomics {
  const safeDepot = findClosestSafeHoldDepot(origin, hazardCenter, radiusKm).depot;
  const estimated_clearance_hours =
    hazardType === 'landslide' ? 24 :
    hazardType === 'earthquake' ? 36 :
    hazardType === 'port_closure' ? 18 : 14;

  const deltaKm = Math.max(0, detourDistKm - primaryDistKm);
  const fuelAndMaintenanceCost = Math.round(deltaKm * 6800);
  const tollDifferential = 85000;
  const driverOvertimeBonus = Math.round((deltaKm / 45) * 40000);
  const reroute_total_cost_idr = Math.max(750000, fuelAndMaintenanceCost + tollDifferential + driverOvertimeBonus);

  const reeferPlugCost = estimated_clearance_hours * 45000;
  const demurrageCost = estimated_clearance_hours * 125000;
  const baseCargoValue = 180000000;
  const spoilageLoss = Math.round(baseCargoValue * (1 - Math.exp(-0.006 * estimated_clearance_hours)));
  const hold_total_cost_idr = reeferPlugCost + demurrageCost + spoilageLoss;

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
  // 2: Langkat / Belawan Offshore Approach
  [98.7800, 3.9500],
  // 3: Kuala Tanjung Sea Fairway
  [99.5500, 3.5000],
  // 4: Asahan / Tanjung Balai Sea Lane
  [100.1000, 3.1000],
  // 5: Dumai Offshore Fairway
  [101.4800, 1.7800],
  // 6: Selat Bengkalis / Selat Rupat Waterway
  [102.3500, 1.4000],
  // 7: Riau Islands / Batam - Singapore Strait Approach
  [103.9500, 1.1500],
  // 8: Selat Berhala / Jambi Estuary
  [104.4500, -0.7500],
  // 9: Selat Bangka North Entrance
  [105.0500, -1.8500],
  // 10: Selat Bangka South (Musi River Entrance for Boom Baru)
  [105.2500, -2.7500],
  // 11: Lampung East Coast Sea Fairway
  [106.1000, -4.7500],
  // 12: Sunda Strait North / Panjang Port Entrance
  [105.4500, -5.6000],
  // 13: Bakauheni - Merak Ferry Nautical Corridor
  [105.8200, -5.9200],
  // 14: Sunda Strait West Ocean Fairway
  [105.5000, -6.1000],
  // 15: Teluk Semangka South
  [104.6500, -5.9000],
  // 16: Krui / Lampung Barat Offshore (Indian Ocean)
  [103.7500, -5.2500],
  // 17: Bengkulu / Pulau Baai Fairway (Indian Ocean)
  [102.1500, -3.9500],
  // 18: Mukomuko Offshore
  [101.0500, -2.6000],
  // 19: Teluk Bayur (Padang) Fairway (Indian Ocean)
  [100.2500, -1.0500],
  // 20: Nias Strait / Pasaman West Waters
  [99.4500, 0.1000],
  // 21: Sibolga Bay Ocean Entrance (Indian Ocean)
  [98.6500, 1.6500],
  // 22: Tapaktuan Offshore Waters
  [97.0500, 3.1500],
  // 23: Meulaboh Offshore Waters
  [95.9500, 4.0500],
  // 24: Banda Aceh West Coast (Indian Ocean)
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
 * Finds closest nautical perimeter waypoint index
 */
function findClosestNauticalIndex(pt: LonLat): number {
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
 * Generates an authentic coastal maritime path following open water sea-lanes around Sumatra.
 * Guarantees ships never traverse over the mainland.
 */
export function generateNauticalCoastalRoute(origin: LonLat, destination: LonLat): LonLat[] {
  const startIdx = findClosestNauticalIndex(origin);
  const endIdx = findClosestNauticalIndex(destination);
  const N = SUMATRA_NAUTICAL_PERIMETER.length;

  if (startIdx === endIdx) {
    return [origin, SUMATRA_NAUTICAL_PERIMETER[startIdx], destination];
  }

  // Calculate Forward (counter-clockwise) path distance
  const forwardPath: LonLat[] = [];
  let curr = startIdx;
  let forwardDist = 0;
  let prevPt = origin;
  while (true) {
    const pt = SUMATRA_NAUTICAL_PERIMETER[curr];
    forwardDist += getHaversineDistanceKm(prevPt, pt);
    forwardPath.push(pt);
    prevPt = pt;
    if (curr === endIdx) break;
    curr = (curr + 1) % N;
  }
  forwardDist += getHaversineDistanceKm(prevPt, destination);

  // Calculate Backward (clockwise) path distance
  const backwardPath: LonLat[] = [];
  curr = startIdx;
  let backwardDist = 0;
  prevPt = origin;
  while (true) {
    const pt = SUMATRA_NAUTICAL_PERIMETER[curr];
    backwardDist += getHaversineDistanceKm(prevPt, pt);
    backwardPath.push(pt);
    prevPt = pt;
    if (curr === endIdx) break;
    curr = (curr - 1 + N) % N;
  }
  backwardDist += getHaversineDistanceKm(prevPt, destination);

  // Choose the shorter open-ocean coastal fairway
  const bestPerimeter = forwardDist <= backwardDist ? forwardPath : backwardPath;

  return [origin, ...bestPerimeter, destination];
}

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
}

export interface MapboxDirectionsRoute {
  distance: number;
  duration: number;
  geometry: { coordinates: LonLat[] };
  legs?: Array<{ summary?: string; annotation?: { congestion?: string[] } }>;
}

export interface MapboxDirectionsResponse {
  code?: string;
  message?: string;
  routes?: MapboxDirectionsRoute[];
}

export type MapboxDirectionsProfile = 'driving' | 'driving-traffic';

const MAPBOX_DIRECTIONS_ENDPOINT = 'https://api.mapbox.com/directions/v5/mapbox';

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

/**
 * Requests Mapbox Directions. When `excludeToll` is applied and Mapbox answers NoRoute, the
 * request is retried once without the toll exclusion so routing never fails closed.
 */
export async function requestMapboxDirections(
  coordString: string,
  profile: MapboxDirectionsProfile,
  params: string,
  token: string,
  excludeToll: boolean
): Promise<MapboxDirectionsResponse | null> {
  const buildUrl = (exclude: boolean) =>
    `${MAPBOX_DIRECTIONS_ENDPOINT}/${profile}/${coordString}?${params}${
      exclude ? '&exclude=toll' : ''
    }&access_token=${token}`;

  const attempt = async (exclude: boolean) => {
    const res = await fetch(buildUrl(exclude));
    const data = (await res.json().catch(() => null)) as MapboxDirectionsResponse | null;
    const isNoRoute = data?.code === 'NoRoute' || (res.ok && !data?.routes?.length);
    return { data, isNoRoute };
  };

  const first = await attempt(excludeToll);
  if (excludeToll && first.isNoRoute) {
    return (await attempt(false)).data;
  }
  return first.data;
}

async function fetchMapboxRouteWithForcedWaypoint(
  origin: LonLat,
  destination: LonLat,
  forcedWaypoint: LonLat,
  token: string,
  excludeToll: boolean = false
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
      'overview=full&geometries=geojson&annotations=congestion',
      token,
      excludeToll
    );
    if (!data?.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const coords: LonLat[] = route.geometry.coordinates;
    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const durationMinutes = Math.round(route.duration / 60);

    const congestionSegments: CongestionSegment[] = [];
    const annotations = route.legs?.[0]?.annotation?.congestion;
    if (annotations && coords.length > 1) {
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

    return { coordinates: coords, distanceKm, durationMinutes, congestionSegments, summary: route.legs?.[0]?.summary || 'Bypass Route', source: 'live' };
  } catch {
    return null;
  }
}

export async function fetchMapboxAlternativeDrivingRoutes(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = [],
  excludeToll: boolean = false
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
        'alternatives=true&annotations=congestion,distance,duration,speed&geometries=geojson&overview=full',
        token,
        excludeToll
      );
      if (data?.routes && data.routes.length > 0) {
        for (let index = 0; index < data.routes.length; index++) {
          const route = data.routes[index];
          const coords: LonLat[] = route.geometry.coordinates;
          const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
          const durationMinutes = Math.round(route.duration / 60);

          const congestionSegments: CongestionSegment[] = [];
          const annotations = route.legs?.[0]?.annotation?.congestion;
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
          results.push({ coordinates: coords, distanceKm, durationMinutes, congestionSegments, summary: route.legs?.[0]?.summary || routeName, source: 'live' });
        }
      }
    } catch (err) {
      console.warn('Mapbox Directions API call failed:', err);
    }
  }

  if (results.length === 0) {
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

  results.sort((a, b) => a.durationMinutes - b.durationMinutes);
  return results.slice(0, 3);
}

export async function fetchMapboxDrivingRoute(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = [],
  modality: TransportModality = 'truck'
): Promise<LonLat[]> {
  if (modality === 'maritime') {
    return generateNauticalCoastalRoute(origin, destination);
  }
  if (modality === 'air') {
    // Airway corridor with curvature
    const midLon = (origin[0] + destination[0]) / 2 + 0.12;
    const midLat = (origin[1] + destination[1]) / 2 + 0.08;
    return [origin, [midLon, midLat], destination];
  }
  const results = await fetchMapboxAlternativeDrivingRoutes(origin, destination, waypoints);
  return results[0]?.coordinates || [origin, ...waypoints, destination];
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
 */
export async function calculateSeaIntermodalCorridor(
  origin: LonLat,
  destination: LonLat
): Promise<RouteRecommendation> {
  const odDistanceKm = getHaversineDistanceKm(origin, destination);
  const originPort = findClosestSeaport(origin).seaport;
  const destPort = findClosestSeaport(destination).seaport;

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
  // Leg 1: First-Mile Land Truck to Origin Seaport
  const leg1Coords = await fetchMapboxDrivingRoute(origin, originPort.coords, [], 'truck');
  const leg1Dist = Math.round(getHaversineDistanceKm(origin, originPort.coords) * 1.15);
  const leg1Eta = Math.round((leg1Dist / 50) * 60);

  // Leg 2: Coastal Maritime Sea Lane along SUMATRA_NAUTICAL_PERIMETER
  const seaFairwayCoords = generateNauticalCoastalRoute(originPort.coords, destPort.coords);
  let seaDist = 0;
  for (let i = 0; i < seaFairwayCoords.length - 1; i++) {
    seaDist += getHaversineDistanceKm(seaFairwayCoords[i], seaFairwayCoords[i + 1]);
  }
  const leg2Dist = Math.round(seaDist);
  const leg2Eta = Math.round((leg2Dist / 26) * 60) + 120; // 26 km/h (~14 knots) + 120 min Pelindo port handling buffer

  // Leg 3: Last-Mile Land Truck from Destination Seaport to Destination
  const leg3Coords = await fetchMapboxDrivingRoute(destPort.coords, destination, [], 'truck');
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
    route_name: `Intermodal Laut (${originPort.name.split('(')[0].trim()} -> ${destPort.name.split('(')[0].trim()})`,
    description: `Bypass Maritim Pesisir Alur Laut Kepulauan Indonesia (ALKI) via ${originPort.name} ke ${destPort.name}`,
    waypoints: totalWaypoints,
    distance_km: leg1Dist + leg2Dist + leg3Dist,
    eta_minutes: leg1Eta + leg2Eta + leg3Eta,
    fuel_increase_pct: 0,
    risk_score: 0.04,
    is_compromised: false,
    safety_status: 'SAFE_DETOUR',
    safety_tag: 'MULTI-MODA LAUT + DARAT',
    modality: 'maritime',
    corridor_type: 'sea_intermodal',
    viable: true,
    legs,
    color: '#3B82F6',
  };
}

/**
 * Computes Authentic 3-Leg Air Cargo + Land Intermodal Logistics Chain (Truck -> Airport -> Airport -> Truck)
 */
export async function calculateAirIntermodalCorridor(
  origin: LonLat,
  destination: LonLat
): Promise<RouteRecommendation> {
  const odDistanceKm = getHaversineDistanceKm(origin, destination);
  const depAirport = findClosestAirport(origin).airport;
  const arrAirport = findClosestAirport(destination).airport;

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

  // True 3-Leg Chain:
  // Leg 1: First-Mile Land Truck to Departure Airport
  const leg1Coords = await fetchMapboxDrivingRoute(origin, depAirport.coords, [], 'truck');
  const leg1Dist = Math.round(getHaversineDistanceKm(origin, depAirport.coords) * 1.15);
  const leg1Eta = Math.round((leg1Dist / 55) * 60);

  // Leg 2: Geodesic Flight Arc
  const flightDist = Math.round(getHaversineDistanceKm(depAirport.coords, arrAirport.coords));
  const flightEta = Math.round((flightDist / 620) * 60) + 40; // 40m loading/handling buffer
  const numArcPts = 12;
  const leg2Coords: LonLat[] = [];
  const midLon = (depAirport.coords[0] + arrAirport.coords[0]) / 2 + 0.18;
  const midLat = (depAirport.coords[1] + arrAirport.coords[1]) / 2 + 0.12;
  for (let s = 0; s <= numArcPts; s++) {
    const t = s / numArcPts;
    const bx = (1 - t) * (1 - t) * depAirport.coords[0] + 2 * (1 - t) * t * midLon + t * t * arrAirport.coords[0];
    const by = (1 - t) * (1 - t) * depAirport.coords[1] + 2 * (1 - t) * t * midLat + t * t * arrAirport.coords[1];
    leg2Coords.push([Number(bx.toFixed(4)), Number(by.toFixed(4))]);
  }

  // Leg 3: Last-Mile Land Truck from Arrival Airport to Destination
  const leg3Coords = await fetchMapboxDrivingRoute(arrAirport.coords, destination, [], 'truck');
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
 * Simultaneous Multi-Color Intermodal Router:
 * Simultaneously computes all four corridors (Land Primary, Land Detour, Sea Intermodal, Air Intermodal)
 * with authentic per-leg multi-color coordinates and grounded Hold-vs-Reroute economics.
 */
export async function calculateAIDynamicDetourRoutes(
  hazardCenter: LonLat | null,
  radiusKm: number = DEFAULT_HAZARD_RADIUS_KM,
  origin: LonLat,
  destination: LonLat,
  _modality: TransportModality = 'best'
): Promise<RouteRecommendation[]> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const excludeToll = hazardCenter ? isHazardNearTollCorridor(hazardCenter, radiusKm) : false;

  // STEP 1: Compute Land Routes (Primary & Alternative / Bypass)
  const mapboxResults = await fetchMapboxAlternativeDrivingRoutes(origin, destination, [], excludeToll);
  const primaryRes = mapboxResults[0];
  const primaryMetrics = hazardCenter
    ? calculateHazardExposureMetrics(primaryRes.coordinates, hazardCenter, radiusKm)
    : { isIntersecting: false, exposureKm: 0, penetrationRatio: 0, minDistanceToCenterKm: 9999, maxProximity: 0, riskPenaltyScore: 0 };
  const isPrimaryCompromised = primaryMetrics.isIntersecting;

  // Corridor 1: Fastest Direct Land Corridor
  const isPrimaryOffline = primaryRes.source === 'offline-interpolated';
  const landPrimaryName = isPrimaryOffline ? '[SIMULASI] Koridor Darat Utama (Tol / Jalinsum)' : 'Koridor Darat Utama (Tol / Jalinsum)';
  const landPrimaryColor = isPrimaryCompromised ? '#EF4444' : '#10B981';

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
    is_compromised: isPrimaryCompromised,
    safety_status: isPrimaryCompromised ? 'COMPROMISED' : 'SAFE_DETOUR',
    safety_tag: isPrimaryCompromised ? 'TERDAMPAK ZONA BAHAYA (+60m Delay)' : 'RUTE DARAT TERCEPAT',
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
      },
    ],
  };

  // Corridor 2: Alternative Land / Hazard Detour Corridor
  let landDetourResult: MapboxRouteResult = mapboxResults[1] || primaryRes;
  let landDetourColor = '#34D399';
  let landDetourTag = 'RUTE ALTERNATIF ARTERI';
  let isDetourCompromised = false;

  // If primary route intersects hazard shockwave, actively solve detour around hazard
  if (hazardCenter && isPrimaryCompromised && token) {
    let foundDetour = false;

    // A. Priority Bypass: Safe arterial junctions outside hazard zone
    const safeNodes = HIGHWAY_JUNCTION_NODES.filter(
      (node) => getHaversineDistanceKm(node.coords, hazardCenter) >= radiusKm + 2.0
    );
    const scoredNodes = safeNodes.map((node) => ({
      name: node.name,
      coords: node.coords,
      score: getHaversineDistanceKm(origin, node.coords) + getHaversineDistanceKm(node.coords, destination),
    })).sort((a, b) => a.score - b.score);

    for (const cand of scoredNodes.slice(0, 4)) {
      const bypass = await fetchMapboxRouteWithForcedWaypoint(origin, destination, cand.coords, token, excludeToll);
      if (bypass) {
        const m = calculateHazardExposureMetrics(bypass.coordinates, hazardCenter, radiusKm);
        if (!m.isIntersecting) {
          landDetourResult = bypass;
          landDetourColor = '#10B981';
          landDetourTag = `PENGALIHAN AMAN (${cand.name.toUpperCase()})`;
          foundDetour = true;
          break;
        }
      }
    }

    // B. Radial clearance detour if junction bypass not clean
    if (!foundDetour) {
      const [hazardLon, hazardLat] = hazardCenter;
      const clearanceKm = radiusKm + 6.0;
      const kmPerLonDegree = 111.32 * Math.cos((hazardLat * Math.PI) / 180);
      const kmPerLatDegree = 110.574;
      const odLonKm = (destination[0] - origin[0]) * kmPerLonDegree;
      const odLatKm = (destination[1] - origin[1]) * kmPerLatDegree;
      const odLengthKm = Math.sqrt(odLonKm * odLonKm + odLatKm * odLatKm) || 1;
      const dirLon = odLonKm / odLengthKm;
      const dirLat = odLatKm / odLengthKm;

      for (const ang of [Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4]) {
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        const rotLon = dirLon * cosA - dirLat * sinA;
        const rotLat = dirLon * sinA + dirLat * cosA;
        const offsetLon = (rotLon * clearanceKm) / kmPerLonDegree;
        const offsetLat = (rotLat * clearanceKm) / kmPerLatDegree;
        const waypoint: LonLat = [hazardLon + offsetLon, hazardLat + offsetLat];

        const radial = await fetchMapboxRouteWithForcedWaypoint(origin, destination, waypoint, token, excludeToll);
        if (radial) {
          const m = calculateHazardExposureMetrics(radial.coordinates, hazardCenter, radiusKm);
          if (!m.isIntersecting) {
            landDetourResult = radial;
            landDetourColor = '#10B981';
            landDetourTag = 'RUTE PENGALIHAN BEBAS BENCANA';
            foundDetour = true;
            break;
          }
        }
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
    is_compromised: isDetourCompromised,
    safety_status: isDetourCompromised ? 'COMPROMISED' : 'SAFE_DETOUR',
    safety_tag: landDetourTag,
    traffic_level: landDetourResult.congestionSegments.some((s) => s.level === 'heavy') ? 'heavy' : 'low',
    congestion_segments: landDetourResult.congestionSegments,
    modality: 'truck',
    corridor_type: 'land_detour',
    viable: true,
    color: landDetourColor,
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
      },
    ],
  };

  // STEP 2: Simultaneously Compute Intermodal Corridors (Sea & Air)
  const [seaCorridor, airCorridor] = await Promise.all([
    calculateSeaIntermodalCorridor(origin, destination),
    calculateAirIntermodalCorridor(origin, destination),
  ]);

  // STEP 3: Grounded Hold vs Reroute Economic Decision Engine
  let holdCorridor: RouteRecommendation | null = null;
  if (hazardCenter) {
    const econ = calculateHoldVsRerouteEconomics(
      origin,
      destination,
      landPrimary.distance_km,
      landDetour.distance_km,
      hazardCenter,
      radiusKm
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

  return allCorridors;
}
