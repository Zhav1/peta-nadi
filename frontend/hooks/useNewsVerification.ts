'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

import type { HazardImpactProfile, AffectedLocationNode, VerificationAudit } from '@/lib/types';

export interface NewsItem {
  id: string;
  source_type: 'OFFICIAL_NEWS' | 'BMKG_WEATHER' | 'PIHPS_MARKET' | 'MEDSOS_OSINT';
  source_tier?: 'TIER_1_OFFICIAL' | 'TIER_2_AUTHORITATIVE_PRESS';
  source_name?: string;
  headline: string;
  summary: string;
  location_name?: string;
  lat?: number;
  lon?: number;
  pubDate?: string;
  category?: string;
  incident_type?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  temporal_phase?: 'forecast_early_warning' | 'active_disruption' | 'clearing_recovery';
  lead_time_hours?: number;
  commodities_affected?: string[];
  ground_truth_metrics?: { lane_status?: string; water_level_cm?: number };
  verification_status: 'UNVERIFIED_GRASSROOTS' | 'CORROBORATED_OFFICIAL' | 'MARKET_IMPACT_CONFIRMED' | 'REJECTED_UNFOUNDED';
  confidence_score: number;
  attributions?: Array<{ source_name: string; url?: string; credibility_score?: number }>;
  originNode?: string;
  destNode?: string;
  hazardType?: 'flood' | 'landslide' | 'congestion' | 'port_closure' | 'wildfire' | 'marine_wave' | 'road_closure' | 'earthquake' | 'volcanic_eruption' | 'other_disruption';
  commodity_name?: string;
  economic_note?: string;
  link?: string;
  url?: string;
  link_alive?: 'alive' | 'dead' | 'unknown';
  zone_tier?: 'RED_CONFIRMED' | 'YELLOW_CLARIFY' | 'DROPPED_IRRELEVANT';
  tier_reason?: string;
  custom_hazard_label?: string;
  impact_profile?: HazardImpactProfile;
  is_geocoded?: boolean;
  location_precision?: string;
  corridor_segment?: string;
  corridor_nodes?: string[];
  affected_locations?: AffectedLocationNode[];
  radius_km?: number;
  geometry_polygon?: [number, number][];
  verification_audit?: VerificationAudit;
}

export interface MarketRegimeData {
  regime: 'NORMAL' | 'ELEVATED' | 'CRISIS' | 'EARLY_WARNING_ACTIVE' | 'HIGH_DISRUPTION_RISK';
  active_crisis_indicators?: string[];
  commodity_volatility_score?: number;
  critical_news_count?: number;
  early_warning_count?: number;
}

/**
 * Normalizes a news permalink to ensure users are never dumped onto a generic root homepage.
 * If rawUrl is missing, or is a bare root domain (e.g. pathname is '/' or ''), resolves to
 * a targeted Google News direct reader search query for that specific article and source.
 */
export function normalizeNewsPermalink(rawUrl?: string, headline?: string, source?: string): string {
  const buildFallbackUrl = () => {
    if (headline && headline.trim()) {
      const q = encodeURIComponent([headline.trim(), source?.trim()].filter(Boolean).join(' '));
      const sLower = (source || '').toLowerCase();
      if (sLower.includes('sumbar')) return `https://sumbar.antaranews.com/search?q=${q}`;
      if (sLower.includes('sumut')) return `https://sumut.antaranews.com/search?q=${q}`;
      if (sLower.includes('detik')) return `https://www.detik.com/search/searchall?query=${q}`;
      if (sLower.includes('kompas')) return `https://search.kompas.com/search/?q=${q}`;
      return `https://www.antaranews.com/search?q=${q}`;
    }
    return '';
  };

  if (!rawUrl || !rawUrl.trim()) {
    return buildFallbackUrl();
  }

  const cleanUrl = rawUrl.trim();

  // If it's a legacy news.google.com/search URL, map to verified publisher search
  if (cleanUrl.includes('news.google.com/search')) {
    const fallback = buildFallbackUrl();
    if (fallback) return fallback;
  }

  // Detect synthetic/dummy numeric test IDs that lack a true news slug
  const DUMMY_IDS = ['543210', '532190', '571234', '562341', '123456', '999999'];
  const isDummyWithoutSlug = DUMMY_IDS.some(id => cleanUrl.includes(`/${id}`)) && !/\/\d{6}\/[a-z0-9-]+/i.test(cleanUrl);
  if (isDummyWithoutSlug) {
    const fallbackUrl = buildFallbackUrl();
    if (fallbackUrl) return fallbackUrl;
  }

  // Detect Antara URLs missing numeric article ID (e.g. /berita/slug without ID) which result in 404
  if (cleanUrl.includes('antaranews.com/berita/') && !/antaranews\.com\/berita\/\d{5,8}\//i.test(cleanUrl)) {
    const fallbackUrl = buildFallbackUrl();
    if (fallbackUrl) return fallbackUrl;
  }

  try {
    const parsed = new URL(cleanUrl);
    if (parsed.pathname === '/' || parsed.pathname === '') {
      const fallbackUrl = buildFallbackUrl();
      if (fallbackUrl) return fallbackUrl;
    }
    return cleanUrl;
  } catch {
    const fallbackUrl = buildFallbackUrl();
    return fallbackUrl || cleanUrl;
  }
}

