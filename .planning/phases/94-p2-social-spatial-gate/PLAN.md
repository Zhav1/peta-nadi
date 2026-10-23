# Phase 94 — P2: Social / Spatial Gate

**Workstream:** P2 (citizen OSINT ingestion + anti-false-corroboration)
**Status:** IMPLEMENTED in commit `20c7fa5`. Documentation uncommitted.
**Pre-fix revision:** `20c7fa5^`

---

## 1. Why this phase exists

Agent 2 read a 3-hour Redis stream, counted **any** payload whose text contained
a hazard keyword as a corroboration, and boosted confidence, affected
commodities and blocked corridors accordingly. The distance/direction of the
report was never checked. Citizen payloads also kept their real text inside a
JSON `raw` blob that the agent did not unpack, so the judgment ran on the
wrapper title.

**Evidence**

| Pre-fix fact | File:line at `20c7fa5^` |
|---|---|
| Any keyword hit incremented `social_corroborations` | `agents/nodes/osint_hazard.py:108-111` |
| NER overlap passed if any Sumatra province name appeared anywhere in the text | `agents/nodes/osint_hazard.py:128-130` |
| Social text read only `normalized_event.raw_payload.text` | `agents/nodes/osint_hazard.py:147-148` |
| Missing stream logged at `debug` | `agents/nodes/osint_hazard.py:59` |
| Simulate routes overwrote attribution with `"source": "simulation"` | `backend/app/routers/agent_router.py:135`, `backend/app/routers/incidents.py:258`, `:304` |
| No social poller existed; `TWITTER_BEARER_TOKEN` absence was implicit | `backend/app/main.py` (pre-fix lifespan task list) |

---

## 2. Defect register (OSINT-D*)

| ID | Defect | Pre-fix evidence | Fixed at |
|---|---|---|---|
| OSINT-D1 | Social payload content lived in a JSON `raw` blob; the agent judged the wrapper title and lost tier/published_at | `osint_hazard.py:147-148` (pre) | `osint_hazard.py:88-124` (`_unpack_social_payload`: raw_text/text/description → summary, `TIER_3_CITIZEN_OSINT`, published_at), `:281-320` (used before discourse/freshness gates) |
| OSINT-D2 | A keyword hit anywhere in the 3 h stream counted as corroboration | `osint_hazard.py:108-111` (pre) | `osint_hazard.py:23` (`SPATIAL_GATE_RADIUS_KM = 100.0`), `:151-193` (`_evaluate_spatial_relevance`), `:362-378` (reject before counting), `:380-393` (only accepted hits affect commodities/corridors) |
| OSINT-D3 | NER "overlap" accepted a bare province mention, even for a different hazard | `osint_hazard.py:128-130` (pre) | `osint_hazard.py:395-402` (`region_matches_text` + `_hazard_type_alignment`), keyword table `:28-41`, matcher `:143-148` |
| OSINT-D4 | Simulation endpoints replaced the caller's source with `"simulation"`, so citizen reports lost attribution | `agent_router.py:135`, `incidents.py:258`/`:304` (pre) | `backend/app/routers/agent_router.py:171`, `backend/app/routers/incidents.py:259`, `:307` (`source = body.get("source") or "simulation"`); `data_collection.py:156-162` (`_source_from_state`) |
| OSINT-D5 | A missing/unreadable stream was a `debug` line; "quiet day" and "dead path" were indistinguishable | `osint_hazard.py:59` (pre) | `osint_hazard.py:206-216` (`degraded_sources`/`errors` ledger), `:417-419` (Redis failure), `:469-489` (`evidence_health` = `degraded`/`quiet`/`nominal`), `:505-520` (audit block in the finding) |
| OSINT-D6 | No citizen-OSINT poller and no explicit no-token state | pre-fix `main.py` lifespan | `backend/app/main.py:229-257` (`_poll_social_osint_loop`: no token → `lrip:health:social_scraper = disabled_no_token`, clean return), `:287-297` (task registered only when pollers enabled) |

---

## 3. Contract changes

1. **Spatial gate result is part of the finding.**
   `osint_hazard_finding.data.spatial_gate` carries
   `radius_km, state_lat, state_lon, region, accepted_hits, official_hits,
   rejected_hits, rejected[]`; `data.spatially_relevant` is a boolean
   (`osint_hazard.py:505-520`).
2. **Rejected evidence is recorded, not silently dropped.** Up to 10 rejected
   payloads keep `headline, source, tier, distance_km, reason,
   spatially_relevant: false` (`osint_hazard.py:369-377`).
3. **Citizen reports never inherit official labels.** For social payloads,
   `lane_status` is forced `CLEAR` and `temporal_phase`
   `active_disruption` (`osint_hazard.py:349-352`).
