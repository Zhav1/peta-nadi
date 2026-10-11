# Phase 54: Environment Fixes, Workarounds & Developer Pitfalls

Five environment traps were hit or confirmed during Phase 54 execution. Each is documented with symptom, root cause, fix, and the detection trick that exposes it.

---

## 1. The `.env` CWD Trap

**Symptom:** credentials appear configured in one terminal but "missing" in the backend process — or vice versa. Behavior changes depending on the directory `uvicorn`/scripts are launched from.

**Root cause:** `backend/app/config.py:47-51` declares `env_file = ".env"` — a **path relative to the process working directory**, not to the module file.

| Launch cwd | File actually loaded |
|---|---|
| Repository root (`D:\College\Pidi.id`) | root `.env` |
| `backend/` | `backend/.env` |

Both files exist and define the same key names with **different values** (e.g., the NVIDIA keys hold real `nvapi-…` values in the root file while `backend/.env` carries placeholders; TomTom/AISstream keys live at lines 21-22 of each). On top of that, `get_settings()` is `@lru_cache()` (`config.py:58-60`) and `settings = get_settings()` runs at import time in `main.py` and `supabase_auth.py` — so whichever file is read at process start is frozen for the lifetime of that process.

**Fix / workaround:**
- Pick one launch convention and document it (backend development is run from the repo root against the root `.env`).
- After editing any `.env`, **restart the process** — `lru_cache` will not re-read it.
- When sharing keys across environments, mirror values deliberately; never assume the two files agree.

---

## 2. Process-Scope Environment Variables in Terminal Subshells Mask Credential Mismatches

**Symptom class:** a scratch script or manual `pytest` run succeeds ("the key works!"), while the long-running FastAPI process — started earlier or from a different shell — still fails (e.g., Supabase `42501` on writes). The credential "works" and "doesn't work" depending on who you ask.

**Root cause:** PowerShell `$env:SUPABASE_SERVICE_ROLE_KEY = "…"` (or any session export) only affects **that shell and its children**. A separately-started server process reads the `.env` file value instead. The mismatch is invisible because both paths "look" configured.

**Detection trick:**
- Decode the JWT actually in use **inside the failing process** and check its `role` claim (`service_role` vs `anon`) — do not check what the shell says.
- Compare the same claim between the shell-run script and the server process; a divergence proves the process-scope masking.

**Fix / workaround:** treat `.env` files as the single source of truth for services; use shell exports only for throwaway probes and never as the "fix" for a server-side mismatch. Restart services after credential changes.

---

## 3. Supabase RLS Trap — `commodity_prices`

**Symptom:**
- The frontend/API price series read back empty, with **no error** anywhere.
- PIHPS ingestion writes failed with PostgreSQL `42501` (*new row violates row-level security policy*) — swallowed by the scraper's best-effort exception handling.

**Root cause:** `commodity_prices` had **Row Level Security enabled with zero policies**. Under RLS-with-no-policy:

| Operation | PostgREST behavior |
|---|---|
| `select` (anon) | **HTTP 200 with `[]`** — a silent empty result, not a 4xx |
| `insert`/`upsert` (anon) | `42501 row-level security policy` violation |

The silent-empty-read is the trap: nothing in logs or HTTP status indicated a problem. This is the same failure signature that makes `/api/v1/incidents` return `[]` despite rows existing (see Phase 55).

**Fix (Phase 54):**

1. **Reads:** `infra/supabase/migrations/009_commodity_prices_public_read.sql` adds `for select to anon, authenticated using (true)`.
2. **Writes:** `pihps_scraper._get_write_client()` prefers the **service-role client** (bypasses RLS) because no INSERT policy exists — and intentionally so; ingestion writes stay privileged.

**Caveat for fresh environments:** migration 009 contains only the `create policy` statement. It assumes RLS is enabled on the table (enabled out-of-band in the live project `ulpmmacsdkohwkmyhlwj`). When replaying migrations into a new database, pair it with `alter table public.commodity_prices enable row level security;` — otherwise the policy sits inert.

**Broader warning:** seven core tables from `000_init.sql` have **no RLS policies at all** (`data_sources`, `incidents`, `route_approvals`, `ltm_episodes`, `kg_entities`, `kg_relationships`, and the same `commodity_prices` write path). This pattern ("policy added, enforcement forgotten" / "table exposed, policy never written") is scheduled for hardening in Phase 55.

---

## 4. Missing `KNOWN_POIS` Alias Breaks pytest **Collection**

**Symptom:** the entire `pytest backend/tests` run dies before executing anything, with an `ImportError` pointing at `backend/tests/test_scrapers.py`.

**Root cause:** `test_scrapers.py` imports `KNOWN_POIS` from `app.nlp.geocoding_service`, but a refactor had removed the module-level alias. An import failure at collection time aborts the **whole suite**, not just one test — making it look like "everything is broken" instead of "one symbol is missing".

**Fix (`0ff2ac0`, +2 lines):**

```python
KNOWN_POIS = {k: v["coords"] for k, v in PAN_SUMATRA_GAZETTEER.items()}
```

**Lesson:** module-level names imported by tests are API contracts. When refactoring, either keep the alias or update every importer in the same commit. Collection-time failures mask all downstream tests.

---

## 5. Pre-Existing Commodity Test Failure When the DB Table Had 0 Rows

**Symptom:** `backend/tests/test_api_routers.py` failed on `/api/v1/commodities/prices` ("expected items > 0") even though the router code was correct.

**Root cause:** the test hits the **live** Supabase-backed endpoint and asserts a non-empty result; the `commodity_prices` table held 0 rows at the time (writes had been blocked — see §3). The failure was environmental, not a code regression.

**Fix:**
1. PIHPS persistence (`0ff2ac0`) populated ~35 rows (7 commodities × ~5 weekly periods), making the live assertion meaningful again.
2. The API-router test fixtures were adjusted in `8f12e50` for the new RBAC/permission shapes.

**Lesson:** tests coupled to live data must seed their own rows, skip gracefully when the table is empty, or be explicitly classified as environment checks — otherwise "pipeline not yet run" is indistinguishable from "endpoint broken".

---

## 6. Related Environment Notes

- PowerShell subshell PATH resolution and `rtk` command proxying are unchanged from Phase 53 — see `../53-system-audit-routing-geometry-and-strict-rbac-guardrails/53-ENVIRONMENT-FIXES-AND-PITFALLS.md` §1–§2.
- Public deployment topology: `docker-compose.yml:26` runs `uvicorn --workers 2`, which duplicates every FastAPI lifespan poller (including the new PIHPS loop) per worker. Keep this in mind when validating "run once on startup" behavior.
