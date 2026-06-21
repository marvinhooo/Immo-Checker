-- =====================================================
-- Immo-Checker Supabase Setup
-- Dieses SQL im Supabase SQL Editor ausführen
-- =====================================================

-- 1. Tabellen
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  new_accounts_require_approval BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.app_settings (id, new_accounts_require_approval)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.scenarios (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX idx_scenarios_user_id ON public.scenarios(user_id);

-- 2. Trigger: Automatisch Profil bei Signup erstellen
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  require_approval BOOLEAN;
BEGIN
  SELECT COALESCE((
    SELECT settings.new_accounts_require_approval
    FROM public.app_settings settings
    WHERE settings.id = true
  ), true)
  INTO require_approval;

  INSERT INTO public.profiles (id, is_admin, approved)
  VALUES (NEW.id, false, NOT require_approval)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Helper: Admin-Check ohne RLS-Rekursion
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- 4. RLS aktivieren
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Profiles
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE USING (public.is_admin());

-- 6. RLS Policies: App Settings
CREATE POLICY "Admins read app settings" ON public.app_settings
  FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins update app settings" ON public.app_settings
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 7. RLS Policies: Scenarios
CREATE POLICY "Users read own scenarios" ON public.scenarios
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own scenarios" ON public.scenarios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own scenarios" ON public.scenarios
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own scenarios" ON public.scenarios
  FOR DELETE USING (auth.uid() = user_id);

-- 8. Admin-Funktionen
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  created_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ,
  is_admin BOOLEAN,
  approved BOOLEAN,
  scenario_count BIGINT
)
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT,
    u.created_at,
    u.last_sign_in_at,
    p.is_admin,
    p.approved,
    COALESCE(s.cnt, 0)::BIGINT AS scenario_count
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN (
    SELECT sc.user_id, COUNT(*) AS cnt FROM public.scenarios sc GROUP BY sc.user_id
  ) s ON s.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_get_auth_settings()
RETURNS TABLE (
  new_accounts_require_approval BOOLEAN
)
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT COALESCE((
    SELECT settings.new_accounts_require_approval
    FROM public.app_settings settings
    WHERE settings.id = true
  ), true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_set_auth_settings(require_approval BOOLEAN)
RETURNS VOID
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.app_settings (id, new_accounts_require_approval, updated_at)
  VALUES (true, require_approval, now())
  ON CONFLICT (id) DO UPDATE
    SET new_accounts_require_approval = EXCLUDED.new_accounts_require_approval,
        updated_at = now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 9. Ersten Admin setzen (NACH Registrierung als User ausführen)
-- UPDATE public.profiles SET is_admin = true, approved = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'martin.wiederhold1@gmail.com');
