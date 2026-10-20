<!-- generated-by: gsd-plan-phase -->
# Phase 84: Deterministic BMKG Sensor Cross-Validation & Consensus Gate Hardening — Context

**Milestone:** M5 - High-Fidelity Intelligence & Isolated Operations Engine  
**Phase:** 84  
**Status:** PLANNING 📋  
**Domain:** Sensor Fusion, Consensus Engine, Probabilistic Independent Observation, Physical Cross-Validation

---

## 1. Problem Statement

In the existing Consensus Gate (`agents/tools/consensus_gate.py` and `backend/app/services/unified_news_ingestor.py`):
1. **Tautological Weather Inference:** When cached BMKG telemetry is absent, `unified_news_ingestor.py` lines 408-412 fall back to inspecting the article's own title (e.g. `any(w in title for w in ("hujan deras", "badai", "cuaca ekstrem", "banjir"))` and artificially inflating `weather_conf = 0.75`). A news claim validates itself, completely violating sensory independence (proposal section 4.3).
2. **Missing Deterministic Spatial-Temporal Matrix:** `compute_consensus` applies continuous exponential decay formulas ($e^{-\lambda \Delta t}$ and $e^{-d / d_0}$) but lacks hard cut-off gates. A report of a landslide in Padang could be "supported" by heavy rainfall in Medan (400 km away) or weather data from 2 days ago, resulting in a false-positive escalation.
3. **Uncapped Uncorroborated Rumors:** Rumors or unverified news items with high journalistic tier scores can reach confidence $>0.70$ on their own without physical sensor confirmation (radar rain rate $\ge 20\text{ mm/h}$, earthquake $M \ge 4.5$, or maritime wave $\ge 2.5\text{ m}$).
4. **Lack of an Explicit Audit Ledger:** Upstream consumers cannot inspect the exact spatial delta ($\Delta d$), temporal delta ($\Delta t$), or specific BMKG physical parameter that justified the consensus decision.

---

## 2. Target Architectural Invariants

1. **Deterministic Haversine & Temporal Gate:**
   - Spatial tolerance gate: $\Delta d \le 30.0\text{ km}$ (for floods, landslides, wind, port closures) and $\le 50.0\text{ km}$ (for earthquakes $M \ge 4.5$).
   - Temporal tolerance window: $\Delta t \le 6.0\text{ hours}$ between news publication and sensor observation.
2. **Physical Sensor Thresholds:**
   - **Flood / Flash Flood / Inundation:** BMKG radar rainfall rate $\ge 20.0\text{ mm/h}$ OR official BMKG warning level in `("WASPADA", "SIAGA", "AWAS")`.
   - **Earthquake:** BMKG seismic magnitude $M \ge 4.5$.
   - **Maritime / Port Disruption:** BMKG significant wave height $\ge 2.5\text{ m}$.
3. **Anti-Tautology Lock:**
   - A news article's title, summary, or description NEVER counts as weather sensor evidence.
   - If physical BMKG telemetry is unavailable or below threshold, `weather_conf` remains $\le 0.15$ and `is_corroborated = False`.
4. **Hard Confidence Cap on Uncorroborated News:**
   - Any news claim without physical corroboration (BMKG or TomTom severe delay) is capped at confidence $\le 0.50$ (`UNCONFIRMED`).
   - Promotion to `VALIDATED` (`route = "validated"`) strictly requires:
     * $\ge 2$ independent corroborated sensors.
     * `calibrated_confidence >= 0.85`.
5. **Structured Audit Ledger:**
   - Emits a clean dict/model `BMKGCrossValidationResult` recording `is_corroborated`, `spatial_delta_km`, `temporal_delta_hours`, `bmkg_parameter_matched`, `bmkg_warning_level`, `composite_confidence`, `validation_status`, and `audit_notes`.

---

## 3. Scope Lock

### Files Permitted to Modify
* `agents/tools/consensus_gate.py` (core consensus gate, cross-validation matrix, confidence cap, audit ledger)
* `backend/app/services/unified_news_ingestor.py` (purge title-based weather fallback, integrate cross-validation)
* `backend/tests/test_bmkg_consensus_validation.py` (new comprehensive automated test suite)

### Files Strictly Locked (DO NOT TOUCH)
* `backend/app/adapters/cpu_routing_adapter.py` (deterministic CPU routing invariant)
* `backend/app/services/weather_fusion_service.py` (fused polygon coverage invariant)
* `frontend/components/dashboard/EvaluationSection.tsx` (empirical N=60 benchmark integrity)
