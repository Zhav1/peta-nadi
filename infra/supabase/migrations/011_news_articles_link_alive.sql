-- Migration 011: News Source Link Liveness Provenance
-- WP4: records whether the original article URL still resolves, so the dashboard can
-- label expired sources honestly instead of substituting a search URL.

ALTER TABLE public.news_articles
  ADD COLUMN IF NOT EXISTS link_alive TEXT DEFAULT 'unknown';

COMMENT ON COLUMN public.news_articles.link_alive IS
  'alive | dead | unknown — result of the ingestion-time source link probe (dead = status >= 400, redirect to site root, or redirect to another host; unknown = timeout/transport error).';
