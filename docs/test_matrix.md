# PreHub Test Matrix & Verification Inventory

This document provides the complete empirical verification inventory for PreHub, mapping all 133 automated and architectural verification tests to Functional Requirements (FR-1 through FR-20). It details test types, scenario parameters, expected invariants, execution outcomes, and architectural coverage.

---

## 1. Functional Requirement Mapping Overview

| FR ID | Functional Requirement Domain | Test Count | Primary Test Modules | Status |
| :--- | :--- | :---: | :--- | :---: |
| **FR-1** | Hydro-meteorological & Seismic Early Warning (BMKG / Open-Meteo) | 5 | `test_adapters.py`, `test_api_routers.py`, `test_news_pipeline.py` | Passed |
| **FR-2** | Highway Traffic & Segment Congestion Ingestion (TomTom) | 4 | `test_adapters.py`, `test_api_routers.py` | Passed |
| **FR-3** | Maritime Vessel Tracking & Port Bottleneck Detection (AISstream) | 2 | `test_adapters.py` | Passed |
| **FR-4** | OSINT News & Social Stream NLP Pipeline (LKBN Antara, X, NASA FIRMS) | 15 | `test_news_pipeline.py`, `test_scrapers.py`, `test_adapters.py`, `test_api_routers.py` | Passed |
| **FR-5** | Multi-Agent Swarm Orchestration & Consensus Engine (LangGraph) | 9 | `test_agents.py` | Passed |
| **FR-6** | Empirical Benchmark Dataset & Disruption Classifier Evaluation | 3 | `test_benchmark_eval.py` | Passed |
| **FR-7** | Multi-Modal Fleet Tracking & Corridor Detours | 3 | `test_agents.py`, `test_api_routers.py` | Passed |
| **FR-8** | PIHPS Food Inflation & Commodity Price Anomaly Detection | 4 | `test_scrapers.py`, `test_agents.py` | Passed |
| **FR-9** | Human-in-the-Loop Decision Copilot & Incident Management API | 3 | `test_agents.py`, `test_api_routers.py` | Passed |
| **FR-10** | System Health, Adaptive Polling & Infrastructure Resilience | 2 | `test_adapters.py`, `test_api_routers.py` | Passed |
| **FR-11** | Mathematical Consensus Formulation, Probability Calibration & CPU Routing | 17 | `test_consensus_calibration.py`, `test_cpu_routing_weather.py` | Passed |
| **FR-12** | Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine | 8 | `test_outcomes_decisions.py` | Passed |
| **FR-13** | Tactical Multi-Modal Telemetry, WebGL God's-Eye HUD & Transponder Ingestion | 4 | `test_vehicles_telemetry.py` | Passed |
| **FR-14** | Dedicated Evaluation & Benchmark Dashboard (Reliability, Matrix & Savings) | 5 | `test_evaluation_router.py` | Passed |
| **FR-15** | Supabase Authentication & Multi-Role Workspace Management (RBAC) | 15 | `test_auth_rbac.py` | Passed |
| **FR-16** | Self-Serve Fleet Onboarding & GPS Telematics Ingestion (Phase 43) | 9 | `test_fleet_ingest.py` | Passed |
| **FR-17** | Intermodal Sea-Land Terminal & Choke-Point Synchronization (Phase 44) | 5 | `test_intermodal_hedging_compliance.py` | Passed |
| **FR-18** | Operational Spoilage Hedging & Economic Cost-Benefit Solver (Phase 44) | 6 | `test_intermodal_hedging_compliance.py` | Passed |
| **FR-19** | Digital Cargo Manifest & Agricultural Quarantine Compliance (Phase 44) | 6 | `test_intermodal_hedging_compliance.py` | Passed |
| **FR-20** | Pilot Verification, Scenario Drills & Production Packaging (Phase 45) | 8 | `test_pilot_e2e.py` | Passed |
| **TOTAL** | **Comprehensive Automated Verification Suite** | **133** | **15 Automated Test Modules across Backend, RBAC, Swarm & Persistence** | **100% Passed** |

---

## 2. Exhaustive Test Case Inventory

