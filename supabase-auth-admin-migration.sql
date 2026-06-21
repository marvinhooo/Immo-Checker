-- =====================================================
-- Immo-Checker Supabase Migration: Auth/Admin fixes
-- Fuer bestehende Supabase-Projekte ausfuehren.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  new_accounts_require_approval BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS new_accounts_require_approval BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

INSERT INTO public.app_settings (id, new_accounts_require_approval)
VALUES (true, true)
ON CONFLICT (id) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = auth.uid()
      AND profile.is_admin = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read app settings" ON public.app_settings;
CREATE POLICY "Admins read app settings" ON public.app_settings
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update app settings" ON public.app_settings;
CREATE POLICY "Admins update app settings" ON public.app_settings
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

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
    u.email::TEXT AS email,
    u.created_at AS created_at,
    u.last_sign_in_at AS last_sign_in_at,
    p.is_admin AS is_admin,
    p.approved AS approved,
    COALESCE(s.cnt, 0)::BIGINT AS scenario_count
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN (
    SELECT sc.user_id, COUNT(*) AS cnt
    FROM public.scenarios sc
    GROUP BY sc.user_id
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
