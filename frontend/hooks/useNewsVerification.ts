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
  commodity_impact?: Record<string, number>;
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
    headline: 'Banjir Luapan Sungai Padang Rendam Jalur Logistik Tebing Tinggi',
    summary: 'Debit air meningkat 120cm menutup badan jalan arteri Jalinsum. Puluhan truk sembako dialihkan via Tol Medan-Kualanamu.',
    location_name: 'Interchange Tebing Tinggi',
    lat: 3.5680,
    lon: 98.9560,
    pubDate: '10m lalu · Antara Sumut',
    category: 'DISASTER_LOGISTICS',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.94,
    attributions: [
      { source_name: 'Antara News Sumut', url: 'https://news.google.com/search?q=banjir+tebing+tinggi+antara' },
      { source_name: 'Kompas.com Regional', url: 'https://news.google.com/search?q=banjir+tebing+tinggi+kompas' }
    ],
    commodity_impact: { cabai_merah_pct: 14.2, minyak_goreng_pct: 5.8 }
  },
  {
    id: 'NEWS-002',
    source_type: 'OFFICIAL_NEWS',
    headline: 'Jalur Tol Pekanbaru-Dumai Alami Antrean Truk CPO di Gerbang Dumai',
    summary: 'Peningkatan volume angkutan minyak kelapa sawit mentah (CPO) dan pupuk menuju Pelabuhan Dumai memicu perlambatan laju armada.',
    location_name: 'Pelabuhan Dumai (Riau)',
    lat: 1.6811,
    lon: 101.4533,
    pubDate: '25m lalu · Riau Pos',
    category: 'TRAFFIC_BOTTLENECK',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.89,
    attributions: [
      { source_name: 'Riau Pos Online', url: 'https://news.google.com/search?q=pelabuhan+dumai+logistik' },
      { source_name: 'Tribun Pekanbaru', url: 'https://news.google.com/search?q=tol+pekanbaru+dumai' }
    ],
    commodity_impact: { minyak_goreng_pct: 4.5 }
  },
  {
    id: 'NEWS-003',
    source_type: 'BMKG_WEATHER',
    headline: 'Peringatan Dini BMKG: Gelombang Tinggi & Angin Kencang Selat Malaka',
    summary: 'Tinggi gelombang mencapai 2.5–3.0 meter di perairan timur Sumatera. Kapal kargo curah dan armada nelayan diimbau waspada.',
    location_name: 'Perairan Selat Malaka - Belawan',
    lat: 3.7922,
    lon: 98.6776,
    pubDate: '40m lalu · BMKG Maritim',
    category: 'METEOROLOGY',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.96,
    attributions: [
      { source_name: 'BMKG Stasiun Maritim Belawan', url: 'https://maritim.bmkg.go.id' }
    ],
    commodity_impact: { beras_pct: 2.1 }
  },
  {
    id: 'NEWS-004',
    source_type: 'MEDSOS_OSINT',
    headline: 'Laporan Sopir Truk: Antrean Truk 3 KM Menuju Gate Tol Belmera',
    summary: 'Genangan pasang rob laut setinggi 30cm di Jl. Pelabuhan Raya memperlambat manuver kontainer pengangkut beras BULOG.',
    location_name: 'Pelabuhan Belawan',
    lat: 3.7831,
    lon: 98.6868,
    pubDate: '1j lalu · X / Twitter OSINT',
    category: 'DISASTER_LOGISTICS',
    verification_status: 'UNVERIFIED_GRASSROOTS',
    confidence_score: 0.72,
    attributions: [
      { source_name: 'Komunitas Driver Truk Sumut', url: 'https://twitter.com' }
    ],
    commodity_impact: { beras_pct: 3.5 }
  },
  {
    id: 'NEWS-005',
    source_type: 'OFFICIAL_NEWS',
    headline: 'Longsor Tebing Sitinjau Lauik Putus Akses Padang–Solok',
    summary: 'Material longsor menutup badan jalan Lintas Barat Sumatera. Truk sayuran dari Alahan Panjang tertahan di bahu jalan.',
    location_name: 'Sitinjau Lauik (Sumbar)',
    lat: -0.9492,
    lon: 100.4500,
    pubDate: '1.5j lalu · Padang Ekspres',
    category: 'DISASTER_LOGISTICS',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.91,
    attributions: [
      { source_name: 'Padang Ekspres', url: 'https://news.google.com/search?q=sitinjau+lauik+longsor' },
      { source_name: 'BPBD Sumbar', url: 'https://sumbarprov.go.id' }
    ],
    commodity_impact: { cabai_merah_pct: 18.5, sayuran_pct: 12.0 }
  },
  {
    id: 'NEWS-006',
    source_type: 'PIHPS_MARKET',
    headline: 'PIHPS Catat Kenaikan Harga Cabai Merah di Pasar Sentral Medan (+12%)',
    summary: 'Pasokan dari sentra Karo dan Bukittinggi mengalami keterlambatan logistik 6 jam akibat perbaikan jalan dan hujan lebat.',
    location_name: 'Pusat Pasar Medan & Bukittinggi',
    lat: 3.5952,
    lon: 98.6722,
    pubDate: '2j lalu · Bank Indonesia PIHPS',
    category: 'PRICE_ANOMALY',
    verification_status: 'MARKET_IMPACT_CONFIRMED',
    confidence_score: 0.98,
    attributions: [
      { source_name: 'PIHPS Nasional Bank Indonesia', url: 'https://hargapangan.id' }
    ],
    commodity_impact: { cabai_merah_pct: 12.4, bawang_merah_pct: 6.8 }
  }
];

export function useNewsVerification() {
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>(MOCK_NEWS_FALLBACK);
  const [marketRegime, setMarketRegime] = useState<MarketRegimeData>({
    regime: 'ELEVATED',
    active_crisis_indicators: ['Banjir Jalinsum Tebing Tinggi', 'Antrean Port Belawan'],
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
          if (newsData.items && newsData.items.length > 0) setNewsFeed(newsData.items as unknown as NewsItem[]);
          if (regimeData.regime) setMarketRegime(regimeData as MarketRegimeData);
        }

      } catch (err) {
        console.warn('Backend news API fallback:', err);
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

  return { newsFeed, marketRegime, isLoading };
}
