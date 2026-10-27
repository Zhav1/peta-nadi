import {
  PRODUCTION_API_BASE_URL,
  getBaseUrl,
  sanitizeBaseUrl,
} from './baseUrl';

export { PRODUCTION_API_BASE_URL, getBaseUrl, sanitizeBaseUrl };

let currentAuthToken: string | null = null;

export function setAuthToken(token: string | null) {
  currentAuthToken = token;
}

export function getAuthToken(): string | null {
  return currentAuthToken;
}

function isAbortError(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

function createAbortError(message: string = 'Request aborted'): Error {
  const err = new Error(message);
  err.name = 'AbortError';
  return err;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const baseUrl = getBaseUrl();
  const signal = options?.signal;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers,
      signal: options?.signal,
    });
  } catch (err) {
    // A cancelled request must never fall back to the proxy — that would restart
    // the work the caller just aborted.
    if (isAbortError(err) || signal?.aborted) throw err;
    if (typeof window !== 'undefined') {
      res = await fetch(`/api/proxy${path}`, {
        ...options,
        headers: {
          ...headers,
          'x-target-base-url': baseUrl,
        },
      });
    } else {
      throw err;
    }
  }

  if (signal?.aborted) throw createAbortError();
  if (!res.ok) {
    // Preserve the HTTP status so auth code can distinguish "session is dead"
    // (401 → clear token + re-authenticate) from "backend is cold/failing"
    // (5xx → keep the session and retry later).
    const error = new Error(`API ${path} → ${res.status}`) as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
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
    // Alias required by Catat verifikasi hybrid A+C (LaporanAktualModal step-2 +
    // ReportsSection audit deep-link). Same POST /api/v1/outcomes as record;
    // kept separate so call-sites read as api.outcomes.create.
    create: (body: import('./types').OutcomePayload) =>
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
    },
    spikes: (params?: { region?: string }) => {
      const qs = params?.region
        ? `?region=${encodeURIComponent(params.region)}`
        : '';
      return request<{
        spikes: Array<{
          commodity: string;
          region: string;
          current_price: number;
          baseline_price: number;
          spike_pct: number;
          severity: string;
          status: string;
          detected_at: string;
        }>;
        total: number;
      }>(`/api/v1/commodities/spikes${qs}`);
    }
  },
  corridor: {
    context: (corridorId: string = 'sumatra_belawan_medan') =>
      request<import('./types').CorridorContext>(`/api/v1/corridor/context?corridor_id=${corridorId}`),
  },
  weather: {
    spatialPolygons: (params?: { min_severity?: string; min_precip?: number; min_flood?: number }) => {
      const sp = new URLSearchParams();
      // Disruption-only default: only high/critical heavy rain shows.
      sp.append('min_severity', params?.min_severity ?? 'high');
      if (params?.min_precip != null) sp.append('min_precip', String(params.min_precip));
      else if ((params?.min_severity ?? 'high') === 'high') sp.append('min_precip', '50');
      if (params?.min_flood != null) sp.append('min_flood', String(params.min_flood));
      else if ((params?.min_severity ?? 'high') === 'high') sp.append('min_flood', '80');
      const qs = `?${sp.toString()}`;
      return request<GeoJSON.FeatureCollection & {
        metadata?: import('./types').WeatherPolygonMeta;
        meta?: import('./types').WeatherPolygonMeta;
      }>(`/api/v1/weather/spatial-polygons${qs}`);
    },
    // Phase 160: world-truth counters — no severity params, never capped by
    // MAX_WEATHER_FEATURES, independent of the map layer toggles.
    summary: () =>
      request<import('./types').WeatherHazardSummary>('/api/v1/weather/summary'),
  },
  fire: {
    // Phase 168: keyless CSV fallback + tri-state envelope.
    hotspots: () =>
      request<import('./types').FireHotspotResponse>('/api/v1/fire/hotspots'),
  },
  bnpb: {
    events: (params?: { limit?: number }) => {
      const qs = params?.limit != null ? `?limit=${encodeURIComponent(String(params.limit))}` : '';
      return request<{
        events: Array<{
          source: string;
          event_type: string;
          severity: string;
          lat: string | number;
          lon: string | number;
          radius_km?: number;
          title: string;
          ts: string;
          dedup_key: string;
        }>;
        total: number;
        status: 'ok' | 'unavailable';
        reason?: string | null;
        source?: string;
        updated_at?: string | null;
      }>(`/api/v1/bnpb/events${qs}`);
    },
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
    optimizeRouting: (payload: {
      origin_id?: string;
      dest_id?: string;
      origin_coords?: [number, number];
      dest_coords?: [number, number];
      origin_name?: string;
      dest_name?: string;
      fleet_size?: number;
      hazard_zones?: Array<Record<string, unknown>>;
      // Optional grounded hedging economics (backend _enrich_routes_with_hedging).
      // Sent only when the caller supplies them; absent => honest null, no invented Rp.
      commodity?: string;
      cargo_tonnage?: number;
      vehicle_golongan?: string;
      fuel_type?: string;
      toll_segments?: string[];
      p_disruption?: number;
      disruption_delay_hours?: number;
    }, signal?: AbortSignal) =>
      request<{
        status: string;
        is_fallback?: boolean;
        degraded_reason?: string | null;
        solver: string;
        compute_time_ms: number;
        total_pipeline_time_ms?: number;
        optimization_summary: { travel_time_savings_pct?: number | null; fuel_cost_reduction_pct?: number | null; hazard_segments_avoided: number; avg_corridor_speed_kmh: number; speed_source: string };
        point_to_point_path?: { status?: string; message?: string; routes?: Array<{ route_index?: number; hedging?: import('./types').RouteRecommendation['hedging']; distance_km?: number; eta_minutes?: number } & Record<string, unknown>> };
        routes?: Array<Record<string, unknown>>;
      }>('/api/v1/routing/optimize', {
        method: 'POST',
        body: JSON.stringify(payload),
        signal,
      }),
  },
  geocode: {
    nodes: () =>
      request<{ nodes: import('./types').GeocodeNode[]; total: number }>('/api/v1/geocode/nodes'),
    /**
     * Gazetteer search with a hard client timeout.
     *
     * The Render backend cold-starts in 60-80s; without a timeout the fetch
     * hangs forever and the map search spinner never resolves. On timeout we
     * abort and throw a non-Abort error so the UI can say the lookup failed
     * instead of silently showing a partial list.
     */
    search: async (
      q: string,
      signal?: AbortSignal,
      timeoutMs: number = 20000
    ) => {
      const controller = new AbortController();
      const forwardAbort = () => controller.abort();
      if (signal) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', forwardAbort, { once: true });
      }
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await request<{
          results: import('./types').GeocodeSearchResult[];
          query: string;
          count?: number;
          status?: string;
        }>(`/api/v1/geocode/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
      } catch (err) {
        if (isAbortError(err) && !(signal?.aborted)) {
          throw new Error(`Pencarian backend melebihi ${Math.round(timeoutMs / 1000)} detik`);
        }
        throw err;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', forwardAbort);
      }
    },
    reverse: (lat: number, lon: number) =>
      request<import('./types').GeocodeSearchResult>(`/api/v1/geocode/reverse?lat=${lat}&lon=${lon}`),
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
    // Phase 57 STEP 0 tenant contract (D3): ?company_id= filters custom +
    // baseline; missing claim = honest empty (dispatcher) / full corridor
    // (regulator, macro view). Enforced in WP-B3.
    vehicles: (modality?: string, company_id?: string, include_geometry?: boolean) => {
      const sp = new URLSearchParams();
      if (modality && modality !== 'all') sp.append('modality', modality);
      if (company_id) sp.append('company_id', company_id);
      if (include_geometry !== undefined) sp.append('include_geometry', String(include_geometry));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request<{ vehicles: import('./types').FleetVehicle[]; total_vehicles?: number; timestamp?: string }>(
        `/api/v1/fleet/vehicles${qs}`
      );
    },
    vehicleGeometry: (vehicleId: string) =>
      request<{ status: string; vehicle_id: string; route_geometry?: any; path: [number, number][] }>(
        `/api/v1/fleet/vehicles/${encodeURIComponent(vehicleId)}/geometry`
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
      
      const baseUrl = getBaseUrl();
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/v1/fleet/upload-manifest/file`, {
          method: 'POST',
          headers,
          body: formData,
        });
      } catch (err) {
        if (typeof window !== 'undefined') {
          res = await fetch('/api/proxy/api/v1/fleet/upload-manifest/file', {
            method: 'POST',
            headers: {
              ...headers,
              'x-target-base-url': baseUrl,
            },
            body: formData,
          });
        } else {
          throw err;
        }
      }
      if (!res.ok) throw new Error(`API /api/v1/fleet/upload-manifest/file → ${res.status}`);
      return res.json() as Promise<import('./types').FleetIngestResponse>;
    },
    ingestTelemetry: (payload: import('./types').TMSWebhookPingPayload) =>
      request<{ status: string; message: string; data: any }>('/api/v1/fleet/telemetry/ingest', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listCustom: (modality?: string, company_id?: string) => {
      const sp = new URLSearchParams();
      if (modality && modality !== 'all') sp.append('modality', modality);
      if (company_id) sp.append('company_id', company_id);
      const qs = sp.toString() ? `?${sp.toString()}` : '';
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
    // Phase 44: master truck asset (Step 1) + travel/rit ledger (Step 2)
    createTruck: (payload: import('./types').TruckAssetCreatePayload) =>
      request<import('./types').TruckAsset>('/api/v1/fleet/trucks', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listTrucks: (company_id?: string) => {
      const qs = company_id ? `?company_id=${encodeURIComponent(company_id)}` : '';
      return request<import('./types').TruckAsset[]>(`/api/v1/fleet/trucks${qs}`);
    },
    createTravel: (payload: import('./types').TravelCreatePayload) =>
      request<import('./types').TravelRecord>('/api/v1/fleet/travels', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    listTravels: (params?: { company_id?: string; status?: string; truck_id?: string; limit?: number }) => {
      const sp = new URLSearchParams();
      if (params?.company_id) sp.append('company_id', params.company_id);
      if (params?.status) sp.append('status', params.status);
      if (params?.truck_id) sp.append('truck_id', params.truck_id);
      if (params?.limit) sp.append('limit', String(params.limit));
      const qs = sp.toString() ? `?${sp.toString()}` : '';
      return request<import('./types').TravelListResponse>(`/api/v1/fleet/travels${qs}`);
    },
    getTravel: (travelId: string) =>
      request<import('./types').TravelRecord>(`/api/v1/fleet/travels/${encodeURIComponent(travelId)}`),
    updateTravel: (
      travelId: string,
      payload: import('./types').TravelUpdatePayload,
      opts?: { idempotencyKey?: string }
    ) =>
      request<import('./types').TravelRecord>(`/api/v1/fleet/travels/${encodeURIComponent(travelId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
        ...(opts?.idempotencyKey ? { headers: { 'Idempotency-Key': opts.idempotencyKey } } : {}),
      }),
    solveTravelHedging: (travelId: string, payload: {
      p_disruption?: number;
      detour_distance_km?: number;
      detour_time_hours?: number;
      hold_wait_hours?: number;
      toll_segments?: string[];
      downtime_fixed_fee_idr?: number;
      inflation_shock_factor?: number;
    },
      opts?: { idempotencyKey?: string }
    ) =>
      request<{ status: string; travel_id: string; hedging: Record<string, any> }>(
        `/api/v1/fleet/travels/${encodeURIComponent(travelId)}/hedging`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
          ...(opts?.idempotencyKey ? { headers: { 'Idempotency-Key': opts.idempotencyKey } } : {}),
        }
      ),
  },
  erp: {
    summary: (company_id?: string) => {
      const qs = company_id ? `?company_id=${encodeURIComponent(company_id)}` : '';
      return request<import('./types').ERPSummaryResponse>(`/api/v1/erp/summary${qs}`);
    },
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
    hitlPending: () =>
      request<{ items: Array<Record<string, unknown>>; count: number }>('/api/v1/news/hitl-pending'),
    hitlAction: (payload: { approval_id: string; decision: 'APPROVE' | 'REJECT' | 'HOLD'; approved_by?: string; notes?: string }) =>
      request<{ status: string; approval_id: string; decision: string; message: string }>('/api/v1/news/hitl-action', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
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
