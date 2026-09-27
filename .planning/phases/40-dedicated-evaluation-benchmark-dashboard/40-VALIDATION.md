# Phase 40 — Validation Strategy: Dedicated Evaluation & Benchmark Dashboard

## 1. Automated Verification Gates

| Target | Command | Expected Outcome |
|---|---|---|
| Backend Evaluation Router Tests | `backend/.venv/Scripts/python.exe -m pytest backend/tests/test_evaluation_router.py -v` | 100% pass (schema validation, metric ranges, test matrix counts) |
| Full Backend Test Suite | `backend/.venv/Scripts/python.exe -m pytest backend/tests -q` | >= 81 passing tests, 0 failures |
| Frontend Type Checking & Build | `npm --prefix frontend run build` | Zero TypeScript errors, 7 static routes compiled |
| Non-AI Emoji Scan | Grep search across `frontend/components/dashboard/` for non-ASCII emoji characters | 0 occurrences |

---

## 2. Manual & Visual Verification Checklist

1. **Navigation Tab Switching**:
   - Open `/dashboard`.
   - Click `EVALUATION`: Smooth transition to the evaluation view without page reload.
   - Click `ANALYTICS`, `SIMULATION`, `REPORTS`, and back to `MAP 4D`: All tabs switch immediately; map canvas state and active vehicles are maintained.
   - All tabs show pointer cursor on hover.

2. **Empirical Benchmark KPI Cards**:
   - Precision displays `100.0%` with green threshold badge `Target: > 85.0%`.
   - Recall displays `97.1%` with green threshold badge `Target: > 80.0%`.
   - F1-Score displays `0.985` with green threshold badge `Target: > 0.82`.
   - Brier Score displays `0.0782` with green threshold badge `Target: <= 0.10`.
   - Latency displays `0.019 ms` with green threshold badge `Target: < 15 mnt`.

3. **Interactive Reliability Diagram**:
   - Native SVG canvas renders cleanly with $x$ and $y$ axes labeled from `0.0` to `1.0`.
   - Diagonal dashed Cyan line represents perfect calibration ($y = x$).
   - Emerald calibration curve plots 10 probability bins.
   - Hovering over a bin node reveals the glassmorphic monospaced telemetry tooltip with sample count, mean confidence, and empirical accuracy.

4. **Automated Test Matrix Table**:
   - Displays all 81 automated tests with Test ID, category, module, scenario, and result.
   - Search input filters tests dynamically in real time.
   - Category filter pills filter by FR domain (Cuaca, TomTom, Berita, Swarm, Kalibrasi, Audit, Telemetri).
   - Clicking a row expands the assertion details drawer.

5. **Corridor Reroute Efficiency Benchmark**:
   - Displays comparison metrics: Blocked Corridor (8.5h delay) vs CPU Reroute (42m detour).
   - Shows fuel and cost savings calculation with interactive truck multiplier.

6. **Closed-Loop Decision Audit & Outcome Trace**:
   - Displays real operator decisions (`ACCEPT`/`REJECT`/`OVERRIDE`) alongside verified T+12h / T+24h field outcomes.
   - Displays dynamic sensor weight recalibration factor ($\eta = 0.05$).