### FR-1: Hydro-meteorological & Seismic Early Warning (BMKG / Open-Meteo)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR01-01 | `test_adapters.py::test_bmkg_parse_earthquake` | Unit | Simulated BMKG autogempa payload (M5.4, North Sumatra) | Correct parsing of magnitude, coordinates, and medium severity | Passed |
| TEST-FR01-02 | `test_adapters.py::test_bmkg_severity_mapping` | Unit | Multi-tier earthquake magnitudes (M4.2, M6.5, M7.2) | Filtering of sub-5.0 events, mapping to High (6.5) and Critical (7.2) | Passed |
| TEST-FR01-03 | `test_adapters.py::test_bmkg_dedup` | Unit | Repeated incoming BMKG payload with existing Redis key | Idempotent deduplication filter returning 0 duplicate events | Passed |
| TEST-FR01-04 | `test_api_routers.py::test_spatial_weather_and_traffic_endpoints` | Integration | GET /api/v1/weather/spatial-polygons and /api/v1/traffic/flow-segments | Valid GeoJSON polygons with weather attributes and traffic flow lines | Passed |
| TEST-FR01-05 | `test_news_pipeline.py::test_fast_heuristic_extraction_early_warning` | Unit | BMKG high sea wave advisory headline | Classification as forecast_early_warning with positive lead time | Passed |

### FR-2: Highway Traffic & Segment Congestion Ingestion (TomTom)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR02-01 | `test_adapters.py::test_tomtom_congestion_score` | Unit | TomTom segment (FreeFlow=90 km/h, Current=12 km/h) | Congestion score 0.866 triggering high severity congestion event | Passed |
| TEST-FR02-02 | `test_adapters.py::test_tomtom_road_closure` | Unit | TomTom segment with roadClosure=True and speed 0 | Event classification as road_closure with critical severity | Passed |
| TEST-FR02-03 | `test_adapters.py::test_tomtom_no_alert_normal` | Unit | Free flowing highway segment (FreeFlow=90, Current=80) | Zero congestion alerts emitted | Passed |
| TEST-FR02-04 | `test_api_routers.py::test_corridor_endpoints` | Integration | GET /api/v1/corridor/context?corridor_id=sumatra_belawan_medan | Correlated multi-source corridor telemetry dictionary | Passed |

### FR-3: Maritime Vessel Tracking & Port Bottleneck Detection (AISstream)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR03-01 | `test_adapters.py::test_aisstream_port_queue` | Unit | 10 anchored vessels (SOG < 0.5 knots) in Belawan roadstead | Threshold breach (>=8) emits high-severity port queue alert | Passed |
| TEST-FR03-02 | `test_adapters.py::test_aisstream_no_queue` | Unit | 3 anchored vessels (below 8 vessel threshold) | No bottleneck alerts emitted | Passed |

### FR-4: OSINT News & Social Stream NLP Pipeline (LKBN Antara, X, NASA FIRMS)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR04-01 | `test_adapters.py::test_nasa_firms_parse_csv` | Unit | Active thermal hotspot within 5km of Belawan corridor | Emits wildfire event with high severity | Passed |
| TEST-FR04-02 | `test_adapters.py::test_nasa_firms_proximity_filter` | Unit | Hotspot >20km away from corridor highway spine | Geo-proximity filter rejects distant thermal anomaly | Passed |
| TEST-FR04-03 | `test_api_routers.py::test_news_endpoints` | Integration | GET /api/v1/news/live and /api/v1/news/market-regime | Returns enriched articles and synthesized market regime state | Passed |
| TEST-FR04-04 | `test_news_pipeline.py::test_official_feeds_configured` | Unit | Multi-outlet RSS registry configuration | Presence of LKBN Antara Sumut and LKBN Antara Ekonomi feeds | Passed |
| TEST-FR04-05 | `test_news_pipeline.py::test_targeted_queries_configured` | Unit | Targeted search parameters for Sumatra corridors | Presence of Antara domains and staple logistics keywords | Passed |
| TEST-FR04-06 | `test_news_pipeline.py::test_fast_heuristic_extraction_flood` | Unit | Antara news: 'Banjir Luapan Sungai Padang Tebing Tinggi' | Extracted incident type flood, critical severity, corridor node | Passed |
| TEST-FR04-07 | `test_news_pipeline.py::test_extract_structured_news_caching` | Unit | Repeated structured news extraction call | Cache hit returns identical UUID with commodity impact extraction | Passed |
| TEST-FR04-08 | `test_scrapers.py::test_ner_gazetteer_finds_belawan` | Unit | Text containing 'Pelabuhan Belawan' | Gazetteer NER extracts Belawan POI correctly | Passed |
| TEST-FR04-09 | `test_scrapers.py::test_ner_gazetteer_finds_nothing` | Unit | Text with non-corridor entities (e.g. Jakarta Selatan) | Gazetteer returns empty set, rejecting out-of-scope noise | Passed |
| TEST-FR04-10 | `test_scrapers.py::test_ner_llm_fallback_called` | Unit | Unlisted entity ('Kuala Namu') in highway disruption context | Fallback invokes LLM extraction gateway successfully | Passed |
| TEST-FR04-11 | `test_scrapers.py::test_geocode_known_poi_no_api_call` | Unit | Known POI lookup for 'Belawan' | Returns exact (lat, lon) without external HTTP requests | Passed |
| TEST-FR04-12 | `test_scrapers.py::test_geocode_cache_hit` | Unit | Geocoding cache entry present in Redis | Direct retrieval from Redis without geocoding engine overhead | Passed |
| TEST-FR04-13 | `test_scrapers.py::test_social_severity_critical` | Unit | Social report: 'Antrian macet parah lumpuh total Belawan' | Severity scored as critical with extracted geographic coordinates | Passed |
| TEST-FR04-14 | `test_scrapers.py::test_social_severity_low` | Unit | Benign social report: 'Cuaca mendung di Medan' | Filtered with low severity | Passed |
| TEST-FR04-15 | `test_scrapers.py::test_crisis_mode_interval_switch` | Unit | Switching scraper from calm (600s) to active crisis (120s) | Dynamic polling interval adjustment verified | Passed |

