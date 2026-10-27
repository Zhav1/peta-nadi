// Mirror of agents/state.py TypedDicts: keep in sync with backend

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type CrisisType =
  | 'flood'
  | 'port_closure'
  | 'wildfire'
  | 'congestion'
  | 'earthquake'
  | 'landslide'
  | 'marine_wave'
  | 'road_closure'
  | 'volcanic_eruption'
  | 'other_disruption';

export type ZoneTier = 'RED_CONFIRMED' | 'YELLOW_CLARIFY' | 'DROPPED_IRRELEVANT';

/**
 * Early-warning marker. A forecast item keeps `zone_tier = 'YELLOW_CLARIFY'`
 * (it never becomes RED_CONFIRMED) and is only advisory until
 * `forecast_valid_until` passes — the tag is then hidden, while the article
 * itself still follows the independent 48h admission gate.
 */
export type ForecastTag = 'FORECAST_WASPADA';

export interface AffectedLocationNode {
  name: string;
  latitude: number;
  longitude: number;
  corridor_segment?: string;
  location_precision?: string;
  radius_km?: number;
  geometry_polygon?: [number, number][];
}

export interface VerificationAudit {
  freshness_passed: boolean;
  discourse_passed: boolean;
  spatial_passed: boolean;
  impact_corroborated: boolean;
  discourse_type?: string;
  age_hours?: number;
  agent_verdict_summary?: string;
  llm_verified?: boolean;
  content_chars_analyzed?: number;
  is_active_disaster?: boolean;
}

export interface HazardImpactProfile {
  affected_modalities: Array<'land' | 'sea' | 'air'>;
  passability: 'BLOCKED' | 'RESTRICTED' | 'CAUTION';
  estimated_delay_hours: number;
}

/** GeoJSON polygon emitted by `get_hazard_polygons` (never a raw WKB hex string). */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: [number, number][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}

export type HazardGeometry = GeoJsonPolygon | GeoJsonMultiPolygon;

/** PostGIS hazard row normalized by the backend for map rendering. */
export interface HazardPolygon {
  incident_id?: string;
  title?: string;
  type?: CrisisType | string;
  severity?: Severity | string;
  /** GeoJSON polygon; `null` when stored geometry was empty/invalid. */
  polygon?: HazardGeometry | null;
  /** Alias of `polygon` kept for consumers that read `geometry`. */
  geometry?: HazardGeometry | null;
  /** Closed [[lon, lat], ...] outer ring when the geometry is a Polygon. */
  polygon_ring?: [number, number][] | null;
  geometry_format?: 'geojson' | null;
  distance_km?: number;
  lat?: number;
  lon?: number;
  [key: string]: unknown;
}

/** Per-horizon congestion forecast from PredictionAgent. */
export interface CongestionForecastHorizon {
  delay_min: number;
  confidence_interval?: [number, number];
}

export interface CongestionForecast {
  '6h'?: CongestionForecastHorizon;
  '12h'?: CongestionForecastHorizon;
  '24h'?: CongestionForecastHorizon;
  '48h'?: CongestionForecastHorizon;
  [horizon: string]: CongestionForecastHorizon | undefined;
}

export interface RouteTradeoffAnalysis {
  time_delta_minutes: number;
  additional_cost_idr: number;
  cost_breakdown_items: Array<{ label: string; amount_idr: number }>;
  pros: string[];
  cons: string[];
}

export type CrisisStatus = 'detecting' | 'validating' | 'validated' | 'resolved';

