---
phase: 109
phase_name: EWKB Location Parsing & Fair Intake (60 / 150)
milestone: M7
milestone_name: Live News Trust, Source Breadth & Forecast Waspada Integrity
created_at: "2026-10-25T00:00:00.000Z"
status: completed
code_commit: 56045cf
framework: GSD
---

# Phase 109 — EWKB Location Parsing & Fair Intake (60 / 150)

**Status:** IMPLEMENTED (commit `56045cf`); documented in this pass.
**Commit subject:** `fix(incidents+news): parse EWKB hex locations, round-robin intake 60 + read 150 to restore Berita`.
**Depends on:** Phase 107 (live-only read path), Phase 108 (23 feeds + 8 queries).
**Related existing mechanism:** Redis ingestion lock in `news_router.py` (hardening, not introduced here).

---

## 1. Goal

Restore two things that were silently broken:

1. **Incident coordinates.** PostgREST returns PostGIS `geometry` as EWKB hex, not WKT. The incidents API treated every non-WKT `location` as unparseable, so rows lost their lat/lon.
2. **Feed fairness and volume.** A flat head-slice over 23 feeds + 8 queries starved late feeds; a 60-row read window let DROPPED rows push valid rows out of the Berita response.

---

## 2. Issues found

| Issue | Evidence | Fix |
|---|---|---|
| EWKB hex rejected as WKT | `incidents.py:53-100` parses EWKB; old behavior only had `_WKT_POINT_RE` (`:16-19`) | Endian-aware EWKB Point reader |
| Non-WGS84 SRID accepted/ignored | `incidents.py:23-27,87-92` | Reject SRID ≠ 4326 |
| A pre-migration schema had no separate coordinate projection | `incidents.py:121-141` tries the concrete `lat/lon` projection, then the legacy WKT projection | Explicit two-step fallback |
| PostGIS polygon hex unconsumable by the map | `agents/tools/supabase_tools.py:104-123,204-212,257-295` | Stdlib WKB/EWKB reader → GeoJSON |
| Late feeds starved by a flat slice | `unified_news_ingestor.py:39-42` comment: "a flat head-slice starves every feed whose results land late in the gather order" | `round_robin_by_source` |
| Reported prior caps of 15 per feed / 30 total starved low-volume outlets | Not present in the current tree; no `15`/`30` intake constant survives. Replaced by `NEWS_INGEST_ITEM_BUDGET = 60` (`unified_news_ingestor.py:42`) allocated round-robin. The 15/30 values are a window report, not a code constant. | 60-item fair budget |
| 60-row read window hid valid rows | `news_router.py:304-307` comment: "a 60-row window let valid rows get pushed out by dropped ones" | Read 150 |
| 97% DROPPED thin volume | Operator observation in this window; see `news_router.py:305-306` for the code-level consequence | Over-fetch + fair intake |
| Stale Redis lock | `news_router.py:169-210` uses a 240 s NX lock + token-checked release | Self-healing TTL; no manual cleanup |

**Not claimed:** the 97% figure is not encoded in code; it is a recorded observation that explains why 150 was chosen.

---

## 3. Work packages

### WP1 — EWKB Point parser (`backend/app/routers/incidents.py`)

| Line | Behavior |
|---|---|
| `21-27` | EWKB flag constants: SRID bit `0x20000000`, type mask, Point type 1, WGS84 4326. |
| `53-70` | Normalize `0x` prefix; reject odd-length / non-hex input. |
| `72-80` | Read byte order; accept little (`0x01`) and big (`0x00`) endian. |
| `82-84` | Reject non-Point geometry. |
| `86-93` | Read SRID when present; reject anything other than 4326. |
| `95-100` | Read `lon,lat` doubles; reject non-finite. |
| `103-108` | `_parse_location_coords`: EWKB first, then WKT. |
| `121-141` | Concrete `lat`/`lon` projection first; legacy WKT projection on failure. |
| `211-225` | Prefer concrete columns; fall back to parsing `location`; warn only when both fail. |

`_WKT_POINT_RE` (`:16-19`) remains, so legacy rows and fixtures still parse.

### WP2 — WKB/EWKB polygon normalization (`agents/tools/supabase_tools.py`)

| Line | Behavior |
|---|---|
| `104-111` | Documents that PostgREST returns geometry as WKB/EWKB hex; the tool must emit GeoJSON or `None`. |
| `113-129` | EWKB flags, polygon/multipolygon/collection type ids, hex/header regexes. |
| `131-201` | `_WKBReader`: endian-aware, Z/M-aware, SRID-aware Polygon/MultiPolygon/GeometryCollection reader. |
| `204-212` | `_parse_wkb_hex`. |
| `215-234` | `_parse_wkt` for POLYGON/MULTIPOLYGON/GEOMETRYCOLLECTION. |
| `257-295` | `_normalize_geojson_polygon` accepts GeoJSON, JSON string, WKT/EWKT, WKB/EWKB hex, or a ring array. |

