-- Migration 008: Dynamic Pan-Sumatra News Articles and Realtime Enablement
-- Creates public.news_articles table with PostGIS spatial geography, RLS policies, and Realtime publications.

CREATE TABLE IF NOT EXISTS public.news_articles (
  id                    TEXT PRIMARY KEY,
  title                 TEXT NOT NULL,
  link                  TEXT UNIQUE NOT NULL,
  source                TEXT NOT NULL,
  source_tier           TEXT NOT NULL DEFAULT 'TIER_2_AUTHORITATIVE_PRESS',
  category              TEXT DEFAULT 'GENERAL_LOGISTICS',
  province              TEXT NOT NULL DEFAULT 'Sumatera',
  location              GEOGRAPHY(Point, 4326),
  latitude              NUMERIC,
  longitude             NUMERIC,
  corridor_segment      TEXT,
  corridor_nodes        TEXT[] DEFAULT '{}',
  incident_type         TEXT NOT NULL DEFAULT 'logistics_news',
  severity              TEXT NOT NULL DEFAULT 'low',
  temporal_phase        TEXT NOT NULL DEFAULT 'active_disruption',
  lead_time_hours       NUMERIC DEFAULT 0.0,
  commodities_affected  TEXT[] DEFAULT '{}',
  ground_truth_metrics  JSONB DEFAULT '{}',
  confidence_score      NUMERIC DEFAULT 0.85,
  raw_description       TEXT,
  summary               TEXT,
  is_incident_triggered BOOLEAN DEFAULT FALSE,
  incident_id           UUID REFERENCES public.incidents(incident_id) ON DELETE SET NULL,
  published_at          TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial and Filtering Indexes
CREATE INDEX IF NOT EXISTS news_articles_location_idx ON public.news_articles USING GIST (location);
CREATE INDEX IF NOT EXISTS news_articles_severity_idx ON public.news_articles (severity);
CREATE INDEX IF NOT EXISTS news_articles_province_idx ON public.news_articles (province);
CREATE INDEX IF NOT EXISTS news_articles_created_at_idx ON public.news_articles (created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;

-- Allow Public/Anon & Authenticated Read
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'news_articles' AND policyname = 'Allow public read on news_articles'
  ) THEN
    CREATE POLICY "Allow public read on news_articles" 
      ON public.news_articles FOR SELECT 
      TO anon, authenticated 
      USING (true);
  END IF;
END $$;

-- Allow Service Role Full Access (Backend Ingestion)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'news_articles' AND policyname = 'Allow service role full access on news_articles'
  ) THEN
    CREATE POLICY "Allow service role full access on news_articles" 
      ON public.news_articles FOR ALL 
      TO service_role 
      USING (true) 
      WITH CHECK (true);
  END IF;
END $$;

-- Enable Supabase Realtime publication
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.news_articles;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.route_approvals;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
