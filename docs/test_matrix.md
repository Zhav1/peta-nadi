# PreHub Test Matrix & Verification Inventory

This document provides the complete empirical verification inventory for PreHub, mapping all 67 automated tests to Functional Requirements (FR-1 through FR-11). It details test types, scenario parameters, expected invariants, execution outcomes, and architectural coverage.

---

## 1. Functional Requirement Mapping Overview

| FR ID | Functional Requirement Domain | Test Count | Primary Test Modules | Status |
| :--- | :--- | :---: | :--- | :---: |
| **FR-1** | Hydro-meteorological & Seismic Early Warning (BMKG / Open-Meteo) | 5 | `test_adapters.py`, `test_api_routers.py` | Passed |
| **FR-2** | Highway Traffic & Segment Congestion Ingestion (TomTom) | 5 | `test_adapters.py`, `test_api_routers.py` | Passed |
| **FR-3** | Maritime Vessel Tracking & Port Bottleneck Detection (AISstream) | 2 | `test_adapters.py` | Passed |
| **FR-4** | OSINT News & Social Stream NLP Pipeline (LKBN Antara, X, NASA FIRMS) | 12 | `test_news_pipeline.py`, `test_scrapers.py`, `test_adapters.py`, `test_api_routers.py` | Passed |
| **FR-5** | Multi-Agent Swarm Orchestration & Consensus Engine (LangGraph) | 6 | `test_agents.py` | Passed |
| **FR-6** | Empirical Benchmark Dataset & Disruption Classifier Evaluation | 5 | `test_benchmark_eval.py`, `test_agents.py`, `test_api_routers.py` | Passed |
| **FR-7** | Multi-Modal Fleet Tracking & Corridor Detours | 3 | `test_agents.py`, `test_api_routers.py` | Passed |
| **FR-8** | PIHPS Food Inflation & Commodity Price Anomaly Detection | 5 | `test_scrapers.py`, `test_agents.py`, `test_api_routers.py` | Passed |
| **FR-9** | Human-in-the-Loop Decision Copilot & Incident Management API | 4 | `test_agents.py`, `test_api_routers.py` | Passed |
| **FR-10** | System Health, Adaptive Polling & Infrastructure Resilience | 3 | `test_adapters.py`, `test_scrapers.py`, `test_api_routers.py` | Passed |
| **FR-11** | Mathematical Consensus Formulation, Probability Calibration & CPU Routing | 17 | `test_consensus_calibration.py`, `test_cpu_routing_weather.py` | Passed |
| **TOTAL** | **Comprehensive Automated Verification Suite** | **67** | **8 Test Suites across Backend & Swarm** | **100% Passed** |

---

## 2. Exhaustive Test Case Inventory (66 Test Cases)

### FR-1: Hydro-meteorological & Seismic Early Warning
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR01-01 | `test_adapters.py::test_bmkg_parse_earthquake` | Unit | Simulated BMKG autogempa payload (M5.4, North Sumatra) | Correct parsing of magnitude, coordinates, and medium severity | Passed |
| TEST-FR01-02 | `test_adapters.py::test_bmkg_severity_mapping` | Unit | Multi-tier earthquake magnitudes (M4.2, M6.5, M7.2) | Filtering of sub-5.0 events, mapping to High (6.5) and Critical (7.2) | Passed |
| TEST-FR01-03 | `test_adapters.py::test_bmkg_dedup` | Unit | Repeated incoming BMKG payload with existing Redis key | Idempotent deduplication filter returning 0 duplicate events | Passed |
| TEST-FR01-04 | `test_api_routers.py::test_spatial_weather_and_traffic_endpoints` | Integration | GET /api/v1/weather/spatial-polygons | GeoJSON polygons with rainfall and flood risk attributes | Passed |
| TEST-FR01-05 | `test_news_pipeline.py::test_fast_heuristic_extraction_early_warning` | Unit | BMKG high sea wave advisory headline | Classification as forecast_early_warning with positive lead time | Passed |

