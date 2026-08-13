'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export interface NewsItem {
  id: string;
  source_type: 'MEDSOS_OSINT' | 'OFFICIAL_NEWS' | 'PIHPS_MARKET';
  headline: string;
  summary: string;
  location_name?: string;
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
    headline: 'Banjir Luapan Sungai Padang Lumpuhkan Jalur Logistik Tebing Tinggi',
    summary: 'Debit air meningkat 120cm menutup badan jalan arteri Jalinsum. Truk kargo terpaksa bertahan di kantong parkir.',
    location_name: 'Interchange Tebing Tinggi',
    verification_status: 'CORROBORATED_OFFICIAL',
    confidence_score: 0.94,
    attributions: [
      { source_name: 'Antara News Sumut', url: 'https://sumut.antaranews.com' },
      { source_name: 'Kompas.com Regional', url: 'https://regional.kompas.com' }
    ],
    commodity_impact: { cabai_merah_pct: 14.2, minyak_goreng_pct: 5.8 }
  },
  {
    id: 'NEWS-002',
    source_type: 'MEDSOS_OSINT',
    headline: 'Laporan Warga: Genangan Air 30cm di Gerbang Tol Belawan',
    summary: 'Postingan TikTok pengemudi truk memperlihatkan kepadatan kendaraan 1 km menuju gerbang tol.',
    location_name: 'Pelabuhan Belawan',
    verification_status: 'UNVERIFIED_GRASSROOTS',
    confidence_score: 0.68,
    attributions: [],
    commodity_impact: { minyak_goreng_pct: 3.1 }
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
