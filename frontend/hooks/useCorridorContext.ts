'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CorridorContext } from '@/lib/types';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { SingleFlightRequest } from '@/lib/dashboardMemoryCache';
import { isDocumentVisible, subscribeVisibility } from '@/lib/visibility';

const DEFAULT_FALLBACK_CORRIDOR: CorridorContext = {
  corridor_id: 'sumatra_belawan_medan',
  corridor_name: 'Koridor Arteri Utama Belawan–Medan–Tebing Tinggi',
  timestamp: new Date().toISOString(),
  is_fallback: true,
  fallback_reasons: [
    'corridor context API unreachable; seeded Belawan–Medan fallback telemetry in use'
  ],
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
    bmkg_status: 'ONLINE',
    tomtom_status: 'ONLINE',
    pihps_status: 'ONLINE',
    consensus_confidence: 0.92
  }
};

export interface OperationalImpact {
  delayMinutes: number;
  fuelIncreasePct: number;
  commoditySpikePct?: number;
}

export interface UseCorridorContextOptions {
  /**
   * Bootstrap seed (`sections.corridor_context.data`). Skips the first network
   * fetch; the 30 s poll keeps it live afterwards.
   */
  initialData?: CorridorContext | null;
  /** False while the bootstrap snapshot is still loading (M8 phase 163b). */
  enabled?: boolean;
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveTrafficStatus(congestionPct: number): string {
  if (congestionPct >= 85) return 'SEVERE_CONGESTION';
  if (congestionPct >= 65) return 'HEAVY_CONGESTION';
  if (congestionPct >= 40) return 'MODERATE_CONGESTION';
  return 'LIGHT_TRAFFIC';
}

function resolveCommodityStatus(deviationPct: number): string {
  if (deviationPct >= 15) return 'spike';
  if (deviationPct >= 5) return 'elevated';
  return 'normal';
}

// Reactive operational recalculation: an approved detour immediately propagates
// into corridor telemetry (speed, delay, congestion) and commodity inflation.
function applyImpactToContext(base: CorridorContext, impact: OperationalImpact): CorridorContext {
  const addedDelayMinutes = Math.max(0, impact.delayMinutes);
  const fuelIncreasePct = Math.max(0, impact.fuelIncreasePct);
  const congestionDelta = clamp(fuelIncreasePct * 0.8 + addedDelayMinutes * 0.35, 0, 100);
  const congestionPct = clamp(base.traffic.congestion_level_pct + congestionDelta, 0, 100);
  const speedFactor = clamp(1 - congestionDelta / 100, 0.15, 1);
  const commoditySpikePct =
    impact.commoditySpikePct ?? round1(fuelIncreasePct * 0.6 + addedDelayMinutes * 0.12);
  const priceFactor = 1 + commoditySpikePct / 100;

  return {
    ...base,
    timestamp: new Date().toISOString(),
    traffic: {
      ...base.traffic,
      congestion_level_pct: round1(congestionPct),
      delay_minutes: Math.round(base.traffic.delay_minutes + addedDelayMinutes),
      flow_speed_kmh: Math.max(5, round1(base.traffic.flow_speed_kmh * speedFactor)),
      status: resolveTrafficStatus(congestionPct),
      checkpoints: base.traffic.checkpoints.map((checkpoint) => {
        const checkpointCongestion = clamp(checkpoint.congestion_pct + congestionDelta, 0, 100);
        return {
          ...checkpoint,
          speed: Math.max(5, round1(checkpoint.speed * speedFactor)),
          congestion_pct: round1(checkpointCongestion),
          status: checkpointCongestion >= 80 ? 'critical' : checkpointCongestion >= 55 ? 'medium' : 'low',
        };
      }),
    },
    commodity_prices: {
      ...base.commodity_prices,
      chili_price: Math.round(base.commodity_prices.chili_price * priceFactor),
      rice_price: Math.round(base.commodity_prices.rice_price * priceFactor),
      cooking_oil_price: Math.round(base.commodity_prices.cooking_oil_price * priceFactor),
      inflation_trend_pct: round1(base.commodity_prices.inflation_trend_pct + commoditySpikePct),
      price_anomaly_detected: base.commodity_prices.price_anomaly_detected || commoditySpikePct > 0,
      commodities: base.commodity_prices.commodities.map((commodity) => {
        const deviationPct = round1(commodity.deviation_pct + commoditySpikePct);
        return {
          ...commodity,
          price_idr: Math.round(commodity.price_idr * priceFactor),
          deviation_pct: deviationPct,
          status: resolveCommodityStatus(deviationPct),
        };
      }),
    },
  };
}

export function useCorridorContext(
  corridorId: string = 'sumatra_belawan_medan',
  options?: UseCorridorContextOptions
) {
  const { user, role } = useAuth();
  const identityKey = JSON.stringify([user?.id ?? 'guest', role, user?.company_id ?? null]);
  const enabled = options?.enabled ?? true;
  const seed = options?.initialData ?? null;
  const hasSeed = seed !== null;

  const [corridorContext, setCorridorContext] = useState<CorridorContext | null>(
    seed ?? DEFAULT_FALLBACK_CORRIDOR
  );
  const [isLoading, setIsLoading] = useState<boolean>(!hasSeed);
  const [error, setError] = useState<string | null>(null);
  const activeImpactRef = useRef<OperationalImpact | null>(null);
  const requestGateRef = useRef(new SingleFlightRequest());
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;
  const hasSeedRef = useRef<boolean>(hasSeed);
  const wasDisabledRef = useRef(false);
  hasSeedRef.current = hasSeed;
  // True once live telemetry (not the fallback/seed) is on screen.
  const fetchedRef = useRef<boolean>(false);

  const fetchCorridor = useCallback(async () => {
    const requestIdentity = identityKey;
    const controller = requestGateRef.current.begin();
    if (!controller) return;
    try {
      // Resolve through getBaseUrl() (via the shared api client) so this hook
      // never points at a stale NEXT_PUBLIC_API_URL or skips the proxy fallback.
      const data = await api.corridor.context(corridorId, controller.signal);
      if (controller.signal.aborted || identityKeyRef.current !== requestIdentity) return;
      const fresh: CorridorContext = { ...data, is_fallback: data.is_fallback === true };
      const activeImpact = activeImpactRef.current;
      setCorridorContext(activeImpact ? applyImpactToContext(fresh, activeImpact) : fresh);
      setError(null);
      fetchedRef.current = true;
    } catch (err: unknown) {
      if (isAbortError(err) || controller.signal.aborted || identityKeyRef.current !== requestIdentity) return;
      const msg = err instanceof Error ? err.message : 'Failed to fetch corridor telemetry';
      setError(msg);
      // If we don't have context yet, initialize with default fallback so UI doesn't break
      setCorridorContext((prev) => prev || DEFAULT_FALLBACK_CORRIDOR);
    } finally {
      requestGateRef.current.finish(controller);
      if (!controller.signal.aborted && identityKeyRef.current === requestIdentity) setIsLoading(false);
    }
  }, [corridorId, identityKey]);

  // Seed arriving after mount: never overwrite live telemetry or an applied
  // operational impact with an older snapshot row.
  useEffect(() => {
    if (!seed || identityKeyRef.current !== identityKey) return;
    if (fetchedRef.current || activeImpactRef.current) return;
    setCorridorContext({ ...seed, is_fallback: seed.is_fallback === true });
    setError(null);
    setIsLoading(false);
  }, [seed, identityKey]);

  // Persist the latest approved-detour impact so the 30s poll can re-base on
  // fresh backend telemetry and reapply the impact instead of losing it.
  const applyOperationalImpact = useCallback((impact: OperationalImpact) => {
    activeImpactRef.current = impact;
    setCorridorContext((prev) => (prev ? applyImpactToContext(prev, impact) : prev));
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const requestGate = requestGateRef.current;
    const shouldRefreshSeed = wasDisabledRef.current;
    wasDisabledRef.current = false;

    const tick = () => {
      if (!isDocumentVisible()) return;
      void fetchCorridor();
    };

    // Seeded by the bootstrap snapshot: the first poll owns freshness, no
    // duplicate mount request.
    if (!hasSeedRef.current || shouldRefreshSeed) tick();

    const interval = setInterval(tick, 30000); // 30s polling
    const unsubscribe = subscribeVisibility((visible) => {
      if (visible) tick();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
      wasDisabledRef.current = true;
      requestGate.abort();
    };
  }, [enabled, fetchCorridor]);

  return { corridorContext, isLoading, error, refetch: fetchCorridor, applyOperationalImpact };
}
