'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface NewsItem {
  id: string;
  source_type: 'MEDSOS_OSINT' | 'OFFICIAL_NEWS' | 'PIHPS_MARKET' | 'BMKG_WEATHER';
  headline: string;
  summary: string;
  location_name?: string;
  lat?: number;
  lon?: number;
  pubDate?: string;
  category?: 'DISASTER_LOGISTICS' | 'PRICE_ANOMALY' | 'METEOROLOGY' | 'TRAFFIC_BOTTLENECK';
  verification_status: 'UNVERIFIED_GRASSROOTS' | 'CORROBORATED_OFFICIAL' | 'MARKET_IMPACT_CONFIRMED' | 'REJECTED_UNFOUNDED';
  confidence_score: number;
  attributions: Array<{ source_name: string; url?: string; credibility_score?: number }>;
  originNode?: string;
  destNode?: string;
  hazardType?: 'flood' | 'landslide' | 'congestion' | 'port_closure' | 'wildfire';
  commodity_name?: string;
  economic_note?: string;
}

export interface MarketRegimeData {
  regime: 'NORMAL' | 'ELEVATED' | 'CRISIS';
  active_crisis_indicators: string[];
  commodity_volatility_score: number;
}

const MOCK_NEWS_FALLBACK: NewsItem[] = [
  {
    id: 'NEWS-001',
    source_type: 'OFFICIAL_NEWS',
    headline: 'Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi KM 78',
    summary: 'Debit air meningkat 120cm menutup badan jalan arteri Jalinsum. Puluhan truk sembako dialihkan via Tol Medan-Kualanamu-Tebing Tinggi.',
    location_name: 'Interchange Tebing Tinggi (Sumut)',
    lat: 3.5680,
    lon: 98.9560,
    pubDate: '10m lalu · Antara Sumut',
    category: 'DISASTER_LOGISTICS',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.94,
    originNode: 'belawan',
    destNode: 'tebingtinggi',
    hazardType: 'flood',
    commodity_name: 'Beras BULOG & Minyak Goreng',
    economic_note: 'Rute Pengalihan: Tambahan jarak +14 km via Tol MKTT, perkiraan delay 45 menit.',
    attributions: [
      { source_name: 'Antara News Sumut', url: 'https://news.google.com/search?q=banjir+sungai+padang+tebing+tinggi+logistik' },
      { source_name: 'BPBD Pemprov Sumatera Utara', url: 'https://news.google.com/search?q=bpbd+sumut+banjir+tebing+tinggi' }
    ],
  },
  {
    id: 'NEWS-002',
    source_type: 'OFFICIAL_NEWS',
    headline: 'Tebing Sitinjau Lauik Longsor, Jalur Distribusi Padang-Solok Terputus',
    summary: 'Material longsor menutup badan jalan Lintas Barat Sumatera. Truk sayur mayur dan cabai dari sentra pertanian Alahan Panjang tertahan di bahu jalan.',
    location_name: 'Sitinjau Lauik (Sumbar)',
    lat: -0.9492,
    lon: 100.4500,
    pubDate: '25m lalu · Padang Ekspres',
    category: 'DISASTER_LOGISTICS',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.91,
    originNode: 'padang',
    destNode: 'bukittinggi',
    hazardType: 'landslide',
    commodity_name: 'Cabai Merah & Sayur Agam',
    economic_note: 'Rute Pengalihan: Pengalihan via jalur alternatif Padang Panjang-Malalak (+28 km).',
    attributions: [
      { source_name: 'Padang Ekspres Online', url: 'https://news.google.com/search?q=longsor+sitinjau+lauik+padang+solok+truk' },
      { source_name: 'BPBD Sumatera Barat', url: 'https://news.google.com/search?q=bpbd+sumbar+longsor+sitinjau+lauik' }
    ],
  },
  {
    id: 'NEWS-003',
    source_type: 'OFFICIAL_NEWS',
    headline: 'Tol Pekanbaru-Dumai Alami Antrean Truk Tangki CPO di Gerbang Dumai',
    summary: 'Peningkatan volume angkutan CPO kelapa sawit dan pupuk menuju Pelabuhan Dumai memicu perlambatan kecepatan armada logistik.',
    location_name: 'Pelabuhan Dumai (Riau)',
    lat: 1.6811,
    lon: 101.4533,
    pubDate: '40m lalu · Riau Pos',
    category: 'TRAFFIC_BOTTLENECK',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.89,
    originNode: 'pekanbaru',
    destNode: 'dumai_port',
    hazardType: 'congestion',
    commodity_name: 'Minyak Goreng & CPO Sawit',
    economic_note: 'Penataan buffer parking di rest area KM 45 Tol Permai.',
    attributions: [
      { source_name: 'Riau Pos Online', url: 'https://news.google.com/search?q=tol+pekanbaru+dumai+antrean+truk+cpo' },
      { source_name: 'Hutama Karya Tol Permai', url: 'https://news.google.com/search?q=hutama+karya+tol+pekanbaru+dumai' }
    ],
  },
  {
    id: 'NEWS-004',
    source_type: 'BMKG_WEATHER',
    headline: 'Peringatan Dini BMKG: Gelombang 2.5m & Angin Kencang Selat Malaka',
    summary: 'Tinggi gelombang mencapai 2.5–3.0 meter di perairan timur Sumatera. Kapal kargo curah basah dan armada nelayan diimbau menunda keberangkatan.',
    location_name: 'Perairan Selat Malaka - Belawan',
    lat: 3.7922,
    lon: 98.6776,
    pubDate: '1j lalu · BMKG Maritim',
    category: 'METEOROLOGY',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.96,
    originNode: 'belawan',
    destNode: 'dumai_port',
    hazardType: 'port_closure',
    commodity_name: 'Gula Pasir & Beras Impor',
    economic_note: 'Rekomendasi Operasional: Penundaan keberangkatan pelayaran 12 jam demi keselamatan kargo.',
    attributions: [
      { source_name: 'BMKG Stasiun Meteorologi Maritim Belawan', url: 'https://news.google.com/search?q=bmkg+maritim+belawan+gelombang+tinggi' }
    ],
  },
  {
    id: 'NEWS-005',
    source_type: 'OFFICIAL_NEWS',
    headline: 'Lonjakan Arus Truk Logistik Sembako di Gerbang Tol Bakauheni Selatan',
    summary: 'Arus distribusi bahan pangan pokok Jawa-Sumatera meningkat 35%. Petugas ASDP memberlakukan skema delaying system di kantong parkir pelabuhan.',
    location_name: 'Pelabuhan Bakauheni (Lampung)',
    lat: -5.8711,
    lon: 105.7533,
    pubDate: '1.5j lalu · Lampung Post',
    category: 'TRAFFIC_BOTTLENECK',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.92,
    originNode: 'bakauheni_port',
    destNode: 'palembang',
    hazardType: 'congestion',
    commodity_name: 'Beras & Sembako Nasional',
    economic_note: 'Pola distribusi bergilir via Tol Terbanggi Besar-Kayu Agung.',
    attributions: [
      { source_name: 'Lampung Post', url: 'https://news.google.com/search?q=arus+logistik+truk+bakauheni+sembako' },
      { source_name: 'PT ASDP Indonesia Ferry', url: 'https://news.google.com/search?q=asdp+bakauheni+truk+logistik' }
    ],
  },
  {
    id: 'NEWS-006',
    source_type: 'PIHPS_MARKET',
    headline: 'PIHPS Bank Indonesia Catat Keterlambatan Pasokan Cabai ke Pasar Sentral',
    summary: 'Survei harga harian mencatat fluktuasi pasokan sayur & cabai dari sentra Karo dan Bukittinggi akibat perlambatan logistik cuaca buruk.',
    location_name: 'Pasar Pusat Medan & Pasar Raya Padang',
    lat: 3.5952,
    lon: 98.6722,
    pubDate: '2j lalu · Bank Indonesia PIHPS',
    category: 'PRICE_ANOMALY',
    verification_status: 'MARKET_IMPACT_CONFIRMED',
    confidence_score: 0.98,
    originNode: 'siantar',
    destNode: 'medan',
    hazardType: 'congestion',
    commodity_name: 'Cabai Merah & Bawang Merah',
    economic_note: 'Data survei resmi Bank Indonesia untuk acuan disparitas harga antar-wilayah.',
    attributions: [
      { source_name: 'Pusat Informasi Harga Pangan Strategis (PIHPS) Bank Indonesia', url: 'https://news.google.com/search?q=pihps+harga+cabai+sumatera+pasokan' }
    ],
  }
];

export function useNewsVerification() {
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>(MOCK_NEWS_FALLBACK);
  const [marketRegime, setMarketRegime] = useState<MarketRegimeData>({
    regime: 'ELEVATED',
    active_crisis_indicators: ['Banjir Sungai Padang Tebing Tinggi', 'Longsor Sitinjau Lauik Sumbar', 'Gelombang Selat Malaka'],
    commodity_volatility_score: 0.25
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const [newsData, regimeData] = await Promise.all([
          api.news.live(),
          api.news.marketRegime()
        ]);
        if (isMounted) {
          if (newsData.items && newsData.items.length > 0) {
            setNewsFeed(newsData.items as unknown as NewsItem[]);
          }
          if (regimeData.regime) setMarketRegime(regimeData as MarketRegimeData);
        }
      } catch (err) {
        console.warn('Backend news API fallback:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 15000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { newsFeed, marketRegime, isLoading };
}
