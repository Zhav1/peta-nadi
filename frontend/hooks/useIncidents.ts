'use client';
import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { IncidentSummary } from '@/lib/types';

const POLL_INTERVAL_MS = 15_000; // 15-second passive poll

export function useIncidents() {
  const [incidents, setIncidents] = useState<IncidentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchIncidents = useCallback(async () => {
    try {
      const res = await api.incidents.list({ limit: 100 });
      setIncidents(res.items);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load incidents');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
    const timer = setInterval(fetchIncidents, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchIncidents]);

  return { incidents, loading, error, lastUpdated, refetch: fetchIncidents };
}
