# Phase 55: Environment Constraints, API Limits & Platform Pitfalls

External constraints that shape the Phase 55 implementation. Each section documents the hard limit, the observed failure it caused, and the workaround pattern to implement.

---

## 1. NVIDIA NIM — Account Catalog Limits

**Hard constraint:** `integrate.api.nvidia.com/v1/chat/completions` only serves models present in the **account's catalog**. Requesting a model outside the catalog returns **HTTP 404** ("model not found"), not a permission error.

**Observed failure:** `agents/llm_gateway.py:9` pins `deepseek-ai/deepseek-r1`, which is **not in the account catalog**; the catalog contains **`deepseek-ai/deepseek-v4.1-flash`** instead. The 404 is collapsed into a generic `except` and answered with a canned Indonesian string (`llm_gateway.py:107-115`), so the failure was invisible for the entire LLM surface.

| Item | Value |
|---|---|
| Endpoint | `https://integrate.api.nvidia.com/v1/chat/completions` (`llm_gateway.py:80`) |
| Model discovery | `GET https://integrate.api.nvidia.com/v1/models` with the same Bearer key — run this **before** writing the fix to confirm exact catalog IDs |
| Key env names | `NVIDIA_DEEPSEEK_V4_PRO`, `NVIDIA_DEEPSEEK_V4_FLASH`, `NVIDIA_CUOPT`, `NVIDIA_FOURCASTNET` (`backend/app/config.py:31-34`); selection order `llm_gateway.py:15-20` |
| Key storage trap | Root `.env` holds real `nvapi-…` values while `backend/.env` holds placeholders — launch cwd decides which one is read (see `54-ENVIRONMENT-FIXES-AND-PITFALLS.md` §1) |
| Timeout | 30 s (`llm_gateway.py:101`) |

**Implementation rules:**
1. Treat the model ID as configuration (single source), never scattered literals.
2. Add a startup preflight that lists catalog models and logs a `warning` (with the available IDs) when the configured model is absent.
3. Distinguish error classes — 401 (bad key), 403 (entitlement), **404 (model not in catalog)**, 429 (rate limit), timeout — instead of one catch-all.
4. Never return human-readable prose as a stand-in for model output. Degradation must be typed/flagged so callers cannot mistake it for a completion (the current leak: `economic_intelligence.py:113-119` accepts any string >20 chars).

---

## 2. TomTom — Bbox Area Cap & Credit Exhaustion

### 2.1 Incident Details v5 bbox limit: 10,000 km²

The current request ships `BBOX = "95.0,-6.0,106.5,6.0"` (`tomtom_adapter.py:41`): 11.5° lon × 12° lat ≈ **~1.7 million km² ≈ 170× the cap** → every incidents request returns **HTTP 400** and is silently discarded (`tomtom_adapter.py:90-101`).

**Area formula** (approximation used for tiling):

```
area_km² ≈ (111.32 × Δlat) × (111.32 × Δlon × cos(lat))
```

| Tile size | Approx. area (Sumatra lat 0°–6°N) | Headroom vs 10,000 km² |
|---|---|---|
| 0.5° lat × 0.5° lon | ~3,070 km² | 3.2× |
| 0.5° lat × 0.75° lon | ~4,600 km² | 2.2× |
| 1.0° lat × 1.0° lon | ~12,300 km² | **exceeds cap** — do not use |

**Tiling strategy:** full-island coverage is infeasible at this cap (hundreds of tiles per poll would burn rate limits). Scope incident polling to **monitored corridors**: 0.5°×0.75° cells anchored to the 12 arterial checkpoints + major hubs, sequential fetches with small sleeps, dedupe incidents by incident ID across tiles.

### 2.2 HTTP 403 `InsufficientFunds` (flow)

`flowSegmentData` requests return **403 InsufficientFunds** when the TomTom account credit balance is exhausted. This is a **billing state, not a transient error** — retrying within the same poll cycle cannot succeed.

**Implementation rules:**
1. On 403: set a `credit_exhausted` latch, log **once at warning**, and back off (skip further flow calls until a cooldown elapses).
2. Distinguish 403 (credits) from 429 (rate limit) — different remediation.
3. Surface the state: `corridor_service` payloads carry `is_fallback: true` + a `status`/reason string; the health endpoint reflects degraded TomTom instead of the seeded `'ok'`.
4. Never let the *seed* speed constants masquerade as live data (`cuopt_tomtom_service.py:134` currently labels them `tomtom_live_speed_kmh`).

**Detection checklist before implementing:** verify current account balance; reproduce one raw request per endpoint and log status + body; confirm which endpoint returns 403 vs 400 in the current account state.

---

## 3. Redis — Unbounded Stream Memory Risk

