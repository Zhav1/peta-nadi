# Phase 37: Mathematical Consensus Formulation, Probability Calibration & CPU Routing Consolidation - Context

**Gathered:** 2026-09-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 37 addresses core feedback from technical judges regarding algorithmic conformance, probabilistic validity, and realistic computing architecture. It delivers:
1. **Mathematical Consensus Formulation**: Refactors the Consensus Gate from simple linear summation to the technical proposal's probabilistic independence formulation:
   $$P_{\text{disruption}}(s) = 1 - \prod_{k \in \{W, T, I\}} (1 - w_k \cdot p_k(s))$$
   incorporating exponential temporal decay ($e^{-\lambda \Delta t}$ with $\lambda = 0.05/\text{hour}$) and inverse distance spatial decay ($e^{-d / d_0}$ with $d_0 = 25\text{ km}$).
2. **Sensor Decoupling**: Strictly isolates independent sensor observations (BMKG, Open-Meteo, TomTom, OSINT) from internal derived outputs (Agent 4 route optimization detours), preventing self-reinforcing consensus loops.
3. **Probability Calibration Service**: Implements empirical Brier Score calculation ($BS \le 0.10$), Expected Calibration Error (ECE) with 10 reliability decile bins, and calibration transforms (Platt Scaling via logistic sigmoid and Isotonic Regression).
4. **Deterministic CPU Routing Engine**: Replaces mock NVIDIA cuOpt calls with a deterministic CPU solver uniting NetworkX Dijkstra / A* and Google OR-Tools VRP, backed by a local Sumatra arterial road network graph cache (`data/road_network_sumatra.json`) achieving <150 ms latency for 50 nodes.
5. **Standardized Weather Fusion Service**: Upgrades `weather_fusion_service.py` to consume open Open-Meteo numerical forecasts (ECMWF/GFS) and BMKG warning radar with zero GPU or Earth-2 dependencies, stripping all fictional DGX boasting.

This phase solidifies system credibility, algorithmic rigor, and offline reliability.
</domain>

<decisions>
## Implementation Decisions

### Mathematical Consensus Gate
- **D-01 (Probabilistic Independence Model):** Consensus gate in `agents/tools/consensus_gate.py` must compute $P_{\text{disruption}}(s) = 1 - \prod_{k} (1 - w_k(t, d) \cdot p_k(s))$ where $k \in \{\text{Weather}, \text{Traffic}, \text{OSINT}, \text{Economics}\}$. Default baseline weights: Weather $w_W = 0.35$, Traffic $w_T = 0.35$, OSINT $w_I = 0.30$.
- **D-02 (Spatio-Temporal Decay):** Dynamic weight adjustment:
  - Temporal decay: $w_k(t) = w_{k,0} \cdot e^{-\lambda \Delta t}$, where $\lambda = 0.05/\text{hour}$.
  - Spatial decay: $w_k(d) = w_k(t) \cdot e^{-d / d_0}$, where $d_0 = 25.0\text{ km}$.
- **D-03 (Strict Sensor Decoupling):** Agent 4 (Route Optimization) is an operational response, NOT an independent observation sensor. It must not contribute to $P_{\text{disruption}}$ or the independent sensor vote count. Disruption validation requires $P_{\text{disruption}} \ge 0.85$ and at least 2 independent external sensor channels with $p_k > 0.5$.

### Probability Calibration
- **D-04 (Empirical Calibration Metrics):** `backend/app/services/probability_calibration.py` provides:
  - Brier Score: $BS = \frac{1}{N}\sum_{i=1}^N (f_i - o_i)^2$.
  - Expected Calibration Error (ECE) across 10 uniform probability deciles $[0.0, 0.1), \dots, [0.9, 1.0]$.
  - Reliability curve coordinates (mean predicted probability vs observed fraction of positives per bin).
- **D-05 (Calibration Transforms):** Implement Platt Scaling ($P_{\text{cal}} = \frac{1}{1 + e^{-(A \cdot f + B)}}$) and non-parametric Isotonic Regression (PAVA algorithm) using SciPy/NumPy to calibrate raw heuristic scores against the ground-truth benchmark.

### Deterministic CPU Routing
- **D-06 (Local Sumatra Road Network Cache):** Create `data/road_network_sumatra.json` containing 50+ verified arterial and toll junctions across Trans-Sumatra Highway, Belawan Port, Bakauheni, and provincial hubs, with distances, average speeds, and corridor tags.
- **D-07 (CPU Routing Engine & cuOpt Replacement):** Create `backend/app/adapters/cpu_routing_adapter.py`. Route requests to NetworkX Dijkstra for point-to-point detours and Google OR-Tools (with NetworkX heuristic fallback) for multi-stop fleet VRP. Guarantees <150 ms execution time on CPU without GPU overhead.
- **D-08 (API Compatibility):** Retain `POST /api/v1/routing/optimize-cuopt` and `cuopt_tomtom_service.py` as transparent wrappers around the CPU routing engine, documenting the honest CPU architecture while preventing frontend breaking changes.

### Weather Fusion Standardization
- **D-09 (Zero GPU Weather Fusion):** Create `backend/app/adapters/openmeteo_adapter.py` to standardize Open-Meteo API ingestion. Update `weather_fusion_service.py` to fuse BMKG radar and Open-Meteo GFS/ECMWF forecasts. Remove all references to "NVIDIA FourCastNet DGX AI Forecast".

</decisions>

<canonical_refs>
## Canonical References

### Requirements & Proposal Documents
- `.planning/REQUIREMENTS.md` § FR-11.1 to FR-11.5, NFR-4, NFR-5, NFR-7
- `.planning/ROADMAP.md` § Phase 37
- `docs/Dokumen_Pendukung_PreHub.md` § 4.3 (Formulasi Matematika Indeks Risiko Gabungan)
- `scripts/generate_docx_technical_doc.py` § Consensus Equation & Weights

### Codebase Components
- `agents/tools/consensus_gate.py` - Existing consensus gate
- `agents/nodes/route_optimization.py` - Agent 4 routing node
- `backend/app/services/weather_fusion_service.py` - Weather fusion polygon generator
- `backend/app/adapters/cuopt_adapter.py` & `cuopt_tomtom_service.py` - Legacy cuOpt mocks
- `scripts/evaluate_metrics.py` - Empirical evaluation harness
- `data/benchmark/sumatra_disruptions_ground_truth.json` - N=60 ground-truth dataset

</canonical_refs>

<code_context>
## Codebase Insights

### Key Files to Modify/Create
- `agents/tools/consensus_gate.py`: Core mathematical formula refactor.
- `backend/app/services/probability_calibration.py`: New calibration and reliability service.
- `data/road_network_sumatra.json`: Offline road graph fixture.
- `backend/app/adapters/cpu_routing_adapter.py`: New CPU VRP & shortest path engine.
- `backend/app/adapters/openmeteo_adapter.py`: Clean Open-Meteo adapter.
- `backend/app/services/weather_fusion_service.py`: Honest weather fusion.
- `scripts/evaluate_metrics.py`: Integrate calibration calculations (Brier score & ECE).
- `backend/tests/test_consensus_calibration.py`: New test module for consensus & calibration.
- `backend/tests/test_cpu_routing_weather.py`: New test module for CPU routing & weather fusion.

</code_context>