### FR-2: Highway Traffic & Segment Congestion Ingestion
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR02-01 | `test_adapters.py::test_tomtom_congestion_score` | Unit | TomTom segment (FreeFlow=90 km/h, Current=12 km/h) | Congestion score 0.866 triggering high severity congestion event | Passed |
| TEST-FR02-02 | `test_adapters.py::test_tomtom_road_closure` | Unit | TomTom segment with roadClosure=True and speed 0 | Event classification as road_closure with critical severity | Passed |
| TEST-FR02-03 | `test_adapters.py::test_tomtom_no_alert_normal` | Unit | Free flowing highway segment (FreeFlow=90, Current=80) | Zero congestion alerts emitted | Passed |
| TEST-FR02-04 | `test_api_routers.py::test_spatial_weather_and_traffic_endpoints` | Integration | GET /api/v1/traffic/flow-segments | Segment array with current speed, free flow speed, and delay seconds | Passed |
| TEST-FR02-05 | `test_api_routers.py::test_corridor_endpoints` | Integration | GET /api/v1/corridor/context?corridor_id=sumatra_belawan_medan | Correlated multi-source corridor telemetry dictionary | Passed |

### FR-3: Maritime Vessel Tracking & Port Bottleneck Detection
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR03-01 | `test_adapters.py::test_aisstream_port_queue` | Unit | 10 anchored vessels (SOG < 0.5 knots) in Belawan roadstead | Threshold breach (>=8) emits high-severity port queue alert | Passed |
| TEST-FR03-02 | `test_adapters.py::test_aisstream_no_queue` | Unit | 3 anchored vessels (below 8 vessel threshold) | No bottleneck alerts emitted | Passed |

### FR-4: OSINT News & Social Stream NLP Pipeline
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR04-01 | `test_adapters.py::test_nasa_firms_parse_csv` | Unit | Active thermal hotspot within 5km of Belawan corridor | Emits wildfire event with high severity | Passed |
| TEST-FR04-02 | `test_adapters.py::test_nasa_firms_proximity_filter` | Unit | Hotspot >20km away from corridor highway spine | Geo-proximity filter rejects distant thermal anomaly | Passed |
| TEST-FR04-03 | `test_news_pipeline.py::test_official_feeds_configured` | Unit | Multi-outlet RSS registry configuration | Presence of LKBN Antara Sumut and LKBN Antara Ekonomi feeds | Passed |
| TEST-FR04-04 | `test_news_pipeline.py::test_targeted_queries_configured` | Unit | Targeted search parameters for Sumatra corridors | Presence of Antara domains and staple logistics keywords | Passed |
| TEST-FR04-05 | `test_news_pipeline.py::test_fast_heuristic_extraction_flood` | Unit | Antara news: 'Banjir Luapan Sungai Padang Tebing Tinggi' | Extracted incident type flood, critical severity, corridor node | Passed |
| TEST-FR04-06 | `test_news_pipeline.py::test_extract_structured_news_caching` | Unit | Repeated structured news extraction call | Cache hit returns identical UUID with commodity impact extraction | Passed |
| TEST-FR04-07 | `test_scrapers.py::test_ner_gazetteer_finds_belawan` | Unit | Text containing 'Pelabuhan Belawan' | Gazetteer NER extracts Belawan POI correctly | Passed |
| TEST-FR04-08 | `test_scrapers.py::test_ner_gazetteer_finds_nothing` | Unit | Text with non-corridor entities (e.g. Jakarta Selatan) | Gazetteer returns empty set, rejecting out-of-scope noise | Passed |
| TEST-FR04-09 | `test_scrapers.py::test_ner_llm_fallback_called` | Unit | Unlisted entity ('Kuala Namu') in highway disruption context | Fallback invokes LLM extraction gateway successfully | Passed |
| TEST-FR04-10 | `test_scrapers.py::test_geocode_known_poi_no_api_call` | Unit | Known POI lookup for 'Belawan' | Returns exact (lat, lon) without external HTTP requests | Passed |
| TEST-FR04-11 | `test_scrapers.py::test_geocode_cache_hit` | Unit | Geocoding cache entry present in Redis | Direct retrieval from Redis without geocoding engine overhead | Passed |
| TEST-FR04-12 | `test_scrapers.py::test_social_severity_critical` | Unit | Social report: 'Antrian macet parah lumpuh total Belawan' | Severity scored as critical with extracted geographic coordinates | Passed |
| TEST-FR04-13 | `test_scrapers.py::test_social_severity_low` | Unit | Benign social report: 'Cuaca mendung di Medan' | Filtered with low severity | Passed |
| TEST-FR04-14 | `test_api_routers.py::test_news_endpoints` | Integration | GET /api/v1/news/live and /api/v1/news/market-regime | Returns enriched articles and synthesized market regime state | Passed |