### FR-5: Multi-Agent Swarm Orchestration & Consensus Engine (LangGraph)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR05-01 | `test_agents.py::test_data_collection_valid_event` | Unit | Ingestion event mapped to DataCollectionAgent finding | Finding output containing confidence score and structured data | Passed |
| TEST-FR05-02 | `test_agents.py::test_data_collection_duplicate_event` | Unit | Duplicate event ID passed to DataCollectionAgent | Suppresses duplicate state processing | Passed |
| TEST-FR05-03 | `test_agents.py::test_data_collection_malformed_event` | Unit | Missing required fields in raw telemetry ingestion | Gracefully drops payload with error log, no unhandled exception | Passed |
| TEST-FR05-04 | `test_agents.py::test_osint_hazard_with_polygon` | Unit | Unstructured social alert with location description | Spatial bounding box with PostGIS polygon geometry | Passed |
| TEST-FR05-05 | `test_agents.py::test_osint_hazard_no_polygon` | Unit | OSINT hazard with no discernible spatial boundary | Assigns default point geometry with radius buffer | Passed |
| TEST-FR05-06 | `test_agents.py::test_route_optimization_blocked_primary` | Unit | Blocked highway edge with Trans-Sumatra road graph | Alternative detour path avoiding damaged segment | Passed |
| TEST-FR05-07 | `test_agents.py::test_consensus_gate_validates_at_85pct` | Unit | Multi-sensor agreement with >=2 independent sensors | State promoted to validated status (P >= 0.85) | Passed |
| TEST-FR05-08 | `test_agents.py::test_consensus_gate_rejects_below_85pct` | Unit | Low-confidence unverified anomaly signals | State remains unconfirmed (P < 0.85) | Passed |
| TEST-FR05-09 | `test_agents.py::test_graph_compiles` | Unit | Compiling LangGraph StateGraph | Graph successfully compiles with all nodes and transitions | Passed |

### FR-6: Empirical Benchmark Dataset & Disruption Classifier Evaluation
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR06-01 | `test_benchmark_eval.py::test_benchmark_dataset_integrity` | Schema | Inspection of 60 scenario schemas in JSON benchmark | 100% attribute schema validation passed | Passed |
| TEST-FR06-02 | `test_benchmark_eval.py::test_benchmark_dataset_distribution` | Audit | Scenario composition (35 positive disruptions / 25 controls) | Validated balanced distribution across all 8 Sumatra provinces | Passed |
| TEST-FR06-03 | `test_benchmark_eval.py::test_evaluation_engine_execution` | Integration | Programmatic execution of evaluate_metrics.py | Precision >= 85%, Recall >= 80%, F1 >= 82% | Passed |

### FR-7: Multi-Modal Fleet Tracking & Corridor Detours
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR07-01 | `test_agents.py::test_prediction_with_tomtom_data` | Unit | TomTom congestion ratio injected into prediction agent | Speed degradation curve modeled across time horizons | Passed |
| TEST-FR07-02 | `test_api_routers.py::test_commodity_endpoints` | Integration | GET /api/v1/commodities/prices | Paginated commodity price series sorted by timestamp | Passed |
| TEST-FR07-03 | `test_api_routers.py::test_vehicles_endpoints` | Integration | GET /vehicles and GET /api/v1/fleet/vehicles | Returns fleet vehicle array with coordinate tuples and status | Passed |

### FR-8: PIHPS Food Inflation & Commodity Price Anomaly Detection
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR08-01 | `test_agents.py::test_economic_intelligence_anomaly_detected` | Unit | PIHPS anomaly + flood event injected into Agent 5 | Outputs inflation multiplier and affected commodities | Passed |
| TEST-FR08-02 | `test_scrapers.py::test_pihps_no_spike` | Unit | Normal daily price fluctuation (2% delta) | No price anomaly alert emitted | Passed |
| TEST-FR08-03 | `test_scrapers.py::test_pihps_spike_detection_high` | Unit | Price increase exceeding 15% 3-day delta threshold | Flags price_spike anomaly with High severity rating | Passed |
| TEST-FR08-04 | `test_scrapers.py::test_pihps_spike_detection_critical` | Unit | Price increase exceeding 35% severe disruption threshold | Flags price_spike anomaly with Critical severity rating | Passed |

