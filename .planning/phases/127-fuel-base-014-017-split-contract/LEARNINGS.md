# LEARNINGS — Phase 127: Truck/Travel Split + Fuel-Spec Base (014–017)

Scope: DDL + contract only. Ledger math, SK data, id defaults, backdate,
frontend, and bridge are owned by Phases 128–133.

## User conditions (locked for all fuel phases)

- Supabase-first: remote tables are production truth; SQLite is fallback.
- No fixed universal 3.5 km/L: `GOLONGAN_DEFAULT_KMPL` per golongan; flat 3.5 is
  GOL_II-only legacy (`016:8-17`).
- ESDM SK is the fuel authority, never TomTom (TomTom = traffic/congestion).
- Freeze-at-created_at: SK lookup keys on row `created_at`; old rows keep frozen
  rates unless the one-time backfill explicitly reprices (Phase 131).
- Fuel math surfaces only in Laporan/ERP, never map/popover (Phase 132).
- Null-honest: missing actuals/economy stay absent, never 0 (Phase 132).

## Env context (verified this window)

- `.env` contains live Supabase creds: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY` all SET (names + lengths verified; values never
  printed). SQLite fallback: `backend/data/prehub_local.db` via `local_storage`.
- Frontend prod `https://pre-hub.vercel.app`; backend
  `https://peta-nadi.onrender.com` (Render free plan: ephemeral filesystem,
  cold-start timeouts — reason Supabase must be primary).

## Concerns / issues (only verified facts; assumptions excluded)

1. **3.5/6800 duplicates (verified):** 6800 appears in
   `spoilage_hedging_service.py:100-104` (`PERTAMINA_FUEL_BASE_RATES`), in the
   016 fallback seeds (`016:82-87`), and as the verified SK 218 rate (Phase 128).
   Same number, three provenances — the ledger resolves via `fuel_prices` row +
   `fuel_source`, never by re-typing the literal (Phase 131).
2. **Open RLS on 014 tables (verified):** `014:35-51,140-156` use
   `USING/WITH CHECK (true)`; tenant isolation rests on router filters
   (prior concern `.planning/LEARNINGS.md:224`, still open).
3. **`origin_coords/dest_coords` default `[0,0]` (verified `014:66,69`):**
   schema-level default is not a license to geocode to Null Island; boundary
   rule is skip-and-warn, enforced in service/router layers.
4. **NOT re-verified here (excluded):** 1 km/L bug locus, 40k-vs-50k labor
   figure history, telemetry bridge wiring. No claim made; see Phases 131–133
   for what each actually evidences.
