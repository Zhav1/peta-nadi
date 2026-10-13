-- ==============================================================================
-- Migration 012: Organizations + Profiles Tenancy Contract (Phase 57 STEP 0)
-- ==============================================================================
-- Pilot tenancy contract (D3): stable company_id replaces free-text org_name.
-- - public.organizations(id, name): canonical tenant registry, seeded pilot orgs.
-- - public.profiles(id FK auth.users, company_id FK, role, name, email):
--   per-user tenant claim.
-- - handle_new_user() trigger: populates profiles from raw_user_meta_data
--   (company_id / role / name); MUST default safely and never throw (missing
--   metadata -> NULL company_id + GUEST role; unknown company_id -> NULL).
-- - RLS: users read/update own profile; service_role full; organizations
--   publicly readable (pilot roster); writes restricted to service_role.
-- - Fleet contract (enforced in WP-B3, declared here): GET /api/v1/fleet/vehicles
--   accepts ?company_id= ; missing claim = honest empty (dispatcher) /
--   full corridor (regulator, macro view).
--
-- NOTE (2026-10-13): this file is the checked-in record of applied migration
-- version 20261013161649 (already live on Supabase with 6 pilot seed orgs and
-- the name/email-carrying trigger below — body kept verbatim). Idempotent:
-- safe to re-run against partially migrated databases. No secrets. No mock data.
-- ==============================================================================

-- ----------------------------------------------------------------------------
-- 1. organizations registry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed pilot orgs (stable IDs used by JWT app_metadata.company_id + fleet tags).
INSERT INTO public.organizations (id, name) VALUES
  ('pos_logistik',    'PT Pos Logistik Indonesia'),
  ('bapanas',         'Badan Pangan Nasional (Bapanas)'),
  ('kemenhub',        'Kementerian Perhubungan RI'),
  ('pelindo_belawan', 'PT Pelindo (Persero) Regional 1 Belawan'),
  ('jne_sumut',       'PT Tiki Jalur Nugraha Ekakurir (JNE) Sumut'),
  ('demo_sandbox',    'PreHub Pilot Sandbox')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. profiles (auth.users -> tenant claim)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
  role        TEXT NOT NULL DEFAULT 'GUEST',
  name        TEXT,
  email       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Converge older 012 shapes (adds name/email when missing; no-ops otherwise).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

CREATE INDEX IF NOT EXISTS profiles_company_id_idx ON public.profiles (company_id);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles (role);

-- Backfill: profiles rows for pre-existing auth.users missing one (safe default).
INSERT INTO public.profiles (id, company_id, role, name, email)
SELECT u.id, NULL, 'GUEST', split_part(u.email, '@', 1), u.email
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. handle_new_user() trigger — safe defaults, never throws
--    (body verbatim from live Supabase 20261013161649)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    target_role text;
    target_company text;
    target_name text;
BEGIN
    target_role := COALESCE(new.raw_user_meta_data->>'role', 'GUEST');
    target_company := new.raw_user_meta_data->>'company_id';
    target_name := COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

    IF target_company IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = target_company) THEN
        target_company := NULL;
    END IF;

    INSERT INTO public.profiles (id, company_id, role, name, email, created_at, updated_at)
    VALUES (
        new.id,
        target_company,
        target_role,
        target_name,
        new.email,
        now(),
        now()
    )
    ON CONFLICT (id) DO UPDATE SET
        company_id = COALESCE(EXCLUDED.company_id, public.profiles.company_id),
        role = COALESCE(EXCLUDED.role, public.profiles.role),
        name = COALESCE(EXCLUDED.name, public.profiles.name),
        updated_at = now();

    RETURN new;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user trigger error: %', SQLERRM;
    RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- organizations: public read roster; writes service_role only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND policyname = 'Organizations public read'
  ) THEN
    CREATE POLICY "Organizations public read"
      ON public.organizations FOR SELECT
      TO public
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND policyname = 'Organizations service_role all'
  ) THEN
    CREATE POLICY "Organizations service_role all"
      ON public.organizations FOR ALL
      TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- profiles: user reads/updates own row; service_role full. No open write.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users can view own profile'
  ) THEN
    CREATE POLICY "Users can view own profile"
      ON public.profiles FOR SELECT
      TO public
      USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      TO public
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'Service role full access to profiles'
  ) THEN
    CREATE POLICY "Service role full access to profiles"
      ON public.profiles FOR ALL
      TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