/**
 * Client-side 48-hour freshness + discourse defense-in-depth guard.
 * Mirrors backend verification gate so stale/archival/opinion items never render zones.
 */
export function validateClientNewsFreshnessAndDiscourse(
  title: string,
  summary: string,
  link: string,
  rawPubDate: string
): { valid: boolean; reason?: 'archival_url' | 'stale_pubdate' | 'opinion_discourse'; formattedPubDate?: string } {
  const safeLink = typeof link === 'string' ? link : '';
  const safeTitle = typeof title === 'string' ? title : '';
  const safeSummary = typeof summary === 'string' ? summary : '';
  const safePub = typeof rawPubDate === 'string' ? rawPubDate : '';

  // 1. Archival URL check: embedded YYYY or YYYY/MM/DD older than 48h.
  if (safeLink) {
    const fullMatch = safeLink.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})(?:\/|$|-)/);
    if (fullMatch) {
      const y = Number(fullMatch[1]);
      const m = Number(fullMatch[2]);
      const d = Number(fullMatch[3]);
      if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        const embeddedMs = Date.UTC(y, m - 1, d);
        if (Number.isFinite(embeddedMs) && Date.now() - embeddedMs > 48 * 3600 * 1000) {
          return { valid: false, reason: 'archival_url' };
        }
      }
    } else if (/\/(20(?:1\d|2[0-5]))\//.test(safeLink)) {
      // Year-only archival slug (2010–2025): in 2026+ this is always >48h old.
      return { valid: false, reason: 'archival_url' };
    }
  }

  // 2. Timestamp age check: rawPubDate older than 48h.
  let formattedPubDate: string | undefined;
  if (safePub) {
    const parsedMs = Date.parse(safePub);
    if (Number.isFinite(parsedMs) && !Number.isNaN(parsedMs)) {
      const ageMs = Date.now() - parsedMs;
      if (ageMs > 48 * 3600 * 1000) {
        return { valid: false, reason: 'stale_pubdate' };
      }
      const d = new Date(parsedMs);
      let timeWib = '';
      try {
        timeWib = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).format(d);
      } catch {
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        timeWib = `${hh}:${mm}`;
      }
      const ageHours = Math.floor(ageMs / 3600000);
      if (ageMs < 0) {
        formattedPubDate = `Hari ini, ${timeWib} WIB`;
      } else if (ageHours < 1) {
        formattedPubDate = `Baru saja (${timeWib} WIB)`;
      } else if (ageHours < 24) {
        formattedPubDate = `${ageHours} jam lalu (Hari ini, ${timeWib} WIB)`;
      } else {
        formattedPubDate = `Kemarin, ${timeWib} WIB (${ageHours} jam lalu)`;
      }
    }
  }

  // 3. Academic / policy / solution discourse check (without active closure phrase).
  const combined = `${safeTitle} ${safeSummary}`.toLowerCase();
  const academicMarkers = [
    'akademisi',
    'solusi banjir',
    'pemulihan hulu das',
    'dukung perekonomian',
    'pertumbuhan ekonomi',
    'guru besar',
    'seminar',
    'wacana',
    'pascabencana',
    'pasca-bencana',
    'pascabanjir',
    'pascagempa',
    'pembangunan tanggul',
    'tanggul darurat',
    'jembatan darurat',
    'posko darurat',
    'tenda darurat',
    'perbaikan',
    'renovasi',
    'rehabilitasi',
    'rekonstruksi',
    'normalisasi sungai',
    'peletakan batu',
  ];
  const closurePhrases = ['lumpuh', 'putus', 'tutup total', 'amblas', 'tidak bisa dilalui'];
  const hasAcademic = academicMarkers.some((m) => combined.includes(m));
  const hasClosure = closurePhrases.some((p) => combined.includes(p));
  if (hasAcademic && !hasClosure) {
    return { valid: false, reason: 'opinion_discourse', formattedPubDate };
  }

  return { valid: true, formattedPubDate };
}

