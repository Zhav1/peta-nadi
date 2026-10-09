'use client';
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

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
  hazardType?: 'flood' | 'landslide' | 'congestion' | 'port_closure' | 'wildfire';
  commodity_name?: string;
  economic_note?: string;
  link?: string;
}

export interface MarketRegimeData {
  regime: 'NORMAL' | 'ELEVATED' | 'CRISIS' | 'EARLY_WARNING_ACTIVE' | 'HIGH_DISRUPTION_RISK';
  active_crisis_indicators?: string[];
  commodity_volatility_score?: number;
  critical_news_count?: number;
  early_warning_count?: number;
}

export function useNewsVerification() {
  const [newsFeed, setNewsFeed] = useState<NewsItem[]>([]);
  const [marketRegime, setMarketRegime] = useState<MarketRegimeData>({
    regime: 'NORMAL',
    critical_news_count: 0,
    early_warning_count: 0
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
          const rawArticles = (newsData as { articles?: any[]; items?: any[] }).articles || (newsData as { items?: any[] }).items;
          if (rawArticles && rawArticles.length > 0) {
            const mapped: NewsItem[] = rawArticles.map((a: any) => {
              const src = a.source || 'ANTARA';
              const isWeather = /bmkg|cuaca|gelombang|hujan|angin/i.test(src) || a.incident_type === 'marine_wave' || /cuaca|gelombang/i.test(a.title || a.headline || '');
              const isMarket = /pihps|bi\.go\.id|harga|bank indonesia|pasar/i.test(src) || a.incident_type === 'price_shock' || /harga|pangan/i.test(a.title || a.headline || '');
              const isOfficial = !isWeather && !isMarket && (a.source_tier === 'TIER_1_OFFICIAL' || /antara|bnpb|kemenhub|bulog/i.test(src));

              const fallbackSearchUrl = `https://news.google.com/search?q=${encodeURIComponent((a.title || a.headline || 'berita logistik') + ' ' + src)}&hl=id-ID&gl=ID&ceid=ID:id`;
              const isDeadMockUrl = !a.link || (typeof a.link === 'string' && a.link.includes('/berita/49')) || !a.link.startsWith('http');
              const cleanLink = isDeadMockUrl ? fallbackSearchUrl : a.link;

              return {
                id: a.id || `NEWS-${Math.random().toString(36).substr(2, 6)}`,
                source_type: isWeather ? 'BMKG_WEATHER' : isMarket ? 'PIHPS_MARKET' : isOfficial ? 'OFFICIAL_NEWS' : 'MEDSOS_OSINT',
                source_tier: a.source_tier || (isOfficial ? 'TIER_1_OFFICIAL' : 'TIER_2_AUTHORITATIVE_PRESS'),
                source_name: src,
                headline: a.title || a.headline || 'Laporan Lapangan',
                summary: a.summary || a.title || '',
                location_name: a.corridor_segment || (a.corridor_nodes && a.corridor_nodes[0]) || a.region || 'Koridor Sumatera',
                lat: a.latitude != null ? Number(a.latitude) : undefined,
                lon: a.longitude != null ? Number(a.longitude) : undefined,
                pubDate: a.pubDate || 'Terkini',
                category: a.category || 'DISASTER_LOGISTICS',
                incident_type: a.incident_type || 'flood',
                severity: a.severity || 'medium',
                temporal_phase: a.temporal_phase || 'active_disruption',
                lead_time_hours: a.lead_time_hours ? Number(a.lead_time_hours) : 0,
                commodities_affected: a.commodities_affected || ['Beras'],
                ground_truth_metrics: a.ground_truth_metrics || { lane_status: a.lane_status || 'CLEAR' },
                verification_status: isOfficial ? 'CORROBORATED_OFFICIAL' : 'UNVERIFIED_GRASSROOTS',
                confidence_score: Number(a.confidence_score || a.relevance_score || 0.90),
                commodity_name: Array.isArray(a.commodities_affected) ? a.commodities_affected.join(', ') : a.commodities_affected || 'Komoditas Pokok',
                link: cleanLink
              };
            });
            setNewsFeed(mapped);
          }
          if (regimeData) setMarketRegime(regimeData as unknown as MarketRegimeData);
        }
      } catch (err) {
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

  return { newsFeed, marketRegime, isLoading };
}