### FR-9: Human-in-the-Loop Decision Copilot & Incident Management API
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR09-01 | `test_agents.py::test_decision_support_output_format` | Unit | Synthesized crisis state with detour recommendations | Generates Indonesian executive brief and action plan | Passed |
| TEST-FR09-02 | `test_api_routers.py::test_incidents_endpoints` | Integration | GET /api/v1/incidents with severity filtering | Returns structured items and total count | Passed |
| TEST-FR09-03 | `test_api_routers.py::test_approvals_endpoints` | Integration | POST /api/v1/approvals with operator action | Records approval timestamp, operator ID, and status | Passed |

### FR-10: System Health, Adaptive Polling & Infrastructure Resilience
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR10-01 | `test_adapters.py::test_base_adapter_health_update` | Unit | Base adapter updating source health metrics in local state | Records last seen timestamp and healthy status indicator | Passed |
| TEST-FR10-02 | `test_api_routers.py::test_health_endpoints` | Integration | GET /health and GET /api/v1/health/sources | Status 200 with individual source status indicators | Passed |

### FR-11: Mathematical Consensus Formulation, Probability Calibration & CPU Routing
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR11-01 | `test_consensus_calibration.py::test_consensus_formula_independence` | Unit | Two concurring sensors (weather=0.70, traffic=0.80) | Posterior reinforces to 0.9400, strictly higher than individual inputs | Passed |
| TEST-FR11-02 | `test_consensus_calibration.py::test_consensus_temporal_decay` | Unit | Sensor signal aged past half-life (6h) | Decays confidence towards uninformative prior smoothly | Passed |
| TEST-FR11-03 | `test_consensus_calibration.py::test_consensus_spatial_decay` | Unit | Disruption event located 25 km from asset location | Gaussian spatial distance decay dampens impact | Passed |
| TEST-FR11-04 | `test_consensus_calibration.py::test_strict_sensor_decoupling_fr11_2` | Unit | Zero incoming active sensors present | Returns base prior P=0.20 with zero false validations | Passed |
| TEST-FR11-05 | `test_consensus_calibration.py::test_brier_score_metric` | Unit | Forecasts evaluated against ground truth binary outcomes | BS bounded in [0.0, 1.0]; perfect forecast yields 0.0 | Passed |
| TEST-FR11-06 | `test_consensus_calibration.py::test_expected_calibration_error` | Unit | Partitioning predictions into 10 uniform intervals | ECE correctly measures weighted bin accuracy gap | Passed |
| TEST-FR11-07 | `test_consensus_calibration.py::test_platt_scaling_calibrator` | Unit | Fitting Platt logistic scaling on uncalibrated probabilities | Sigmoid output bounded strictly in (0, 1), reduces ECE | Passed |
| TEST-FR11-08 | `test_consensus_calibration.py::test_isotonic_regression_calibrator` | Unit | Applying Isotonic Regression via PAVA algorithm | Calibrated probabilities strictly non-decreasing monotonic | Passed |
| TEST-FR11-09 | `test_consensus_calibration.py::test_benchmark_brier_score_threshold_nfr4` | Unit | Evaluation on N=60 Sumatra benchmark dataset | Brier Score BS = 0.0782 <= 0.10 target | Passed |
| TEST-FR11-10 | `test_cpu_routing_weather.py::test_road_network_cache_integrity` | Unit | Loading data/road_network_sumatra.json graph | Graph contains 54 arterial nodes and 60 bidirectional edges | Passed |
| TEST-FR11-11 | `test_cpu_routing_weather.py::test_cpu_routing_shortest_path_latency` | Unit | Running NetworkX Dijkstra from Belawan to Tebing Tinggi | Returns valid path in < 10 ms CPU latency (actual: 1.4 ms) | Passed |
| TEST-FR11-12 | `test_cpu_routing_weather.py::test_cpu_routing_hazard_avoidance` | Unit | Injecting flood hazard polygon over Medan-Tebing Tinggi | Weights arterial edge with penalty, routes via Lubuk Pakam detour | Passed |
| TEST-FR11-13 | `test_cpu_routing_weather.py::test_cpu_fleet_vrp_latency_nfr5` | Unit | Solving 10-destination multi-vehicle VRP on CPU | Assigns feasible routes within capacity and time windows in < 150 ms | Passed |
| TEST-FR11-14 | `test_cpu_routing_weather.py::test_weather_fusion_service_openmeteo` | Integration | Fusing Open-Meteo precipitation grid with BMKG warnings | Produces combined GeoJSON polygons without GPU dependencies | Passed |
| TEST-FR11-15 | `test_cpu_routing_weather.py::test_agent4_offline_cache_resilience` | Unit | Simulating Open-Meteo and TomTom network blackout | Agent 4 falls back to local graph routing seamlessly | Passed |
| TEST-FR11-16 | `test_cpu_routing_weather.py::test_cuopt_service_backwards_compatibility` | Unit | Invoking optimize_fleet_routes_with_cuopt() adapter | Executes purely on CPU with zero NVIDIA GPU runtime calls | Passed |
| TEST-FR11-17 | `test_cpu_routing_weather.py::test_cpu_routing_alias_resolution` | Unit | Routing with node aliases ('medan', 'belawan', 'padang') | Correctly resolves canonical NetworkX graph node IDs | Passed |