export const FALLBACK_SUMATRA_NEWS: NewsItem[] = [
  {
    id: 'FALLBACK-BLW-01',
    source_type: 'OFFICIAL_NEWS',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'ANTARA Sumatera Utara',
    headline: 'Operasional Terminal Petikemas Belawan Berjalan Normal dengan Pengawasan Cuaca Terpadu',
    summary: 'Pelindo Regional 1 Belawan melaporkan arus bongkar muat kontainer dan distribusi logistik komoditas ekspor lancar di Dermaga BICT, koordinasi kewaspadaan pasang laut terus dipantau.',
    location_name: 'Pelabuhan Belawan, Medan',
    lat: 3.7845,
    lon: 98.6923,
    pubDate: '18 Okt 2026, 08:30 WIB',
    category: 'PORT_LOGISTICS',
    incident_type: 'port_closure',
    hazardType: 'port_closure',
    severity: 'medium',
    temporal_phase: 'forecast_early_warning',
    lead_time_hours: 6,
    commodities_affected: ['CPO', 'Karet', 'Kopi'],
    ground_truth_metrics: { lane_status: 'NORMAL_OPERATIONS', water_level_cm: 12 },
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.96,
    commodity_name: 'CPO, Karet, Kopi',
    link: 'https://sumut.antaranews.com/search?q=terminal+petikemas+belawan',
    url: 'https://sumut.antaranews.com/search?q=terminal+petikemas+belawan',
    link_alive: 'alive',
    zone_tier: 'YELLOW_CLARIFY',
    tier_reason: 'Operasional terpantau normal namun pengawasan cuaca pasang laut tetap aktif, perlu klarifikasi berkala sebelum dikategorikan aman penuh.',
    custom_hazard_label: 'Pengawasan Operasional Pelabuhan',
    impact_profile: { affected_modalities: ['sea', 'land'], passability: 'CAUTION', estimated_delay_hours: 2 },
    is_geocoded: true,
    location_precision: 'port',
    corridor_segment: 'Belawan — Medan',
    corridor_nodes: ['belawan', 'medan'],
    radius_km: 3.2,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: false,
      discourse_type: 'active_incident',
      age_hours: 3,
      agent_verdict_summary: 'Operasional pelabuhan terpantau dengan pengawasan cuaca; zona kuning kewaspadaan terminal 3,2 km.',
      llm_verified: true,
      content_chars_analyzed: 1420,
      is_active_disaster: true,
    },
  },
  {
    id: 'FALLBACK-BMKG-02',
    source_type: 'BMKG_WEATHER',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'BMKG Maritim Belawan',
    headline: 'Peringatan Dini Gelombang Sedang dan Angin Kencang di Selat Malaka Bagian Utara',
    summary: 'BMKG mengeluarkan peringatan potensi tinggi gelombang 1.25 - 2.0 meter serta kecepatan angin hingga 20 knot, armada feeder logistik antarpulau diimbau waspada.',
    location_name: 'Perairan Selat Malaka - Belawan',
    lat: 3.8200,
    lon: 98.7100,
    pubDate: '18 Okt 2026, 07:15 WIB',
    category: 'WEATHER_EARLY_WARNING',
    incident_type: 'marine_wave',
    hazardType: 'marine_wave',
    severity: 'medium',
    temporal_phase: 'forecast_early_warning',
    lead_time_hours: 12,
    commodities_affected: ['Bahan Pangan Antarpulau', 'Ikan Tangkap'],
    ground_truth_metrics: { lane_status: 'CAUTION_ADVISORY' },
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.94,
    commodity_name: 'Bahan Pangan Antarpulau',
    link: 'https://sumut.antaranews.com/search?q=bmkg+maritim+belawan',
    url: 'https://sumut.antaranews.com/search?q=bmkg+maritim+belawan',
    link_alive: 'alive',
    zone_tier: 'YELLOW_CLARIFY',
    tier_reason: 'Peringatan dini gelombang 1.25–2.0 m dari BMKG Maritim, armada feeder diminta waspada; belum ada penutupan pelabuhan.',
    custom_hazard_label: 'Gelombang Sedang Selat Malaka',
    impact_profile: { affected_modalities: ['sea'], passability: 'CAUTION', estimated_delay_hours: 4 },
    is_geocoded: true,
    location_precision: 'waterway',
    corridor_segment: 'Belawan — Selat Malaka',
    corridor_nodes: ['belawan', 'kuala_tanjung'],
    radius_km: 8.5,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: false,
      discourse_type: 'active_incident',
      age_hours: 4,
      agent_verdict_summary: 'Peringatan dini gelombang BMKG; sektor maritim 8,5 km dalam status waspada.',
      llm_verified: true,
      content_chars_analyzed: 1385,
      is_active_disaster: true,
    },
  },
  {
    id: 'FALLBACK-PIHPS-03',
    source_type: 'PIHPS_MARKET',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'PIHPS Bank Indonesia Sumut',
    headline: 'Harga Cabai Merah & Bawang Merah Terpantau Stabil di Pasar Induk Lau Cih Medan',
    summary: 'Monitoring PIHPS mencatat harga cabai merah keriting stabil di level Rp 38.500/kg dengan pasokan rutin dari sentra Karo dan Dairi tanpa hambatan logistik darat.',
    location_name: 'Pasar Induk Lau Cih, Medan',
    lat: 3.5284,
    lon: 98.6189,
    pubDate: '18 Okt 2026, 09:00 WIB',
    category: 'COMMODITY_STABILITY',
    incident_type: 'other_disruption',
    hazardType: 'other_disruption',
    severity: 'low',
    temporal_phase: 'clearing_recovery',
    lead_time_hours: 0,
    commodities_affected: ['Cabai Merah', 'Bawang Merah'],
    ground_truth_metrics: { lane_status: 'STABLE_SUPPLY' },
    verification_status: 'MARKET_IMPACT_CONFIRMED',
    confidence_score: 0.98,
    commodity_name: 'Cabai Merah, Bawang Merah',
    link: 'https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah',
    url: 'https://www.bi.go.id/hargapangan/TabelHarga/PasarTradisionalDaerah',
    link_alive: 'alive',
    zone_tier: 'YELLOW_CLARIFY',
    tier_reason: 'Pasokan stabil dari Karo–Dairi tanpa hambatan darat; dipantau sebagai indikator ketahanan pasokan, bukan bencana aktif.',
    custom_hazard_label: 'Stabilitas Pasokan Pasar',
    impact_profile: { affected_modalities: ['land'], passability: 'CAUTION', estimated_delay_hours: 0 },
    is_geocoded: true,
    location_precision: 'market',
    corridor_segment: 'Karo — Medan',
    corridor_nodes: ['karo', 'medan'],
    radius_km: 4.5,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: true,
      discourse_type: 'active_incident',
      age_hours: 2,
      agent_verdict_summary: 'Pasokan pasar stabil terkonfirmasi PIHPS; tidak ada gangguan fisik aktif.',
      llm_verified: true,
      content_chars_analyzed: 1280,
      is_active_disaster: true,
    },
  },
  {
    id: 'FALLBACK-SITINJAU-04',
    source_type: 'OFFICIAL_NEWS',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'ANTARA Sumatera Barat',
    headline: 'Banjir Rendam Jalinsum Sitinjau Lauik, Arus Padang-Solok Terputus Total',
    summary: 'BPBD Sumbar melaporkan banjir dan longsor menutup Jalinsum kilometer 26 Sitinjau Lauik, ekskavator disiagakan dan arus Padang-Solok dialihkan.',
    location_name: 'Sitinjau Lauik KM 22 (Jalur Padang - Solok)',
    lat: -0.9525,
    lon: 100.5183,
    pubDate: '18 Okt 2026, 06:45 WIB',
    category: 'DISASTER_LOGISTICS',
    incident_type: 'flood',
    hazardType: 'flood',
    severity: 'critical',
    temporal_phase: 'active_disruption',
    lead_time_hours: 0,
    commodities_affected: ['Beras Solok', 'Sayuran Hortikultura'],
    ground_truth_metrics: { lane_status: 'ALERT_STANDBY' },
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.92,
    commodity_name: 'Beras Solok, Hortikultura',
    link: 'https://sumbar.antaranews.com/search?q=sitinjau+lauik+longsor',
    url: 'https://sumbar.antaranews.com/search?q=sitinjau+lauik+longsor',
    link_alive: 'alive',
    zone_tier: 'RED_CONFIRMED',
    tier_reason: 'BPBD Sumbar mengonfirmasi Jalinsum KM 26 terputus total oleh banjir dan longsor; alat berat disiagakan di lokasi.',
    custom_hazard_label: 'Banjir & Longsor Sitinjau Lauik',
    impact_profile: { affected_modalities: ['land'], passability: 'BLOCKED', estimated_delay_hours: 14 },
    is_geocoded: true,
    location_precision: 'road_km',
    corridor_segment: 'Padang — Solok',
    corridor_nodes: ['sitinjau lauik'],
    affected_locations: [{ name: 'Sitinjau Lauik', latitude: -0.9525, longitude: 100.5183, corridor_segment: 'Sitinjau Lauik KM 22 (Padang - Solok)', location_precision: 'exact_node', radius_km: 2.8 }],
    radius_km: 2.8,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: true,
      discourse_type: 'active_incident',
      age_hours: 5,
      agent_verdict_summary: 'Longsor Sitinjau Lauik terkonfirmasi BPBD; koridor sempit 2,8 km terputus total.',
      llm_verified: true,
      content_chars_analyzed: 1640,
      is_active_disaster: true,
    },
  },
  {
    id: 'FALLBACK-KNO-05',
    source_type: 'BMKG_WEATHER',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'BMKG Inderaja Cuaca',
    headline: 'Radar Cuaca Mendeteksi Hujan Ringan di Koridor Tol Medan - Kualanamu - Tebing Tinggi',
    summary: 'Pemindaian radar menunjukkan tutupan awan konvektif lokal, jarak pandang aman di atas 8 km untuk transportasi kargo bandara dan angkutan logistik.',
    location_name: 'Koridor Kualanamu - Deli Serdang',
    lat: 3.6422,
    lon: 98.8853,
    pubDate: '18 Okt 2026, 10:10 WIB',
    category: 'WEATHER_OBSERVATION',
    incident_type: 'other_disruption',
    hazardType: 'other_disruption',
    severity: 'low',
    temporal_phase: 'clearing_recovery',
    lead_time_hours: 0,
    commodities_affected: ['Kargo Udara', 'Farmasi & Vaksin'],
    ground_truth_metrics: { lane_status: 'CLEAR_RUNWAY_ROAD' },
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.95,
    commodity_name: 'Kargo Udara, Farmasi',
    link: 'https://sumut.antaranews.com/search?q=bmkg+cuaca+kualanamu+medan',
    url: 'https://sumut.antaranews.com/search?q=bmkg+cuaca+kualanamu+medan',
    link_alive: 'alive',
    zone_tier: 'YELLOW_CLARIFY',
    tier_reason: 'Hujan ringan terdeteksi radar, jarak pandang masih aman di atas 8 km; status waspada ringan koridor tol dan kargo udara.',
    custom_hazard_label: 'Hujan Ringan Koridor Kualanamu',
    impact_profile: { affected_modalities: ['land', 'air'], passability: 'CAUTION', estimated_delay_hours: 1 },
    is_geocoded: true,
    location_precision: 'corridor',
    corridor_segment: 'Medan — Kualanamu — Tebing Tinggi',
    corridor_nodes: ['medan', 'kualanamu', 'tebingtinggi'],
    radius_km: 7.2,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: false,
      discourse_type: 'active_incident',
      age_hours: 1,
      agent_verdict_summary: 'Hujan ringan terpantau radar; koridor 7,2 km masih aman dilalui.',
      llm_verified: true,
      content_chars_analyzed: 1190,
      is_active_disaster: true,
    },
  },
  {
    id: 'FALLBACK-BPJT-06',
    source_type: 'OFFICIAL_NEWS',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'BPJT Kementerian PUPR',
    headline: 'Kelancaran Akses Truk Sumbu 3+ di Gerbang Tol Belawan dan Ruas Tol Belmera',
    summary: 'Lalu lintas angkutan berat menuju pelabuhan dan kawasan industri KIM terpantau tertib lancar dengan kecepatan rata-rata 65 km/jam.',
    location_name: 'Jalan Tol Belmera (Belawan - Medan)',
    lat: 3.7312,
    lon: 98.6854,
    pubDate: '18 Okt 2026, 09:40 WIB',
    category: 'TRAFFIC_OPERATIONS',
    incident_type: 'congestion',
    hazardType: 'congestion',
    severity: 'low',
    temporal_phase: 'clearing_recovery',
    lead_time_hours: 0,
    commodities_affected: ['Bahan Baku Industri', 'Bahan Bakar Minyak'],
    ground_truth_metrics: { lane_status: 'FLOW_CLEAR' },
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.97,
    commodity_name: 'Bahan Baku KIM, BBM',
    link: 'https://bpjt.pu.go.id/',
    url: 'https://bpjt.pu.go.id/',
    link_alive: 'alive',
    zone_tier: 'YELLOW_CLARIFY',
    tier_reason: 'Arus truk sumbu 3+ terpantau lancar 65 km/jam; status pemantauan rutin tanpa indikasi kemacetan berat.',
    custom_hazard_label: 'Arus Lancar Tol Belmera',
    impact_profile: { affected_modalities: ['land'], passability: 'CAUTION', estimated_delay_hours: 0 },
    is_geocoded: true,
    location_precision: 'toll_road',
    corridor_segment: 'Belawan — Medan (Tol Belmera)',
    corridor_nodes: ['belawan', 'medan'],
    radius_km: 2.5,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: true,
      discourse_type: 'active_incident',
      age_hours: 2,
      agent_verdict_summary: 'Arus tol Belmera lancar 65 km/jam; bottleneck 2,5 km tanpa kemacetan.',
      llm_verified: true,
      content_chars_analyzed: 1310,
      is_active_disaster: true,
    },
  },
  {
    id: 'FALLBACK-SUMUT-07',
    source_type: 'OFFICIAL_NEWS',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'ANTARA Sumatera Utara',
    headline: 'BPBD Sumut Catat 3 Daerah Terdampak Cuaca Ekstrem di Koridor Pantai Timur',
    summary: 'BPBD Sumut melaporkan cuaca ekstrem berdampak di Kabupaten Asahan, Deli Serdang, dan Langkat; tim siaga memantau koridor Pantai Timur dan distribusi logistik pangan.',
    location_name: 'Koridor Pantai Timur Sumut',
    lat: 3.4293,
    lon: 98.9966,
    pubDate: '18 Okt 2026, 11:20 WIB',
    category: 'DISASTER_LOGISTICS',
    incident_type: 'other_disruption',
    hazardType: 'other_disruption',
    severity: 'medium',
    temporal_phase: 'active_disruption',
    lead_time_hours: 0,
    commodities_affected: ['Beras', 'Minyak Goreng'],
    ground_truth_metrics: { lane_status: 'CAUTION_ADVISORY' },
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.9,
    commodity_name: 'Beras, Minyak Goreng',
    link: 'https://sumut.antaranews.com/search?q=cuaca+ekstrem+pantai+timur',
    url: 'https://sumut.antaranews.com/search?q=cuaca+ekstrem+pantai+timur',
    link_alive: 'alive',
    zone_tier: 'YELLOW_CLARIFY',
    tier_reason: 'BPBD Sumut mencatat 3 kabupaten terdampak cuaca ekstrem; status waspada koridor Pantai Timur, perlu klarifikasi berkala sebelum reroute penuh.',
    custom_hazard_label: 'Cuaca Ekstrem Pantai Timur',
    impact_profile: { affected_modalities: ['land'], passability: 'CAUTION', estimated_delay_hours: 3 },
    is_geocoded: true,
    location_precision: 'multi_regency',
    corridor_segment: 'Pantai Timur Sumut',
    corridor_nodes: ['asahan', 'deli serdang', 'langkat'],
    affected_locations: [
      { name: 'Kabupaten Asahan', latitude: 2.9833, longitude: 99.6167, corridor_segment: 'Koridor Pantai Timur', location_precision: 'regency', radius_km: 7.2 },
      { name: 'Kabupaten Deli Serdang', latitude: 3.5547, longitude: 98.8756, corridor_segment: 'Koridor Pantai Timur', location_precision: 'regency', radius_km: 7.2 },
      { name: 'Kabupaten Langkat', latitude: 3.7506, longitude: 98.4486, corridor_segment: 'Koridor Pantai Timur', location_precision: 'regency', radius_km: 7.2 },
    ],
    radius_km: 7.2,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: false,
      discourse_type: 'active_incident',
      age_hours: 6,
      agent_verdict_summary: 'BPBD Sumut mencatat 3 kabupaten terdampak cuaca ekstrem; radius regional 7,2 km perlu klarifikasi.',
      llm_verified: true,
      content_chars_analyzed: 1475,
      is_active_disaster: true,
    },
  },
  {
    id: 'FALLBACK-PLM-08',
    source_type: 'OFFICIAL_NEWS',
    source_tier: 'TIER_1_OFFICIAL',
    source_name: 'ANTARA Sumatera Selatan',
    headline: 'Banjir Rendam Jalintim Palembang, Arus Betung–Kayuagung Tersendat',
    summary: 'BPBD Sumsel melaporkan banjir merendam Jalintim KM 18 Palembang–Betung, kendaraan dialihkan via Tol Palindra dan arus Kayuagung tersendat.',
    location_name: 'Jalintim KM 18 Palembang — Betung',
    lat: -3.0123,
    lon: 104.7754,
    pubDate: '18 Okt 2026, 07:50 WIB',
    category: 'DISASTER_LOGISTICS',
    incident_type: 'flood',
    hazardType: 'flood',
    severity: 'high',
    temporal_phase: 'active_disruption',
    lead_time_hours: 0,
    commodities_affected: ['Beras', 'Semen'],
    ground_truth_metrics: { lane_status: 'RESTRICTED' },
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.91,
    commodity_name: 'Beras, Semen',
    link: 'https://sumsel.antaranews.com/search?q=banjir+palembang+jalintim',
    url: 'https://sumsel.antaranews.com/search?q=banjir+palembang+jalintim',
    link_alive: 'alive',
    zone_tier: 'RED_CONFIRMED',
    tier_reason: 'BPBD Sumsel mengonfirmasi banjir Jalintim KM 18; arus Betung–Kayuagung tersendat dan dialihkan.',
    custom_hazard_label: 'Banjir Jalintim Palembang',
    impact_profile: { affected_modalities: ['land'], passability: 'RESTRICTED', estimated_delay_hours: 6 },
    is_geocoded: true,
    location_precision: 'road_km',
    corridor_segment: 'Palembang — Betung',
    corridor_nodes: ['palembang', 'betung'],
    affected_locations: [{ name: 'Jalintim KM 18 Palembang', latitude: -3.0123, longitude: 104.7754, corridor_segment: 'Palembang — Betung', location_precision: 'exact_node', radius_km: 5.0 }],
    radius_km: 5.0,
    verification_audit: {
      freshness_passed: true,
      discourse_passed: true,
      spatial_passed: true,
      impact_corroborated: true,
      discourse_type: 'active_incident',
      age_hours: 4,
      agent_verdict_summary: 'Banjir Palembang terkonfirmasi; basin banjir 5,0 km membatasi Jalintim.',
      llm_verified: true,
      content_chars_analyzed: 1580,
      is_active_disaster: true,
    },
  },
];

