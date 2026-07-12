const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  incidents: {
    list: (params?: { status?: string; severity?: string; limit?: number }) => {
      const qs = params
        ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as string[][]).toString()
        : '';
      return request<{ items: import('./types').IncidentSummary[]; total: number }>(
        `/api/v1/incidents${qs}`
      );
    },
    get: (id: string) =>
      request<import('./types').CrisisState>(`/api/v1/incidents/${id}`),
    simulate: (body: {
      type: string;
      polygon: [number, number][];
      region?: string;
    }) =>
      request<{ scenario_id: string }>('/api/v1/incidents/simulate', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  },
  crisis: {
    process: (payload: {
      type: string;
      source: string;
      severity: string;
      lat?: number;
      lon?: number;
      region?: string;
      title?: string;
      is_simulated?: boolean;
    }) =>
      request<{ crisis_id: string; status: string; overall_confidence: number; validated: boolean; summary?: string }>(
        '/api/crisis/process',
        { method: 'POST', body: JSON.stringify(payload) }
      ),
  },
};
