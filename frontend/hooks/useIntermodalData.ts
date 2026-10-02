'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type {
  ChokePointItem,
  ChokePointsListResponse,
  HedgingSolveRequest,
  HedgingSolveResponse,
  ComplianceVerifyRequest,
  ComplianceVerifyResponse
} from '@/lib/types';

const POLL_INTERVAL_MS = 20_000; // 20-second telemetry polling

// Authoritative Fallback Choke-Points
const FALLBACK_CHOKEPOINTS: ChokePointItem[] = [
  {
    id: "PORT_BELAWAN",
    name: "Pelabuhan Belawan",
    type: "SEAPORT",
    coords: [98.6776, 3.7922],
    province: "Sumatera Utara",
    status: "CONGESTED",
    dwelling_time_hours: 4.5,
    queue_count: 14,
    intermodal_delay_multiplier: 1.11,
    hazard_type: "VESSEL_ANCHORAGE_WAIT",
    capacity: 40,
    updated_at: new Date().toISOString()
  },
  {
    id: "PORT_BAKAUHENI",
    name: "Pelabuhan Penyeberangan Bakauheni",
    type: "FERRY_TERMINAL",
    coords: [105.7533, -5.8711],
    province: "Lampung",
    status: "RESTRICTED",
    dwelling_time_hours: 5.2,
    queue_count: 22,
    intermodal_delay_multiplier: 1.33,
    hazard_type: "TIDAL_SURGE_FERRY_DELAY",
    capacity: 60,
    updated_at: new Date().toISOString()
  },
  {
    id: "PASS_SITINJAU_LAUIK",
    name: "Tanjakan Sitinjau Lauik",
    type: "MOUNTAIN_PASS",
    coords: [100.5186, -0.9458],
    province: "Sumatera Barat",
    status: "CONGESTED",
    dwelling_time_hours: 3.0,
    queue_count: 18,
    intermodal_delay_multiplier: 1.14,
    hazard_type: "LANDSLIDE_STEEP_GRADE",
    capacity: 25,
    updated_at: new Date().toISOString()
  },
  {
    id: "PASS_MALALAK",
    name: "Jalur Lingkar Malalak",
    type: "MOUNTAIN_PASS",
    coords: [100.2789, -0.3242],
    province: "Sumatera Barat",
    status: "RESTRICTED",
    dwelling_time_hours: 4.0,
    queue_count: 12,
    intermodal_delay_multiplier: 1.18,
    hazard_type: "FLASH_FLOOD_LANDSLIDE",
    capacity: 20,
    updated_at: new Date().toISOString()
  },
  {
    id: "JUNCTION_TEBING_TINGGI",
    name: "Interchange Tebing Tinggi",
    type: "TOLL_HIGHWAY_JUNCTION",
    coords: [99.1625, 3.3285],
    province: "Sumatera Utara",
    status: "CONGESTED",
    dwelling_time_hours: 1.5,
    queue_count: 25,
    intermodal_delay_multiplier: 1.19,
    hazard_type: "CONVERGENCE_CONGESTION",
    capacity: 50,
    updated_at: new Date().toISOString()
  },
  {
    id: "JUNCTION_BETUNG_PALEMBANG",
    name: "Bottleneck Betung - Palembang",
    type: "HIGHWAY_BOTTLENECK",
    coords: [104.5100, -2.8500],
    province: "Sumatera Selatan",
    status: "CONGESTED",
    dwelling_time_hours: 2.5,
    queue_count: 30,
    intermodal_delay_multiplier: 1.23,
    hazard_type: "SINGLE_LANE_CHOKE",
    capacity: 30,
    updated_at: new Date().toISOString()
  }
];

export function useIntermodalData() {
  const [chokePoints, setChokePoints] = useState<ChokePointItem[]>(FALLBACK_CHOKEPOINTS);
  const [congestedCount, setCongestedCount] = useState<number>(4);
  const [restrictedCount, setRestrictedCount] = useState<number>(2);
  const [totalCount, setTotalCount] = useState<number>(18);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchChokePoints = useCallback(async () => {
    try {
      const res: ChokePointsListResponse = await api.intermodal.listChokePoints();
      if (res && res.items && res.items.length > 0) {
        setChokePoints(res.items);
        setCongestedCount(res.congested_count);
        setRestrictedCount(res.restricted_count);
        setTotalCount(res.total);
      }
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.warn('[useIntermodalData] Fallback to pre-cached choke-points:', err);
      // Keep fallback data active
      setError(err instanceof Error ? err.message : 'Failed to fetch choke-points');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChokePoints();
    const timer = setInterval(fetchChokePoints, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchChokePoints]);

  const solveHedging = useCallback(
    async (req: HedgingSolveRequest, inflationShock: number = 0.05): Promise<HedgingSolveResponse> => {
      return await api.intermodal.solveHedging(req, inflationShock);
    },
    []
  );

  const verifyCompliance = useCallback(
    async (req: ComplianceVerifyRequest): Promise<ComplianceVerifyResponse> => {
      return await api.intermodal.verifyCompliance(req);
    },
    []
  );

  return {
    chokePoints,
    congestedCount,
    restrictedCount,
    totalCount,
    loading,
    error,
    lastUpdated,
    refetch: fetchChokePoints,
    solveHedging,
    verifyCompliance
  };
}
