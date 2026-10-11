# Phase 54: Implementation Walkthrough & Code Verification

**Commits covered:** `8f12e50` (audit fixes), `0ff2ac0` (PIHPS persistence + startup), `4df17de` (migration 009)

---

## 1. Overview

Phase 54 closed every plothole from `POST_IMPLEMENTATION_AUDIT_REPORT.md` plus the commodity data-availability gap. Twelve files changed for the audit fixes (+441/−180), four for PIHPS persistence (+311/−13), and one SQL migration. This walkthrough documents the actual code changes per file.

---

## 2. Frontend

### 2.1 `frontend/lib/authContext.tsx` (guest lockdown, race guards, bypass removal)

| Change | Detail |
|---|---|
| `DEFAULT_GUEST_PROFILE.permissions` | Now `[]` — unauthenticated visitors hold zero operational permissions |
| `GUEST_LOCK_MESSAGE` | New constant: *"Diperlukan autentikasi akun resmi untuk beralih peran operasional."* — returned by `switchRole` when no token exists (persona switching is token-gated, deleted earlier in Phase 53) |
| `AUTH_SERVICE_UNAVAILABLE_MESSAGE` + `isAuthServiceUnavailable()` | New failure classifier (`TypeError`, `status === 0`, `AuthRetryableFetchError`); `login` / `signUp` / `loginWithMagicLink` now return this explicit error instead of minting an offline guest session |
| Offline fallback removed | The old `api.auth.createGuestSession({ role: 'DISPATCHER' })` bypass path is deleted; failed init and `logout` return to the locked guest profile (`applyToken(null, DEFAULT_GUEST_PROFILE)`) |
| `isMountedRef` | Set `false` on provider unmount; every post-await `setState` / `applyToken` / `setIsLoading` in `switchRole`, `login`, `signUp`, `loginWithMagicLink` is guarded |
| `syncAuthCookie()` | Keeps the middleware-readable `prehub_auth_token` cookie in lockstep with localStorage (max-age 48h, samesite lax); cleared on logout |

### 2.2 `frontend/components/dashboard/DashboardClient.tsx` (A1, A3, B2)

| Change | Detail (approx. new line anchors from diff) |
|---|---|
| `resolveApprovedDelayMinutes()` | New helper at ~L190–206: returns `Math.max(0, approvedEta − min(route etas))`; returns `0` on non-finite/empty sets — never uses a hardcoded baseline or the raw total ETA |
| Approval call site | ~L610: `applyOperationalImpact({ delayMinutes: resolveApprovedDelayMinutes(approvedRoute, allRoutes), fuelIncreasePct: … })` — replaces `Math.round(approvedRoute?.eta_minutes ?? 38)` |
| Map approval call site | ~L1156: same helper over `currentMapRoutes.length > 0 ? currentMapRoutes : [route]`; `currentMapRoutes` added to the `useCallback` deps |
| Predictive guard | ~L815–829: `if (!id.startsWith('pred-'))` skips the guaranteed-404 `/api/v1/incidents/{id}` fetch; local `historicalEpisodes` / `predictiveRisks` catalogs resolve it |
| Sensor badges | ~L1669–1688: all three badges inverted to `is_fallback ? 'FALLBACK' (amber) : isLoading ? 'MEMUAT' (cyan) : 'LIVE' (emerald)` |

### 2.3 `frontend/components/auth/AuthModal.tsx` (C2, C3, C4)

| Change | Detail |
|---|---|
| `dismissGuestQuery()` | New function using `usePathname`/`useRouter`; deletes only the `guest` query param and `router.replace`s the cleaned URL. Called after successful sign-up, login, and magic-link handling |
| Status icon | Error status now renders `AlertCircle`; `CheckCircle2` reserved for success |
| Guest persona card | Copy replaced with *"Mode Pratinjau Terbatas (Evaluasi Tamu): Akses pemantauan peta dasar tanpa hak wewenang persetujuan atau mutasi rute operasional."*; badge `Akses Penuh` → `Akses Terbatas` |

### 2.4 `frontend/hooks/useCorridorContext.ts` (A3 + B1)

| Change | Detail |
|---|---|
| `DEFAULT_FALLBACK_CORRIDOR` | Now carries `is_fallback: true` (L6–49); still mirrors backend hardcoded defaults (74.2% congestion / 22.5 km/h / 35 min delay) for first-render stability |
| Fresh fetch | `const fresh: CorridorContext = { ...data, is_fallback: false }` |
| `applyImpactToContext()` | Pure recalculation of congestion %, delay minutes, flow speed (clamped ≥5 km/h), checkpoint speeds/status, commodity price factor and inflation trend |
| `activeImpactRef` | Stores the latest `OperationalImpact`; on every 30s poll the fresh payload is re-based and the stored impact **re-applied before** `setCorridorContext` — effects no longer revert to baseline |
| Error path | Still falls back to `DEFAULT_FALLBACK_CORRIDOR`, but only when `prev` is null |

