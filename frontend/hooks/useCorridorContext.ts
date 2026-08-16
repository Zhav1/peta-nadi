'use client';

import { useState, useEffect, useCallback } from 'react';
import { CorridorContext } from '@/lib/types';

const DEFAULT_FALLBACK_CORRIDOR: CorridorContext = {
  corridor_id: 'sumatra_belawan_medan',
  corridor_name: 'Koridor Strategis Distribusi Pangan Sumatera Utara (Belawan - Medan)',
  timestamp: new Date().toISOString(),
  weather: {
    status: 'MODERATE_RAIN',
    rainfall_mm: 68.5,
    visibility: '7 km',
    alert_summary: 'Peringatan Dini BMKG: Hujan Lebat Disertai Angin Kencang di Sektor Belawan-Medan',
    code: 60,
    location: 'Medan-Belawan'
  },
  traffic: {
    congestion_level_pct: 74.2,
    delay_minutes: 35,
    active_incidents: 2,
    flow_speed_kmh: 22.5,
    status: 'HEAVY_CONGESTION',
    checkpoints: [
      { name: 'Belawan Toll Gate', speed: 18.0, congestion_pct: 82.0, status: 'critical' },
      { name: 'Tanjung Mulia Interchange', speed: 25.0, congestion_pct: 65.0, status: 'medium' },
      { name: 'Binjai Km 18', speed: 45.0, congestion_pct: 30.0, status: 'low' }
    ]
  },
  commodity_prices: {
    chili_price: 48500,
    rice_price: 14200,
    cooking_oil_price: 18500,
    price_anomaly_detected: true,
    inflation_trend_pct: 12.8,
    commodities: [
      { name: 'Cabai Merah', price_idr: 48500, deviation_pct: 18.2, status: 'spike' },
      { name: 'Beras Medium', price_idr: 14200, deviation_pct: 4.5, status: 'normal' },
      { name: 'Minyak Goreng', price_idr: 18500, deviation_pct: 6.8, status: 'elevated' }
    ]
  },
  data_integrity: {
    bmkg_status: 'healthy',
    tomtom_status: 'healthy',
    pihps_status: 'healthy',
    consensus_confidence: 0.92
  }
};

export function useCorridorContext(corridorId: string = 'sumatra_belawan_medan') {
  const [corridorContext, setCorridorContext] = useState<CorridorContext | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCorridor = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/v1/corridor/context?corridor_id=${corridorId}`, {
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      setCorridorContext(data);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch corridor telemetry';
      setError(msg);
      // If we don't have context yet, initialize with default fallback so UI doesn't break
      setCorridorContext((prev) => prev || DEFAULT_FALLBACK_CORRIDOR);
    } finally {
      setIsLoading(false);
    }
  }, [corridorId]);

  useEffect(() => {
    fetchCorridor();
    const interval = setInterval(fetchCorridor, 30000); // 30s polling
    return () => clearInterval(interval);
  }, [fetchCorridor]);

  return { corridorContext, isLoading, error, refetch: fetchCorridor };
}
