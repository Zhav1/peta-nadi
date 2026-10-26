# LEARNINGS — Phase 129: Supabase-First Server-Minted IDs (019)

## User conditions (applies)

- Supabase-first includes PK minting: the server owns defaults; the client
  omits rather than invents.
- No app-behavior change for callers that already supply ids (parity kept).

## Env context (verified)

- Live Supabase creds in `.env` (names verified SET). Unmigrated remotes are
  the only path that still needs the client-mint retry
  (`travel_supabase.py:124-131`); migrated remotes never mint.

## Concerns / issues (verified facts only)

1. **23502 NOT NULL on id (verified `019:1-11`):** root cause was missing server
   default on TEXT PKs, not caller error. Fixed by 019 defaults + omit-id adapter
   contract (`travel_supabase.py:65-74,333-339`).
2. **PK rotation across upserts (verified `019:9-11`):** client-minted
   `TRKASSET-/RIT-` ids changed the PK every upsert of the same `truck_id`
   when id was omitted. Fixed by server default + upsert on `truck_id`
   (`travel_supabase.py:111-135`).
3. **Empty-string backfill (`019:17-30`):** legacy rows with `''` ids are
   rewritten to uuids; NULL predicate is safety-only under PK NOT NULL.
4. **Excluded:** 1 km/L bug, 40k-vs-50k, CURRENT_DATE shadowing, toll
   silent-zero, bridge wiring — not evidenced here; no claims made.