This is the polygon analogue of the incidents Point fix. It is in the current tree; the commit subject names the incidents/news path.

### WP3 — Fair intake (`backend/app/services/unified_news_ingestor.py`)

| Line | Behavior |
|---|---|
| `39-42` | `NEWS_INGEST_ITEM_BUDGET = 60`; comment explains the starvation problem. |
| `45-84` | `round_robin_by_source(items, max_items)`: bucket by normalized `source`, keep first-seen order, interleave one item per source per pass, stop at 60. |
| `153-167` | Applies round-robin to form `top_items`, then runs DB-first dedup on that set. |
| `169-211` | Reuses stored classifications; stale `schema_version != 7` rows are re-extracted. |

### WP4 — Read window (`backend/app/routers/news_router.py`)

| Line | Behavior |
|---|---|
| `304-307` | `fetch_news_from_supabase(limit=150, ...)` instead of 60. |
| `309-383` | Defensive re-tier + 48 h freshness + DROPPED/geo/coordinate filters. |
| `386-400` | Empty after filtering → `warming` + background ingest. |

### WP5 — Redis lock hardening (`backend/app/routers/news_router.py`)

| Line | Behavior |
|---|---|
| `162-174` | In-process `asyncio.Lock`, Redis key `lrip:lock:news_ingestor`, TTL 240 s, random token, `_last_cycle_completed_at`. |
| `177-200` | Non-blocking `SET NX EX`; any Redis error returns `True` so ingestion still runs. |
| `203-212` | Release only when the stored token matches this worker's token. |
| `215-260` | Double-checked in-process lock + "cycle completed while queued" check + cross-process lock + `finally` release. |

---

## 4. Operating constraints

- Windows PowerShell, repo `D:\College\Pidi.id`.
- Supabase PostgREST is the source of EWKB hex; this is normal PostGIS behavior, not a corrupt row.
- Render free Singapore single worker: the Redis lock is usually uncontended; it must still be correct if a second worker or a restart appears.
- No Redis by default: lock acquisition returns `True`; DB-first dedup and the in-process cache are load-bearing.
- Vercel `pre-hub.vercel.app`; `NEXT_PUBLIC_API_URL` inlined at build.
- Muse Spark orchestrator/planner; subagents DeepSeek/GLM high; no default subagent; always use subagents.
- Playwright auto-check mandatory; free-model limit → paid high fallback.

---

## 5. Acceptance criteria

- [x] EWKB Point hex parses to `(lat, lon)` for both endiannesses and SRID 4326.
- [x] Non-4326 SRID returns `(None, None)`.
- [x] WKT still parses through `_parse_location_coords`.
- [x] Concrete `lat`/`lon` columns win over `location`.
- [x] Pre-migration schema falls back to the legacy projection.
- [x] Per-cycle extraction is capped at 60 and interleaved by source.
- [x] Live read asks for 150 rows.
- [x] Redis lock has a TTL and owner-checked release.

## 6. Verification plan

```powershell
# from D:\College\Pidi.id
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_api_routers.py -q
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_cross_workstream_integration.py -q
backend\.venv\Scripts\python.exe -m pytest backend/tests/test_news_pipeline.py -q
```

Evidence already in the tree:

- `backend/tests/test_api_routers.py:41-49` — WKT parsing.
- `:52-79` — EWKB little/big endian, SRID-less, non-4326, malformed, WKT fallback.
- `:82-137` — EWKB row maps to floats with no "unparseable" warning.
- `:140-190` — WKT row still maps.
- `:193-244` — concrete columns win.
- `:247+` — legacy projection fallback.
- `backend/tests/test_cross_workstream_integration.py:82-123` — resolve-or-drop permalink contract.

**Not run in this docs-only pass.**

## 7. Open concerns

1. **No test for `round_robin_by_source`.** The function is new and unasserted; its fairness property is only described in the docstring.
2. **No test for the WKB/EWKB polygon reader.** Point parsing is tested; polygon normalization is not.
3. **The lock TTL is not renewed.** A cycle longer than 240 s can let another worker acquire the key. Conversely, a crashed worker self-heals after 240 s.
4. **The lock is best-effort by design.** Redis failure returns `True`, so a Redis outage means multiple workers can ingest concurrently.
5. **Read 150 is still a window.** It reduces starvation but does not guarantee every province appears.
6. **DROPPED rows are persisted deliberately** so they are not re-tested by the LLM; this makes the read-path filter mandatory forever.
7. **The EWKB parser is Point-only in incidents.** A MultiPoint/GeometryCollection in `location` returns `(None, None)`.
