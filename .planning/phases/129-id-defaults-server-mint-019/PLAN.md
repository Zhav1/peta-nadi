# PLAN — Phase 129: Supabase-First Server-Minted IDs (019)

**Status:** COMPLETE ✅ (app edits landed pre-docs; this window is docs-only, no commit)
**Date:** 2026-10-26

## Goal

End the `23502` NOT NULL failures and the client-mint PK rotation bug: let
Supabase mint `truck_assets.id / travels.id / fuel_prices.id` via server
default, so repeated upserts of the same `truck_id` no longer rotate the PK.

## Scope files (read, not edited)

- `infra/supabase/migrations/019_truck_id_default.sql:1-39`
  - Problem statement (`:1-11`): TEXT PKs with no server default → every
    id-less insert violated NOT NULL; the adapter workaround minted
    `TRKASSET-/RIT-` ids client-side, rotating the PK on each upsert of the
    same `truck_id` when the caller omitted id.
  - Fix (`:13-39`): `CREATE EXTENSION IF NOT EXISTS "pgcrypto"`; backfill
    empty-string ids; `ALTER ... SET DEFAULT gen_random_uuid()::text` on all
    three tables. Client-supplied ids keep working; only absent ids default.
- `backend/app/db/travel_supabase.py` (adapter contract honoring 019):
  - `:65-74` `_asset_to_row`: omit id when absent so the server default fires;
    comment states the stability rationale.
  - `:111-135` `save_truck_asset`: upsert on `truck_id`, retry fallback mints
    `TRKASSET-` once only when the remote predates 019.
  - `:333-339` (travel path): same omit-when-absent + 019-default comment;
    retry fallback for remotes without the default.

## Decisions

1. Supabase-first: omit-id, never pre-mint, on the primary path.
2. Client mint survives only as a retry fallback for unmigrated remotes.
3. TEXT PK type kept (`TRKASSET-/RIT-/FP-` parity); only the default changes.
