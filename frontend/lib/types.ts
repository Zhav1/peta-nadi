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
  safety_status?: 'SAFE_DETOUR' | 'COMPROMISED' | 'CLEAR' | 'HOLD_DELAY';
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

export type DecisionAction = 'ACCEPT' | 'REJECT' | 'OVERRIDE';
export type TacticalManeuver = 'REROUTE' | 'HOLD' | 'CONTINUE';

export interface ApprovalPayload {
  incident_id: string;
  route_id: string;
  recommended_route?: RouteRecommendation;
  action?: DecisionAction;
  tactical_action?: TacticalManeuver;
  operator_id?: string;
  crisis_id?: string;
  route_name?: string;
  origin?: string;
  destination?: string;
  approved_by?: string;
  custom_constraints?: Record<string, any>;
  notes?: string;
}

export interface ApprovalResponse {
  id?: string;
  approval_id?: string;
  approved_at?: string;
  created_at?: string;
  action?: DecisionAction;
  tactical_action?: TacticalManeuver;
  status: string;
}

export interface ApprovalItem {
  id: string;
  incident_id: string;
  route_id: string;
  action?: DecisionAction;
  tactical_action?: TacticalManeuver;
  recommended_route?: RouteRecommendation;
  operator_id: string;
  custom_constraints?: Record<string, any>;
  notes?: string;
  approved_at?: string;
  created_at?: string;
}

export interface ApprovalListResponse {
  items: ApprovalItem[];
  total: number;
}

export interface OutcomePayload {
  incident_id: string;
  horizon: 'T+12h' | 'T+24h';
  actual_clearance_time?: string;
  observed_delay_hours: number;
  actual_price_spike_pct: number;
  verified_by: string;
  verification_source: 'FIELD_REPORT' | 'ANTARA_NEWS' | 'BMKG_ALL_CLEAR' | 'POLDA_TRAFFIC_POLICE';
  notes?: string;
}

export interface OutcomeResponseItem {
  id: string;
  incident_id: string;
  horizon: 'T+12h' | 'T+24h';
  actual_clearance_time?: string | null;
  observed_delay_hours: number;
  actual_price_spike_pct: number;
  verified_by: string;
  verification_source: string;
  notes?: string;
  sync_status: string;
  created_at: string;
}

export interface OutcomeListResponse {
  items: OutcomeResponseItem[];
  total: number;
}

export interface OutcomeEvaluationReport {
  incident_id: string;
  predicted_delay_hours: number;
  actual_delay_hours: number;
  predicted_price_spike_pct: number;
  actual_price_spike_pct: number;
  variance: {
    delay_error_hours: number;
    relative_delay_error: number;
    price_variance_pct: number;
    accuracy_score: number;
  };
  recalibration: {
    channel_adjustments: Record<string, number>;
    recommended_weights: Record<string, number>;
    learning_rate: number;
    advisory_rationale: string;
  };
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

// Phase 25, 28 & 39: Multi-Modal Fleet Vehicle & Transponder Types
export type VehicleModality = 'truck' | 'maritime' | 'air';
export type TelemetrySignalStatus = 'LIVE_STREAM' | 'CACHE_FALLBACK' | 'SIMULATION_CACHE';
export type ColdChainStatus = 'NORMAL' | 'WARNING_EXCURSION';

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
  // Transponder kinematics & identifiers
  mmsi?: string;
  imo?: string;
  sog_knots?: number;
  cog_deg?: number;
  draught_m?: number;
  nav_status?: string;
  icao24?: string;
  callsign?: string;
  altitude_ft?: number;
  ground_speed_kts?: number;
  vin?: string;
  temperature_c?: number;
  cold_chain_status?: ColdChainStatus;
  signal_status?: TelemetrySignalStatus;
  telemetry_source?: string;
  heading_deg?: number;
  last_ping_seconds_ago?: number;
}

