# Phase 93 — P1 Walkthrough (what was actually implemented)

**Code commit:** `20c7fa5` (2026-10-23).
**This documentation pass changed code:** no — `.planning/` files only.
**Working tree:** docs left uncommitted.

Line numbers are in the post-fix working tree; pre-fix citations come from
`git show 20c7fa5^:<path>`.

---

## 1. Forecast engine rewritten (`agents/nodes/prediction.py`)

`numpy` was removed; the module now imports `math` only.

| Behaviour | Before | After | Line |
|---|---|---|---|
| Anchor | `np.polyfit` over all segments, extrapolated to 6/12/24/48 h | nearest segment to the event by Haversine; mean delay only as fallback; `DEFAULT_BASE_DELAY_MIN = 30.0` | `:137-150`, `:274-278` |
| Horizon shape | one linear slope | `HORIZON_DECAY = {6h:1.0, 12h:0.85, 24h:0.65, 48h:0.45}` | `:18` |
| Bounds | `max(5, min(300, predicted))` inline | `_clamp_delay` with `MIN_DELAY_MIN=5.0`, `MAX_DELAY_MIN=300.0` | `:19-20`, `:63-64` |
| Unreadable segments | silently skipped | skipped + `tomtom_empty` / `tomtom_redis` in `degraded_sources` | `:105-134` |
| Nearest segment identity | not recorded | `nearest_segment_name`, `nearest_segment_distance_km` | `:396-398` |

## 2. Weather selection (`prediction.py:152-268`)

- Cache is parsed into `candidates` with `name/lat/lon/predictions/source`
  (`:163-190`).
- Selection: nearest by Haversine to `state.lat/lon` (`:195-200`); if no
  coordinates, exact region-name match (`:201-205`); last resort first candidate
  (`:206-207`).
- Provenance: `weather_provenance = "simulated" if source.startswith("open-meteo-sim") else "observed"`
  (`:213`); `unavailable` when no cache (`:155`).
- Escalation: simulated weather is neutral unless the *crisis run* is simulated
  (`:287-306`). A simulated run is discounted by `0.05` (`:326-328`).
- Degradation ledger: `quiet` vs `degraded` (`:379-384`).

## 3. Consensus calibration (`agents/tools/consensus_gate.py`)

- `SIMULATED_EVIDENCE_DISCOUNT = 0.90` (`:34`).
- `_resolve_finding_distance` (`:236-253`) returns `+inf` for missing/unparseable
  distance; used for both weather and traffic (`:377-378`).
- Simulated confidence is multiplied, never rewritten (`:413-414`).
- `validation_mode` added to the result (`:419-423`, `:461`).

## 4. Causal chain repaired (`agents/tools/graphrag.py`)

- `ENTITY_TABLES = ("kg_entities", "entities")`,
  `RELATION_TABLES = ("kg_relationships", "entity_relations")` (`:16-17`).
- Row normalizers accept `id`/`entity_id`, `relation`/`relation_type`, and
  coordinates from columns, `metadata`, or `location.coordinates`
  (`:29-103`).
- Cache key bumped to `lrip:graph:entity:v2` (`:19`, `:114`) so a previously
  cached empty graph is invalidated; Redis read/write failures are non-fatal
  (`:117-130`, `:169-177`).
- `query_graphrag` resolves names against `kg_entities` first, then legacy
  (`:228-268`).

## 5. Graph seed migration

`infra/supabase/migrations/015_kg_relationship_seed.sql`:

- unique index on `(from_entity, to_entity, relation)` (`:12-13`);
- 11 edges joining `kg_entities` by name, `ON CONFLICT DO NOTHING`
  (`:15-34`): Belawan Port → Medan-Belawan Corridor → Trans-Sumatra Highway →
  Dumai Port, plus `located_in`, `produces`, `supplies` edges to Rice/Chili/
  Cooking Oil.

## 6. Benchmark scoring honesty (`scripts/evaluate_metrics.py`)

- `PROBABILISTIC_DECISION_THRESHOLD = 0.50` (`:33`).
- Detection uses `raw_probability` (`:153`), calibration uses `raw_prob`
  (`:157`).
- Per-scenario rows now include `gate_route` and `validation_mode`
  (`:180-181`); the report records the threshold and an `evaluation_notes`
  explanation (`:255-265`).

---

## 7. Files changed by the commit (P1 subset)

| File | Lines changed |
|---|---|
| `agents/nodes/prediction.py` | 396 |
| `agents/tools/consensus_gate.py` | 43 |
| `agents/tools/graphrag.py` | 244 |
| `scripts/evaluate_metrics.py` | 28 |
| `backend/tests/test_consensus_calibration.py` | 104 |
| `infra/supabase/migrations/015_kg_relationship_seed.sql` | 34 (new) |

---

## 8. Test commands and results (run in this session)

### 8.1 Calibration + agent suite

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider
```

**Result:** `33 passed, 4 warnings in 111.94s`.

Relevant tests:

| Test | Assertion |
|---|---|
| `test_consensus_calibration.py:79` | missing distance → `raw_probability ≈ 0.6518`, `is_corroborated False`, `route "unconfirmed"`, `confidence <= 0.50` |
| `test_consensus_calibration.py:96` | simulated route preserved, `validation_mode "simulation_bypass"`, confidence exactly `observed * 0.90` |

### 8.2 Benchmark harness

```powershell
cd D:\College\Pidi.id
.\backend\.venv\Scripts\python.exe scripts\evaluate_metrics.py
```

**Result:** `GATING PASSED: All empirical evaluation and calibration thresholds satisfied.`

```
TP=35 FP=1 FN=0 TN=24 (N=60)
Precision 97.2% | Recall 100.0% | F1 0.986 | FPR 4.0% | Accuracy 98.3%
Latency 0.017 ms/scenario
Raw Brier 0.0846 | Platt 0.0000 | Isotonic 0.0000
ECE Platt 0.0001 | ECE Isotonic 0.0000
```

The run wrote `test-results/benchmark_evaluation_report.json`; that path is
ignored by git (not shown in `git status`).

### 8.3 TypeScript regression check

```powershell
cd D:\College\Pidi.id\frontend
npx tsc --noEmit
```

**Result:** exit code 0.

---

## 9. Not implemented / not verified here

- No test executes `prediction_agent` against a synthetic Redis segment set to
  prove the nearest-segment anchor numerically.
- No test covers `graphrag.load_entity_graph` / `query_graphrag`; the migration
  is not applied by the test suite.
- `weather_provenance` classification is prefix-based, so only feeds named
  `open-meteo-sim*` are treated as synthetic.
- Benchmark numbers above come from the curated N=60 fixture, not field data.