### 2.5 `frontend/lib/types.ts`

`CorridorContext` gained `is_fallback: boolean` (+1 line).

---

## 3. Backend

### 3.1 `backend/app/auth/supabase_auth.py`

`ROLE_GUEST` trimmed from nine permissions (`all:sandbox`, `scenarios:run`, `simulation:write`, `approvals:write`, `fleet:read`, `routes:plan`, `reports:export`, …) down to exactly `['benchmark:read', 'reports:read']` (7 lines deleted). The guest JWT payload consequently carries the read-only list through `app_metadata.permissions`.

### 3.2 `backend/app/routers/approvals.py`

- Import slimmed (`ROLE_REGULATOR` no longer used).
- `create_approval` gate changed from a role denylist (`if role == ROLE_REGULATOR`) to a **capability gate**: `if "approvals:write" not in (current_user.permissions or [])` → HTTP 403 with `required_permissions: ["approvals:write"]` and the caller's `current_role`. Guests and regulators are now both denied; dispatchers pass.

### 3.3 `backend/app/routers/fleet_ingest_router.py`

- Role imports replaced with `get_optional_user, UserSession`.
- Four write endpoints converted to capability gates:
  - `register_single_vehicle` and `delete_custom_fleet_unit` → `fleet:write`
  - `upload_fleet_manifest` and `upload_fleet_manifest_file` → `manifests:upload`
- Error payloads now include `required_permissions`. This (not the frontend) is the authoritative guest lockdown for fleet mutation.

### 3.4 `backend/app/scrapers/pihps_scraper.py`

| Change | Detail |
|---|---|
| `_get_write_client()` | Prefers `get_service_client()` (RLS bypass) with anon fallback; used only for ingestion writes |
| `persist_price_points()` | Persists **every** weekly period reading into `commodity_prices`; idempotent via delete-then-insert on `(commodity, region, time)`; wraps each point in try/except and never raises; logs `Persisted N PIHPS price points …` |
| `parse()` | Calls persistence for each commodity before spike evaluation; warns when a level-2 row is missing and a level-1 aggregate is used (e.g. `cabai_merah`); spike/baseline/dedup logic unchanged |
| Row math | 7 commodities × ~5 weekly points = ~35 rows per cycle — the `commodity_prices` row count observed thereafter |

### 3.5 `backend/app/main.py`

New `_poll_pihps_loop()` (imports `PIHPSScraper`, runs `scraper.run()` with cancel/error handling) registered as a lifespan task `pihps_task = asyncio.create_task(_poll_pihps_loop())`; the shutdown loop now cancels `[bmkg, tomtom, earth2, ais, news, pihps]`.

### 3.6 `backend/app/nlp/geocoding_service.py`

Re-added the compatibility alias the test suite imports:

```python
KNOWN_POIS = {k: v["coords"] for k, v in PAN_SUMATRA_GAZETTEER.items()}
```

Without it, `pytest` collection aborted with an `ImportError` in `backend/tests/test_scrapers.py` (see `54-ENVIRONMENT-FIXES-AND-PITFALLS.md` §4).

### 3.7 `infra/supabase/migrations/009_commodity_prices_public_read.sql`

```sql
create policy "commodity_prices_public_read" on public.commodity_prices for select to anon, authenticated using (true);
```

Grants the anon/authenticated SELECT that unblocks `/api/v1/commodities/prices` and the frontend price chart. Writes intentionally have no policy — the service-role client from `_get_write_client()` is required.

---

## 4. Test & Verification Artifacts

| Suite | Change | Result |
|---|---|---|
| `backend/tests/test_auth_rbac.py` | +199 lines: guest-denial on mutation routes (HTTP 403), forged-signature rejection, `/switch-role` session enforcement | 18/18 passed |
| `backend/tests/test_scrapers.py` | +187 lines: `test_pihps_persists_all_period_points_to_supabase` and persistence-failure safety | passed |
| `backend/tests/test_api_routers.py` | 8 lines adjusted (role/permission fixtures) | passed |
| `backend/tests/test_fleet_ingest.py` | 3 lines adjusted | passed |
| `backend/tests/test_outcomes_decisions.py` | 7 lines adjusted for local fallback | passed |
| `npx tsc --noEmit` | Frontend type gate | 0 errors |

**Commit hashes:** `8f12e50` · `0ff2ac0` · `4df17de` — all on `main`.
