-- ==============================================================================
-- PetaNadi / LRIP — LTM embedding 768-dim remediation
-- Migration: 001_ltm_embedding_768.sql
-- Run this in: Supabase SQL Editor → New Query → Run (AFTER 000_init.sql)
--
-- Why: 000_init.sql declared ltm_episodes.embedding as vector(1536) while
--   agents/memory/ltm.py embeds with Google models/text-embedding-004
--   (768 dims). pgvector enforces width on insert, so 768-dim rows fail
--   against a 1536-built table and LTM write + recall silently degrade to [].
--   Phase 59 D-08 locks the model (one-way); this migration pins the column.
--
-- Probe evidence (2026-10-17, secret-safe masked checks only, key never printed):
--   * GEMINI_API_KEY present in local .env (set:yes, AQ.-class prefix).
--   * Direct embedContent probe for models/text-embedding-004 returned
--     HTTP 404 NOT_FOUND for this key ("not found for API version v1beta").
--     Full ListModels (pageSize=1000, single page) exposes exactly 3
--     embedContent-capable models (gemini-embedding-001,
--     gemini-embedding-2-preview, gemini-embedding-2); text-embedding-004
--     is NOT listed. Follow-up tracked in 59-02-SUMMARY.md — the 768-dim
--     contract below is unchanged (switching models is a one-way
--     distribution shift per D-08, out of scope here).
--   * Live atttypmod check DONE via read-only pg_attribute query at build:
--     public.ltm_episodes.embedding = vector(1536) (drift confirmed live),
--     table holds 0 rows (TRUNCATE destroys nothing), and no match_episodes
--     RPC exists yet (flagged as follow-up — creating it is out of scope).
--
-- ONE-WAY (Phase 59 D-08 lock): the TRUNCATE below DESTROYS existing rows.
--   Downcast vector(1536) -> vector(768) cannot preserve data. After apply,
--   re-embed every row and verify counts (see step 4).
-- ==============================================================================

DO $$
DECLARE
  v_typid  oid;
  v_typmod integer;
BEGIN
  -- (1) Idempotency gate: read the live column width via pg_attribute.
  -- pgvector stores the width directly in atttypmod (live probe 2026-10-17:
  -- vector(1536) reports typmod=1536), so compare via format_type rather
  -- than a magic constant — robust to any typmod encoding.
  SELECT a.atttypid, a.atttypmod INTO v_typid, v_typmod
  FROM pg_attribute a
  WHERE a.attrelid = to_regclass('public.ltm_episodes')
    AND a.attname = 'embedding'
    AND NOT a.attisdropped;

  IF v_typid IS NULL THEN
    RAISE NOTICE '001 SKIP: public.ltm_episodes.embedding not found — apply 000_init.sql first.';
    RETURN;
  END IF;

  IF v_typid = 'vector'::regtype AND format_type(v_typid, v_typmod) = 'vector(768)' THEN
    RAISE NOTICE '001 SKIP: ltm_episodes.embedding already reports vector(768) — no-op, contract pinned.';
    RETURN;
  END IF;

  RAISE NOTICE '001 MIGRATE: live embedding typmod=% — downcasting to vector(768). Rows destroyed (one-way), re-embed required.', v_typmod;

  -- (2) Explicit one-way row wipe BEFORE the downcast. Rows are destroyed
  -- and must be re-embedded via agents/seeds/seed_ltm.py (step 4).
  TRUNCATE public.ltm_episodes;

  -- (3) Ordered index swap: DROP (IF EXISTS) -> ALTER -> CREATE (IF NOT EXISTS).
  DROP INDEX IF EXISTS ltm_episodes_embedding_idx;
  ALTER TABLE public.ltm_episodes ALTER COLUMN embedding TYPE vector(768);
  CREATE INDEX IF NOT EXISTS ltm_episodes_embedding_idx
    ON public.ltm_episodes USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

  RAISE NOTICE '001 DONE: ltm_episodes.embedding is vector(768). Re-embed now (step 4).';
END
$$;

-- (4) Re-embed runbook (run AFTER the DO block above reports MIGRATE/DONE):
--   python agents/seeds/seed_ltm.py
--   -- row-count verify (run in SQL Editor before vs after the seed):
--   SELECT count(*) AS total,
--          count(*) FILTER (WHERE embedding IS NOT NULL) AS filled
--   FROM public.ltm_episodes;
--   -- every row must return filled = total; any shortfall means the seed
--   -- hit the embed []-on-error path — fix the key/model first, then reseed.
