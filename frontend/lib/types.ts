// Mirror of agents/state.py TypedDicts — keep in sync with backend

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type CrisisType = 'flood' | 'port_closure' | 'wildfire' | 'congestion' | 'earthquake' | 'landslide';

export type CrisisStatus = 'detecting' | 'validating' | 'validated' | 'resolved';

export interface AgentFinding {
  agent: string;
  confidence: number;
  summary: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RouteLeg {
  title: string;
  mode: 'truck' | 'maritime' | 'air';
  distance_km: number;
  eta_minutes: number;
  from_name: string;
  to_name: string;
}

export interface CongestionSegment {
  coordinates: Array<{ lat: number; lon: number }>;
  level: 'low' | 'moderate' | 'heavy';
}

export interface RouteRecommendation {
  id?: string;
  route_name?: string;
  description: string;
  waypoints: Array<{ lat: number; lon: number }>;
  distance_km: number;
  eta_minutes: number;
  fuel_increase_pct: number;
  risk_score: number;
  is_compromised?: boolean;
  safety_status?: 'SAFE_DETOUR' | 'COMPROMISED' | 'CLEAR';
  safety_tag?: string;
  traffic_level?: 'low' | 'moderate' | 'heavy' | 'mixed';
  congestion_segments?: CongestionSegment[];
  modality?: 'truck' | 'maritime' | 'air' | 'multimodal' | 'best';
  legs?: RouteLeg[];
  color?: string;
}

export interface LTMEpisode {
  episode_id: string;
  title: string;
  description: string;
  crisis_type: string;
  inflation_multiplier: number;
  recovery_days: number;
  similarity_score: number;
}

export interface GraphRAGNode {
  entity_id: string;
  entity_type: 'port' | 'route' | 'warehouse' | 'commodity' | 'supplier';
  name: string;
  relation: string;
  impact_score: number;
}

export interface CrisisState {
  crisis_id: string;
  title: string;
  type: CrisisType;
  is_simulated: boolean;
  lat: number;
  lon: number;
  region: string;
  affected_polygon?: number[][];
  status: CrisisStatus;
  overall_confidence: number;
  data_collection_finding?: AgentFinding;
  osint_hazard_finding?: AgentFinding;
  prediction_finding?: AgentFinding;
  route_optimization_finding?: AgentFinding;
  economic_intelligence_finding?: AgentFinding;
  decision_support_output?: string;
  route_recommendations: RouteRecommendation[];
  inflation_forecast?: {
    commodity: string;
    region: string;
    pct_increase: number;
    timeframe_hours: number;
  };
  causal_chain?: Array<{ node: string; relation: string }>;
  hazard_polygons?: Array<Record<string, unknown>>;
  consensus_breakdown?: Record<string, number>;
  validated: boolean;
  created_at: string;
  evidence?: {
    osint_author?: string;
    osint_text?: string;
    delay_minutes?: string;
    delay_history?: number[];
  };
  updated_at: string;
  messages: string[];
}

// Incident list item (lighter weight — from REST endpoint)
export interface IncidentSummary {
  id: string;
  title: string;
  type: CrisisType;
  severity: Severity;
  status: CrisisStatus;
  confidence: number;
  lat?: number;
  lon?: number;
  created_at: string;
}

// WebSocket message types
export type WsEvent =
  | { event: 'node_update'; crisis_id: string; data: Partial<CrisisState> }
  | { event: 'complete'; crisis_id: string; data: { status: 'finished' } }
  | { event: 'error'; crisis_id: string; error: string };

// Map layer data shapes
export interface FireHotspot {
  coordinates: [number, number];   // [lng, lat]
  confidence: number;               // 0–100
}

export interface MaritimeVector {
  path: [number, number][];         // [[lng, lat], ...]
  vessel_id: string;
  name: string;
}

export interface DisasterZone {
  polygon: [number, number][];      // ring [[lng, lat], ...]
  type: CrisisType;
  risk: number;                     // 0–1
  crisis_id?: string;
}

// PIHPS price chart data
export interface PricePoint {
  date: string;
  beras?: number;       // rice (IDR/kg)
  minyak?: number;      // cooking oil (IDR/liter)
  cabai?: number;       // chili (IDR/kg)
  gula?: number;        // sugar (IDR/kg)
}

export interface ApprovalPayload {
  incident_id: string;
  route_id: string;
  recommended_route: RouteRecommendation;
  operator_id?: string;
  crisis_id?: string;
  route_name?: string;
  origin?: string;
  destination?: string;
  approved_by?: string;
  notes?: string;
}

export interface ApprovalResponse {
  approval_id: string;
  approved_at: string;
  status: string;
}

export interface ApprovalItem {
  id: string;
  incident_id: string;
  route_id: string;
  recommended_route: RouteRecommendation;
  operator_id: string;
  approved_at: string;
}

export interface ApprovalListResponse {
  items: ApprovalItem[];
  total: number;
}

export type SourceStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface SourceHealth {
  name: string;
  status: SourceStatus;
  last_seen: string | null;
}

export interface SourceHealthResponse {
  sources: SourceHealth[];
}

export interface CorridorContext {
  corridor_id: string;
  corridor_name: string;
  timestamp: string;
  weather: {
    status: string;
    rainfall_mm: number;
    visibility: string;
    alert_summary: string;
    code: number;
    location: string;
  };
  traffic: {
    congestion_level_pct: number;
    delay_minutes: number;
    active_incidents: number;
    flow_speed_kmh: number;
    status: string;
    checkpoints: Array<{
      name: string;
      speed: number;
      congestion_pct: number;
      status: string;
    }>;
  };
  commodity_prices: {
    chili_price: number;
    rice_price: number;
    cooking_oil_price: number;
    price_anomaly_detected: boolean;
    inflation_trend_pct: number;
    commodities: Array<{
      name: string;
      price_idr: number;
      deviation_pct: number;
      status: string;
    }>;
  };
  data_integrity: {
    bmkg_status: string;
    tomtom_status: string;
    pihps_status: string;
    consensus_confidence: number;
  };
}

export interface DemoStatus {
  crisis_id: string;
  stage: number;
  stage_name: string;
  agent_statuses: Record<string, 'pending' | 'running' | 'done'>;
  confidence: number;
  validated: boolean;
  summary?: string;
  crisis_state: import('./types').CrisisState;
}

// Phase 25 & 28: Multi-Modal Fleet Vehicle Types
export type VehicleModality = 'truck' | 'maritime' | 'air';

export interface FleetVehicle {

  vehicle_id: string;
  name: string;
  modality: VehicleModality;
  path: [number, number][];        // Trajectory polyline: [[lon, lat], ...], min 2 points
  speed_kmh: number;               // Speed in km/h or knots converted
  status: 'moving' | 'anchored' | 'rerouting';
  cargo?: string;                  // e.g., "1.200 Ton Beras BULOG"
  origin?: string;                 // e.g., "Pelabuhan Belawan"
  destination?: string;            // e.g., "Hub Logistik Medan"
  progress?: number;               // 0.0-1.0 internal progress tracking
  route_geometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}



