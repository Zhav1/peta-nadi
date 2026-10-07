const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

let currentAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentAuthToken = token;
}

export function getAuthToken(): string | null {
  return currentAuthToken;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
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
    assessImpact: (body: import('./types').DisruptionImpactRequest) =>
      request<import('./types').DisruptionImpactResponse>('/api/v1/incidents/impact-assessment', {
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
  outcomes: {
    record: (body: import('./types').OutcomePayload) =>
      request<{ id: string; incident_id: string; horizon: string; status: string }>('/api/v1/outcomes', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    list: (incidentId?: string, horizon?: string) => {
      const params = new URLSearchParams();
      if (incidentId) params.append('incident_id', incidentId);
      if (horizon) params.append('horizon', horizon);
      const qs = params.toString() ? `?${params.toString()}` : '';
      return request<import('./types').OutcomeListResponse>(`/api/v1/outcomes${qs}`);
    },
    evaluation: (incidentId: string) =>
      request<import('./types').OutcomeEvaluationReport>(`/api/v1/outcomes/evaluation/${incidentId}`),
    benchmarkSummary: () =>
      request<any>('/api/v1/outcomes/benchmark/summary'),
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
    chat: (body: { message: string; crisis_id?: string; agency?: string; parameters?: Record<string, any> }) =>
      request<{ reply: string; thought_signature?: string; confidence_score?: number }>('/api/simulation/chat', {
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
    vehicles: (modality?: string) =>
      request<{ vehicles: import('./types').FleetVehicle[]; total_vehicles?: number; timestamp?: string }>(
        modality && modality !== 'all'
          ? `/api/v1/fleet/vehicles?modality=${encodeURIComponent(modality)}`
          : '/api/v1/fleet/vehicles'
      ),
    register: (payload: import('./types').CustomVehicleRegisterPayload) =>
      request<import('./types').FleetIngestResponse>('/api/v1/fleet/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    uploadManifest: (payload: { vehicles?: import('./types').CustomVehicleRegisterPayload[]; csv_text?: string; manifest_name?: string; notes?: string }) =>
      request<import('./types').FleetIngestResponse>('/api/v1/fleet/upload-manifest', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    uploadManifestFile: async (file: File, manifestName?: string) => {
      const formData = new FormData();
      formData.append('file', file);
      if (manifestName) formData.append('manifest_name', manifestName);
      
      const headers: Record<string, string> = {};
      if (currentAuthToken) {
        headers['Authorization'] = `Bearer ${currentAuthToken}`;
      }
      
      const res = await fetch(`${BASE_URL}/api/v1/fleet/upload-manifest/file`, {
        method: 'POST',
        headers,
        body: formData,
      });
      if (!res.ok) throw new Error(`API /api/v1/fleet/upload-manifest/file → ${res.status}`);
      return res.json() as Promise<import('./types').FleetIngestResponse>;
    },
    ingestTelemetry: (payload: import('./types').TMSWebhookPingPayload) =>
      request<{ status: string; message: string; data: any }>('/api/v1/fleet/telemetry/ingest', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listCustom: (modality?: string) => {
      const qs = modality && modality !== 'all' ? `?modality=${encodeURIComponent(modality)}` : '';
      return request<import('./types').FleetVehicle[]>(`/api/v1/fleet/custom${qs}`);
    },
    deleteCustom: (vehicleId: string) =>
      request<{ status: string; message: string; vehicle_id: string }>(`/api/v1/fleet/custom/${encodeURIComponent(vehicleId)}`, {
        method: 'DELETE',
      }),
    getManifestTemplate: () =>
      request<import('./types').ManifestTemplateInfo>('/api/v1/fleet/manifest/template'),
    simulatePing: (payload: import('./types').TMSWebhookPingPayload) =>
      request<{ status: string; message: string; data: any }>('/api/v1/fleet/telemetry/simulate-ping', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  news: {
    live: () =>
      request<{ items: Array<Record<string, unknown>>; total: number }>('/api/v1/news/live'),
    verify: (claim: string, location: string = 'Koridor Sumatera') =>
      request<{ verification_status: string; confidence_score: number; attributions: Array<Record<string, unknown>>; reasoning: string }>(
        `/api/v1/news/verify?claim=${encodeURIComponent(claim)}&location=${encodeURIComponent(location)}`,
        { method: 'POST' }
      ),
    marketRegime: () =>
      request<{ regime: string; active_crisis_indicators: string[]; commodity_volatility_score: number }>(
        '/api/v1/news/market-regime'
      ),
  },
  evaluation: {
    getBenchmark: () =>
      request<import('./types').BenchmarkReportResponse>('/api/v1/evaluation/benchmark'),
    getTestMatrix: (params?: { fr_id?: string; search?: string }) => {
      const sp = new URLSearchParams();
      if (params?.fr_id && params.fr_id !== 'all') sp.append('fr_id', params.fr_id);
      if (params?.search) sp.append('search', params.search);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request<import('./types').TestMatrixResponse>(`/api/v1/evaluation/test-matrix${qs}`);
    },
    getCorridorEfficiency: () =>
      request<import('./types').CorridorEfficiencyResponse>('/api/v1/evaluation/corridor-efficiency'),
  },
  auth: {
    me: () =>
      request<import('./types').UserProfile>('/api/v1/auth/me'),
    session: () =>
      request<import('./types').UserProfile>('/api/v1/auth/session'),
    createGuestSession: (payload: { role: string; org_name?: string; name?: string; email?: string }) =>
      request<import('./types').AuthTokenResponse>('/api/v1/auth/guest-session', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    switchRole: (role: string) =>
      request<import('./types').AuthTokenResponse>('/api/v1/auth/switch-role', {
        method: 'POST',
        body: JSON.stringify({ role }),
      }),
    roles: () =>
      request<import('./types').RoleCatalogItem[]>('/api/v1/auth/roles'),
  },
  intermodal: {
    listChokePoints: (params?: { status?: string; type?: string }) => {
      const sp = new URLSearchParams();
      if (params?.status) sp.append('status_filter', params.status);
      if (params?.type) sp.append('chokepoint_type', params.type);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request<import('./types').ChokePointsListResponse>(`/api/v1/intermodal/chokepoints${qs}`);
    },
    getChokePoint: (id: string) =>
      request<import('./types').ChokePointItem>(`/api/v1/intermodal/chokepoints/${id}`),
    solveHedging: (req: import('./types').HedgingSolveRequest, inflationShock: number = 0.05) =>
      request<import('./types').HedgingSolveResponse>(`/api/v1/intermodal/hedging/solve?inflation_shock_factor=${inflationShock}`, {
        method: 'POST',
        body: JSON.stringify(req),
      }),
    verifyCompliance: (req: import('./types').ComplianceVerifyRequest) =>
      request<import('./types').ComplianceVerifyResponse>('/api/v1/intermodal/compliance/verify', {
        method: 'POST',
        body: JSON.stringify(req),
      }),
    getTollTariffs: () =>
      request<Record<string, any>>('/api/v1/intermodal/toll-tariffs'),
  },
};
