'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardMemoryCache } from '@/lib/dashboardMemoryCache';
import { subscribeVisibility } from '@/lib/visibility';

const VISIBILITY_REVALIDATE_AFTER_MS = 60_000;

interface ResourceState<T> {
  key: string;
  data: T | null;
  updatedAt: number | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
}

export interface DashboardCachedResource<T> extends ResourceState<T> {
  refresh: () => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Gagal memuat data.';
}

export function useDashboardCachedResource<T>(
  key: string,
  load: () => Promise<T>,
  enabled = true,
): DashboardCachedResource<T> {
  const loadRef = useRef(load);
  loadRef.current = load;
  const keyRef = useRef(key);
  keyRef.current = key;
  const requestIdRef = useRef(0);
  const inFlightCountRef = useRef(0);
  const lastSuccessAtRef = useRef(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => {
    const cached = dashboardMemoryCache.get<T>(key);
    return {
      key,
      data: cached?.value ?? null,
      updatedAt: cached?.updatedAt ?? null,
      isLoading: enabled && !cached,
      isRefreshing: enabled,
      error: null,
    };
  });

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const requestId = ++requestIdRef.current;
    const cached = dashboardMemoryCache.get<T>(key);
    const generation = dashboardMemoryCache.generation;
    inFlightCountRef.current += 1;

    setState({
      key,
      data: cached?.value ?? null,
      updatedAt: cached?.updatedAt ?? null,
      isLoading: !cached,
      isRefreshing: true,
      error: null,
    });

    void Promise.resolve().then(() => loadRef.current()).then(
      (data) => {
        if (
          requestId !== requestIdRef.current ||
          keyRef.current !== key ||
          generation !== dashboardMemoryCache.generation
        ) return;
        dashboardMemoryCache.set(key, data, generation);
        lastSuccessAtRef.current = Date.now();
        if (!active) return;
        setState({
          key,
          data,
          updatedAt: Date.now(),
          isLoading: false,
          isRefreshing: false,
          error: null,
        });
      },
      (error: unknown) => {
        if (!active || requestId !== requestIdRef.current || keyRef.current !== key) return;
        const lastGood = dashboardMemoryCache.get<T>(key) ?? cached;
        setState({
          key,
          data: lastGood?.value ?? null,
          updatedAt: lastGood?.updatedAt ?? null,
          isLoading: false,
          isRefreshing: false,
          error: errorMessage(error),
        });
      },
    ).finally(() => {
      inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
    });

    return () => {
      active = false;
    };
  }, [enabled, key, refreshToken]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeVisibility((visible) => {
      if (!visible || inFlightCountRef.current > 0) return;
      if (Date.now() - lastSuccessAtRef.current < VISIBILITY_REVALIDATE_AFTER_MS) return;
      setRefreshToken((value) => value + 1);
    });
  }, [enabled]);

  const refresh = useCallback(() => {
    if (inFlightCountRef.current > 0) return;
    setRefreshToken((value) => value + 1);
  }, []);
  const cached = dashboardMemoryCache.get<T>(key);
  const matchesKey = state.key === key;
  const data = matchesKey ? state.data : cached?.value ?? null;
  const updatedAt = matchesKey ? state.updatedAt : cached?.updatedAt ?? null;

  return {
    key,
    data,
    updatedAt,
    isLoading: matchesKey ? state.isLoading : enabled && !cached,
    isRefreshing: matchesKey ? state.isRefreshing : enabled,
    error: matchesKey ? state.error : null,
    refresh,
  };
}
