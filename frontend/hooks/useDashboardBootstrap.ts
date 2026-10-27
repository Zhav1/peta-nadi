'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { isDocumentVisible, subscribeVisibility } from '@/lib/visibility';
import type { DashboardBootstrapResponse } from '@/lib/types';

/**
 * Phase 163b (M8) — the dashboard's single first-paint read.
 *
 * Replaces ~25-30 per-section first-mount requests with one auth-aware request
 * that reads the DB-backed snapshot (phase 163a). Live hooks stay mounted on top
 * of it for freshness; this hook only owns the seed.
 *
 * Behaviour contract:
 * - one fetch per mount (and per identity change), aborted on unmount;
 * - no `isLoading` flicker on refresh: `isLoading` is only true before the first
 *   answer, so a caller can gate dependent hooks on it without re-mounting them;
 * - a 60 s refresh only while the document is visible, plus a manual `refresh()`;
 * - `stale` mirrors the backend flag and additionally reports a locally-old
 *   `computed_at` (> 600 s = 2 x the 5-minute tick), so a cached 200 cannot look
 *   fresh after the tab slept for an hour.
 */

/** Snapshot older than 2 x the 300 s tick cadence counts as stale (server rule). */
const STALE_AFTER_MS = 600_000;
const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

export interface UseDashboardBootstrapOptions {
  modality?: 'truck' | 'vessel' | 'air';
  corridorId?: string;
  /**
   * Hold the fetch until the session is resolved. The endpoint is auth-aware
   * (DISPATCHER gets tenant `fleet`/`erp`), so firing before `setAuthToken` runs
   * would fetch the guest shape and seed an operator with empty tenant data.
   */
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
  const modality = options?.modality ?? 'truck';
  const corridorId = options?.corridorId;
  const refreshIntervalMs = options?.refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;

  const [data, setData] = useState<DashboardBootstrapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localStale, setLocalStale] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(false);
  const lastFetchAtRef = useRef<number>(0);
  const hasAnswerRef = useRef(false);

  const fetchBootstrap = useCallback(async () => {
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!hasAnswerRef.current) setIsLoading(true);
    try {
      const response = await api.dashboard.bootstrap(
        { modality, ...(corridorId ? { corridor_id: corridorId } : {}) },
        controller.signal
      );
      if (controller.signal.aborted || !mountedRef.current) return;
      setData(response);
      setLocalStale(isLocallyStale(response.computed_at));
      setError(null);
      lastFetchAtRef.current = Date.now();
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Gagal memuat snapshot dasbor');
      // Never clear `data`: a failed refresh must keep the last good snapshot on
      // screen (the badge marks it stale instead of blanking the dashboard).
    } finally {
      if (!controller.signal.aborted && mountedRef.current) {
        hasAnswerRef.current = true;
        setIsLoading(false);
      }
    }
  }, [enabled, modality, corridorId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
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
      abortRef.current?.abort();
    };
  }, [enabled, fetchBootstrap, refreshIntervalMs]);

  // Local clock moves independently of the network: recompute staleness on the
  // same 60 s cadence so the badge tells the truth between refreshes.
  useEffect(() => {
    const timer = setInterval(() => {
      setLocalStale(isLocallyStale(data?.computed_at));
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