4. **Region is a canonical slug on the wire.** `normalize_region` folds
   `North Sumatra` / `Sumatera Utara` / `Sumut` / gateway cities to
   `north_sumatra`; `region_matches_text` matches aliases and corridors
   (`agents/nodes/data_collection.py:17-61`, `:63-105`).
5. **Text extraction is shared.** `extract_payload_text` priority:
   `text` → `description` → `raw` (JSON unwrapped) → `raw_text` → `title`
   (`data_collection.py:130-153`).
6. **Attribution survives simulation.** `is_simulated` remains the provenance
   flag; `source` is preserved from the caller in both simulate routes.
7. **No-token is a state, not an error.**
   `lrip:health:social_scraper.status = disabled_no_token`.

---

## 4. Fail-today / pass-after tests

| Test | Fail today (static, pre-fix code path) | Pass after | Evidence |
|---|---|---|---|
| `backend/tests/test_agents.py:585` `test_osint_social_raw_unpack_and_spatial_boost` | `raw` is not unpacked; `summary` is empty, `source_tier`/`published_at` absent, `data.spatially_relevant` key absent → KeyError/assert fail | confidence `0.75`, `spatially_relevant True`, tier `TIER_3_CITIZEN_OSINT`, `published_at` non-empty | pre: `osint_hazard.py:147-148`; post: `:88-124`, `:446-455`; test `:585-627` |
| `backend/tests/test_agents.py:631` `test_osint_spatial_gate_rejects_distant_lampung` | A Bandar Lampung payload matches `"banjir"` and increments corroboration regardless of coordinates; `spatial_gate` absent | confidence `0.60`, `spatially_relevant False`, `social_corroborations 0`, rejected entry recorded, citations `[]` | pre: `osint_hazard.py:108-111`; post: `:151-193`, `:362-378`; test `:631-670` |
| `backend/tests/test_agents.py:558` `test_data_collection_preserves_social_source_and_raw_text` | `raw_payload["text"]` is not derived from `raw`; state region stays `"North Sumatra"` instead of a slug | `source == "citizen_report"`, `raw_payload.text == "Banjir parah Pelabuhan Belawan"`, `region == "north_sumatra"` | post: `data_collection.py:130-153`, `:63-105`, `:349-402`; test `:558-581` |
| `backend/tests/test_agents.py:546` `test_normalize_region_aliases` | `normalize_region` does not exist → ImportError | all five spellings → `north_sumatra`; `Sumatera Selatan` → `south_sumatra`; Kepri/Lampung slugs | post: `data_collection.py:63-90`; test `:546-554` |
| `backend/tests/test_agents.py:674` `test_social_poller_disabled_without_token` | `_poll_social_osint_loop` does not exist → AttributeError | `hset("lrip:health:social_scraper", "status", "disabled_no_token")` | post: `main.py:229-257`; test `:674-685` |

**Executed proof (this session)**

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider
# 33 passed, 4 warnings in 111.94s

.\.venv\Scripts\python.exe -m pytest tests/test_osint_leak_hardening.py tests/test_news_pipeline.py tests/test_pre_llm_filter.py tests/test_phase76_news_spatial_consensus.py tests/test_bmkg_consensus_validation.py tests/test_geocode_search.py tests/test_scrapers.py -q -p no:cacheprovider
# 128 passed, 3 warnings in 14.94s
```

---

## 5. Acceptance gate

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_agents.py -q -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest tests/test_osint_leak_hardening.py tests/test_news_pipeline.py tests/test_pre_llm_filter.py -q -p no:cacheprovider
```

- Five P2 tests green (listed above).
- Phase 90 leak-hardening suite stays green (no regression in date/boilerplate/
  metaphor/bbox gates).
- Static checks:
  - `osint_hazard.py` contains `SPATIAL_GATE_RADIUS_KM = 100.0`.
  - `agent_router.py` and `incidents.py` no longer contain a literal
    `"source": "simulation"` assignment (only `body.get("source") or
    "simulation"`).
  - `main.py` writes `disabled_no_token` when the Twitter token is absent.

---

## 6. Out of scope / open

- The 100 km radius is flat; it does not scale with the hazard footprint
  (earthquake vs 1 km flood).
- The no-coordinate fallback is alias/substring matching; a distant article that
  names the province *and* the hazard type can still pass.
- `_hazard_type_alignment` returns `True` for unknown/custom event types
  (`osint_hazard.py:146-147`), by design to avoid silently rejecting evidence.
- Rejected citations are capped at 10; totals above that are not retained
  individually (`:369`).
- No test covers OSINT-D4 (router source preservation) end-to-end.