### FR-12: Closed-Loop Operator Decision Trace & Ground-Truth Outcome Engine
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR12-01 | `test_outcomes_decisions.py::test_decision_schema_validation` | Unit | Logging multi-action decisions (ACCEPT, REJECT, OVERRIDE) | Validates action enum and enforces mandatory rationale notes | Passed |
| TEST-FR12-02 | `test_outcomes_decisions.py::test_decision_storage_sqlite` | Integration | Saving and retrieving decision logs via local SQLite | Persists to prehub_local.db with zero cloud dependencies | Passed |
| TEST-FR12-03 | `test_outcomes_decisions.py::test_outcomes_storage_sqlite` | Integration | Saving verified field outcome records locally in SQLite | Stores ground truth outcomes with timestamps and variance | Passed |
| TEST-FR12-04 | `test_outcomes_decisions.py::test_approvals_endpoint_multi_action` | Integration | POST /api/v1/approvals with ACCEPT, REJECT, and OVERRIDE | HTTP 201 Created and rejected on empty notes | Passed |
| TEST-FR12-05 | `test_outcomes_decisions.py::test_outcomes_endpoint` | Integration | POST /api/v1/outcomes and GET /api/v1/outcomes | Returns 201 Created and lists verified outcome records | Passed |
| TEST-FR12-06 | `test_outcomes_decisions.py::test_variance_recalibration` | Unit | High delay variance trigger with learning rate eta=0.05 | Generates normalized sensor weight adjustments summing to 1.0 | Passed |
| TEST-FR12-07 | `test_outcomes_decisions.py::test_benchmark_linking` | Unit | Linking outcome delay error to benchmark evaluation report | Correlates field feedback with historical precision/recall | Passed |
| TEST-FR12-08 | `test_outcomes_decisions.py::test_evaluation_endpoints` | Integration | GET /api/v1/outcomes/benchmark/summary | Returns mean delay variance and recalibration recommendations | Passed |

### FR-13: Tactical Multi-Modal Telemetry, WebGL God's-Eye HUD & Transponder Ingestion
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR13-01 | `test_vehicles_telemetry.py::test_fleet_telemetry_schema` | Unit | Pydantic schema validation for AIS, ADS-B, and Cold-Chain truck | Validates MMSI, IMO, ICAO24, VIN, and temperature fields | Passed |
| TEST-FR13-02 | `test_vehicles_telemetry.py::test_fleet_modality_filters` | Integration | GET /api/v1/fleet/vehicles?modality=truck/maritime/air | Correctly filters response and preserves modality counts | Passed |
| TEST-FR13-03 | `test_vehicles_telemetry.py::test_cold_chain_threshold_evaluation` | Unit | Evaluating temperature threshold (<=4.0 C normal, >4.0 C excursion) | Correctly sets NORMAL vs WARNING_EXCURSION cold chain status | Passed |
| TEST-FR13-04 | `test_vehicles_telemetry.py::test_offline_telemetry_fallback` | Unit | Simulating Redis and OpenSky outages | Falls back to 45-unit simulation cache with SIMULATION_CACHE status | Passed |

### FR-14: Dedicated Evaluation & Benchmark Dashboard (Reliability, Matrix & Savings)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR14-01 | `test_evaluation_router.py::test_get_benchmark_report` | Integration | GET /api/v1/evaluation/benchmark ($N=60$ Sumatra scenarios) | Precision >= 0.85, Recall >= 0.80, Brier Score <= 0.10, 10 calibration bins | Passed |
| TEST-FR14-02 | `test_evaluation_router.py::test_get_test_matrix_full` | Integration | GET /api/v1/evaluation/test-matrix (Exhaustive verification suite) | Status 200, exactly 133 tests categorized by FR domain, 0 failures | Passed |
| TEST-FR14-03 | `test_evaluation_router.py::test_get_test_matrix_filtered_by_fr` | Unit | Query filters (`?fr_id=FR-11`) | Filtered test list matching domain constraint | Passed |
| TEST-FR14-04 | `test_evaluation_router.py::test_get_test_matrix_search_query` | Unit | Search query filter (`?search=Dijkstra`) | Filtered tests matching query across ID, scenario, or module | Passed |
| TEST-FR14-05 | `test_evaluation_router.py::test_get_corridor_efficiency` | Unit | GET /api/v1/evaluation/corridor-efficiency (5 Sumatra corridors) | Positive time and cost savings, CPU solver latency < 10.0 ms | Passed |

