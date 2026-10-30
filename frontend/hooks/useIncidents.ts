'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/authContext';
import { SingleFlightRequest } from '@/lib/dashboardMemoryCache';
import { isDocumentVisible, subscribeVisibility } from '@/lib/visibility';
import type { IncidentSummary } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000; // 15-second passive poll

export interface UseIncidentsOptions {
  /**
   * Bootstrap seed (`sections.incidents.data.items`). When present the first
   * network fetch is skipped — the snapshot already answered — and only the
   * 15 s poll runs. An empty array is a real seed (verified empty), not "no seed".
   */
  initialData?: IncidentSummary[] | null;
  /** False while the bootstrap snapshot is still loading (M8 phase 163b). */
  enabled?: boolean;
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

export function useIncidents(options?: UseIncidentsOptions) {
  const { user, role } = useAuth();
  const identityKey = JSON.stringify([user?.id ?? 'guest', role, user?.company_id ?? null]);
  const enabled = options?.enabled ?? true;
  const seeded = Array.isArray(options?.initialData) ? options.initialData : null;
  const hasSeed = seeded !== null;

  const [incidents, setIncidents] = useState<IncidentSummary[]>(seeded ?? []);
  const [loading, setLoading] = useState(!hasSeed);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const requestGateRef = useRef(new SingleFlightRequest());
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;
  const hasSeedRef = useRef(hasSeed);
  const wasDisabledRef = useRef(false);
  hasSeedRef.current = hasSeed;

  const previousIdentityKeyRef = useRef(identityKey);
  useEffect(() => {
    if (previousIdentityKeyRef.current === identityKey) return;
    previousIdentityKeyRef.current = identityKey;
    setIncidents(seeded ?? []);
    setLoading(!hasSeed);
    setError(null);
    setLastUpdated(null);
  }, [identityKey, seeded, hasSeed]);

  const fetchIncidents = useCallback(async () => {
    const requestIdentity = identityKey;
    const controller = requestGateRef.current.begin();
    if (!controller) return;
    try {
      const res = await api.incidents.list({ limit: 100 }, controller.signal);
      if (controller.signal.aborted || identityKeyRef.current !== requestIdentity) return;
      setIncidents(res.items);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted || identityKeyRef.current !== requestIdentity) return;
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
    } finally {
      requestGateRef.current.finish(controller);
      if (!controller.signal.aborted && identityKeyRef.current === requestIdentity) setLoading(false);
    }
  }, [identityKey]);

  // A seed can arrive after mount (bootstrap resolves a few hundred ms later).
  // Apply it once, and only when we still have nothing of our own.
  useEffect(() => {
    if (!seeded || identityKeyRef.current !== identityKey) return;
    setIncidents((prev) => (prev.length > 0 ? prev : seeded));
    setLastUpdated((prev) => prev ?? new Date());
    setLoading(false);
  }, [seeded, identityKey]);

  useEffect(() => {
    if (!enabled) return;
    const requestGate = requestGateRef.current;
    const shouldRefreshSeed = wasDisabledRef.current;
    wasDisabledRef.current = false;

    const tick = () => {
      if (!isDocumentVisible()) return;
      void fetchIncidents();
    };

    // Seeded: the snapshot is the first answer, so wait for the first poll
    // instead of duplicating it on mount.
    if (!hasSeedRef.current || shouldRefreshSeed) tick();

    const timer = setInterval(tick, POLL_INTERVAL_MS);
    // Resume immediately when a hidden tab becomes visible again.
    const unsubscribe = subscribeVisibility((visible) => {
      if (visible) tick();
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
      wasDisabledRef.current = true;
      requestGate.abort();
    };
  }, [enabled, fetchIncidents]);

  return { incidents, loading, error, lastUpdated, refetch: fetchIncidents };
}
