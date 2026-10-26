# WALKTHROUGH — Phase 129: Supabase-First Server-Minted IDs (019)

Docs-only window. No app files edited, no tests run, no commits.

## What was read (file:line)

1. `infra/supabase/migrations/019_truck_id_default.sql` (full, 39 lines)
   - `:1-11` root-cause header (no server default → NOT NULL violation →
     client-mint rotation across upserts).
   - `:15` pgcrypto requirement; `:17-30` empty-string backfill (NULLs cannot
     exist under PK NOT NULL; predicate kept for safety); `:32-39` three
     `SET DEFAULT gen_random_uuid()::text`.
2. `backend/app/db/travel_supabase.py`
   - `:20` `is_configured()` gate (Supabase-primary switch, owned by Phase 133).
   - `:65-74` omit-when-absent asset mapping; `:111-135` upsert + single retry
     fallback; `:333-339` travel-side mirror of the same contract.

## Fixes tried

None in this window (docs-only). Design note recorded from reading: the retry
fallback mints exactly once inside the `except` path (`:124-131`), so the
stable path (migrated remote) never mints and never rotates; the fallback path
exists only for remotes without the 019 default.

## Test evidence

No tests executed here. Id-stability is covered indirectly by
`test_travels_erp.py` flows that register a truck then create travels against
the same `truck_id` (`:425-436,486-501`); hermetic re-verification was not
re-run in this docs window.