### FR-15: Supabase Authentication & Multi-Role Workspace Management (RBAC)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR15-01 | `test_auth_rbac.py::test_create_and_decode_dispatcher_token` | Unit | Generate signed JWT for DISPATCHER persona with permissions | Decoded session reflects DISPATCHER role, PT Samudera org, and permissions | Passed |
| TEST-FR15-02 | `test_auth_rbac.py::test_create_and_decode_regulator_token` | Unit | Generate signed JWT for REGULATOR persona | Decoded session reflects REGULATOR role and Badan Pangan Nasional org | Passed |
| TEST-FR15-03 | `test_auth_rbac.py::test_create_and_decode_guest_token` | Unit | Generate signed JWT for GUEST sandbox persona | Decoded session reflects GUEST role and sandbox permissions | Passed |
| TEST-FR15-04 | `test_auth_rbac.py::test_invalid_token_rejected` | Security | Provide malformed/tampered JWT string to decode engine | Raises HTTP 401 Unauthorized with INVALID_TOKEN error detail | Passed |
| TEST-FR15-05 | `test_auth_rbac.py::test_expired_token_rejected` | Security | Decode token signed with negative expires_delta_hours (-1) | Raises HTTP 401 Unauthorized with TOKEN_EXPIRED error detail | Passed |
| TEST-FR15-06 | `test_auth_rbac.py::test_api_auth_me_endpoint` | Integration | GET /api/v1/auth/me with Bearer token header | Returns 200 OK with authenticated user profile payload | Passed |
| TEST-FR15-07 | `test_auth_rbac.py::test_api_auth_me_unauthorized` | Security | GET /api/v1/auth/me without Authorization header | Raises HTTP 401 Unauthorized | Passed |
| TEST-FR15-08 | `test_auth_rbac.py::test_api_auth_session_fallback` | Integration | GET /api/v1/auth/session without Authorization header | Returns 200 OK with default GUEST fallback profile | Passed |
| TEST-FR15-09 | `test_auth_rbac.py::test_api_create_guest_session` | Integration | POST /api/v1/auth/guest-session for instant guest entry | Returns 200 OK with valid guest JWT access token | Passed |
| TEST-FR15-10 | `test_auth_rbac.py::test_api_create_guest_session_invalid_role` | Security | POST /api/v1/auth/guest-session with non-existent role | Raises HTTP 400 Bad Request with UNRECOGNIZED_ROLE | Passed |
| TEST-FR15-11 | `test_auth_rbac.py::test_api_switch_role` | Integration | POST /api/v1/auth/switch-role from Dispatcher to Regulator | Returns 200 OK with newly signed JWT containing target role | Passed |
| TEST-FR15-12 | `test_auth_rbac.py::test_api_roles_catalog` | Integration | GET /api/v1/auth/roles | Returns catalog containing DISPATCHER, REGULATOR, and GUEST definitions | Passed |
| TEST-FR15-13 | `test_auth_rbac.py::test_rbac_approval_allowed_for_dispatcher` | Security | Dispatcher attempts to approve route detour via /api/v1/approvals | Authorized: returns 201 Created and logs approval | Passed |
| TEST-FR15-14 | `test_auth_rbac.py::test_rbac_approval_rejected_for_regulator` | Security | Regulator attempts to approve route detour via /api/v1/approvals | Denied: raises HTTP 403 Forbidden with role limitation explanation | Passed |
| TEST-FR15-15 | `test_auth_rbac.py::test_rbac_approval_allowed_for_guest` | Security | Guest in sandbox mode approves route detour via /api/v1/approvals | Authorized in sandbox: returns 201 Created and logs approval | Passed |

