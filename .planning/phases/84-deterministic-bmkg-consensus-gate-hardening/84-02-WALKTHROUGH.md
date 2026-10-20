<!-- generated-by: gsd-doc-writer -->
# Phase 84: Deterministic BMKG Sensor Cross-Validation & Consensus Gate Hardening — Walkthrough

**Purpose:** Implementation and verification record for deterministic BMKG sensor cross-validation, physical threshold checks (rainfall rate $\ge 20\text{ mm/h}$, earthquake magnitude $M \ge 4.5$, wave height $\ge 2.5\text{ m}$), strict spatial and temporal tolerance gates ($\Delta d \le 30\text{ km}$, $\Delta t \le 6\text{ h}$), uncorroborated news confidence capping ($\le 0.50$), and anti-tautology locks. Every statement below is grounded in the active codebase and verified against real command runs.

---

## 1. Files Changed

| # | File | Status | What Changed |
|---|---|---|---|
| 1 | `agents/tools/consensus_gate.py` | modified | Added `haversine_distance_km`, `compute_temporal_delta_hours`, and `cross_validate_news_with_bmkg`. Implemented uncorroborated claim confidence capping ($\le 0.50$) in `compute_consensus`, refined collocated sensor distance defaults, and attached a structured `bmkg_cross_validation` audit ledger. |
| 2 | `backend/app/services/unified_news_ingestor.py` | modified | Completely purged tautological title keyword guessing (`"hujan deras" in title -> weather_conf = 0.75`). Integrated `cross_validate_news_with_bmkg` into `_verify_with_consensus_gate` so that only confirmed physical sensor telemetry elevates weather confidence. Attached audit payload. |
| 3 | `backend/tests/test_bmkg_consensus_validation.py` | **new** | Comprehensive automated test suite with 8 test cases verifying spatial tolerances, temporal windows, physical threshold checks, unconfirmed caps, anti-tautology locks, and audit ledger schema. |
| 4 | `.planning/ROADMAP.md` | modified | Updated Phase 84 status to `COMPLETE ✅` and checked off verification criteria. |
| 5 | `.planning/STATE.md` | modified | Advanced active phase to Phase 85 (Mapbox Turn-by-Turn Road Network), incremented completed phases to 84 (97.6% milestone progress). |

---

## 2. Before vs. After Mechanics

### 2.1 Sensor Evidence Independence & Anti-Tautology
* **Before:**
  * When real-time weather telemetry was missing from Redis cache, `unified_news_ingestor.py` lines 408-412 inspected the news article's own title for phrases like `"hujan deras"`, `"badai"`, or `"banjir"` and inflated `weather_conf` to $0.75$.
  * A dramatic news claim corroborated itself without a single physical sensor measurement, violating sensor decoupling (FR-11.2) and causing false-positive crisis alerts.
* **After:**
  * Title-based guessing is 100% eliminated. If official BMKG telemetry is absent or below threshold, `weather_conf` remains at baseline ($0.10$), and `is_corroborated` is set to `False`.
  * News claims are validated against physical ground-truth only.

### 2.2 Deterministic Spatial-Temporal Matrix
* **Before:**
  * The system used continuous exponential decay functions ($e^{-\lambda \Delta t}$ and $e^{-d / d_0}$) without hard bounding boxes. Severe storms 400 km away or data from 24 hours ago could still contribute probability mass to a fresh local incident.
* **After:**
  * Strict spatial tolerance: $\Delta d \le 30.0\text{ km}$ for floods, landslides, wind, and port closures; $\le 50.0\text{ km}$ for earthquakes ($M \ge 4.5$).
  * Strict temporal window: $\Delta t \le 6.0\text{ hours}$ between news publication and sensor telemetry.
  * Incidents exceeding either gate immediately drop to `is_corroborated = False` and `validation_status = "UNCONFIRMED"`.

### 2.3 Physical Telemetry Thresholds
* **Before:**
  * Any non-zero rainfall reading could be treated as supporting evidence for catastrophic road cut-offs.
* **After:**
  * **Flood / Landslide / Inundation:** Requires BMKG radar rain rate $\ge 20.0\text{ mm/h}$ OR official BMKG warning level in `("WASPADA", "SIAGA", "AWAS")`.
  * **Earthquake:** Requires BMKG seismic magnitude $M \ge 4.5$ (minor tremors $M < 4.5$ are rejected).
  * **Maritime / Port Disruption:** Requires BMKG significant wave height $\ge 2.5\text{ m}$.

### 2.4 Uncorroborated Claim Confidence Capping
* **Before:**
  * High-tier press sources (LKBN ANTARA, Detik, Kompas) could single-handedly elevate an incident confidence to $>0.75$ and trigger automatic corridor reroutes without sensor confirmation.
* **After:**
  * Any news claim lacking physical confirmation (BMKG or TomTom severe flow congestion $\ge 25\text{ min}$) is capped at confidence $\le 0.50$ (`UNCONFIRMED`).
  * Promotion to `VALIDATED` (`route = "validated"`) strictly requires $\ge 2$ independent corroborated sensors and `calibrated_confidence >= 0.85`.

---

## 3. Verification Evidence

### 3.1 New Phase 84 Test Suite (`backend/tests/test_bmkg_consensus_validation.py`)
Command executed:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk backend/.venv/Scripts/python.exe -m pytest backend/tests/test_bmkg_consensus_validation.py -v
```
Output:
```
============================= test session starts =============================
platform win32 -- Python 3.12.10, pytest-8.2.2, pluggy-1.6.0 -- C:\Farras\DIGDAYA\peta-nadi\backend\.venv\Scripts\python.exe
cachedir: .pytest_cache
rootdir: C:\Farras\DIGDAYA\peta-nadi
plugins: anyio-4.15.1, langsmith-0.14.2, asyncio-0.23.7, cov-7.1.0
asyncio: mode=Mode.STRICT
collecting ... collected 8 items

backend/tests/test_bmkg_consensus_validation.py::test_haversine_and_temporal_helpers PASSED [ 12%]
backend/tests/test_bmkg_consensus_validation.py::test_corroborated_flood_radar PASSED [ 25%]
backend/tests/test_bmkg_consensus_validation.py::test_spatial_mismatch_dropped PASSED [ 37%]
backend/tests/test_bmkg_consensus_validation.py::test_temporal_mismatch_dropped PASSED [ 50%]
backend/tests/test_bmkg_consensus_validation.py::test_physical_threshold_mismatch PASSED [ 62%]
backend/tests/test_bmkg_consensus_validation.py::test_earthquake_magnitude_threshold PASSED [ 75%]
backend/tests/test_bmkg_consensus_validation.py::test_anti_tautology_headline_cannot_corroborate_itself PASSED [ 87%]
backend/tests/test_bmkg_consensus_validation.py::test_structured_audit_ledger_fields PASSED [100%]

======================== 8 passed, 1 warning in 0.60s =========================
```

### 3.2 Full Regression & Consensus Calibration Suite
Command executed:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk backend/.venv/Scripts/python.exe -m pytest backend/tests/test_bmkg_consensus_validation.py backend/tests/test_consensus_calibration.py backend/tests/test_pre_llm_filter.py backend/tests/test_news_pipeline.py backend/tests/test_scrapers.py backend/tests/test_llm_gateway.py -q
```
Output:
```
67 passed, 3 warnings in 5.36s
```

### 3.3 TypeScript Typecheck
Command executed:
```powershell
$env:PATH = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User"); rtk npx tsc --noEmit
```
Output:
```
TypeScript: No errors found
```
