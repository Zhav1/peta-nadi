# PLAN — Phase 159: Vessel Restore (Dispatcher)

**Window:** 2026-10-27 · **Mode:** docs (record built work; no commit)
**Commit recorded:** `b0072cc`

## Objective

Record the vessel restore: dispatcher scope = tenant trucks (strict
`company_id` claim) + public situational maritime/air vessels (pre-Phase-81
behavior); trucks never leak across tenants; Perusahaan badge counts
live-tenant GPS only.

## Scope IN

- Backend (`telemetry_service.py:2055-2065`): `tenant_only` keeps tenant
  trucks isolated; `modality in (maritime, air)` rides along as public
  AIS/ADS-B awareness; docstring updated (`:1839-1846`); router contract
  updated (`vehicles_router.py:46-64`).
- Frontend (`useFleetVehicles.ts:488-557`): `tenantVehicles` stays
  strictly scoped (roster honesty); new `situationalVessels`
  (non-tenant maritime/air only, never trucks; no claim → honest empty,
  no backfill).
- Counts (`DashboardClient.tsx:593-600,3467-3470`): pills use combined
  slice; `Perusahaan Live GPS` badge uses `liveTenantVehicles` only.
- Tests (`test_fleet_ingest.py`, `test_fleet_scope.ts`): trucks asserted
  tenant-scoped; vessels asserted present (`len > 0`); cross-tenant
  invisibility kept.

## Scope OUT

- No tenancy-model change; no commit/push.

## Decisions locked (from diff + code reads)

1. Trucks = tenant private (claim-scoped, `is_tenant_asset` true only).
2. Maritime/air = public situational (macro feed, `is_tenant_asset`
   false, never counted as Perusahaan).
3. No claim → honest empty; mock fleets never substitute (Phase 81 rule
   kept for trucks).