### FR-16: Self-Serve Fleet Onboarding & GPS Telematics Ingestion (Phase 43)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR16-01 | `test_fleet_ingest.py::test_manifest_template_endpoint` | Integration | GET /api/v1/fleet/manifest/template | Returns CSV header definition and valid sample CSV lines | Passed |
| TEST-FR16-02 | `test_fleet_ingest.py::test_register_single_vehicle_success` | Integration | POST /api/v1/fleet/register as DISPATCHER with truck payload | HTTP 200/201, registered_count=1, vehicle persisted | Passed |
| TEST-FR16-03 | `test_fleet_ingest.py::test_register_single_vehicle_regulator_forbidden` | Security | POST /api/v1/fleet/register as REGULATOR | HTTP 403 Forbidden with read-only limitation explanation | Passed |
| TEST-FR16-04 | `test_fleet_ingest.py::test_bulk_manifest_upload_json` | Integration | POST /api/v1/fleet/upload-manifest with JSON vehicle list and raw csv_text | HTTP 200, parses and registers multiple custom vehicles in batch | Passed |
| TEST-FR16-05 | `test_fleet_ingest.py::test_bulk_manifest_upload_csv_file` | Integration | POST /api/v1/fleet/upload-manifest/file multipart CSV upload | HTTP 200, registers all valid vehicles parsed from multipart buffer | Passed |
| TEST-FR16-06 | `test_fleet_ingest.py::test_tms_telemetry_webhook_ingestion` | Integration | POST /api/v1/fleet/telemetry/ingest standard TMS webhook ping | HTTP 200, updates real-time coordinates, speed, and heading | Passed |
| TEST-FR16-07 | `test_fleet_ingest.py::test_telemetry_service_dynamic_fusion` | Unit | telemetry_service.get_unified_fleet() with registered custom assets | Seamlessly fuses baseline 45-unit master fleet with custom fleet | Passed |
| TEST-FR16-08 | `test_fleet_ingest.py::test_cold_chain_excursion_evaluation_on_custom_fleet` | Unit | TMS ping with temperature=7.5 C on reefer truck (> 4.0 C limit) | Evaluates status as WARNING_EXCURSION with temperature anomaly | Passed |
| TEST-FR16-09 | `test_fleet_ingest.py::test_custom_vehicle_listing_and_deletion` | Integration | GET /api/v1/fleet/custom and DELETE /api/v1/fleet/custom/{id} | Lists custom vehicles; enforces DISPATCHER RBAC on deletion | Passed |

### FR-17: Intermodal Sea-Land Terminal & Choke-Point Synchronization (Phase 44)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR17-01 | `test_intermodal_hedging_compliance.py::test_chokepoints_registry_integrity` | Unit | Querying all registered Pan-Sumatra choke-points | Registry contains 18 strategic gateways (7 ports, 11 passes) | Passed |
| TEST-FR17-02 | `test_intermodal_hedging_compliance.py::test_intermodal_delay_multiplier_clamping` | Unit | Computing delay multiplier with extreme queue counts (0 to 100) | M_intermodal strictly clamped in interval [1.0, 3.5] | Passed |
| TEST-FR17-03 | `test_intermodal_hedging_compliance.py::test_haversine_and_route_intermodal_delay` | Unit | Calculating route proximity delay across Medan-Pekanbaru | Modulates route travel time by proximity to active bottlenecks | Passed |
| TEST-FR17-04 | `test_intermodal_hedging_compliance.py::test_api_chokepoints_list` | Integration | GET /api/v1/intermodal/chokepoints with type and status filters | Returns 18+ gateways, congested_count, and restricted_count | Passed |
| TEST-FR17-05 | `test_intermodal_hedging_compliance.py::test_api_chokepoints_detail_and_404` | Integration | GET /api/v1/intermodal/chokepoints/PORT_BELAWAN and invalid ID | Returns 200 OK for valid ID; raises HTTP 404 for invalid ID | Passed |

### FR-18: Operational Spoilage Hedging & Economic Cost-Benefit Solver (Phase 44)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR18-01 | `test_intermodal_hedging_compliance.py::test_bpjt_toll_segment_tariffs` | Unit | Querying BPJT toll tariffs across Golongan I-V vehicles | Monotonically increasing tariffs: Gol_I < Gol_II < ... < Gol_V | Passed |
| TEST-FR18-02 | `test_intermodal_hedging_compliance.py::test_4_tier_perishability_decay` | Unit | Evaluating exponential cargo value loss over 24-hour delay | Decay rates: Cabai (0.025/h) > Bawang (0.008/h) > Beras (0.0005/h) | Passed |
| TEST-FR18-03 | `test_intermodal_hedging_compliance.py::test_spoilage_hedging_solve_perishable_high_risk` | Unit | Hedging solve: 10T Cabai Merah facing 14h flood delay | Recommends REROUTE policy with substantial net monetary savings | Passed |
| TEST-FR18-04 | `test_intermodal_hedging_compliance.py::test_spoilage_hedging_solve_dry_bulk_low_risk` | Unit | Hedging solve: 20T Beras SPHP facing 2h minor delay | Recommends CONTINUE policy (toll/fuel savings exceed decay risk) | Passed |
| TEST-FR18-05 | `test_intermodal_hedging_compliance.py::test_api_hedging_solve` | Integration | POST /api/v1/intermodal/hedging/solve with inflation shock factor | Returns complete cost breakdown for CONTINUE, REROUTE, and HOLD | Passed |
| TEST-FR18-06 | `test_intermodal_hedging_compliance.py::test_api_toll_tariffs` | Integration | GET /api/v1/intermodal/toll-tariffs | Returns BPJT segments, Pertamina fuel rates, and perishability tiers | Passed |

