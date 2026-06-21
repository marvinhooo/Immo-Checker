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
BEGIN
  INSERT INTO public.profiles (id, is_admin, approved)
  VALUES (NEW.id, false, false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. RLS aktivieren
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Profiles
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 5. RLS Policies: Scenarios
CREATE POLICY "Users read own scenarios" ON public.scenarios
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users insert own scenarios" ON public.scenarios
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own scenarios" ON public.scenarios
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own scenarios" ON public.scenarios
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins read all scenarios" ON public.scenarios
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- 6. Admin-Funktionen
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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
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
    COALESCE(s.cnt, 0) AS scenario_count
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  LEFT JOIN (
    SELECT sc.user_id, COUNT(*) AS cnt FROM public.scenarios sc GROUP BY sc.user_id
  ) s ON s.user_id = u.id
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id UUID)
RETURNS VOID
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete yourself';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Ersten Admin setzen (NACH Registrierung als User ausführen)
-- UPDATE public.profiles SET is_admin = true, approved = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'martin.wiederhold1@gmail.com');
