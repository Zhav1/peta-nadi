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
  hedging?: {
    optimal_policy: 'CONTINUE' | 'REROUTE' | 'HOLD' | string;
    net_savings_idr: number;
    spoilage_loss_idr: number;
    cargo_value_idr: number;
    continue_cost_idr: number;
    reroute_cost_idr: number;
    hold_cost_idr: number;
    recommendation_reason: string;
  };
  compliance?: {
    status: 'PASSED' | 'WARNING' | 'HARD_BLOCK' | string;
    summary: string;
    is_compliant: boolean;
    requires_override: boolean;
  };
  chokepoint_delay_multiplier?: number;
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
  severity?: Severity;
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
  hedging_breakdown?: Record<string, unknown>;
  compliance_status?: Record<string, unknown>;
  inflation_forecast?: {
    commodity?: string;
    region?: string;
    pct_increase?: number;
    inflation_multiplier?: number;
    anomalous_commodities?: string[];
    timeframe_hours?: number;
  };
  causal_chain?: Array<{
    node?: string;
    name?: string;
    entity_id?: string;
    entity_type?: string;
    relation: string;
    impact_score?: number;
  }>;
  hazard_polygons?: Array<Record<string, unknown>>;
  consensus_breakdown?: Record<string, number>;
  validated: boolean;
  verified_news_citations?: Array<{
    headline?: string;
    source?: string;
    source_name?: string;
    tier?: string;
    url?: string;
    temporal_phase?: string;
    lane_status?: string;
  }>;
  news_attributions?: Array<{
    source_name?: string;
    url?: string;
  }>;
  blocked_corridors?: string[];
  news_affected_commodities?: string[];
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
  // Shipment & Compliance Context
  commodity_key?: string;
  cargo_tonnage?: number;
  cargo_value_idr?: number;
  vehicle_golongan?: string;
  gross_weight_ton?: number;
  sla_deadline_hours?: number;
  deadline_buffer_hours?: number;
  has_bkhit_cert?: boolean;
  bkhit_cert_id?: string;
  driver_phone?: string;
  driver_name?: string;
  license_plate?: string;
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

// ==========================================
// Phase 44: Intermodal, Spoilage Hedging & Compliance Types
// ==========================================

export type ChokePointType =
  | "SEAPORT"
  | "FERRY_TERMINAL"
  | "MOUNTAIN_PASS"
  | "TOLL_HIGHWAY_JUNCTION"
  | "FREIGHT_CORRIDOR"
  | "HIGHWAY_BOTTLENECK";

export type ChokePointStatus = "NORMAL" | "CONGESTED" | "RESTRICTED" | "BLOCKED";

export interface ChokePointItem {
  id: string;
  name: string;
  type: ChokePointType;
  coords: [number, number];
  province: string;
  status: ChokePointStatus;
  dwelling_time_hours: number;
  queue_count: number;
  intermodal_delay_multiplier: number;
  hazard_type?: string;
  capacity?: number;
  updated_at: string;
}

export interface ChokePointsListResponse {
  items: ChokePointItem[];
  total: number;
  congested_count: number;
  restricted_count: number;
}

export interface HedgingSolveRequest {
  vehicle_id: string;
  commodity: string;
  cargo_tonnage?: number;
  origin: string;
  destination: string;
  vehicle_golongan?: "GOL_I" | "GOL_II" | "GOL_III" | "GOL_IV" | "GOL_V";
  fuel_type?: "biosolar" | "dexlite" | "pertamina_dex";
  p_disruption?: number;
  disruption_delay_hours?: number;
  detour_distance_km?: number;
  detour_time_hours?: number;
  toll_segments?: string[];
  hold_wait_hours?: number;
  downtime_fixed_fee_idr?: number;
}

export interface PolicyBreakdown {
  policy: "CONTINUE" | "REROUTE" | "HOLD";
  cost_idr: number;
  breakdown: Record<string, number>;
  explanation: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface HedgingSolveResponse {
  vehicle_id: string;
  commodity: string;
  perishability_tier: string;
  decay_rate_per_hour: number;
  cargo_value_idr: number;
  spoilage_loss_idr: number;
  continue_policy: PolicyBreakdown;
  reroute_policy: PolicyBreakdown;
  hold_policy: PolicyBreakdown;
  optimal_policy: "CONTINUE" | "REROUTE" | "HOLD";
  net_savings_idr: number;
  recommendation_reason: string;
}

export interface ComplianceVerifyRequest {
  vehicle_id: string;
  origin: string;
  destination: string;
  traversed_roads?: string[];
  vehicle_gross_weight_ton: number;
  commodity: string;
  driver_name?: string;
  driver_phone?: string;
  license_plate?: string;
  has_bkhit_cert?: boolean;
  bkhit_cert_id?: string;
  manifest_hash?: string;
}

export type ComplianceCheckStatus = "PASSED" | "WARNING" | "HARD_BLOCK";

export interface ComplianceCheckDetail {
  category: "QUARANTINE_BKHIT" | "AXLE_LOAD_MST" | "SURAT_JALAN_MANIFEST";
  status: ComplianceCheckStatus;
  title: string;
  detail: string;
  remedy_action?: string | null;
}

export interface ComplianceVerifyResponse {
  vehicle_id: string;
  overall_status: ComplianceCheckStatus;
  can_dispatch: boolean;
  requires_override: boolean;
  checks: ComplianceCheckDetail[];
  timestamp: string;
}

// Disruption Impact Assessment & Decision Engine Types
export interface DisruptionImpactRequest {
  incident_id: string;
  lat: number;
  lon: number;
  radius_km?: number;
  expected_delay_hours?: number;
  hazard_type?: string;
  road_class_blockade?: string[];
}

export interface ImpactedVehicleAssessment {
  vehicle_id: string;
  name: string;
  commodity_key: string;
  cargo_tonnage: number;
  cargo_value_idr: number;
  distance_to_incident_km: number;
  is_direct_intersection: boolean;
  driver_name: string;
  driver_phone: string;
  license_plate: string;
  origin: string;
  destination: string;
  current_location: [number, number];
  sla_deadline_hours: number;
  baseline_spoilage_prob: number;
  delayed_spoilage_prob: number;
  at_risk_spoilage_idr: number;
  spoilage_recommendation: {
    recommended_policy: "CONTINUE" | "REROUTE" | "HOLD";
    expected_savings_idr: number;
    explanation: string;
  };
  compliance_check: {
    is_compliant: boolean;
    quarantine_clear: boolean;
    mst_clear: boolean;
    issues: string[];
  };
  detour_route?: {
    distance_km: number;
    eta_hours: number;
    toll_cost_idr: number;
    fuel_cost_idr: number;
    total_cost_idr: number;
    waypoints: string[];
    geometry_geojson?: Record<string, unknown>;
  } | null;
  recommended_action: "REROUTE_IMMEDIATE" | "PROCEED_WITH_CAUTION" | "HOLD_AT_SAFE_POINT";
  justification: string;
}

export interface DisruptionImpactResponse {
  incident_id: string;
  timestamp: string;
  total_fleet_scanned: number;
  impacted_vehicles_count: number;
  total_value_at_risk_idr: number;
  critical_spoilage_count: number;
  impacted_assessments: ImpactedVehicleAssessment[];
}