### FR-19: Digital Cargo Manifest & Agricultural Quarantine Compliance (Phase 44)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR19-01 | `test_intermodal_hedging_compliance.py::test_compliance_bkhit_inter_island_hard_block` | Security | Inter-island shipment (Sumatra to Java) lacking BKHIT certificate | Triggers HARD_BLOCK status and sets can_dispatch=False | Passed |
| TEST-FR19-02 | `test_intermodal_hedging_compliance.py::test_compliance_bkhit_inter_island_passed` | Integration | Inter-island shipment with verified BKHIT certificate reference ID | Returns PASSED status and sets can_dispatch=True | Passed |
| TEST-FR19-03 | `test_intermodal_hedging_compliance.py::test_compliance_bkhit_intra_sumatra_no_block` | Unit | Intra-provincial shipment (Medan to Tebing Tinggi) without BKHIT | Exempt from inter-island quarantine, passes without hard block | Passed |
| TEST-FR19-04 | `test_intermodal_hedging_compliance.py::test_compliance_mst_axle_load_warning` | Unit | Heavy vehicle (>8 Ton gross) traversing Class III mountain pass | Triggers WARNING status and sets requires_override=True | Passed |
| TEST-FR19-05 | `test_intermodal_hedging_compliance.py::test_compliance_surat_jalan_manifest_warning` | Unit | Shipment lacking digital electronic Surat Jalan SHA-256 hash | Flags WARNING advisory requiring electronic manifest attachment | Passed |
| TEST-FR19-06 | `test_intermodal_hedging_compliance.py::test_api_compliance_verify` | Integration | POST /api/v1/intermodal/compliance/verify | Returns overall_status, can_dispatch flag, and itemized checks | Passed |

### FR-20: Pilot Verification, Scenario Drills & Production Packaging (Phase 45)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR20-01 | `test_pilot_e2e.py::test_drill1_belawan_pekanbaru_spoilage_hedging_e2e` | Integration | Drill 1: Belawan to Pekanbaru perishable detour around Tebing Tinggi flood | Net risk savings > IDR 60M, CPU Dijkstra reroute latency < 2.0 ms | Passed |
| TEST-FR20-02 | `test_pilot_e2e.py::test_drill1_whatsapp_link_generation_and_decision_logging` | Integration | Drill 1: Generating WhatsApp dispatch URI and recording decision trace in SQLite | Valid wa.me URI generated, decision persisted with ACCEPT/REROUTE action | Passed |
| TEST-FR20-03 | `test_pilot_e2e.py::test_drill1_outcome_verification_t12h` | Integration | Drill 1: Recording T+12h field outcome from LKBN Antara ground truth | Variance computed, sensor recalibration weight adjustments generated | Passed |
| TEST-FR20-04 | `test_pilot_e2e.py::test_drill2_bakauheni_merak_bkhit_quarantine_hard_block` | Security | Drill 2: Bakauheni strait crossing beef shipment without BKHIT certificate | Enforces non-negotiable statutory HARD_BLOCK (UU No. 21/2019) | Passed |
| TEST-FR20-05 | `test_pilot_e2e.py::test_drill2_bakauheni_merak_bkhit_quarantine_release` | Integration | Drill 2: Bakauheni strait crossing with valid BKHIT certificate attached | Clearance status transitions to PASSED with reefer fuel burn rate audit | Passed |
| TEST-FR20-06 | `test_pilot_e2e.py::test_drill3_sitinjau_lauik_mst_axle_load_warning` | Integration | Drill 3: Sitinjau Lauik mountain pass with 14.2T vehicle > 8.0T MST limit | Returns statutory WARNING, rejects empty override notes with HTTP 422 | Passed |
| TEST-FR20-07 | `test_pilot_e2e.py::test_drill3_sitinjau_lauik_operator_override_with_notes` | Integration | Drill 3: Operator override with Dishub/Polda escort custom constraints | Audits liability transfer override trace in SQLite with CPU detour routing | Passed |
| TEST-FR20-08 | `test_pilot_e2e.py::test_pilot_real_data_integrity_invariants` | Audit | Auditing 54-node NetworkX road graph, 18 choke-points, BPJT tariffs, Pertamina rates | 100% verified real Pan-Sumatra data, zero mockup or synthetic placeholders | Passed |
