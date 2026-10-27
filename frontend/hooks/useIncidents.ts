'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
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
  const enabled = options?.enabled ?? true;
  const seeded = Array.isArray(options?.initialData) ? options.initialData : null;
  const hasSeed = seeded !== null;

  const [incidents, setIncidents] = useState<IncidentSummary[]>(seeded ?? []);
  const [loading, setLoading] = useState(!hasSeed);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const inFlightRef = useRef<AbortController | null>(null);
  const hasSeedRef = useRef(hasSeed);
  hasSeedRef.current = hasSeed;

  const fetchIncidents = useCallback(async () => {
    // One request at a time: a slow poll must never stack behind the previous one.
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    try {
      const res = await api.incidents.list({ limit: 100 }, controller.signal);
      if (controller.signal.aborted) return;
      setIncidents(res.items);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // A seed can arrive after mount (bootstrap resolves a few hundred ms later).
  // Apply it once, and only when we still have nothing of our own.
  useEffect(() => {
    if (!seeded) return;
    setIncidents((prev) => (prev.length > 0 ? prev : seeded));
    setLastUpdated((prev) => prev ?? new Date());
    setLoading(false);
  }, [seeded]);

  useEffect(() => {
    if (!enabled) return;

    const tick = () => {
      if (!isDocumentVisible()) return;
      void fetchIncidents();
    };

    // Seeded: the snapshot is the first answer, so wait for the first poll
    // instead of duplicating it on mount.
    if (!hasSeedRef.current) tick();

    const timer = setInterval(tick, POLL_INTERVAL_MS);
    // Resume immediately when a hidden tab becomes visible again.
    const unsubscribe = subscribeVisibility((visible) => {
      if (visible) tick();
    });

    return () => {
      clearInterval(timer);
      unsubscribe();
      inFlightRef.current?.abort();
    };
  }, [enabled, fetchIncidents]);

  return { incidents, loading, error, lastUpdated, refetch: fetchIncidents };
}
