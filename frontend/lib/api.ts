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
    historical: () => request<{ items: Record<string, unknown>[]; total: number }>('/api/v1/incidents/historical/episodes'),
    predictive: () => request<{ items: Record<string, unknown>[]; total: number }>('/api/v1/incidents/predictive/risks'),
    osint: () => request<{ items: Record<string, unknown>[]; total: number }>('/api/v1/incidents/osint/feed'),
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
  approvals: {
    create: (body: import('./types').ApprovalPayload) =>
      request<import('./types').ApprovalResponse>('/api/v1/approvals', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    list: (incidentId?: string) => {
      const qs = incidentId ? `?incident_id=${incidentId}` : '';
      return request<import('./types').ApprovalListResponse>(`/api/v1/approvals${qs}`);
    },
  },
  sourceHealth: {
    get: () =>
      request<import('./types').SourceHealthResponse>('/api/v1/health/sources'),
  },
  commodities: {
    prices: (params?: { commodity?: string; region?: string; limit?: number }) => {
      const qs = params
        ? '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v != null) as string[][]).toString()
        : '';
      return request<{ items: Array<{ time: string; commodity: string; region: string; price_idr: number; source: string; metadata: Record<string, unknown> }>; total: number }>(
        `/api/v1/commodities/prices${qs}`
      );
    }
  },
  simulation: {
    chat: (body: { message: string; crisis_id?: string }) =>
      request<{ reply: string }>('/api/simulation/chat', {
        method: 'POST',
        body: JSON.stringify(body)
      })
  },
  corridor: {
    context: (corridorId: string = 'sumatra_belawan_medan') =>
      request<import('./types').CorridorContext>(`/api/v1/corridor/context?corridor_id=${corridorId}`),
  },
  weather: {
    spatialPolygons: () =>
      request<GeoJSON.FeatureCollection>('/api/v1/weather/spatial-polygons'),
  },
  traffic: {
    flowSegments: () =>
      request<{
        segments: Array<{ checkpoint: string; lat: number; lon: number; current_speed_kmh: number; free_flow_speed_kmh: number; congestion_level: 'low' | 'moderate' | 'heavy'; delay_seconds: number }>;
        incidents: Array<Record<string, unknown>>;
        total_segments: number;
        total_incidents: number;
      }>('/api/v1/traffic/flow-segments'),
  },
  routing: {
    optimizeCuOpt: (payload: { origin_id?: string; dest_id?: string; fleet_size?: number; hazard_zones?: Array<Record<string, unknown>> }) =>
      request<{
        status: string;
        solver: string;
        compute_time_ms: number;
        optimization_summary: { travel_time_savings_pct: number; fuel_cost_reduction_pct: number; hazard_segments_avoided: number; tomtom_live_speed_kmh: number };
      }>('/api/v1/routing/optimize-cuopt', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  demo: {
    start: (opts?: { mock_agents?: boolean; offline?: boolean }) =>
      request<{ crisis_id: string; stage: number; total_stages: number }>(
        '/api/demo/start',
        {
          method: 'POST',
          body: JSON.stringify(opts ?? {}),
        }
      ),
    status: (crisisId: string) =>
      request<import('./types').DemoStatus>(`/api/demo/status/${crisisId}`),
    advance: (crisisId: string) =>
      request<{ stage: number; stage_name: string }>(
        `/api/demo/advance/${crisisId}`,
        { method: 'POST' }
      ),
    replay: (crisisId: string) =>
      request<unknown>(`/api/demo/replay/${crisisId}`),
  },
  fleet: {
    vehicles: () =>
      request<{ vehicles: import('./types').FleetVehicle[]; total: number; timestamp: string }>(
        '/api/v1/fleet/vehicles'
      ),
  },
  news: {
    live: () =>
      request<{ items: Array<Record<string, unknown>>; total: number }>('/api/v1/news/live'),
    verify: (claim: string, location: string = 'Koridor Sumut') =>
      request<{ verification_status: string; confidence_score: number; attributions: Array<Record<string, unknown>>; reasoning: string }>(
        `/api/v1/news/verify?claim=${encodeURIComponent(claim)}&location=${encodeURIComponent(location)}`,
        { method: 'POST' }
      ),
    marketRegime: () =>
      request<{ regime: string; active_crisis_indicators: string[]; commodity_volatility_score: number }>(
        '/api/v1/news/market-regime'
      ),
  },
};