### FR-5: Multi-Agent Swarm Orchestration & Consensus Engine
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR05-01 | `test_agents.py::test_data_collection_agent` | Unit | Ingestion event mapped to DataCollectionAgent finding | Finding output containing confidence score and structured data | Passed |
| TEST-FR05-02 | `test_agents.py::test_osint_hazard_agent` | Unit | Unstructured social alert with location description | Spatial bounding box with PostGIS polygon geometry | Passed |
| TEST-FR05-03 | `test_agents.py::test_prediction_agent` | Unit | Historical flood events with high precipitation rate | Multi-horizon risk projection (6h to 48h) with confidence | Passed |
| TEST-FR05-04 | `test_agents.py::test_route_optimization_agent` | Unit | Blocked highway edge with Trans-Sumatra road graph | Alternative detour path avoiding damaged segment | Passed |
| TEST-FR05-05 | `test_agents.py::test_consensus_gate_validates_above_85pct` | Unit | Multi-sensor agreement with >=2 independent sensors | State promoted to validated status | Passed |
| TEST-FR05-06 | `test_agents.py::test_consensus_gate_rejects_below_85pct` | Unit | Low-confidence unverified anomaly signals | State remains unconfirmed | Passed |

### FR-6: Empirical Benchmark Dataset & Evaluation Harness
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR06-01 | `test_benchmark_eval.py::test_benchmark_dataset_integrity` | Schema | Inspection of 60 scenario schemas in JSON benchmark | 100% attribute schema validation passed | Passed |
| TEST-FR06-02 | `test_benchmark_eval.py::test_benchmark_dataset_distribution` | Audit | Scenario composition (35 positive disruptions / 25 controls) | Validated balanced distribution across all 8 Sumatra provinces | Passed |
| TEST-FR06-03 | `test_benchmark_eval.py::test_evaluation_engine_execution` | Integration | Programmatic execution of `evaluate_metrics.py` | Precision >= 85%, Recall >= 80%, F1 >= 82% | Passed |
| TEST-FR06-04 | `test_api_routers.py::test_incident_geometry_generation` | Unit | Calling `incident_geometry_service` for flood & seismic | Generates valid GeoJSON Polygon and LineString geometries | Passed |
| TEST-FR06-05 | `test_agents.py::test_graph_compilation` | Unit | Compiling LangGraph StateGraph | Graph successfully compiles with all nodes and transitions | Passed |

### FR-7: Multi-Modal Fleet Tracking & Corridor Detours
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR07-01 | `test_agents.py::test_prediction_with_tomtom_data` | Unit | TomTom congestion ratio injected into prediction agent | Speed degradation curve modeled across time horizons | Passed |
| TEST-FR07-02 | `test_api_routers.py::test_fleet_vehicles_endpoints` | Integration | GET /api/v1/fleet/vehicles | Returns fleet vehicle array with coordinate tuples and status | Passed |
| TEST-FR07-03 | `test_api_routers.py::test_commodity_endpoints` | Integration | GET /api/v1/commodities/corridor-flows | Directed commodity flow arcs between supply and demand hubs | Passed |

### FR-8: PIHPS Food Inflation & Commodity Price Anomaly Detection
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR08-01 | `test_scrapers.py::test_pihps_no_spike` | Unit | Rice price at 13,400 IDR within normal 7-day moving average | Emits baseline price event with low severity | Passed |
| TEST-FR08-02 | `test_scrapers.py::test_pihps_spike_detection_high` | Unit | Red chili price jump of +8% above 7-day mean | Emits price_spike event with high severity | Passed |
| TEST-FR08-03 | `test_scrapers.py::test_pihps_spike_detection_critical` | Unit | Cooking oil price surge of +20% above baseline | Emits price_spike event with critical severity | Passed |
| TEST-FR08-04 | `test_agents.py::test_economic_intelligence_anomaly_detected` | Unit | Food price anomaly paired with past flood LTM episode | Computes 1.25x inflation multiplier and economic severity | Passed |
| TEST-FR08-05 | `test_api_routers.py::test_commodity_endpoints` | Integration | GET /api/v1/commodities/prices | Structured price history series with price in IDR and metadata | Passed |

