'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { SingleFlightRequest } from '@/lib/dashboardMemoryCache';
import { isDocumentVisible, subscribeVisibility } from '@/lib/visibility';
import { PUBLIC_DASHBOARD_CACHE_KEY, readPublicCache, writePublicCache } from '@/lib/publicCache';
import {
  isUsefulPublicSnapshot,
  markPublicSnapshotStale,
  normalizePublicSnapshot,
} from '@/lib/publicSnapshot';
import type { DashboardBootstrapResponse } from '@/lib/types';

/**
 * Phase 163b (M8) — the dashboard's single first-paint read.
 *
 * Reads one shared, anonymous snapshot for both guest and authenticated users.
 * Public data never waits for auth and never fans out to live providers from here.
 *
 * Behaviour contract:
 * - one shared fetch per mount, aborted on unmount;
 * - no `isLoading` flicker on refresh: `isLoading` is only true before the first
 *   answer, so a caller can gate dependent hooks on it without re-mounting them;
 * - a bounded 30 s public-snapshot refresh only while visible, plus manual refresh;
 * - `stale` mirrors the backend flag and additionally reports a locally-old
 *   `computed_at` (> 600 s = 2 x the 5-minute tick), so a cached 200 cannot look
 *   fresh after the tab slept for an hour.
 */

/** Snapshot older than 2 x the 300 s tick cadence counts as stale (server rule). */
const STALE_AFTER_MS = 600_000;
const DEFAULT_REFRESH_INTERVAL_MS = 30_000;

export interface UseDashboardBootstrapOptions {
  modality?: 'truck' | 'vessel' | 'air';
  corridorId?: string;
  /** Compatibility option; this hook always reads the public-only snapshot. */
  sections?: 'all' | 'public' | 'tenant';
  /** False only when the public snapshot request itself must be paused. */
  enabled?: boolean;
  refreshIntervalMs?: number;
}

export interface UseDashboardBootstrapResult {
  data: DashboardBootstrapResponse | null;
  isLoading: boolean;
  error: string | null;
  stale: boolean;
  refresh: () => void;
}

function isLocallyStale(computedAt: string | null | undefined): boolean {
  if (!computedAt) return false;
  const parsed = Date.parse(computedAt);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed > STALE_AFTER_MS;
}

export function useDashboardBootstrap(
  options?: UseDashboardBootstrapOptions
): UseDashboardBootstrapResult {
  const enabled = options?.enabled ?? true;

  const refreshIntervalMs = options?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  const [data, setData] = useState<DashboardBootstrapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localStale, setLocalStale] = useState(false);

  const requestGateRef = useRef(new SingleFlightRequest());
  const mountedRef = useRef(false);
  const lastFetchAtRef = useRef<number>(0);
  const hasAnswerRef = useRef(false);
  const latestSnapshotRef = useRef<DashboardBootstrapResponse | null>(null);
  const dataReadyMarkedRef = useRef(false);

  const fetchBootstrap = useCallback(async () => {
    if (!enabled) return;
    const controller = requestGateRef.current.begin();
    if (!controller) return;

    if (!hasAnswerRef.current) setIsLoading(true);
    try {
      const raw = await api.dashboard.publicSnapshot(controller.signal);
      if (controller.signal.aborted || !mountedRef.current) return;
      const response = normalizePublicSnapshot(raw);
      setError(null);
      if (isUsefulPublicSnapshot(response)) {
        latestSnapshotRef.current = response;
        setData(response);
        writePublicCache(PUBLIC_DASHBOARD_CACHE_KEY, response);
        if (!dataReadyMarkedRef.current && typeof performance !== 'undefined') {
          performance.mark('dashboard-public-data-ready');
          dataReadyMarkedRef.current = true;
        }
        setLocalStale(isLocallyStale(response.computed_at) || response.stale);
      } else if (!isUsefulPublicSnapshot(latestSnapshotRef.current ?? response)) {
        latestSnapshotRef.current = response;
        setData(response);
        setLocalStale(false);
      } else {
        const retained = markPublicSnapshotStale(latestSnapshotRef.current as DashboardBootstrapResponse);
        latestSnapshotRef.current = retained;
        setData(retained);
        setLocalStale(true);
      }
      lastFetchAtRef.current = Date.now();
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Gagal memuat snapshot publik');
      const lastGood = latestSnapshotRef.current ?? readPublicCache<DashboardBootstrapResponse>(PUBLIC_DASHBOARD_CACHE_KEY);
      if (lastGood && isUsefulPublicSnapshot(lastGood)) {
        const retained = markPublicSnapshotStale(lastGood);
        latestSnapshotRef.current = retained;
        setData(retained);
        setLocalStale(true);
      }
    } finally {
      requestGateRef.current.finish(controller);
      if (!controller.signal.aborted && mountedRef.current) {
        hasAnswerRef.current = true;
        setIsLoading(false);
      }
    }
  }, [enabled]);

  useEffect(() => {
    const requestGate = requestGateRef.current;
    mountedRef.current = true;
    const cached = readPublicCache<DashboardBootstrapResponse>(PUBLIC_DASHBOARD_CACHE_KEY);
    if (cached) {
      const normalized = normalizePublicSnapshot(cached);
      if (isUsefulPublicSnapshot(normalized)) {
        const stale = markPublicSnapshotStale(normalized);
        latestSnapshotRef.current = stale;
        setData(stale);
        setLocalStale(true);
        hasAnswerRef.current = true;
        setIsLoading(false);
        if (!dataReadyMarkedRef.current && typeof performance !== 'undefined') {
          performance.mark('dashboard-public-data-ready');
          dataReadyMarkedRef.current = true;
        }
      }
    }
    return () => {
      mountedRef.current = false;
      requestGate.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const requestGate = requestGateRef.current;
    void fetchBootstrap();

    const interval = setInterval(() => {
      if (!isDocumentVisible()) return;
      void fetchBootstrap();
    }, refreshIntervalMs);

    // Waking the tab re-reads the snapshot if the last answer is older than the
    // interval, so a long-hidden tab does not render hour-old data as fresh.
    const unsubscribe = subscribeVisibility((visible) => {
      if (!visible) return;
      if (Date.now() - lastFetchAtRef.current < refreshIntervalMs) return;
      void fetchBootstrap();
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
      requestGate.abort();
    };
  }, [enabled, fetchBootstrap, refreshIntervalMs]);

  // Local clock moves independently of the network: recompute staleness between refreshes.
  useEffect(() => {
    const timer = setInterval(() => {
      setLocalStale(Boolean(data?.stale) || isLocallyStale(data?.computed_at));
    }, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [data?.computed_at, refreshIntervalMs]);

  const refresh = useCallback(() => {
    void fetchBootstrap();
  }, [fetchBootstrap]);

  return {
    data,
    isLoading,
    error,
    stale: Boolean(data?.stale) || localStale,
    refresh,
  };
}
