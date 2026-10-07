# Phase 40 Walkthrough: Dedicated Evaluation & Benchmark Dashboard

## Overview

Phase 40 delivers the operator-grade **Evaluation & Benchmark Dashboard** (`EVALUATION` tab), empowering stakeholders to inspect empirical verification results, interactive calibration curves, the exhaustive 83-test matrix, and closed-loop decision audit trails.

---

## 1. Activated Top Navigation

The top navigation bar in `DashboardClient.tsx` now supports switching across all 5 operational sections:
- `MAP 4D`: The primary geospatial command center with tactical WebGL fleet tracking and God's-Eye HUD console.
- `ANALYTICS`: Archipelago spatial trade flows and commodity price time-series.
- `SIMULATION`: Multi-agent scenario sandbox and crisis stress testing.
- `REPORTS`: Executive cabinet PDF reports and route approval history.
- `EVALUATION`: Dedicated empirical evaluation dashboard.

---

## 2. Evaluation Section Breakdown

### 2.1 Empirical Benchmark Scorecards
5 top-level KPI scorecards present the performance of PreHub's models against predefined operational targets:
- **Presisi Deteksi**: `100.0%` (Target: $> 85.0\%$, Status: Tercapai)
- **Sensitivitas (Recall)**: `97.1%` (Target: $> 80.0\%$, Status: Tercapai)
- **Skor F1 Komposit**: `0.985` (Target: $> 0.820$, Status: Tercapai)
- **Brier Score Kalibrasi**: `0.0782` (Target: $\le 0.100$, Status: Terkalibrasi)
- **Latensi Solver CPU**: `0.019 ms` (Target: $< 15\text{ mnt}$, Status: Sub-Milidetik)

### 2.2 Interactive Reliability Diagram (`ReliabilityDiagram.tsx`)
- Native SVG canvas plotting 10 probability intervals against observed empirical frequencies ($N=60$).
- Dashed Cyan reference line ($y = x$) signifies perfect calibration.
- Emerald line plots the empirical curve.
- Hovering over any data point reveals an interactive tooltip displaying sample count, mean confidence, empirical accuracy, and calibration error.

### 2.3 Corridor Reroute Efficiency Benchmark (`RouteEfficiencyCard.tsx`)
- Compares blocked road corridors against CPU-optimized detours (NetworkX Dijkstra + OR-Tools).
- Evaluates travel time saved ($-7.8\text{ h}$ / $-91.7\%$), fuel saved ($38.5\text{ L}$), and operational cost saved ($\text{Rp } 1.450.000\text{ / rit}$).
- Features an interactive fleet size multiplier stepper ($1, 5, 10, 25, 50$ trucks).

### 2.4 Exhaustive Automated Test Suite Matrix (`TestMatrixTable.tsx`)
- Complete table of all 83 automated and architectural tests mapped to FR-1 through FR-13.
- Instant search bar and category filter tabs.
- Expandable drawers revealing the exact assertion invariants and test module paths.

### 2.5 Closed-Loop Decision Audit & Outcome Trace
- Tracks operator actions (`ACCEPT`, `REJECT`, `OVERRIDE`) paired with verified post-disruption reality at T+12h and T+24h post-incident.
- Displays dynamic sensor recalibration weights ($\eta = 0.05$).

---

## 3. Verification Commands

```bash
# Run backend evaluation router tests
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_evaluation_router.py -v

# Run full backend test suite
backend/.venv/Scripts/python.exe -m pytest backend/tests -q

# Build frontend production bundle
npm --prefix frontend run build
```