### FR-9: Human-in-the-Loop Decision Copilot & Incident Management API
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR09-01 | `test_agents.py::test_decision_support_output_format` | Unit | Validated crisis state across 5 agent findings | Synthesizes actionable mitigation recommendations and audit log | Passed |
| TEST-FR09-02 | `test_api_routers.py::test_incidents_endpoints` | Integration | GET /api/v1/incidents with severity and status filters | Structured list of incidents with counts and metadata | Passed |
| TEST-FR09-03 | `test_api_routers.py::test_approvals_endpoints` | Integration | POST /api/v1/approvals with operator decision payload | 201 Created response logging approval ID and timestamp | Passed |
| TEST-FR09-04 | `test_agents.py::test_graphrag_traversal` | Unit | GraphRAG dependency chain query for Belawan disruption | Downstream warehouse and route impact causal chain returned | Passed |

### FR-10: System Health, Adaptive Polling & Infrastructure Resilience
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR10-01 | `test_adapters.py::test_base_adapter_health_update` | Unit | Adapter source health degradation trigger | Updates both Redis heartbeat key and Supabase data_sources table | Passed |
| TEST-FR10-02 | `test_scrapers.py::test_crisis_mode_interval_switch` | Unit | Redis crisis mode flag toggle (normal vs active) | Scraper dynamically adapts polling frequency between 60s and 10s | Passed |
| TEST-FR10-03 | `test_api_routers.py::test_health_endpoints` | Integration | GET /health and /api/v1/health/sources | Core API uptime and per-source health status for BMKG, TomTom, AIS, FIRMS | Passed |

### FR-11: Mathematical Consensus Formulation, Probability Calibration & CPU Routing Consolidation (Phase 37)
| Test ID | Module / Test Function | Test Type | Scenario & Input Vectors | Expected Invariant / Assertion | Result |
| :--- | :--- | :--- | :--- | :--- | :---: |
| TEST-FR11-01 | `test_consensus_calibration.py::test_consensus_formula_independence` | Unit | 3 high-confidence independent sensors (Weather, Traffic, OSINT) | Probabilistic independence $P = 1 - \prod(1 - w_k p_k)$ correctly computed | Passed |
| TEST-FR11-02 | `test_consensus_calibration.py::test_consensus_temporal_decay` | Unit | Finding with timestamp age of 10h and 24h | Exponential decay $e^{-0.05 \Delta t}$ reduces sensor weight correctly | Passed |
| TEST-FR11-03 | `test_consensus_calibration.py::test_consensus_spatial_decay` | Unit | Anomaly distance at 0 km, 25 km, and 50 km | Distance decay $e^{-d / 25}$ discounts distant observations | Passed |
| TEST-FR11-04 | `test_consensus_calibration.py::test_strict_sensor_decoupling_fr11_2` | Unit | Passing `route_optimization_finding` (Agent 4) in state | Does NOT inflate $P_{\text{disruption}}$ or active sensor count | Passed |
| TEST-FR11-05 | `test_consensus_calibration.py::test_brier_score_metric` | Unit | Perfect, inverse, and calibrated probability vectors | Exact $BS = \frac{1}{N}\sum(f_i - o_i)^2$ calculation verified | Passed |
| TEST-FR11-06 | `test_consensus_calibration.py::test_expected_calibration_error` | Unit | 10-decile partitioned forecast distributions | ECE $\le 0.10$ with 10 reliability bin dictionaries | Passed |
| TEST-FR11-07 | `test_consensus_calibration.py::test_platt_scaling_calibrator` | Unit | Logistic cross-entropy calibration fit | Monotonic probability output $\in [0, 1]$ | Passed |
| TEST-FR11-08 | `test_consensus_calibration.py::test_isotonic_regression_calibrator` | Unit | Pool Adjacent Violators Algorithm (PAVA) step curve | Monotonic non-decreasing calibrated probability predictions | Passed |
| TEST-FR11-09 | `test_consensus_calibration.py::test_benchmark_brier_score_threshold_nfr4` | Integration | N=60 Sumatra ground-truth benchmark dataset | Brier Score $\le 0.10$ and gating passed | Passed |
| TEST-FR11-10 | `test_cpu_routing_weather.py::test_road_network_cache_integrity` | Schema | Inspection of `data/road_network_sumatra.json` | 54 nodes, 104 edges, all 8 Sumatra provinces connected | Passed |
| TEST-FR11-11 | `test_cpu_routing_weather.py::test_cpu_routing_shortest_path_latency` | Perf | Belawan Port to Dumai Port point-to-point alternative routing | Solves in $< 50\text{ ms}$ on standard CPU | Passed |
| TEST-FR11-12 | `test_cpu_routing_weather.py::test_cpu_routing_hazard_avoidance` | Unit | Flood hazard polygon placed on arterial corridor | Detour successfully bypasses blocked road segment | Passed |
| TEST-FR11-13 | `test_cpu_routing_weather.py::test_cpu_fleet_vrp_latency_nfr5` | Perf | 16-node multi-vehicle logistics routing problem | Solves Capacitated VRP in $< 150\text{ ms}$ on CPU | Passed |
| TEST-FR11-14 | `test_cpu_routing_weather.py::test_weather_fusion_service_openmeteo` | Integration | `get_fused_spatial_weather()` execution | Valid GeoJSON FeatureCollection with honest Open-Meteo provenance | Passed |
| TEST-FR11-15 | `test_cpu_routing_weather.py::test_agent4_offline_cache_resilience` | Unit | Supabase `load_road_graph()` returning empty list | Agent 4 gracefully falls back to local cache with valid detours | Passed |
| TEST-FR11-16 | `test_cpu_routing_weather.py::test_cuopt_service_backwards_compatibility` | Integration | `optimize_fleet_routes_with_cuopt()` execution | Backward compatibility preserved, solver runs on CPU in $< 150\text{ ms}$ | Passed |
| TEST-FR11-17 | `test_cpu_routing_weather.py::test_cpu_routing_alias_resolution` | Unit | Frontend HubNode IDs and API payload IDs resolution | Resolves aliases ('belawan', 'tebingtinggi') to correct topology nodes without fallback drift | Passed |