export interface AgentFinding {
  agent: string;
  confidence: number;
  summary: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface HoldVsRerouteEconomics {
  reroute_total_cost_idr: number;
  hold_total_cost_idr: number;
  hold_depot_name: string;
  hold_depot_coords: [number, number];
  estimated_clearance_hours: number;
  recommended_action: 'REROUTE' | 'HOLD';
  net_savings_idr: number;
  rationale_id: string;
  // Optional real cost components (BPJT toll, Pertamina fuel, driver overtime,
  // depot + reefer + spoilage). When absent the card hides the value rather
  // than printing a hardcoded benchmark.
  reroute_fuel_cost_idr?: number;
  reroute_toll_cost_idr?: number;
  reroute_labor_cost_idr?: number;
  reroute_fuel_liters?: number;
  reroute_distance_km?: number;
  hold_depot_cost_idr?: number;
  hold_reefer_cost_idr?: number;
  hold_spoilage_idr?: number;
  hold_wait_hours?: number;
}

export interface RouteLeg {
  title: string;
  mode: 'truck' | 'maritime' | 'air';
  modality?: 'truck' | 'maritime' | 'air';
  distance_km: number;
  eta_minutes: number;
  from_name: string;
  to_name: string;
  coordinates?: [number, number][];
  color?: string;
  maneuvers?: Array<{
    instruction: string;
    distance_meters: number;
    duration_seconds: number;
  }>;
  transfer_hub?: {
    id: string;
    name: string;
    type: 'seaport' | 'airport' | 'hold_depot';
    coords: [number, number];
  };
}

export interface CongestionSegment {
  coordinates: Array<{ lat: number; lon: number }>;
  level: 'low' | 'moderate' | 'heavy';
}

export interface RouteRecommendation {
  id?: string;
  incident_id?: string;
  route_name?: string;
  description: string;
  waypoints: Array<{ lat: number; lon: number }>;
  distance_km: number;
  eta_minutes: number;
  fuel_increase_pct: number;
  risk_score: number;
  explainer?: string;
  is_compromised?: boolean;
  safety_status?: 'SAFE_DETOUR' | 'COMPROMISED' | 'CLEAR' | 'HOLD_DELAY';
  safety_tag?: string;
  traffic_level?: 'low' | 'moderate' | 'heavy' | 'mixed';
  congestion_segments?: CongestionSegment[];
  modality?: 'truck' | 'maritime' | 'air' | 'multimodal' | 'best';
  corridor_type?: 'land_primary' | 'land_detour' | 'sea_intermodal' | 'air_intermodal' | 'hold_staging';
  viable?: boolean;
  non_viable_reason?: string;
  economic_comparison?: HoldVsRerouteEconomics;
  tradeoff_analysis?: RouteTradeoffAnalysis;
  affected_port_name?: string;
  alternate_port_name?: string;
  legs?: RouteLeg[];
  color?: string;
  hedging?: {
    optimal_policy?: 'CONTINUE' | 'REROUTE' | 'HOLD' | string;
    net_savings_idr?: number;
    spoilage_loss_idr?: number;
    cargo_value_idr?: number;
    continue_cost_idr?: number;
    reroute_cost_idr?: number;
    hold_cost_idr?: number;
    recommendation_reason?: string;
    // Backend _enrich_routes_with_hedging attaches the full HedgingSolveResponse
    // (grounded BPJT + Pertamina + 4-tier decay). All fields stay optional so a
    // missing backend value reads as honest null instead of invented Rp.
    perishability_tier?: string;
    decay_rate_per_hour?: number;
    continue_policy?: { policy?: string; cost_idr?: number; breakdown?: Record<string, number>; explanation?: string; risk_level?: string };
    reroute_policy?: { policy?: string; cost_idr?: number; breakdown?: Record<string, number>; explanation?: string; risk_level?: string };
    hold_policy?: { policy?: string; cost_idr?: number; breakdown?: Record<string, number>; explanation?: string; risk_level?: string };
  };
  compliance?: {
    status: 'PASSED' | 'WARNING' | 'HARD_BLOCK' | string;
    summary: string;
    is_compliant: boolean;
    requires_override: boolean;
  };
  chokepoint_delay_multiplier?: number;
  // Phase 77: operator-facing risk transparency (optional, backend may omit).
  dasar_risiko?: string;
  dampak?: string;
  keterbatasan_data?: string[];
  // Phase 106: First-Principles Trip Operational Cost Engine (A/B Variant C)
  total_operational_cost_idr?: number;
  operational_cost_breakdown?: {
    fuel_cost_idr: number;
    labor_cost_idr: number;
    reefer_genset_cost_idr: number;
    toll_cost_idr: number;
    total_operational_cost_idr: number;
  };
}

export type RouteDecisionType = 'APPROVE' | 'REJECT' | 'HOLD' | 'OVERRIDE';

export interface RouteDetailModalProps {
  route: RouteRecommendation;
  crisis: CrisisState | null;
  open: boolean;
  onClose: () => void;
  role: 'DISPATCHER' | 'REGULATOR' | 'GUEST';
  mode: 'live' | 'sandbox';
  onAction: (
    decision: RouteDecisionType,
    tactical: TacticalManeuver,
    notes?: string
  ) => Promise<void>;
  isActing: boolean;
  corridorIsFallback?: boolean;
  onOpenEvaluation?: () => void;
}

export interface HitlPendingCreatePayload {
  incident_id: string;
  route_id: string;
  route_name?: string;
  origin?: string;
  destination?: string;
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
  ltm_episodes?: LTMEpisode[];
  causal_chain?: Array<{
    node?: string;
    name?: string;
    entity_id?: string;
    entity_type?: string;
    relation: string;
    impact_score?: number;
  }>;
  hazard_polygons?: HazardPolygon[];
  congestion_forecast?: CongestionForecast;
  consensus_breakdown?: Record<string, number>;
  validated: boolean;
  verified_news_citations?: Array<{
    headline?: string;
    source?: string;
    source_name?: string;
    tier?: string;
    url?: string;
    link_alive?: 'alive' | 'dead' | 'unknown';
    temporal_phase?: string;
    lane_status?: string;
  }>;
  news_attributions?: Array<{
    source_name?: string;
    url?: string;
  }>;
  blocked_corridors?: string[];
  news_affected_commodities?: string[];
  affected_locations?: AffectedLocationNode[];
  zone_tier?: 'RED_CONFIRMED' | 'YELLOW_CLARIFY';
  /** Set only for early-warning forecasts; zone_tier stays YELLOW_CLARIFY. */
  forecast_tag?: ForecastTag | null;
  /** ISO timestamp after which the forecast tag must not be rendered. */
  forecast_valid_until?: string | null;
  tier_reason?: string;
  custom_hazard_label?: string;
  impact_profile?: HazardImpactProfile;
  radius_km?: number;
  geometry_polygon?: [number, number][];
  verification_audit?: VerificationAudit;
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

// Incident list item (lighter weight - from REST endpoint)
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
  confidence: number;               // 0-100
  frp?: number;                     // Fire Radiative Power (MW, VIIRS)
  conf?: string;                    // FIRMS confidence class (l/n/h)
  dist_to_corridor_km?: number | null;
  severity?: string;                // critical | high | medium
  title?: string;
  source?: string;                  // e.g. VIIRS_SNPP_NRT
  near_segment?: string | null;
  lon?: number;
  lat?: number;
  ts?: string;
  radius_km?: number;             // affected-area radius (km): 5 critical / 2.5 high / 1 medium
  // Phase 168: raw detection provenance (keyless CSV + API parity)
  acq_date?: string;
  acq_time?: string;
  satellite?: string;
  instrument?: string;
  daynight?: string;
  type?: string;                    // wildfire
}

/** Phase 168: where the hotspot payload came from. */
export type FireHotspotSource = 'nasa-firms-api' | 'nasa-firms-csv' | 'cache';

/**
 * GET /api/v1/fire/hotspots — stable envelope.
 * count is null ONLY when unknown (degraded); status "ok" with count 0 is
 * forbidden (healthy zero is "empty").
 */
export interface FireHotspotResponse {
  /** Render-capped list (unchanged hotspot shape). */
  hotspots: FireHotspot[];
  /** True pre-cap count; null only when unknown. */
  count: number | null;
  /** Pre-cap count. */
  total: number;
  /** True when the render cap truncated hotspots. */
  capped: boolean;
  status: HazardCounterStatus;
  reason: string | null;
  source: FireHotspotSource;
  updated_at: string;
  /** Observation window in hours (24h default). */
  window_hours: number;
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
  id?: string;
  zone_tier?: 'RED_CONFIRMED' | 'YELLOW_CLARIFY';
  /** Set only for early-warning forecasts; rendered dashed/zero-fill on the map. */
  forecast_tag?: ForecastTag | null;
  /** ISO timestamp after which the forecast tag must not be rendered. */
  forecast_valid_until?: string | null;
  title?: string;
  tier_reason?: string;
  custom_hazard_label?: string;
  source_news_id?: string;
  center?: [number, number];
  radiusKm?: number;
  radius_km?: number;
  geometry_polygon?: [number, number][];
  verification_audit?: VerificationAudit;
  impact_profile?: HazardImpactProfile;
  affected_locations?: AffectedLocationNode[];
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
  sync_status?: string;
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
  is_fallback: boolean;
  fallback_reasons: string[];
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
  // Phase 57 STEP 0 tenant contract (D3): stable tenant claim. Backend
  // GET /api/v1/fleet/vehicles accepts ?company_id= ; WP-B3 enforces filter.
  company_id?: string;
  company_name?: string;
  // Server-tagged tenancy (issue #2): true only when the asset belongs to the
  // caller's company_id claim. Dispatcher views filter on this + LIVE_GPS.
  is_tenant_asset?: boolean;
  tracking_mode?: 'LIVE_GPS' | 'ROUTE_ESTIMATED';
  current_coords?: [number, number];
  location?: {
    type: string;
    coordinates: [number, number];
  };
  current_location?: {
    type: string;
    coordinates: [number, number];
  };
  departure_time?: string;
  origin_coords?: [number, number];
  dest_coords?: [number, number];
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
  // Phase 57 STEP 0 tenant contract (D3): stable tenant ID from
  // profiles.company_id via JWT app_metadata.company_id. org_name stays
  // for display; company_id is the enforceable claim (WP-B2/B3).
  company_id?: string;
  name: string;
  permissions: string[];
  is_offline_guest: boolean;
  company_name?: string;
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
  tracking_mode?: 'LIVE_GPS' | 'ROUTE_ESTIMATED';
  departure_time?: string;
  origin_coords?: [number, number];
  dest_coords?: [number, number];
}

// Phase 62: Pan-Sumatra Gazetteer & 3-Tier Village Geocoding Types
export interface GeocodeNode {
  name: string;
  display_name: string;
  lat: number;
  lon: number;
  type: 'port' | 'airport' | 'city' | 'regency' | 'kecamatan' | 'village' | 'hub';
  province: string;
  kabupaten?: string;
  kecamatan?: string;
  corridor?: string;
}

export interface GeocodeSearchResult {
  name: string;
  display_name: string;
  lat: number;
  lon: number;
  type: string;
  province: string;
  kabupaten?: string;
  kecamatan?: string;
  corridor?: string;
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
// Mirror of backend/app/schemas/impact_schemas.py: keep in sync with the API contract
export interface DisruptionImpactRequest {
  incident_id?: string;
  lat: number;
  lon: number;
  radius_km?: number;
  hazard_type?: string;
  severity?: Severity;
  title?: string;
}

export interface DisruptionContext {
  incident_id: string;
  title: string;
  hazard_type: string;
  severity: Severity;
  latitude: number;
  longitude: number;
  radius_km: number;
}

// Deterministic CPU detour geometry emitted by the routing adapter
export interface DetourRoute {
  route_index: number;
  description: string;
  nodes: string[];
  coordinates: [number, number][];
  distance_km: number;
  eta_minutes: number;
  fuel_increase_pct: number;
  risk_score: number;
  is_detour: boolean;
}

export interface ImpactedVehicleAssessment {
  vehicle_id: string;
  vehicle_name: string;
  modality: string;
  driver_name?: string | null;
  driver_phone?: string | null;
  commodity: string;
  commodity_key: string;
  cargo_tonnage: number;
  cargo_value_idr: number;
  vehicle_golongan: string;
  origin: string;
  destination: string;
  distance_to_hazard_km: number;
  estimated_delay_hours: number;
  sla_deadline_hours: number;
  late_arrival_risk_pct: number;
  optimal_policy: "REROUTE" | "HOLD" | "CONTINUE";
  net_savings_idr: number;
  spoilage_loss_idr: number;
  detour_cost_idr: number;
  compliance_status: "PASSED" | "WARNING" | "HARD_BLOCK";
  recommendation_rationale: string;
  whatsapp_dispatch_text: string;
  detour_route?: DetourRoute | null;
}

export interface DisruptionImpactResponse {
  disruption: DisruptionContext;
  total_fleet_scanned: number;
  impacted_vehicles_count: number;
  critical_count: number;
  warning_count: number;
  impacted_vehicles: ImpactedVehicleAssessment[];
  evaluated_at: string;
}



// ==========================================
// Truck asset master + travel/rit ledger + ERP savings
// ==========================================

export type TravelStatus = 'planned' | 'moving' | 'rerouted' | 'delivered' | 'failed';

// Fuel-spec contract (Phase 1, DB + contract only — ledger math untouched).
// Default fuel efficiency per BPJT golongan (km/L). A null asset efficiency
// MUST resolve via this map. The legacy flat 3.5 km/L fallback is DEPRECATED
// as a universal value (it remains the GOL_II default only).
export const GOLONGAN_DEFAULT_KMPL: Record<string, number> = {
  GOL_I: 4.0,
  GOL_II: 3.5,
  GOL_III: 3.0,
  GOL_IV: 2.8,
  GOL_V: 2.5,
};
/** @deprecated Flat 3.5 km/L fallback — valid for GOL_II only. Use GOLONGAN_DEFAULT_KMPL. */
export const LEGACY_FLAT_KMPL_FALLBACK_DEPRECATED = 3.5;

export interface FuelPrice {
  id: string;
  fuel_type: string;
  region: string;
  price_idr: number;
  sk_number?: string | null;
  effective_date: string;
  source_url?: string | null;
  is_fallback: boolean;
}

export interface TruckAsset {
  id: string;
  truck_id: string;
  name: string;
  modality: string;
  vin?: string;
  vehicle_golongan: string;
  driver_name?: string;
  driver_phone?: string;
  company_id?: string;
  company_name?: string;
  gross_weight_ton: number;
  fuel_type: string;
  /** Null = resolve from vehicle_golongan via GOLONGAN_DEFAULT_KMPL. */
  fuel_efficiency_kmpl?: number | null;
  is_reefer?: boolean;
  /** Null = non-reefer / unknown. */
  reefer_fuel_lph?: number | null;
  notes?: string;
  source: 'master' | 'legacy_custom_fleet';
  created_at?: string;
  updated_at?: string;
}

export interface TruckAssetCreatePayload {
  truck_id: string;
  name: string;
  vin?: string;
  vehicle_golongan: string;
  driver_name?: string;
  driver_phone?: string;
  company_id?: string;
  company_name?: string;
  gross_weight_ton?: number;
  fuel_type?: 'biosolar' | 'dexlite' | 'pertamina_dex';
  fuel_efficiency_kmpl?: number | null;
  is_reefer?: boolean;
  reefer_fuel_lph?: number | null;
  notes?: string;
}

export interface TravelCreatePayload {
  truck_id: string;
  origin_name: string;
  origin_ref?: string;
  origin_coords: [number, number];
  destination_name: string;
  destination_ref?: string;
  dest_coords: [number, number];
  commodity_key: string;
  cargo_tonnage: number;
  cargo_value_idr?: number;
  sla_deadline_hours: number;
  vehicle_golongan?: string;
  fuel_type?: 'biosolar' | 'dexlite' | 'pertamina_dex';
  /** Fuel-spec contract overrides (Phase 1: accepted, ledger resolution unchanged). */
  fuel_efficiency_kmpl?: number | null;
  is_reefer?: boolean | null;
  reefer_fuel_lph?: number | null;
  baseline_distance_km?: number;
  baseline_time_hours: number;
  /** Null = distance / golongan efficiency. Flat 3.5 km/L fallback deprecated except GOL_II. */
  baseline_fuel_liters?: number;
  baseline_toll_segments?: string[];
  blocked_delay_hours?: number;
  actual_time_hours?: number;
  actual_fuel_liters?: number;
  actual_toll_segments?: string[];
  rerouted?: boolean;
  disruption_id?: string;
  status?: TravelStatus;
  notes?: string;
  inflation_shock_factor?: number;
}

export interface TravelUpdatePayload {
  status?: TravelStatus;
  actual_time_hours?: number;
  actual_fuel_liters?: number;
  actual_toll_segments?: string[];
  baseline_fuel_liters?: number;
  baseline_toll_segments?: string[];
  blocked_delay_hours?: number;
  rerouted?: boolean;
  disruption_id?: string;
  cargo_value_idr?: number;
  inflation_shock_factor?: number;
  notes?: string;
  delivered_at?: string;
}

export interface TravelRecord {
  id: string;
  truck_id: string;
  truck_name?: string;
  company_id?: string;
  driver_name?: string;
  origin_name: string;
  origin_ref?: string;
  origin_coords: [number, number];
  destination_name: string;
  destination_ref?: string;
  dest_coords: [number, number];
  commodity_key: string;
  cargo_tonnage: number;
  cargo_value_idr: number;
  cargo_value_source: string;
  vehicle_golongan: string;
  fuel_type: string;
  sla_deadline_hours: number;
  baseline_distance_km: number;
  distance_source: string;
  baseline_time_hours: number;
  blocked_delay_hours: number;
  baseline_fuel_liters: number;
  baseline_toll_segments: string[];
  actual_toll_segments: string[];
  baseline_fuel_cost_idr: number;
  baseline_toll_cost_idr: number;
  baseline_spoilage_idr: number;
  baseline_labor_idr: number;
  baseline_cost_idr: number;
  actual_time_hours: number;
  actual_fuel_liters: number;
  actual_recorded: boolean;
  actual_fuel_cost_idr: number;
  actual_toll_cost_idr: number;
  actual_spoilage_idr: number;
  actual_labor_idr: number;
  actual_cost_idr: number;
  saved_time_hours: number;
  saved_fuel_liters: number;
  saved_cost_idr: number;
  saved_fuel_cost_idr: number;
  saved_toll_idr: number;
  saved_spoilage_idr: number;
  saved_labor_idr: number;
  efficiency_pct: number;
  rerouted: boolean;
  disruption_id?: string;
  status: TravelStatus;
  hedging?: Record<string, unknown> | null;
  hedging_policy?: string | null;
  hedging_net_savings_idr?: number | null;
  hedging_solved_at?: string | null;
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  delivered_at?: string | null;
  // ---- Phase 3 fuel-economy provenance (optional; backend may omit) ----
  /** Frozen Pertamina/SK rate used for this rit (IDR/L). */
  fuel_rate_used_idr?: number | null;
  /** ESDM SK document number; null when Pertamina fallback. */
  fuel_sk_number?: string | null;
  fuel_sk_id?: string | null;
  fuel_effective_date?: string | null;
  /** ESDM_SK | PERTAMINA_FALLBACK | legacy_3p5 | migrated_golongan */
  fuel_source?: string | null;
  /** True when Pertamina fallback was used (no SK row). */
  fuel_is_fallback?: boolean | null;
  /** Resolved efficiency used (km/L): override > golongan default. */
  fuel_efficiency_used_kmpl?: number | null;
  /** asset_override | golongan_default | legacy_3p5_flat */
  fuel_efficiency_source?: string | null;
  fuel_load_factor?: number | null;
  /** Measured reefer burn used (L/h); null = non-reefer/belum diketahui. */
  reefer_fuel_lph_used?: number | null;
}

export interface TravelListResponse {
  status: string;
  total: number;
  items: TravelRecord[];
}

export interface ERPSavingsBreakdown {
  fuel_idr: number;
  toll_idr: number;
  spoilage_idr: number;
  labor_idr: number;
}

export interface ERPTotals {
  total_trips: number;
  active_trips: number;
  delivered_trips: number;
  failed_trips: number;
  reroute_success_count: number;
  reroute_failed_count: number;
  reroute_success_rate_pct: number;
  sla_compliance_pct: number;
  time_saved_hours: number;
  fuel_saved_liters: number;
  cost_saved_idr: number;
  baseline_cost_idr: number;
  actual_cost_idr: number;
  cost_efficiency_pct: number;
  avg_cost_saved_per_trip_idr: number;
  savings_breakdown: ERPSavingsBreakdown;
}

export interface ERPCompanySummary {
  company_id: string;
  total_trips: number;
  delivered_trips: number;
  failed_trips: number;
  reroute_success_count: number;
  reroute_success_rate_pct: number;
  time_saved_hours: number;
  fuel_saved_liters: number;
  cost_saved_idr: number;
  cost_efficiency_pct: number;
}

export interface ERPTripRow {
  id: string;
  truck_id: string;
  truck_name?: string;
  origin_name: string;
  destination_name: string;
  commodity_key: string;
  cargo_tonnage: number;
  status: TravelStatus;
  rerouted: boolean;
  disruption_id?: string;
  saved_time_hours: number;
  saved_fuel_liters: number;
  saved_cost_idr: number;
  savings_breakdown: ERPSavingsBreakdown;
  efficiency_pct: number;
  hedging_policy?: string | null;
  created_at?: string;
  // ---- Phase 3 fuel-economy provenance (optional; absent = belum diinput) ----
  /** Baseline distance (km); null/undefined = belum diketahui. */
  baseline_distance_km?: number | null;
  /** Actual fuel burned (L); null/undefined = aktual belum diinput. */
  actual_fuel_liters?: number | null;
  /** True bila aktual sudah direkam ledger; false/null = exclude from averages. */
  actual_recorded?: boolean | null;
  fuel_rate_used_idr?: number | null;
  fuel_sk_number?: string | null;
  fuel_sk_id?: string | null;
  fuel_effective_date?: string | null;
  fuel_source?: string | null;
  fuel_is_fallback?: boolean | null;
  fuel_efficiency_used_kmpl?: number | null;
  fuel_efficiency_source?: string | null;
  fuel_load_factor?: number | null;
  reefer_fuel_lph_used?: number | null;
}

export interface ERPSummaryResponse {
  status: string;
  generated_at: string;
  company_id?: string | null;
  scope: 'DISPATCHER_DETAIL' | 'REGULATOR_AGGREGATE';
  storage: string;
  totals: ERPTotals;
  per_company: ERPCompanySummary[];
  trips: ERPTripRow[];
  business_notes: string[];
}

// ==========================================
// M8 Phase 1: Laporan aggregation foundation (frontend-only, no API change)
// ==========================================

export type LaporanTierKey = 'ultra' | 'cold' | 'semi' | 'dry' | 'Lainnya';

export interface LaporanFilters {
  startDate?: string;
  endDate?: string;
  tier?: LaporanTierKey | 'ALL';
  status?: TravelStatus | 'ALL';
  search?: string;
}

export interface CommodityTierGroup {
  tier: LaporanTierKey;
  tripCount: number;
  totalSavedIdr: number;
  totalSavedFuelLiters: number;
  totalSavedHours: number;
}

export interface PeriodBucket {
  key: string;
  label: string;
  tripCount: number;
  totalSavedIdr: number;
}

/** Phase 160 — hazard counter truth states. `degraded` means unknown, not 0. */
export type HazardCounterStatus = 'ok' | 'stale' | 'degraded' | 'empty';

/** One world-truth hazard counter (cuaca = disruption, waspada = medium watch). */
export interface HazardCounterBucket {
  /** null ONLY when status is degraded — never a fabricated 0. */
  count: number | null;
  /** Uncapped total before the render cap; equals count on this endpoint. */
  total: number | null;
  status: HazardCounterStatus;
  reason: string | null;
  source: string;
  valid_until: string | null;
  /** Hazard window in hours (24h precipitation gate). */
  window_hours: number;
}

/** GET /api/v1/weather/summary — toggle-independent, full-Sumatra counters. */
export interface WeatherHazardSummary {
  /** [minLon, minLat, maxLon, maxLat] */
  bbox: number[];
  generated_at: string;
  cuaca: HazardCounterBucket;
  waspada: HazardCounterBucket;
}

/**
 * Phase 169 — render-cap + retention contract of a weather polygon
 * FeatureCollection (`metadata` is the full block, `meta` the compact copy).
 * `total` is the pre-cap qualifying count, `count` the returned polygons.
 */
export interface WeatherPolygonMeta {
  status: HazardCounterStatus;
  reason: string | null;
  total: number | null;
  count: number | null;
  capped: boolean;
  updated_at: string | null;
  validity_hours?: number;
  stale_ceiling_hours?: number;
  refresh_seconds?: number;
  max_features?: number;
}
