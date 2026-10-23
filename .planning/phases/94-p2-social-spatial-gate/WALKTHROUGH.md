# Phase 94 — P2 Walkthrough (what was actually implemented)

**Code commit:** `20c7fa5` (2026-10-23).
**This documentation pass changed code:** no — `.planning/` files only.
**Working tree:** docs left uncommitted.

---

## 1. Social payload normalization (`agents/nodes/osint_hazard.py`)

New helpers, all synchronous and testable:

| Helper | Lines | Behaviour |
|---|---|---|
| `_parse_raw_meta` | `:72-84` | Accepts `raw` as dict or JSON string; never raises |
| `_is_social_payload` | `:87-95` | True for `source in (social, citizen_report, citizen)`, `event_type in (osint_report, citizen_report)`, or a `platform` field |
| `_unpack_social_payload` | `:97-124` | Text priority `raw_text → text → description → payload.text/description/summary/title`; `source_tier = TIER_3_CITIZEN_OSINT`; timestamp from payload or raw |
| `_payload_coords` | `:127-140` | `lat/lon` from payload, then `latitude/longitude`, then raw meta |
| `_hazard_type_alignment` | `:143-148` | Keyword table per hazard (`:28-41`); unknown type returns `True` |
| `_evaluate_spatial_relevance` | `:151-193` | Explicit coords → distance, accept `<= 100 km`; else region+hazard text match; else reject |

Integration: `:281-316` unpacks social payloads before the discourse/freshness
gates; `:349-352` clears official lane/forecast labels for citizen reports;
`:354-357` builds the matched text from the unpacked summary.

## 2. Spatial gate

- Constant: `SPATIAL_GATE_RADIUS_KM = 100.0` (`:23`).
- Gate is applied **before** any counter is touched (`:362-378`). Rejections are
  appended to `spatially_rejected` (max 10) with `headline/source/tier/
  distance_km/reason`.
- Accepted hits only then increment `social_corroborations` /
  `official_corroborations` and contribute to `blocked_corridors`,
  `affected_commodities`, and `verified_citations` (`:380-416`).
- NER overlap requires `region_matches_text(...)` or an NER entity equal to the
  region slug, **and** hazard-type alignment (`:395-402`).
- Citizen corroboration now gives `+0.10` at `>= 1` accepted hit
  (`:452-453`), not `>= 2` on unmatched text.
- Finding exposes the full audit:
  `spatially_relevant`, `spatial_gate{radius_km, state_lat, state_lon, region,
  accepted_hits, official_hits, rejected_hits, rejected[]}`
  (`:505-520`).

## 3. Region contract (`agents/nodes/data_collection.py`)

- `SUMATRA_REGION_ALIASES` covers 11 canonical regions including
  `north_sumatra`, `south_sumatra`, `bangka_belitung`, `kepulauan_riau`
  (`:17-61`).
- `normalize_region` strips `provinsi/province` prefixes, collapses
  `_`/`-`/spaces, and returns a lowercase slug for unknown labels
  (`:63-90`).
- `region_matches_text` checks canonical aliases, then literal slug/spaced
  forms (`:93-105`).
- `extract_payload_text` resolves nested JSON `raw` (`:130-153`).
- `data_collection_agent` writes the slug into `normalized_event.region`,
  `state.region`, and `raw_payload.region`, keeping the original spelling as
  `region_raw` (`:349-402`).

## 4. Attribution preserved in simulation routes

- `backend/app/routers/agent_router.py:171`:
  `"source": payload.get("source") or "simulation"`.
- `backend/app/routers/incidents.py:259`, `:307`: same pattern.
- `is_simulated` stays the provenance field; the caller's `citizen_report` /
  `social` label is no longer overwritten.

## 5. Social poller

`backend/app/main.py:229-257` (`_poll_social_osint_loop`):

- no `TWITTER_BEARER_TOKEN` → write
  `lrip:health:social_scraper status=disabled_no_token` + `updated_at`, log, and
  return without scraping;
- with token → `SocialScraper().run()`;
- registered in the lifespan task list only when `pollers_enabled` is true
  (`:287-297`), and included in shutdown cancellation (`:306-308`).

## 6. Degradation ledger

`osint_hazard` now accumulates named failures (`:206-216`):

- `supabase_polygons` (query failure or missing coordinates),
- `redis_osint` (stream/list unavailable),
- `write_rejected` (agent-status write failure).

`evidence_health` is `degraded` if any are present, `quiet` when every path
answered with no hits, else `nominal` (`:482-489`). The finding carries
`degraded_sources` and `errors` (`:521-523`).

---

## 7. Files changed by the commit (P2 subset)

| File | Change |
|---|---|
| `agents/nodes/osint_hazard.py` | social unpack, 100 km gate, hazard alignment, audit block, degradation ledger |
| `agents/nodes/data_collection.py` | region aliases, `normalize_region`, `region_matches_text`, `extract_payload_text`, `_source_from_state` |
| `backend/app/routers/agent_router.py` | preserve caller source |
| `backend/app/routers/incidents.py` | preserve caller source (both simulate routes) |
| `backend/app/main.py` | `_poll_social_osint_loop` |
| `backend/tests/test_agents.py` | 5 new P2 tests |

---

## 8. Test commands and results (run in this session)

```powershell
cd D:\College\Pidi.id\backend
.\.venv\Scripts\python.exe -m pytest tests/test_agents.py tests/test_consensus_calibration.py -q -p no:cacheprovider
```

**Result:** `33 passed, 4 warnings in 111.94s`.

P2 tests inside that run:

| Test | Observed assertion |
|---|---|
| `test_agents.py:585` | nearby Belawan social report unpacked; confidence `0.75`; `spatially_relevant True`; tier `TIER_3_CITIZEN_OSINT`; `published_at` present |
| `test_agents.py:631` | distant Lampung report rejected; confidence `0.60`; `social_corroborations 0`; citations `[]` |
| `test_agents.py:558` | `citizen_report` attribution + raw text + `north_sumatra` slug |
| `test_agents.py:546` | 5 spellings → `north_sumatra`; `Sumatera Selatan` → `south_sumatra` |
| `test_agents.py:674` | no token → `disabled_no_token` health |

Phase 90 regression suite (same shell):

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_osint_leak_hardening.py tests/test_news_pipeline.py tests/test_pre_llm_filter.py tests/test_phase76_news_spatial_consensus.py tests/test_bmkg_consensus_validation.py tests/test_geocode_search.py tests/test_scrapers.py -q -p no:cacheprovider
```

**Result:** `128 passed, 3 warnings in 14.94s`.

Static checks:

```powershell
Select-String -Path agents/nodes/osint_hazard.py -Pattern 'SPATIAL_GATE_RADIUS_KM = 100.0'
Select-String -Path backend/app/routers/agent_router.py,backend/app/routers/incidents.py -Pattern '"source": "simulation"'
```

- First: match at `osint_hazard.py:23`.
- Second: no literal assignment remains; only
  `payload.get("source") or "simulation"` / `body.get("source") or
  "simulation"`.

---

## 9. Not implemented / not exercised here

- No test covers OSINT-D4 (route-level source preservation) end-to-end.
- No test covers `_hazard_type_alignment` for unknown event types.
- No live Twitter/X scrape was performed; the poller test mocks Redis and
  asserts the no-token branch only.
- The 100 km radius remains flat per hazard type.