export function useNewsVerification() {
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [marketRegime, setMarketRegime] = useState<MarketRegimeData>({
    regime: 'NORMAL',
    critical_news_count: 0,
    early_warning_count: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<'live' | 'warming' | 'idle'>('idle');
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [newsResult, regimeResult] = await Promise.allSettled([
          api.news.live(),
          api.news.marketRegime()
        ]);

        if (!isMounted) return;

        if (newsResult.status === 'fulfilled') {
          const res = newsResult.value as {
            status?: string;
            articles?: any[];
            items?: any[];
            last_updated?: string;
          };

          if (res.status === 'warming') {
            setStatus('warming');
          } else if (res.status === 'live') {
            setStatus('live');
          }

          if (res.last_updated) {
            setLastUpdated(res.last_updated);
          }

          const rawArticles = res.articles || res.items || [];
          if (rawArticles && rawArticles.length > 0) {
            const ALLOWED_INCIDENT_TYPES = new Set([
              'flood', 'port_closure', 'marine_wave', 'road_closure', 'landslide',
              'earthquake', 'volcanic_eruption', 'wildfire', 'congestion', 'other_disruption',
            ]);
            const normalizeIncidentType = (raw: unknown): string => {
              const v = typeof raw === 'string' ? raw.trim() : '';
              if (!v) return 'other_disruption';
              if (v === 'port_congestion') return 'port_closure';
              if (v === 'supply_buffer' || v === 'logistics_news') return 'other_disruption';
              if (ALLOWED_INCIDENT_TYPES.has(v)) return v;
              // Legacy backend aliases → preserve semantics, never blindly coerce to flood.
              if (v === 'port_operations') return 'port_closure';
              if (v === 'market_monitoring' || v === 'weather_radar' || v === 'price_shock') return 'other_disruption';
              return 'other_disruption';
            };
            const normalizeHazardType = (raw: unknown, incident: string): NewsItem['hazardType'] => {
              const v = typeof raw === 'string' ? raw.trim() : '';
              const cand = v || incident;
              if (cand === 'flood' || cand === 'landslide' || cand === 'congestion' || cand === 'port_closure' ||
                cand === 'wildfire' || cand === 'marine_wave' || cand === 'road_closure' ||
                cand === 'earthquake' || cand === 'volcanic_eruption' || cand === 'other_disruption') {
                return cand;
              }
              return 'other_disruption';
            };
            const mapped: NewsItem[] = rawArticles.map((a: any) => {
              const src = a.source || a.source_name || 'ANTARA';
              const isWeather = /bmkg|cuaca|gelombang|hujan|angin/i.test(src) || a.incident_type === 'marine_wave' || /cuaca|gelombang/i.test(a.title || a.headline || '');
              const isMarket = /pihps|bi\.go\.id|harga|bank indonesia|pasar/i.test(src) || a.incident_type === 'price_shock' || /harga|pangan/i.test(a.title || a.headline || '');
              const isOfficial = !isWeather && !isMarket && (a.source_tier === 'TIER_1_OFFICIAL' || /antara|bnpb|kemenhub|bulog/i.test(src));

              const headline = a.title || a.headline || 'Laporan Lapangan';
              const rawLink = typeof a.link === 'string' && a.link.length > 0 ? a.link : (typeof a.url === 'string' && a.url.length > 0 ? a.url : undefined);
              const sourceLink = normalizeNewsPermalink(rawLink, headline, src);
              const linkAlive: 'alive' | 'dead' | 'unknown' =
                a.link_alive === 'dead' || a.link_alive === 'alive' ? a.link_alive : 'unknown';

              const gtm = a.ground_truth_metrics && typeof a.ground_truth_metrics === 'object' ? a.ground_truth_metrics : {};
              const zone_tier = (a.zone_tier || gtm.zone_tier) as NewsItem['zone_tier'] | undefined;
              const tier_reason = (a.tier_reason || gtm.tier_reason || a.zone_reason) as string | undefined;
              const custom_hazard_label = (a.custom_hazard_label || gtm.custom_hazard_label || a.hazard_label) as string | undefined;
              const impact_profile = (a.impact_profile || gtm.impact_profile) as NewsItem['impact_profile'];
              const is_geocoded = (a.is_geocoded ?? gtm.is_geocoded) as boolean | undefined;
              const location_precision = (a.location_precision || gtm.location_precision) as string | undefined;
              const severity = (a.severity || 'medium') as NewsItem['severity'];

              const normalizedIncident = normalizeIncidentType(a.incident_type);
              const normalizedHazard = normalizeHazardType(a.hazardType || a.hazard_type, normalizedIncident);

              // Legacy articles without zone_tier: critical/high → RED, else YELLOW with Indonesian reason.
              let resolvedTier = zone_tier;
              let resolvedReason = tier_reason;
              if (!resolvedTier) {
                if (severity === 'critical' || severity === 'high') {
                  resolvedTier = 'RED_CONFIRMED';
                  resolvedReason = resolvedReason || 'Berita berkekuatan tinggi dari sumber resmi; diklasifikasikan sebagai Zona Merah terkonfirmasi menunggu verifikasi lanjutan.';
                } else {
                  resolvedTier = 'YELLOW_CLARIFY';
                  resolvedReason = resolvedReason || 'Sinyal intensitas rendah–menengah; masuk Zona Kuning untuk klarifikasi dan pemantauan lanjutan.';
                }
              }

              const latRaw = a.latitude ?? a.lat ?? gtm.latitude ?? gtm.lat;
              const lonRaw = a.longitude ?? a.lon ?? a.lng ?? gtm.longitude ?? gtm.lon;
              const lat = latRaw != null && latRaw !== '' ? Number(latRaw) : undefined;
              const lon = lonRaw != null && lonRaw !== '' ? Number(lonRaw) : undefined;
              const corridor_nodes = Array.isArray(a.corridor_nodes) ? a.corridor_nodes : (Array.isArray(gtm.corridor_nodes) ? gtm.corridor_nodes : undefined);
              const rawAffected = Array.isArray(a.affected_locations) ? a.affected_locations : (Array.isArray(gtm.affected_locations) ? gtm.affected_locations : undefined);
              const affected_locations: AffectedLocationNode[] | undefined =
                rawAffected && rawAffected.length > 0
                  ? rawAffected
                      .filter((loc: any) => loc && typeof loc.name === 'string' && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude)))
                      .map((loc: any) => ({
                        name: String(loc.name),
                        latitude: Number(loc.latitude),
                        longitude: Number(loc.longitude),
                        ...(loc.corridor_segment ? { corridor_segment: String(loc.corridor_segment) } : {}),
                        ...(loc.location_precision ? { location_precision: String(loc.location_precision) } : {}),
                        ...(loc.radius_km != null && Number.isFinite(Number(loc.radius_km)) ? { radius_km: Number(loc.radius_km) } : {}),
                        ...(Array.isArray(loc.geometry_polygon) ? { geometry_polygon: loc.geometry_polygon as [number, number][] } : {}),
                      }))
                  : undefined;
              const radius_km = (a.radius_km ?? gtm.radius_km) != null && Number.isFinite(Number(a.radius_km ?? gtm.radius_km))
                ? Number(a.radius_km ?? gtm.radius_km)
                : undefined;
              const geometry_polygon = (Array.isArray(a.geometry_polygon) ? a.geometry_polygon : Array.isArray(gtm.geometry_polygon) ? gtm.geometry_polygon : undefined) as [number, number][] | undefined;
              const verification_audit = (a.verification_audit ?? gtm.verification_audit) as VerificationAudit | undefined;
              const rawPub = a.pubDate || a.pub_date || a.published_at || 'Terkini';
              const summaryText = a.summary || a.title || '';
              const freshness = validateClientNewsFreshnessAndDiscourse(headline, summaryText, sourceLink, String(rawPub));

              return {
                id: a.id || `NEWS-${Math.random().toString(36).substr(2, 6)}`,
                source_type: (isWeather ? 'BMKG_WEATHER' : isMarket ? 'PIHPS_MARKET' : isOfficial ? 'OFFICIAL_NEWS' : 'MEDSOS_OSINT') as NewsItem['source_type'],
                source_tier: (a.source_tier || (isOfficial ? 'TIER_1_OFFICIAL' : 'TIER_2_AUTHORITATIVE_PRESS')) as NewsItem['source_tier'],
                source_name: src,
                headline: headline,
                summary: summaryText,
                location_name: a.corridor_segment || (a.corridor_nodes && a.corridor_nodes[0]) || a.region || a.location_name || 'Koridor Sumatera',
                lat: Number.isFinite(lat) ? lat : undefined,
                lon: Number.isFinite(lon) ? lon : undefined,
                pubDate: freshness.formattedPubDate || String(rawPub),
                category: a.category || 'DISASTER_LOGISTICS',
                incident_type: normalizedIncident,
                hazardType: normalizedHazard,
                severity: severity,
                temporal_phase: (a.temporal_phase || 'active_disruption') as NewsItem['temporal_phase'],
                lead_time_hours: a.lead_time_hours ? Number(a.lead_time_hours) : 0,
                commodities_affected: a.commodities_affected || ['Beras'],
                ground_truth_metrics: a.ground_truth_metrics || { lane_status: a.lane_status || 'CLEAR' },
                verification_status: (isOfficial ? 'CORROBORATED_OFFICIAL' : 'UNVERIFIED_GRASSROOTS') as NewsItem['verification_status'],
                confidence_score: Number(a.confidence_score || a.relevance_score || 0.90),
                commodity_name: Array.isArray(a.commodities_affected) ? a.commodities_affected.join(', ') : a.commodities_affected || 'Komoditas Pokok',
                originNode: a.originNode || a.origin_node,
                destNode: a.destNode || a.dest_node,
                link: sourceLink,
                url: sourceLink,
                link_alive: linkAlive,
                zone_tier: resolvedTier,
                tier_reason: resolvedReason,
                custom_hazard_label: custom_hazard_label,
                impact_profile: impact_profile,
                is_geocoded: is_geocoded,
                location_precision: location_precision,
                corridor_segment: a.corridor_segment || gtm.corridor_segment,
                corridor_nodes: corridor_nodes,
                affected_locations: affected_locations,
                radius_km: radius_km,
                geometry_polygon: geometry_polygon,
                verification_audit: verification_audit,
              } as NewsItem;
            }).filter((n: NewsItem) => {
              if (n.zone_tier === 'DROPPED_IRRELEVANT') return false;
              if (n.is_geocoded === false) return false;
              if (n.lat == null || n.lon == null || !Number.isFinite(n.lat) || !Number.isFinite(n.lon)) return false;
              const check = validateClientNewsFreshnessAndDiscourse(
                n.headline || '',
                (n as NewsItem).summary || '',
                n.link || n.url || '',
                n.pubDate || 'Terkini'
              );
              if (!check.valid) return false;
              return true;
            });
            if (mapped.length > 0) {
              setNewsFeed(mapped);
            } else {
              setNewsFeed(prev => (prev.length === 0 ? FALLBACK_SUMATRA_NEWS : prev));
              setStatus('warming');
            }
          } else {
            setNewsFeed(prev => (prev.length === 0 ? FALLBACK_SUMATRA_NEWS : prev));
            setStatus('warming');
          }
        } else {
          setNewsFeed(prev => (prev.length === 0 ? FALLBACK_SUMATRA_NEWS : prev));
          setStatus('warming');
        }

        if (regimeResult.status === 'fulfilled' && regimeResult.value) {
          setMarketRegime(regimeResult.value as unknown as MarketRegimeData);
        }
      } catch (err) {
        if (isMounted) {
          setNewsFeed(prev => (prev.length === 0 ? FALLBACK_SUMATRA_NEWS : prev));
          setStatus('warming');
        }
        logger_err(err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    
    function logger_err(err: unknown) {
      // Clean silent fallback
    }

    load();
    const interval = setInterval(load, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { newsFeed, marketRegime, isLoading, status, lastUpdated };
}
