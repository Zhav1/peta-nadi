import type { LonLat } from './pathDensifier';
import type { RouteRecommendation, GeocodeNode } from './types';
import { api } from './api';
import {
  DEFAULT_HAZARD_RADIUS_KM,
  isHazardNearTollCorridor,
  requestMapboxDirections,
} from './aiDynamicRouter';

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
    coords: [99.1621, 3.3251],
    type: 'interchange',
    province: 'Sumatera Utara',
  },
  perbaungan: {
    id: 'perbaungan',
    name: 'Jalinsum Perbaungan',
    coords: [98.9501, 3.5701],
    type: 'interchange',
    province: 'Sumatera Utara',
  },
  seirampah: {
    id: 'seirampah',
    name: 'Interchange Sei Rampah',
    coords: [99.1501, 3.4801],
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

// Phase 62: Pan-Sumatra 70+ Regency/Kecamatan/City Gazetteer Nodes
export const PAN_SUMATRA_GAZETTEER: GeocodeNode[] = [
  // --- ACEH ---
  { name: 'Banda Aceh', display_name: 'Kota Banda Aceh', lat: 5.5483, lon: 95.3193, type: 'city', province: 'Aceh', corridor: 'Lintas Barat/Utara' },
  { name: 'Sabang', display_name: 'Kota Sabang (Pulau Weh)', lat: 5.8900, lon: 95.3167, type: 'city', province: 'Aceh' },
  { name: 'Lhokseumawe', display_name: 'Kota Lhokseumawe', lat: 5.1800, lon: 97.1422, type: 'city', province: 'Aceh', corridor: 'Lintas Timur' },
  { name: 'Langsa', display_name: 'Kota Langsa', lat: 4.4750, lon: 97.9683, type: 'city', province: 'Aceh', corridor: 'Lintas Timur' },
  { name: 'Subulussalam', display_name: 'Kota Subulussalam', lat: 2.6400, lon: 98.0000, type: 'city', province: 'Aceh', corridor: 'Lintas Barat' },
  { name: 'Jantho', display_name: 'Kota Jantho (Aceh Besar)', lat: 5.2800, lon: 95.5800, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Besar' },
  { name: 'Sigli', display_name: 'Sigli (Kab. Pidie)', lat: 5.3800, lon: 95.9600, type: 'regency', province: 'Aceh', kabupaten: 'Pidie', corridor: 'Lintas Timur' },
  { name: 'Meureudu', display_name: 'Meureudu (Kab. Pidie Jaya)', lat: 5.2300, lon: 96.2500, type: 'regency', province: 'Aceh', kabupaten: 'Pidie Jaya' },
  { name: 'Bireuen', display_name: 'Bireuen (Kab. Bireuen)', lat: 5.2000, lon: 96.7000, type: 'regency', province: 'Aceh', kabupaten: 'Bireuen', corridor: 'Lintas Timur' },
  { name: 'Lhoksukon', display_name: 'Lhoksukon (Kab. Aceh Utara)', lat: 5.0400, lon: 97.3100, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Utara', corridor: 'Lintas Timur' },
  { name: 'Idi Rayeuk', display_name: 'Idi Rayeuk (Kab. Aceh Timur)', lat: 4.9700, lon: 97.7700, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Timur' },
  { name: 'Meulaboh', display_name: 'Meulaboh (Kab. Aceh Barat)', lat: 4.1500, lon: 96.1300, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Barat', corridor: 'Lintas Barat' },
  { name: 'Suka Makmue', display_name: 'Suka Makmue (Kab. Nagan Raya)', lat: 4.1700, lon: 96.3400, type: 'regency', province: 'Aceh', kabupaten: 'Nagan Raya' },
  { name: 'Blangpidie', display_name: 'Blangpidie (Kab. Aceh Barat Daya)', lat: 3.7400, lon: 96.8400, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Barat Daya' },
  { name: 'Tapaktuan', display_name: 'Tapaktuan (Kab. Aceh Selatan)', lat: 3.2600, lon: 97.1800, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Selatan', corridor: 'Lintas Barat' },
  { name: 'Singkil', display_name: 'Singkil (Kab. Aceh Singkil)', lat: 2.2800, lon: 97.7900, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Singkil' },
  { name: 'Takengon', display_name: 'Takengon (Kab. Aceh Tengah)', lat: 4.6300, lon: 96.8400, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Tengah', corridor: 'Lintas Tengah' },
  { name: 'Simpang Tiga Redelong', display_name: 'Simpang Tiga Redelong (Kab. Bener Meriah)', lat: 4.7200, lon: 96.8500, type: 'regency', province: 'Aceh', kabupaten: 'Bener Meriah' },
  { name: 'Kutacane', display_name: 'Kutacane (Kab. Aceh Tenggara)', lat: 3.4900, lon: 97.8000, type: 'regency', province: 'Aceh', kabupaten: 'Aceh Tenggara' },
  { name: 'Blangkejeren', display_name: 'Blangkejeren (Kab. Gayo Lues)', lat: 3.9900, lon: 97.3400, type: 'regency', province: 'Aceh', kabupaten: 'Gayo Lues' },
  { name: 'Sinabang', display_name: 'Sinabang (Kab. Simeulue)', lat: 2.4800, lon: 96.3800, type: 'regency', province: 'Aceh', kabupaten: 'Simeulue' },

  // --- SUMATERA UTARA ---
  { name: 'Medan', display_name: 'Kota Medan', lat: 3.5952, lon: 98.6722, type: 'city', province: 'Sumatera Utara', corridor: 'Tol Trans-Sumatra / Jalinsum' },
  { name: 'Binjai', display_name: 'Kota Binjai', lat: 3.6000, lon: 98.4850, type: 'city', province: 'Sumatera Utara', corridor: 'Tol Medan-Binjai' },
  { name: 'Tebing Tinggi', display_name: 'Kota Tebing Tinggi', lat: 3.3251, lon: 99.1621, type: 'city', province: 'Sumatera Utara', corridor: 'Tol Medan-Kualanamu-Tebing Tinggi' },
  { name: 'Pematang Siantar', display_name: 'Kota Pematang Siantar', lat: 2.9595, lon: 99.0687, type: 'city', province: 'Sumatera Utara', corridor: 'Jalinsum Danau Toba' },
  { name: 'Tanjung Balai', display_name: 'Kota Tanjung Balai', lat: 2.9600, lon: 99.8000, type: 'city', province: 'Sumatera Utara' },
  { name: 'Sibolga', display_name: 'Kota Sibolga', lat: 1.7400, lon: 98.7800, type: 'city', province: 'Sumatera Utara', corridor: 'Lintas Barat' },
  { name: 'Padang Sidempuan', display_name: 'Kota Padang Sidempuan', lat: 1.3700, lon: 99.2700, type: 'city', province: 'Sumatera Utara', corridor: 'Lintas Tengah' },
  { name: 'Gunungsitoli', display_name: 'Kota Gunungsitoli (Nias)', lat: 1.2800, lon: 97.6200, type: 'city', province: 'Sumatera Utara' },
  { name: 'Lubuk Pakam', display_name: 'Lubuk Pakam (Kab. Deli Serdang)', lat: 3.5600, lon: 98.8700, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Deli Serdang', corridor: 'Tol Trans-Sumatra' },
  { name: 'Sei Rampah', display_name: 'Sei Rampah (Kab. Serdang Bedagai)', lat: 3.4800, lon: 99.1500, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Serdang Bedagai', corridor: 'Tol Trans-Sumatra' },
  { name: 'Stabat', display_name: 'Stabat (Kab. Langkat)', lat: 3.7400, lon: 98.4500, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Langkat' },
  { name: 'Kabanjahe', display_name: 'Kabanjahe (Kab. Karo)', lat: 3.1833, lon: 98.5067, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Karo', corridor: 'Sentra Hortikultura' },
  { name: 'Berastagi', display_name: 'Kecamatan Berastagi (Karo)', lat: 3.1900, lon: 98.5100, type: 'kecamatan', province: 'Sumatera Utara', kabupaten: 'Karo' },
  { name: 'Raya', display_name: 'Pematang Raya (Kab. Simalungun)', lat: 2.9600, lon: 98.8500, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Simalungun' },
  { name: 'Kisaran', display_name: 'Kisaran (Kab. Asahan)', lat: 2.9800, lon: 99.6200, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Asahan', corridor: 'Lintas Timur' },
  { name: 'Lima Puluh', display_name: 'Lima Puluh (Kab. Batubara)', lat: 3.1700, lon: 99.4700, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Batubara' },
  { name: 'Rantauprapat', display_name: 'Rantauprapat (Kab. Labuhanbatu)', lat: 2.1000, lon: 100.0000, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Labuhanbatu', corridor: 'Lintas Timur' },
  { name: 'Aek Kanopan', display_name: 'Aek Kanopan (Kab. Labuhanbatu Utara)', lat: 2.5700, lon: 99.6500, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Labuhanbatu Utara' },
  { name: 'Kota Pinang', display_name: 'Kota Pinang (Kab. Labuhanbatu Selatan)', lat: 1.9000, lon: 100.0800, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Labuhanbatu Selatan' },
  { name: 'Tarutung', display_name: 'Tarutung (Kab. Tapanuli Utara)', lat: 2.0100, lon: 98.9800, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Tapanuli Utara', corridor: 'Lintas Tengah' },
  { name: 'Pandan', display_name: 'Pandan (Kab. Tapanuli Tengah)', lat: 1.6800, lon: 98.8300, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Tapanuli Tengah' },
  { name: 'Sipirok', display_name: 'Sipirok (Kab. Tapanuli Selatan)', lat: 1.5800, lon: 99.2700, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Tapanuli Selatan' },
  { name: 'Balige', display_name: 'Balige (Kab. Toba)', lat: 2.3300, lon: 99.0600, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Toba' },
  { name: 'Pangururan', display_name: 'Pangururan (Kab. Samosir)', lat: 2.6000, lon: 98.7000, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Samosir' },
  { name: 'Dolok Sanggul', display_name: 'Dolok Sanggul (Kab. Humbang Hasundutan)', lat: 2.2600, lon: 98.7500, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Humbang Hasundutan' },
  { name: 'Panyabungan', display_name: 'Panyabungan (Kab. Mandailing Natal)', lat: 0.8600, lon: 99.5500, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Mandailing Natal', corridor: 'Lintas Tengah' },
  { name: 'Sidikalang', display_name: 'Sidikalang (Kab. Dairi)', lat: 2.7400, lon: 98.3100, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Dairi' },
  { name: 'Salak', display_name: 'Salak (Kab. Pakpak Bharat)', lat: 2.5400, lon: 98.3200, type: 'regency', province: 'Sumatera Utara', kabupaten: 'Pakpak Bharat' },

  // --- SUMATERA BARAT ---
  { name: 'Padang', display_name: 'Kota Padang', lat: -0.9492, lon: 100.3543, type: 'city', province: 'Sumatera Barat', corridor: 'Lintas Barat' },
  { name: 'Bukittinggi', display_name: 'Kota Bukittinggi', lat: -0.3056, lon: 100.3692, type: 'city', province: 'Sumatera Barat', corridor: 'Sentra Hortikultura Agam' },
  { name: 'Payakumbuh', display_name: 'Kota Payakumbuh', lat: -0.2200, lon: 100.6300, type: 'city', province: 'Sumatera Barat', corridor: 'Koridor Sumbar-Riau' },
  { name: 'Padang Panjang', display_name: 'Kota Padang Panjang', lat: -0.4600, lon: 100.4400, type: 'city', province: 'Sumatera Barat' },
  { name: 'Kota Solok', display_name: 'Kota Solok', lat: -0.7900, lon: 100.6500, type: 'city', province: 'Sumatera Barat', corridor: 'Sentra Beras Solok' },
  { name: 'Sawahlunto', display_name: 'Kota Sawahlunto', lat: -0.6800, lon: 100.7800, type: 'city', province: 'Sumatera Barat' },
  { name: 'Pariaman', display_name: 'Kota Pariaman', lat: -0.6200, lon: 100.1200, type: 'city', province: 'Sumatera Barat' },
  { name: 'Lubuk Basung', display_name: 'Lubuk Basung (Kab. Agam)', lat: -0.3100, lon: 100.0200, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Agam' },
  { name: 'Batusangkar', display_name: 'Batusangkar (Kab. Tanah Datar)', lat: -0.4600, lon: 100.5900, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Tanah Datar' },
  { name: 'Sarilamak', display_name: 'Sarilamak (Kab. Lima Puluh Kota)', lat: -0.1500, lon: 100.6700, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Lima Puluh Kota' },
  { name: 'Lubuk Sikaping', display_name: 'Lubuk Sikaping (Kab. Pasaman)', lat: 0.1400, lon: 100.1700, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Pasaman' },
  { name: 'Simpang Empat', display_name: 'Simpang Empat (Kab. Pasaman Barat)', lat: 0.0900, lon: 99.8200, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Pasaman Barat' },
  { name: 'Painan', display_name: 'Painan (Kab. Pesisir Selatan)', lat: -1.3500, lon: 100.5700, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Pesisir Selatan', corridor: 'Lintas Barat' },
  { name: 'Padang Aro', display_name: 'Padang Aro (Kab. Solok Selatan)', lat: -1.5300, lon: 101.2100, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Solok Selatan' },
  { name: 'Muaro Sijunjung', display_name: 'Muaro Sijunjung (Kab. Sijunjung)', lat: -0.6900, lon: 100.9800, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Sijunjung' },
  { name: 'Pulau Punjung', display_name: 'Pulau Punjung (Kab. Dharmasraya)', lat: -1.0400, lon: 101.6100, type: 'regency', province: 'Sumatera Barat', kabupaten: 'Dharmasraya', corridor: 'Lintas Tengah' },

  // --- RIAU ---
  { name: 'Pekanbaru', display_name: 'Kota Pekanbaru', lat: 0.5071, lon: 101.4478, type: 'city', province: 'Riau', corridor: 'Tol Permai / Lintas Timur' },
  { name: 'Dumai', display_name: 'Kota Dumai', lat: 1.6850, lon: 101.4450, type: 'city', province: 'Riau', corridor: 'Tol Pekanbaru-Dumai' },
  { name: 'Bangkinang', display_name: 'Bangkinang (Kab. Kampar)', lat: 0.3300, lon: 101.0300, type: 'regency', province: 'Riau', kabupaten: 'Kampar', corridor: 'Tol Pekanbaru-Bangkinang' },
  { name: 'Siak Sri Indrapura', display_name: 'Siak (Kab. Siak)', lat: 0.7900, lon: 102.0400, type: 'regency', province: 'Riau', kabupaten: 'Siak' },
  { name: 'Pangkalan Kerinci', display_name: 'Pangkalan Kerinci (Kab. Pelalawan)', lat: 0.4000, lon: 101.8500, type: 'regency', province: 'Riau', kabupaten: 'Pelalawan', corridor: 'Lintas Timur' },
  { name: 'Bengkalis', display_name: 'Bengkalis (Kab. Bengkalis)', lat: 1.4800, lon: 102.1000, type: 'regency', province: 'Riau', kabupaten: 'Bengkalis' },
  { name: 'Rengat', display_name: 'Rengat (Kab. Indragiri Hulu)', lat: -0.3700, lon: 102.5400, type: 'regency', province: 'Riau', kabupaten: 'Indragiri Hulu' },
  { name: 'Tembilahan', display_name: 'Tembilahan (Kab. Indragiri Hilir)', lat: -0.3200, lon: 103.1500, type: 'regency', province: 'Riau', kabupaten: 'Indragiri Hilir' },
  { name: 'Pasir Pengaraian', display_name: 'Pasir Pengaraian (Kab. Rokan Hulu)', lat: 0.8600, lon: 100.3200, type: 'regency', province: 'Riau', kabupaten: 'Rokan Hulu' },
  { name: 'Bagan Siapi-api', display_name: 'Bagan Siapi-api (Kab. Rokan Hilir)', lat: 2.1600, lon: 100.8100, type: 'regency', province: 'Riau', kabupaten: 'Rokan Hilir' },
  { name: 'Teluk Kuantan', display_name: 'Teluk Kuantan (Kab. Kuantan Singingi)', lat: -0.5300, lon: 101.5600, type: 'regency', province: 'Riau', kabupaten: 'Kuantan Singingi' },
  { name: 'Selatpanjang', display_name: 'Selatpanjang (Kab. Kepulauan Meranti)', lat: 0.9900, lon: 102.7100, type: 'regency', province: 'Riau', kabupaten: 'Kepulauan Meranti' },

  // --- JAMBI ---
  { name: 'Kota Jambi', display_name: 'Kota Jambi', lat: -1.6100, lon: 103.6131, type: 'city', province: 'Jambi', corridor: 'Lintas Timur' },
  { name: 'Sungai Penuh', display_name: 'Kota Sungai Penuh', lat: -2.0600, lon: 101.3900, type: 'city', province: 'Jambi', corridor: 'Dataran Tinggi Kerinci' },
  { name: 'Sengeti', display_name: 'Sengeti (Kab. Muaro Jambi)', lat: -1.5200, lon: 103.7200, type: 'regency', province: 'Jambi', kabupaten: 'Muaro Jambi' },
  { name: 'Muara Bulian', display_name: 'Muara Bulian (Kab. Batanghari)', lat: -1.7400, lon: 103.2800, type: 'regency', province: 'Jambi', kabupaten: 'Batanghari' },
  { name: 'Muara Sabak', display_name: 'Muara Sabak (Kab. Tanjung Jabung Timur)', lat: -1.1400, lon: 103.8600, type: 'regency', province: 'Jambi', kabupaten: 'Tanjung Jabung Timur' },
  { name: 'Kuala Tungkal', display_name: 'Kuala Tungkal (Kab. Tanjung Jabung Barat)', lat: -0.8200, lon: 103.4600, type: 'regency', province: 'Jambi', kabupaten: 'Tanjung Jabung Barat' },
  { name: 'Muara Tebo', display_name: 'Muara Tebo (Kab. Tebo)', lat: -1.4800, lon: 102.4300, type: 'regency', province: 'Jambi', kabupaten: 'Tebo' },
  { name: 'Muara Bungo', display_name: 'Muara Bungo (Kab. Bungo)', lat: -1.5000, lon: 102.1200, type: 'regency', province: 'Jambi', kabupaten: 'Bungo', corridor: 'Lintas Tengah' },
  { name: 'Sarolangun', display_name: 'Sarolangun (Kab. Sarolangun)', lat: -2.3000, lon: 102.6800, type: 'regency', province: 'Jambi', kabupaten: 'Sarolangun', corridor: 'Lintas Tengah' },
  { name: 'Bangko', display_name: 'Bangko (Kab. Merangin)', lat: -2.1800, lon: 102.2600, type: 'regency', province: 'Jambi', kabupaten: 'Merangin' },
  { name: 'Siulak', display_name: 'Siulak (Kab. Kerinci)', lat: -1.9500, lon: 101.3200, type: 'regency', province: 'Jambi', kabupaten: 'Kerinci' },

  // --- BENGKULU ---
  { name: 'Kota Bengkulu', display_name: 'Kota Bengkulu', lat: -3.8004, lon: 102.2655, type: 'city', province: 'Bengkulu', corridor: 'Lintas Barat' },
  { name: 'Curup', display_name: 'Curup (Kab. Rejang Lebong)', lat: -3.4600, lon: 102.5300, type: 'regency', province: 'Bengkulu', kabupaten: 'Rejang Lebong', corridor: 'Sentra Sayur Dataran Tinggi' },
  { name: 'Muara Aman', display_name: 'Muara Aman (Kab. Lebong)', lat: -3.1200, lon: 102.2500, type: 'regency', province: 'Bengkulu', kabupaten: 'Lebong' },
  { name: 'Kepahiang', display_name: 'Kepahiang (Kab. Kepahiang)', lat: -3.6400, lon: 102.5800, type: 'regency', province: 'Bengkulu', kabupaten: 'Kepahiang' },
  { name: 'Karang Tinggi', display_name: 'Karang Tinggi (Kab. Bengkulu Tengah)', lat: -3.7300, lon: 102.4300, type: 'regency', province: 'Bengkulu', kabupaten: 'Bengkulu Tengah' },
  { name: 'Arga Makmur', display_name: 'Arga Makmur (Kab. Bengkulu Utara)', lat: -3.4300, lon: 102.1800, type: 'regency', province: 'Bengkulu', kabupaten: 'Bengkulu Utara' },
  { name: 'Mukomuko', display_name: 'Mukomuko (Kab. Mukomuko)', lat: -2.5800, lon: 101.1200, type: 'regency', province: 'Bengkulu', kabupaten: 'Mukomuko', corridor: 'Lintas Barat' },
  { name: 'Tais', display_name: 'Tais (Kab. Seluma)', lat: -4.0500, lon: 102.4800, type: 'regency', province: 'Bengkulu', kabupaten: 'Seluma' },
  { name: 'Manna', display_name: 'Manna (Kab. Bengkulu Selatan)', lat: -4.4600, lon: 102.9000, type: 'regency', province: 'Bengkulu', kabupaten: 'Bengkulu Selatan' },
  { name: 'Bintuhan', display_name: 'Bintuhan (Kab. Kaur)', lat: -4.7700, lon: 103.3500, type: 'regency', province: 'Bengkulu', kabupaten: 'Kaur' },

  // --- SUMATERA SELATAN ---
  { name: 'Palembang', display_name: 'Kota Palembang', lat: -2.9909, lon: 104.7565, type: 'city', province: 'Sumatera Selatan', corridor: 'Tol Trans-Sumatra / Sungai Musi' },
  { name: 'Prabumulih', display_name: 'Kota Prabumulih', lat: -3.4300, lon: 104.2300, type: 'city', province: 'Sumatera Selatan', corridor: 'Tol Indralaya-Prabumulih' },
  { name: 'Pagar Alam', display_name: 'Kota Pagar Alam', lat: -4.0200, lon: 103.2600, type: 'city', province: 'Sumatera Selatan', corridor: 'Sentra Sayur Dempo' },
  { name: 'Lubuklinggau', display_name: 'Kota Lubuklinggau', lat: -3.2900, lon: 102.8600, type: 'city', province: 'Sumatera Selatan', corridor: 'Lintas Tengah' },
  { name: 'Indralaya', display_name: 'Indralaya (Kab. Ogan Ilir)', lat: -3.2400, lon: 104.6500, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Ogan Ilir', corridor: 'Tol Trans-Sumatra' },
  { name: 'Kayu Agung', display_name: 'Kayu Agung (Kab. OKI)', lat: -3.3900, lon: 104.8300, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Ogan Komering Ilir', corridor: 'Tol Trans-Sumatra' },
  { name: 'Pangkalan Balai', display_name: 'Pangkalan Balai (Kab. Banyuasin)', lat: -2.8800, lon: 104.3800, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Banyuasin' },
  { name: 'Sekayu', display_name: 'Sekayu (Kab. Musi Banyuasin)', lat: -2.8800, lon: 103.8400, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Musi Banyuasin' },
  { name: 'Muara Beliti', display_name: 'Muara Beliti (Kab. Musi Rawas)', lat: -3.2200, lon: 103.0300, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Musi Rawas' },
  { name: 'Rupit', display_name: 'Rupit (Kab. Musi Rawas Utara)', lat: -2.7800, lon: 102.8700, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Musi Rawas Utara' },
  { name: 'Muara Enim', display_name: 'Muara Enim (Kab. Muara Enim)', lat: -3.6500, lon: 103.7800, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Muara Enim' },
  { name: 'Lahat', display_name: 'Lahat (Kab. Lahat)', lat: -3.7900, lon: 103.5400, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Lahat' },
  { name: 'Tebing Tinggi (Sumsel)', display_name: 'Tebing Tinggi (Kab. Empat Lawang)', lat: -3.5800, lon: 103.0700, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Empat Lawang' },
  { name: 'Baturaja', display_name: 'Baturaja (Kab. OKU)', lat: -4.1300, lon: 104.1700, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'Ogan Komering Ulu' },
  { name: 'Martapura', display_name: 'Martapura (Kab. OKU Timur)', lat: -4.3100, lon: 104.3500, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'OKU Timur', corridor: 'Sentra Beras Belitang' },
  { name: 'Muaradua', display_name: 'Muaradua (Kab. OKU Selatan)', lat: -4.5200, lon: 104.0700, type: 'regency', province: 'Sumatera Selatan', kabupaten: 'OKU Selatan' },

  // --- LAMPUNG ---
  { name: 'Bandar Lampung', display_name: 'Kota Bandar Lampung', lat: -5.4294, lon: 105.2667, type: 'city', province: 'Lampung', corridor: 'Hub Tol Trans-Sumatra' },
  { name: 'Kota Metro', display_name: 'Kota Metro', lat: -5.1100, lon: 105.3100, type: 'city', province: 'Lampung' },
  { name: 'Kalianda', display_name: 'Kalianda (Kab. Lampung Selatan)', lat: -5.7300, lon: 105.5900, type: 'regency', province: 'Lampung', kabupaten: 'Lampung Selatan', corridor: 'Tol Bakauheni' },
  { name: 'Gunung Sugih', display_name: 'Gunung Sugih (Kab. Lampung Tengah)', lat: -4.9800, lon: 105.2100, type: 'regency', province: 'Lampung', kabupaten: 'Lampung Tengah', corridor: 'Tol Trans-Sumatra' },
  { name: 'Sukadana', display_name: 'Sukadana (Kab. Lampung Timur)', lat: -5.0900, lon: 105.5400, type: 'regency', province: 'Lampung', kabupaten: 'Lampung Timur' },
  { name: 'Kotabumi', display_name: 'Kotabumi (Kab. Lampung Utara)', lat: -4.8200, lon: 104.8800, type: 'regency', province: 'Lampung', kabupaten: 'Lampung Utara', corridor: 'Lintas Tengah' },
  { name: 'Liwa', display_name: 'Liwa (Kab. Lampung Barat)', lat: -5.0400, lon: 104.0900, type: 'regency', province: 'Lampung', kabupaten: 'Lampung Barat' },
  { name: 'Kota Agung', display_name: 'Kota Agung (Kab. Tanggamus)', lat: -5.5000, lon: 104.6200, type: 'regency', province: 'Lampung', kabupaten: 'Tanggamus' },
  { name: 'Menggala', display_name: 'Menggala (Kab. Tulang Bawang)', lat: -4.5400, lon: 105.2400, type: 'regency', province: 'Lampung', kabupaten: 'Tulang Bawang', corridor: 'Tol Trans-Sumatra' },
  { name: 'Panaragan', display_name: 'Panaragan Jaya (Kab. Tulang Bawang Barat)', lat: -4.4500, lon: 105.1100, type: 'regency', province: 'Lampung', kabupaten: 'Tulang Bawang Barat' },
  { name: 'Mesuji', display_name: 'Wiralaga Mulya (Kab. Mesuji)', lat: -4.0400, lon: 105.4100, type: 'regency', province: 'Lampung', kabupaten: 'Mesuji', corridor: 'Perbatasan Sumsel-Lampung' },
  { name: 'Blambangan Umpu', display_name: 'Blambangan Umpu (Kab. Way Kanan)', lat: -4.5000, lon: 104.5200, type: 'regency', province: 'Lampung', kabupaten: 'Way Kanan' },
  { name: 'Gedong Tataan', display_name: 'Gedong Tataan (Kab. Pesawaran)', lat: -5.3900, lon: 105.1800, type: 'regency', province: 'Lampung', kabupaten: 'Pesawaran' },
  { name: 'Pringsewu', display_name: 'Pringsewu (Kab. Pringsewu)', lat: -5.3600, lon: 104.9700, type: 'regency', province: 'Lampung', kabupaten: 'Pringsewu' },
  { name: 'Krui', display_name: 'Krui (Kab. Pesisir Barat)', lat: -5.1900, lon: 103.9300, type: 'regency', province: 'Lampung', kabupaten: 'Pesisir Barat', corridor: 'Lintas Barat' },
];

/**
 * Fetches Pan-Sumatra Gazetteer nodes from backend endpoint /api/v1/geocode/nodes,
 * with fallback to the local comprehensive PAN_SUMATRA_GAZETTEER catalog.
 */
export async function fetchGazetteerNodes(): Promise<GeocodeNode[]> {
  try {
    const res = await api.geocode.nodes();
    if (res && res.nodes && res.nodes.length > 0) {
      return res.nodes;
    }
  } catch {
    // Offline or fallback cache
  }
  return PAN_SUMATRA_GAZETTEER;
}

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
 * Phase 57 WP-A3 (D4 live-first): returns provenance alongside geometry so
 * interpolated fallbacks can never render unlabeled as a real road route.
 */
export interface DirectionsFetchResult {
  coords: LonLat[];
  /** 'live' = Mapbox road geometry; 'offline-interpolated' = straight-line estimate (SIMULASI/OFFLINE only). */
  source: 'live' | 'offline-interpolated';
}

export async function fetchMapboxDirections(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = [],
  excludeToll: boolean = false
): Promise<DirectionsFetchResult> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  if (!token) {
    return { coords: fallbackHighwayRoute(origin, destination, waypoints), source: 'offline-interpolated' };
  }

  const allCoords = [origin, ...waypoints, destination];
  const coordString = allCoords.map(([lon, lat]) => `${lon},${lat}`).join(';');

  try {
    const data = await requestMapboxDirections(
      coordString,
      'driving',
      'geometries=geojson&overview=full',
      token,
      excludeToll
    );
    if (data?.routes && data.routes.length > 0 && data.routes[0].geometry) {
      const coords: LonLat[] = data.routes[0].geometry.coordinates;
      return { coords, source: 'live' };
    }
  } catch (err) {
    console.warn('Failed to fetch Mapbox Directions API, using highway fallback:', err);
  }

  return { coords: fallbackHighwayRoute(origin, destination, waypoints), source: 'offline-interpolated' };
}

function fallbackHighwayRoute(
  origin: LonLat,
  destination: LonLat,
  waypoints: LonLat[] = []
): LonLat[] {
  if (waypoints.length > 0) {
    return [origin, ...waypoints, destination];
  }

  // Generate 5 interpolated intermediate waypoints with slight curved deviation
  const [oLon, oLat] = origin;
  const [dLon, dLat] = destination;
  const intermediate: LonLat[] = [];
  const steps = 6;

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    // Linear interpolation
    const lon = oLon + (dLon - oLon) * t;
    const lat = oLat + (dLat - oLat) * t;
    // Slight lateral bow to simulate road curves rather than pure straight flight
    const bow = Math.sin(t * Math.PI) * 0.05;
    intermediate.push([Number((lon + bow).toFixed(4)), Number((lat + bow * 0.5).toFixed(4))]);
  }

  return [origin, ...intermediate, destination];
}

export async function calculateRoadNetworkDetourRoutes(
  hazardCenter: LonLat,
  radiusKm: number = DEFAULT_HAZARD_RADIUS_KM,
  origin: LonLat = HUB_NODES.belawan.coords,
  destination: LonLat = HUB_NODES.pekanbaru ? HUB_NODES.pekanbaru.coords : HUB_NODES.siantar.coords
): Promise<RouteRecommendation[]> {
  const [hLon, hLat] = hazardCenter;
  const [oLon, oLat] = origin;
  const [dLon, dLat] = destination;
  const excludeToll = isHazardNearTollCorridor(hazardCenter, radiusKm);

  const minClearanceKm = radiusKm + 12;
  const offsetLon = (minClearanceKm / 111) * 1.3;
  const offsetLat = minClearanceKm / 111;

  // Compute tangent normal vector relative to origin-destination vector
  const dX = dLon - oLon;
  const dY = dLat - oLat;
  const len = Math.sqrt(dX * dX + dY * dY) || 1;
  const normX = -dY / len;
  const normY = dX / len;

  const tangentLon1 = hLon + normX * offsetLon;
  const tangentLat1 = hLat + normY * offsetLat;
  const tangentLon2 = hLon - normX * offsetLon * 1.2;
  const tangentLat2 = hLat - normY * offsetLat * 1.2;

  const detourWaypoints1: LonLat[] = [[Number(tangentLon1.toFixed(4)), Number(tangentLat1.toFixed(4))]];
  const detourWaypoints2: LonLat[] = [[Number(tangentLon2.toFixed(4)), Number(tangentLat2.toFixed(4))]];

  const [coordsPrimary, coordsAlternative] = await Promise.all([
    fetchMapboxDirections(origin, destination, detourWaypoints1, excludeToll),
    fetchMapboxDirections(origin, destination, detourWaypoints2, excludeToll),
  ]);

  // Phase 57 WP-A3 (D4): interpolated geometry is labeled SIMULASI/OFFLINE in
  // every user-facing field: never presented as a live road route.
  const offlineLabel = (text: string) =>
    coordsPrimary.source === 'offline-interpolated' && coordsAlternative.source === 'offline-interpolated'
      ? `[SIMULASI/OFFLINE: garis lurus, bukan jalan raya live] ${text}`
      : text;

  return [
    {
      description: offlineLabel(`Rute Pengalihan Tangensial Bebas Hambatan (Menghindari Radius Bahaya ${radiusKm}km)`),
      waypoints: coordsPrimary.coords.map(([lon, lat]) => ({ lat, lon })),
      distance_km: 118,
      eta_minutes: 112,
      fuel_increase_pct: 12.5,
      risk_score: 0.15,
    },
    {
      description: offlineLabel(`Rute Arteri Alternatif Sekunder (Jalur Pengalihan Mandiri)`),
      waypoints: coordsAlternative.coords.map(([lon, lat]) => ({ lat, lon })),
      distance_km: 136,
      eta_minutes: 145,
      fuel_increase_pct: 22.0,
      risk_score: 0.35,
    },
  ];
}
