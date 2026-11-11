'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { SingleFlightRequest } from '@/lib/dashboardMemoryCache';
import { isDocumentVisible, subscribeVisibility } from '@/lib/visibility';
import type { HazardConsensusRecord } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000;

export interface UseHazardConsensusOptions {
  initialData?: HazardConsensusRecord[] | null;
  enabled?: boolean;
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

export function useHazardConsensus(options?: UseHazardConsensusOptions) {
  const { user, role } = useAuth();
  const identityKey = JSON.stringify([user?.id ?? 'guest', role, user?.company_id ?? null]);
  const enabled = options?.enabled ?? true;
  const seeded = Array.isArray(options?.initialData) ? options.initialData : null;
  const hasSeed = seeded !== null;

  const [records, setRecords] = useState<HazardConsensusRecord[]>(seeded ?? []);
  const [loading, setLoading] = useState(!hasSeed && enabled);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(hasSeed ? new Date() : null);

  const requestGateRef = useRef(new SingleFlightRequest());
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;

  const fetchConsensus = useCallback(async (forceRefresh = false) => {
    if (!enabled) return;
    const requestIdentity = identityKey;
    const controller = requestGateRef.current.begin();
    if (!controller) return;

    try {
      const res = await api.hazards.consensus(controller.signal, forceRefresh);
      if (controller.signal.aborted || identityKeyRef.current !== requestIdentity) return;
      setRecords(res.records || []);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted || identityKeyRef.current !== requestIdentity) return;
      setError(err instanceof Error ? err.message : 'Gagal memuat konsensus bahaya');
    } finally {
      requestGateRef.current.finish(controller);
      if (!controller.signal.aborted && identityKeyRef.current === requestIdentity) {
        setLoading(false);
      }
    }
  }, [enabled, identityKey]);

  useEffect(() => {
    if (!enabled) return;
    void fetchConsensus(false);
  }, [enabled, fetchConsensus]);

  useEffect(() => {
    if (!enabled) return;
    let timer: NodeJS.Timeout | null = null;

    const schedulePoll = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        if (isDocumentVisible()) {
          void fetchConsensus(false);
        }
      }, POLL_INTERVAL_MS);
    };

    schedulePoll();
    const unsubscribe = subscribeVisibility((visible) => {
      if (visible) {
        void fetchConsensus(false);
        schedulePoll();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    });

    return () => {
      if (timer) clearInterval(timer);
      unsubscribe();
    };
  }, [enabled, fetchConsensus]);

  return {
    records,
    isLoading: loading,
    error,
    lastUpdated,
    refetch: () => fetchConsensus(true),
  };
}