// Phase 40: Dedicated Evaluation & Benchmark Dashboard Types
export interface ConfusionMatrix {
  true_positives: number;
  false_positives: number;
  true_negatives: number;
  false_negatives: number;
}

export interface EvaluationMetrics {
  precision: number;
  recall: number;
  f1_score: number;
  false_positive_rate: number;
  accuracy: number;
  mean_latency_ms: number;
  total_latency_ms: number;
}

export interface ReliabilityBinItem {
  bin_index: number;
  range: [number, number];
  sample_count: number;
  mean_confidence: number;
  empirical_accuracy: number;
  calibration_error: number;
}

export interface CalibrationReport {
  brier_score: number;
  expected_calibration_error: number;
  platt_calibrated_brier: number;
  isotonic_calibrated_brier: number;
  reliability_bins: ReliabilityBinItem[];
}

export interface BenchmarkThresholds {
  min_precision: number;
  min_recall: number;
  min_f1: number;
  max_brier_score: number;
}

export interface BenchmarkReportResponse {
  status: string;
  timestamp: string;
  total_scenarios: number;
  confusion_matrix: ConfusionMatrix;
  metrics: EvaluationMetrics;
  calibration: CalibrationReport;
  thresholds: BenchmarkThresholds;
  gating_passed: boolean;
}

export interface TestCaseItem {
  test_id: string;
  fr_id: string;
  category: string;
  module: string;
  test_type: string;
  scenario: string;
  expected_invariant: string;
  result: string;
  execution_time_ms?: number;
}

export interface TestMatrixResponse {
  status: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  fr_domain_counts: Record<string, number>;
  tests: TestCaseItem[];
}

export interface CorridorEfficiencyItem {
  corridor_name: string;
  origin: string;
  destination: string;
  modality: 'truck' | 'maritime' | 'air';
  baseline_distance_km: number;
  blocked_delay_hours: number;
  reroute_distance_km: number;
  reroute_delay_minutes: number;
  time_saved_hours: number;
  fuel_saved_liters: number;
  cost_saved_idr: number;
  solver_latency_ms: number;
}

export interface CorridorEfficiencyResponse {
  status: string;
  corridors: CorridorEfficiencyItem[];
  total_cost_saved_idr: number;
  avg_time_saved_hours: number;
}

// Authentication & Multi-Persona Workspace Types (Phase 42)
export type UserRole = 'DISPATCHER' | 'REGULATOR' | 'GUEST';

export interface UserProfile {
  id: string;
  email: string;
  role: UserRole;
  org_name: string;
  name: string;
  permissions: string[];
  is_offline_guest: boolean;
  exp?: number;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface RoleCatalogItem {
  id: UserRole;
  name: string;
  title: string;
  organization: string;
  description: string;
  primary_tabs: string[];
  permissions: string[];
}

// Phase 43: Self-Serve Fleet Onboarding & Live GPS Ingestion Types
export interface CustomVehicleRegisterPayload {
  vehicle_id: string;
  name: string;
  modality: VehicleModality;
  driver_name?: string;
  driver_phone?: string;
  cargo?: string;
  origin?: string;
  destination?: string;
  speed_kmh?: number;
  temperature_c?: number;
  path?: [number, number][];
  status?: string;
  mmsi?: string;
  imo?: string;
  vin?: string;
  icao24?: string;
  callsign?: string;
}

export interface TMSWebhookPingPayload {
  vehicle_id: string;
  latitude: number;
  longitude: number;
  speed_kmh?: number;
  heading_deg?: number;
  altitude_m?: number;
  temperature_c?: number;
  timestamp?: string;
  battery_level?: number;
  ignition?: boolean;
}

export interface StrategicHubItem {
  name: string;
  coordinates: [number, number];
}

export interface ManifestTemplateInfo {
  headers: string[];
  sample_csv: string;
  supported_hubs: StrategicHubItem[];
}

export interface FleetIngestResponse {
  status: string;
  message: string;
  registered_count: number;
  vehicles: FleetVehicle[];
}

