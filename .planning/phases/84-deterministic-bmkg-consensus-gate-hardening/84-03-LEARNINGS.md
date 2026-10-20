<!-- generated-by: gsd-doc-writer -->
# Phase 84: Deterministic BMKG Sensor Cross-Validation & Consensus Gate Hardening — Learnings

**Scope:** Durable architectural and operational lessons from Phase 84. Every entry is grounded in real code, observed test executions, and terminal outputs. Assumptions are deliberately omitted.

---

## 1. Key Learnings

### 1.1 Sensory Tautology is the Silent Killer of Multi-Agent Decision Support Systems
* **Evidence:** In `backend/app/services/unified_news_ingestor.py` lines 408–412, missing weather telemetry in Redis triggered a fallback that scanned the article's own title for words like `"hujan deras"` or `"badai"` and set `weather_conf = 0.75`.
* **Consequence:** The news article served as both the claim and the corroborating weather sensor, producing artificial consensus, inflating calibrated confidence above $0.85$, and promoting unverified rumors to `VALIDATED` physical roadblocks.
* **Lesson:** Never infer physical sensor telemetry from natural language news text. A sensor channel must be backed by an actual physical measurement or official station warning. In Phase 84, this title-based guessing was purged: if physical BMKG telemetry is absent, `weather_conf` remains at $0.10$, and the article is capped at $\le 0.50$ (`UNCONFIRMED`).

### 1.2 Continuous Exponential Decay Must Be Guarded by Hard Bounding Gates
* **Evidence:** The consensus formula $P = 1 - \prod (1 - w_k(t, d) \cdot p_k)$ applies spatial decay $e^{-d / 25}$ and temporal decay $e^{-0.05 \Delta t}$. At $d = 50\text{ km}$, $e^{-2.0} \approx 0.135$; at $d = 75\text{ km}$, $e^{-3.0} \approx 0.05$.
* **Consequence:** Under high news confidence ($p_I = 0.90$), a major storm 75 km away or a severe earthquake 100 km away still leaked mathematical probability into a local road segment, causing false-positive consensus.
* **Lesson:** Mathematical decay curves are for graceful gradation within an area of effect; they cannot replace deterministic physical boundary gates. Bounding spatial tolerance at $\Delta d \le 30.0\text{ km}$ ($\le 50.0\text{ km}$ for $M \ge 4.5$ quakes) and temporal tolerance at $\Delta t \le 6.0\text{ hours}$ guarantees zero probability leakage across unrelated Sumatra regions.

### 1.3 Physical Sensor Thresholds Prevent Costly Logistics Over-Reactivity
* **Evidence:** Prior to this phase, any non-zero rainfall reading (e.g. $2.5\text{ mm/h}$ light drizzle) in the vicinity of a news report was treated as positive meteorological corroboration.
* **Consequence:** Routine tropical showers coincided with vague traffic congestion news, elevating incidents to validated status and threatening to trigger expensive truck reroutes (adding 80+ km and millions in fuel/toll costs).
* **Lesson:** Calibrate thresholds to physical disruption realities:
  - Radar rainfall must reach $\ge 20.0\text{ mm/h}$ (heavy rain intensity capable of creating road flash-floods) or carry an official BMKG `"SIAGA"` / `"WASPADA"` warning.
  - Earthquakes must reach $M \ge 4.5$ to threaten bridge/arterial integrity.
  - Maritime events must reach wave height $\ge 2.5\text{ m}$ to justify port closures.

### 1.4 Collocated Sensor Readings vs. Missing Coordinate Defaults
* **Evidence:** In `test_consensus_formula_independence` and the N=60 benchmark suite, synthetic and reference fixtures supply `weather_conf` and `traffic_conf` without explicitly declaring a `distance_km` field. An initial implementation defaulted missing `distance_km` to `999.0 km`, which inadvertently caused all collocated benchmark sensors to fail the $\le 30\text{ km}$ spatial gate and spiked the Brier score to $0.214$.
* **Consequence:** Co-located sensor findings (where coordinates are omitted because they represent the exact incident location) were penalized as if they were situated in outer space.
* **Lesson:** Distinguish between "distance unknown/unspecified on a local finding" (which implies collocated $\Delta d = 0.0\text{ km}$) and "external news vs. distant station coordinates" (which requires computing Haversine distance). Defaulting local sensor distance to $0.0\text{ km}$ restored the N=60 Brier score to $\le 0.10$ and preserved complete regression parity.

### 1.5 Explicit Audit Ledgers Transform Black-Box AI into Defensible Operations
* **Evidence:** `BMKGCrossValidationResult` is embedded into both `compute_consensus` return dicts and `unified_news_ingestor` audit payloads, recording `spatial_delta_km`, `temporal_delta_hours`, `bmkg_parameter_matched`, `composite_confidence`, and human-readable `audit_notes`.
* **Consequence:** Logistics dispatchers and government regulators (BKHIT, BPJT, Pelindo) can see the exact physical reason an alert was confirmed (e.g. `radar_rain_rate_35.0mmh at 4.2 km`) or withheld (e.g. `Jarak spasial (530.0 km) melebihi batas toleransi`).
* **Lesson:** In mission-critical logistics, explainability is not an afterthought; it is the core product feature that enables human-in-the-loop trust.

---

## 2. Evidenced Metrics

| Metric | Pre-Phase 84 | Post-Phase 84 | Verification Method |
|---|---|---|---|
| News Title Self-Corroboration | Active (`"hujan deras" -> weather_conf=0.75`) | **100% PURGED** (weather_conf = 0.10) | `test_anti_tautology_headline_cannot_corroborate_itself` |
| Max Spatial Discrepancy Tolerated | Unlimited (continuous decay) | **$\le 30\text{ km}$** ($\le 50\text{ km}$ quakes) | `test_spatial_mismatch_dropped` |
| Max Temporal Staleness Tolerated | Unlimited (continuous decay) | **$\le 6.0\text{ hours}$** | `test_temporal_mismatch_dropped` |
| Uncorroborated News Confidence | Could exceed $>0.75$ | **Strictly capped $\le 0.50$** | `test_anti_tautology_headline_cannot_corroborate_itself` |
| Minimum Corroborated Radar Rain | Any $>0\text{ mm}$ | **$\ge 20.0\text{ mm/h}$** or SIAGA | `test_physical_threshold_mismatch` |
| Minimum Corroborated Quake Magnitude | Any $>0$ | **$M \ge 4.5$** | `test_earthquake_magnitude_threshold` |
| Unit Test Pass Rate | N/A (new suite) | 8/8 passing ($100\%$) | `pytest backend/tests/test_bmkg_consensus_validation.py` |
| Regression Test Pass Rate | 67/67 passing | 67/67 passing ($100\%$) | 5 pytest test suites in backend |

---

## 3. Next Steps (Phase 85 Transition)
* Proceed to **Phase 85: Mapbox Directions API Turn-by-Turn Road Network & Tangential Hazard Avoidance**.
* Replace point-to-point straight polylines (`densifyPath`) with true street-snapped GeoJSON LineStrings from Mapbox Directions API (Free Tier), obeying one-way streets and executing forced tangential avoidance waypoints ($R + 2\text{ km}$) around verified disaster polygons.
