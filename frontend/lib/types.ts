// Mirror of agents/state.py TypedDicts — keep in sync with backend

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type CrisisType = 'flood' | 'port_closure' | 'wildfire' | 'congestion' | 'earthquake';
export type CrisisStatus = 'detecting' | 'validating' | 'validated' | 'resolved';

export interface AgentFinding {
  agent: string;
  confidence: number;
  summary: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RouteRecommendation {
  description: string;
  waypoints: Array<{ lat: number; lon: number }>;
  distance_km: number;
  eta_minutes: number;
  fuel_increase_pct: number;
  risk_score: number;
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
