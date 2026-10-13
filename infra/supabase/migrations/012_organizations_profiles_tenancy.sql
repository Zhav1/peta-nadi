-- ==============================================================================
-- Migration 012: Organizations + Profiles Tenancy Contract (Phase 57 STEP 0)
-- ==============================================================================
-- Pilot tenancy contract (D3): stable company_id replaces free-text org_name.
-- - public.organizations(id, name): canonical tenant registry, seeded pilot orgs.
-- - public.profiles(id FK auth.users, company_id FK, role): per-user tenant claim.
-- - handle_new_user() trigger: populates profiles from raw_user_meta_data
--   (company_id / role); MUST default safely and never throw (missing metadata
--   -> NULL company_id + GUEST role).
-- - RLS: users read own profile; service_role full; authenticated can read
--   organizations (pilot roster); writes restricted to service_role.
-- - Fleet contract (enforced in WP-B3, declared here): GET /api/v1/fleet/vehicles
--   accepts ?company_id= ; missing claim = honest empty (dispatcher) /
--   full corridor (regulator, macro view).
-- Idempotent: safe to re-run. No secrets. No mock data.
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
  ('pos_logistik', 'Pos Logistik (Pilot)'),
  ('bapanas',      'Bapanas (Pilot Regulator)')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. profiles (auth.users -> tenant claim)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id  TEXT REFERENCES public.organizations(id) ON DELETE SET NULL,
  role        TEXT NOT NULL DEFAULT 'GUEST'
    CHECK (role IN ('DISPATCHER', 'REGULATOR', 'GUEST')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS profiles_company_id_idx ON public.profiles (company_id);

-- Backfill: profiles rows for pre-existing auth.users missing one (safe default).
INSERT INTO public.profiles (id, company_id, role)
SELECT u.id, NULL, 'GUEST'
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. handle_new_user() trigger — safe defaults, never throws
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_company_id TEXT;
  meta_role       TEXT;
BEGIN
  -- Read metadata defensively; any shape problem falls through to defaults.
  BEGIN
    meta_company_id := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'company_id', '')), '');
    meta_role := UPPER(NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'role', '')), ''));
  EXCEPTION WHEN OTHERS THEN
    meta_company_id := NULL;
    meta_role := NULL;
  END;

  IF meta_role NOT IN ('DISPATCHER', 'REGULATOR', 'GUEST') THEN
    meta_role := 'GUEST';
  END IF;

  -- Unknown company_id -> NULL (honest unscoped), never abort signup.
  IF meta_company_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = meta_company_id) THEN
    meta_company_id := NULL;
  END IF;

  INSERT INTO public.profiles (id, company_id, role)
  VALUES (NEW.id, meta_company_id, meta_role)
  ON CONFLICT (id) DO UPDATE SET
    company_id = EXCLUDED.company_id,
    role       = EXCLUDED.role,
    updated_at = NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Trigger must never block signup (Supabase warning). Log + continue.
  RAISE WARNING 'handle_new_user failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- organizations: anon/authenticated read roster; writes service_role only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND policyname = 'allow_public_read_organizations'
  ) THEN
    CREATE POLICY "allow_public_read_organizations"
      ON public.organizations FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organizations'
      AND policyname = 'allow_service_role_full_access_organizations'
  ) THEN
    CREATE POLICY "allow_service_role_full_access_organizations"
      ON public.organizations FOR ALL
      TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- profiles: user reads own row; service_role full. No open write.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'allow_users_read_own_profile'
  ) THEN
    CREATE POLICY "allow_users_read_own_profile"
      ON public.profiles FOR SELECT
      TO authenticated
      USING (auth.uid() = id);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
      AND policyname = 'allow_service_role_full_access_profiles'
  ) THEN
    CREATE POLICY "allow_service_role_full_access_profiles"
      ON public.profiles FOR ALL
      TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;