**Observed:** `lrip:stream:osint` held **43,640 entries** because `unified_news_ingestor.py:99` calls `XADD` with **no `maxlen`**. At up to 10 entries per 5-minute news cycle, growth is ~2,880/day before dedupe effects — the stream never shrinks.

| Risk | Detail |
|---|---|
| Memory growth | Redis Streams retain every entry (plus the radix-tree overhead) until trimmed |
| No server cap | `docker-compose.yml:2-15` runs plain `redis:7-alpine` with **no `maxmemory`/eviction policy** |
| Blast radius | Under memory pressure Redis refuses writes (default `noeviction` for OOM on writes) → ingestion errors cascade across BMKG/TomTom/AIS/PIHPS streams |

**Mitigation pattern:**
1. `XADD … MAXLEN ~ 10000` (approximate trimming) on the osint producer — matching `redis_client.py:63`'s existing cap for adapter streams.
2. One-time `XTRIM lrip:stream:osint MAXLEN ~ 10000` to reclaim the backlog.
3. Consumers use `XRANGE` windows only (`osint_hazard.py:43-60`) with no consumer groups/PEL — trimming is safe.
4. Optional defense-in-depth: `maxmemory` + an eviction policy on the compose Redis service; prefer per-stream `maxlen` as the primary bound (eviction under memory pressure can silently drop unrelated keys).
5. Monitoring: log `XLEN` per publish (debug) and expose a threshold warning.

**Inspection commands:** `XLEN lrip:stream:osint`, `XINFO STREAM lrip:stream:osint`, `MEMORY USAGE lrip:stream:osint`.

---

## 4. Supabase — RLS Across Core Tables

### 4.1 Semantics that bite

| State | anon `SELECT` | anon `INSERT/UPDATE` |
|---|---|---|
| RLS **disabled** | returns rows | allowed (exposed!) |
| RLS **enabled, zero policies** | **HTTP 200 `[]` — no error** | `42501` row-level security violation |
| RLS enabled + read policy | returns rows | `42501` unless a write policy exists |
| service_role key | bypasses RLS entirely | bypasses RLS entirely |

The silent-200-empty is the reason `/api/v1/incidents` (and `/api/v1/approvals`, `/api/v1/outcomes`) returned 22-byte empty payloads while rows existed.

### 4.2 Current state (from the audit)

- **No policies at all:** `data_sources`, `incidents`, `route_approvals`, `ltm_episodes`, `kg_entities`, `kg_relationships`, `ground_truth_outcomes`.
- **Policy without explicit enablement:** `commodity_prices` (migration `009` adds SELECT for `anon, authenticated` but never `enable row level security` — it works in the live project only because RLS was enabled out-of-band).
- **Correct precedents:** `custom_fleet_vehicles` and `incident_impact_assessments` (`007:43,86`), `news_articles` (`008:40`).

### 4.3 Implementation rules

1. Every table migration ships an **explicit decision**: either `enable row level security` + policies, or a comment stating why RLS is intentionally off.
2. Write paths stay privileged: backend ingestion and operator mutations use the **service_role** client (`get_service_client()`); policies grant **reads** to `anon, authenticated` only where the data is public (safety, prices, news, KG).
3. Policy + enablement live in the **same migration** (fix the 009 pattern; replayable on a fresh database).
4. Schema drift warning: committed migrations are incomplete (001–004 missing) and `005`/`008` FK-reference `incidents(incident_id)`, which does not exist in `000_init.sql` — **diagnose the live schema before writing new migrations** (`information_schema.columns` for `incidents`).
5. Verification queries after applying:

```sql
select relname, relrowsecurity from pg_class where relname in ('incidents','commodity_prices','route_approvals');
select tablename, policyname, cmd, roles from pg_policies where schemaname = 'public';
```

6. Smoke tests: anon `select` must return rows (not a silent `[]`); anon `insert` must be rejected; the backend's service-role path must still write.

---

## 5. Related Environment Notes

- `.env` cwd trap and process-scope env masking apply directly to the NIM/TomTom credential checks above — see `../54-post-audit-plothole-remediation-guest-lockdown-pihps-persistence/54-ENVIRONMENT-FIXES-AND-PITFALLS.md` §1–§2.
- Windows PowerShell PATH refresh and `rtk` command proxying rules — see `../53-system-audit-routing-geometry-and-strict-rbac-guardrails/53-ENVIRONMENT-FIXES-AND-PITFALLS.md` §1–§2.
- Deployment topology: `docker-compose.yml:26` runs `uvicorn --workers 2` → every lifespan poller runs twice. Keep all Phase 55 fixes (health writes, TomTom credit latch, stream trims) idempotent under duplicate execution.
