-- ==============================================================================
-- PetaNadi / LRIP — match_episodes RPC (cosine similarity over ltm_episodes)
-- Migration: 002_match_episodes_768.sql
-- Run this in: Supabase SQL Editor → New Query → Run (AFTER 001)
--
-- Why: agents/memory/ltm.py query_ltm() calls supabase.rpc("match_episodes",
--   {query_embedding, match_threshold, match_count}) but no such function
--   existed — every LTM query fell into the except path and returned [].
--   This migration creates the exact contract query_ltm consumes.
--
-- Contract: match_episodes(query_embedding vector(768), match_threshold float,
--   match_count int) RETURNS rows (episode_id uuid, title text,
--   description text, crisis_type text, inflation_multiplier float,
--   recovery_days int, similarity float), ordered by similarity DESC.
--   similarity = 1 - cosine distance, filtered to similarity > threshold.
--
-- Notes:
--   * vector(768) MUST match the column width pinned by 001 and the
--     EMBEDDING_DIMS guard in agents/memory/ltm.py (default model
--     models/gemini-embedding-001 truncated via output_dimensionality=768).
--   * Extended fields (crisis_type / inflation_multiplier / recovery_days)
--     are projected from metadata JSONB with safe defaults; numeric casts
--     are regex-guarded so a malformed metadata value degrades to the
--     default instead of aborting the whole query.
--   * GRANTs target anon + authenticated because the backend calls this RPC
--     with the anon-key client (backend/app/db/supabase_client.py).
--   * IDEMPOTENT: CREATE OR REPLACE + GRANTs re-runnable.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.match_episodes(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  episode_id           uuid,
  title                text,
  description          text,
  crisis_type          text,
  inflation_multiplier float,
  recovery_days        int,
  similarity           float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id AS episode_id,
    e.title AS title,
    e.description AS description,
    COALESCE(
      NULLIF(e.metadata ->> 'crisis_type', ''),
      NULLIF(e.metadata ->> 'disaster_type', ''),
      ''
    ) AS crisis_type,
    CASE
      WHEN e.metadata ->> 'inflation_multiplier' ~ '^-?\d+(\.\d+)?$'
        THEN (e.metadata ->> 'inflation_multiplier')::float
      WHEN e.metadata ->> 'price_impact_pct' ~ '^-?\d+(\.\d+)?$'
        THEN (e.metadata ->> 'price_impact_pct')::float
      ELSE 1.0
    END AS inflation_multiplier,
    CASE
      WHEN e.metadata ->> 'recovery_days' ~ '^\d+$'
        THEN (e.metadata ->> 'recovery_days')::int
      WHEN e.metadata ->> 'lag_days' ~ '^\d+$'
        THEN (e.metadata ->> 'lag_days')::int
      ELSE 0
    END AS recovery_days,
    (1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM public.ltm_episodes AS e
  WHERE e.embedding IS NOT NULL
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_episodes(vector(768), float, int)
  TO anon, authenticated;

-- Post-apply verify (run in SQL Editor AFTER 001 + re-embed via
-- agents/seeds/seed_ltm.py — 768-dim zero vector matches nothing above a
-- 0.6 threshold, so this checks the contract shape, not recall):
--   SELECT * FROM public.match_episodes(
--     (SELECT embedding FROM public.ltm_episodes LIMIT 1),
--     0.0, 5);
--   -- every row must carry episode_id/title/description/crisis_type/
--   -- inflation_multiplier/recovery_days/similarity; empty table → 0 rows.