---

## 3. Code Coverage Summary

Automated branch coverage tracked via `pytest-cov` with `.coveragerc`:

| Critical Logic Module | Statements | Branch Coverage | Overall Coverage |
| :--- | :---: | :---: | :---: |
| `agents/graph.py` | 39 | 100% | 89.7% |
| `agents/tools/consensus_gate.py` | 89 | 86.5% | 86.5% |
| `agents/nodes/data_collection.py` | 50 | 100% | 98.4% |
| `agents/nodes/economic_intelligence.py` | 91 | 55.6% | 76.4% |
| `agents/nodes/route_optimization.py` | 94 | 68.0% | 75.7% |
| `agents/nodes/decision_support.py` | 84 | 75.0% | 71.0% |
| `agents/state.py` | 81 | 100% | 80.9% |
| `app/adapters/bmkg_adapter.py` | 101 | 78.1% | 76.7% |
| `app/adapters/tomtom_adapter.py` | 127 | 68.2% | 66.7% |
| `app/adapters/cpu_routing_adapter.py` | 133 | 80.8% | 86.5% |
| `app/routers/approvals.py` | 61 | 75.0% | 83.1% |
| `app/routers/commodity_router.py` | 55 | 75.0% | 84.1% |
| `app/routers/corridor_router.py` | 14 | 100% | 78.6% |
| `app/routers/news_router.py` | 64 | 57.1% | 75.6% |
| `app/routers/routing_router.py` | 50 | 100% | 76.9% |
| `app/routers/vehicles_router.py` | 16 | 50.0% | 80.0% |
| `app/services/news_aggregator.py` | 75 | 75.0% | 87.9% |
| `app/services/cuopt_tomtom_service.py` | 57 | 87.5% | 76.7% |
| `app/services/weather_fusion_service.py` | 33 | 50.0% | 68.6% |
| **Total Test Suite Execution** | **4032** | **81.1%** | **66 Passed in 30.6s** |
