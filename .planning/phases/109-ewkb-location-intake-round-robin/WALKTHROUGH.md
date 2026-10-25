# Phase 109 — Walkthrough

**Code commit:** `56045cf` (`fix(incidents+news): parse EWKB hex locations, round-robin intake 60 + read 150 to restore Berita`).
**Docs state:** written from the current tree; no app code edited.
**Verification:** code inspection + commit evidence. Tests were not re-run.

> **Attribution note:** the EWKB Point parser, round-robin intake, and 150-row read are the commit's subject. The Redis-lock hardening and the polygon WKB reader are present in the current tree and are documented here because they address the same class of failure; this file does not claim they were introduced by `56045cf`.

---

## 1. Changed surface

### 1.1 Incidents Point parsing

| File:line | What changed |
|---|---|
| `backend/app/routers/incidents.py:21-27` | EWKB constants: SRID flag, type mask, Point type, WGS84. |
| `:53-100` | `_parse_ewkb_point_hex`: hex/prefix normalization, endian, Point check, SRID check, finite `lon/lat`. |
| `:103-108` | `_parse_location_coords`: EWKB then WKT. |
| `:121-141` | `_fetch_incident_rows`: concrete `lat/lon` projection, legacy WKT projection fallback. |
| `:211-225` | Mapping: concrete columns → parsed `location` → warning if both fail. |

### 1.2 Polygon normalization

| File:line | What changed |
|---|---|
| `agents/tools/supabase_tools.py:104-111` | Comment: PostgREST returns WKB/EWKB hex; no map can consume it directly. |
| `:113-129` | Flags/type ids/regexes. |
| `:131-201` | `_WKBReader` for Polygon/MultiPolygon/GeometryCollection with Z/M/SRID. |
| `:204-212` | Hex decode wrapper. |
| `:215-234` | WKT/EWKT fallback. |
| `:257-295` | Coercion entry point used by `get_hazard_polygons`. |

### 1.3 Fair intake

| File:line | What changed |
|---|---|
| `backend/app/services/unified_news_ingestor.py:39-42` | `NEWS_INGEST_ITEM_BUDGET = 60`; docstring records head-slice starvation. |
| `:45-84` | `round_robin_by_source`: bucket by source, interleave, cap at 60. |
| `:153-167` | `top_items = round_robin_by_source(...)`, then DB-first dedup. |

### 1.4 Read window and lock

| File:line | What changed |
|---|---|
| `backend/app/routers/news_router.py:304-307` | `limit=150` with the starvation comment. |
| `:169-174` | Redis lock key, 240 s TTL, token, last-completed monotonic stamp. |
| `:177-200` | Non-blocking acquire; Redis failure degrades to `True`. |
| `:203-212` | Owner-checked release. |
| `:215-260` | Double-checked lock, queued-cycle suppression, `finally` release. |

---

## 2. Why the EWKB fix matters

PostgREST serializes a PostGIS `geometry` column as hex EWKB, e.g.:

```
0101000020E6100000C217265305AB584034A2B437F8C20C40
```

The previous `_WKT_POINT_RE` could not match that string, so `location` became `(None, None)`; the incident still appeared but the map had no coordinates. The new parser reads:

- byte order (`01` little / `00` big),
- geometry type and the SRID flag,
- SRID (reject non-4326),
- two doubles (`lon`, `lat`).

The API still prefers the concrete `lat`/`lon` columns from migration 010, so the EWKB path is a compatibility fallback, not the primary source.

---

## 3. Why round-robin matters

`fetch_all_multi_outlet_news()` gathers 23 RSS feeds + 8 Google queries concurrently (`news_aggregator.py:1095-1127`). Results are appended in completion order. A flat `raw_items[:60]` therefore gives the entire budget to whichever feeds finish first. `round_robin_by_source`:

1. Buckets by normalized `source` in first-seen order.
2. Takes one item from each bucket per pass.
3. Stops at 60.

The DB-first dedup (`unified_news_ingestor.py:153-167`) then reuses stored classifications before spending LLM tokens on unseen items.

---

## 4. Behavior deltas

1. Incidents created from EWKB rows now carry real `lat`/`lon`; no more "unparseable location" warnings.
2. An incident stored in a non-4326 SRID is rejected rather than plotted at a wrong location.
3. A pre-migration schema still serves WKT rows through the legacy projection.
4. Per-cycle extraction is capped at 60 but spread across outlets, so late-finishing Tribun/Katadata feeds are represented.
5. Berita reads 150 rows before filtering, so DROPPED volume is less likely to hide valid rows.
6. A crashed ingestion worker no longer leaves a permanent lock; the key expires after 240 s.

---

## 5. Fixes tried and rejected

| Attempt | Why it was rejected | Current approach |
|---|---|---|
| Regex `POINT(...)` only | PostgREST never sends WKT for geometry columns | EWKB parser first, WKT fallback |
| Treat every hex string as a point | Polygon/line hex would be misread | Type check + SRID check + minimum length |
| Ignore SRID | A projected CRS would be plotted as degrees | Reject SRID ≠ 4326 |
| Trust `location` over `lat/lon` | Migration 010 columns are the canonical values | Concrete columns win |
| Flat `raw_items[:60]` | Starves late feeds | Round-robin by source |
| Reported prior 15-per-feed / 30-total caps | Low-volume outlets never reach the extractor; the values are not in the current tree | 60-item round-robin budget |
| Read 60 rows | DROPPED rows crowd out valid rows | Read 150 |
| Delete the Redis lock key blindly | A slow worker can delete a new owner's key | Token-checked release |
| Hold the lock forever on crash | Ingestion stalls indefinitely | 240 s TTL |

---

## 6. Verification evidence

**Commit:** `.git/logs/HEAD:295` records `56045cf0a95b003ffa2b5a529fe04b61619c8346`.

**Tests present:**

- `backend/tests/test_api_routers.py:52-79` — EWKB little/big endian, SRID-less, non-4326, malformed, WKT fallback.
- `:82-137` — an EWKB row surfaces floats and emits no "unparseable" warning.
- `:140-190` — WKT row still works.
- `:193-244` — concrete columns take precedence.
- `:247+` — legacy projection fallback.
- `backend/tests/test_cross_workstream_integration.py:82-123` — unresolvable URLs are dropped, not rewritten.

**Not present:**

- No test for `round_robin_by_source`.
- No test for the polygon `_WKBReader`.
- No test for the Redis lock's TTL/owner semantics.

**Not run:** all of the above in this docs-only pass.

---

## 7. Residual risks

1. A cycle longer than 240 s can lose the Redis lock; there is no renewal.
2. If Redis is down, `_acquire_cross_process_ingestion_lock` returns `True`; two workers can ingest at once.
3. The 150-row read is a larger window, not a guarantee.
4. `round_robin_by_source` treats `source` as the bucket key; a feed that reports a generic source name will be merged with another.
5. The incidents parser handles Point only; a MultiPoint/collection `location` returns `(None, None)`.
6. DROPPED rows remain in the DB by design; every read path must keep filtering them.
