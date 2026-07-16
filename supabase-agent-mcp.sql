-- =====================================================
-- Immo-Checker: accountgebundene Remote-MCP-Schicht
-- Idempotente Migration fuer bestehende Supabase-Projekte.
--
-- Reihenfolge nach Ausfuehrung:
--   1. public.agent_mcp_config mit fester MCP-Audience konfigurieren.
--   2. public.custom_access_token_hook im Supabase-Dashboard als Custom Access
--      Token Hook aktivieren.
--   3. Die Edge Function agent-mcp mit denselben Werten deployen.
-- =====================================================

-- Fail-closed vor allen Aenderungen: Unbekannte permissive Policies auf den
-- vier geschuetzten Tabellen koennten die unten definierten Regeln per OR
-- erweitern. Bekannte Policies werden anschliessend vollstaendig ersetzt.
DO $$
DECLARE
  unknown_policies TEXT;
BEGIN
  SELECT string_agg(format('%I.%I:%I', schemaname, tablename, policyname), ', ')
  INTO unknown_policies
  FROM pg_policies
  WHERE schemaname = 'public'
    AND permissive = 'PERMISSIVE'
    AND (
      (tablename = 'profiles' AND policyname NOT IN (
        'Users read own profile',
        'Admins read all profiles',
        'Admins update profiles'
      ))
      OR (tablename = 'scenarios' AND policyname NOT IN (
        'Users read own scenarios',
        'Users insert own scenarios',
        'Users update own scenarios',
        'Users delete own scenarios',
        'Admins read all scenarios'
      ))
      OR (tablename = 'scenario_drafts' AND policyname NOT IN (
        'Users read own scenario drafts',
        'Users insert own scenario drafts',
        'Users update own scenario drafts',
        'Users delete own scenario drafts'
      ))
      OR (tablename = 'agent_oauth_grants' AND policyname NOT IN (
        'Users read own agent OAuth grants',
        'Users insert own agent OAuth grants',
        'Users update own agent OAuth grants',
        'Users delete own agent OAuth grants'
      ))
    );

  IF unknown_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'agent-mcp migration aborted: unknown permissive RLS policies: %',
      unknown_policies;
  END IF;
END;
$$;

-- Die Konfiguration ist absichtlich standardmaessig deaktiviert. Dadurch bleibt
-- der Hook fuer normale Web-Logins ein No-op, bis MCP explizit eingerichtet ist.
CREATE TABLE IF NOT EXISTS public.agent_mcp_config (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled BOOLEAN NOT NULL DEFAULT false,
  audience TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (audience IS NULL OR length(audience) BETWEEN 1 AND 2000)
);

ALTER TABLE public.agent_mcp_config
  ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS audience TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Entfernt die alte Single-Client-Konfiguration bei einem Upgrade. Zugelassene
-- Clients werden ab jetzt pro Nutzer in agent_oauth_grants verwaltet.
ALTER TABLE public.agent_mcp_config
  DROP COLUMN IF EXISTS oauth_client_id;

INSERT INTO public.agent_mcp_config (id, enabled)
VALUES (true, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.agent_mcp_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_mcp_config FROM anon, authenticated, PUBLIC;

COMMENT ON TABLE public.agent_mcp_config IS
  'Serverseitige feste Audience fuer accountgebundene Immo-Checker-MCP-Verbindungen.';

CREATE TABLE IF NOT EXISTS public.agent_oauth_grants (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL CHECK (length(client_id) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_oauth_grants_client_id
  ON public.agent_oauth_grants (client_id);

CREATE OR REPLACE FUNCTION public.touch_agent_oauth_grant_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agent_oauth_grants_updated_at_trigger
  ON public.agent_oauth_grants;
CREATE TRIGGER agent_oauth_grants_updated_at_trigger
  BEFORE UPDATE ON public.agent_oauth_grants
  FOR EACH ROW EXECUTE FUNCTION public.touch_agent_oauth_grant_updated_at();

-- Final gespeicherte Auswertungen werden nur gelesen. Die MCP-Schicht berechnet
-- bewusst nichts nach und darf finale Szenarien nicht veraendern.
ALTER TABLE public.scenarios
  ADD COLUMN IF NOT EXISTS analysis JSONB;

ALTER TABLE public.scenarios
  DROP CONSTRAINT IF EXISTS scenarios_data_size,
  DROP CONSTRAINT IF EXISTS scenarios_analysis_size;

-- Je 750 KB lassen selbst bei get_scenario ausreichend Reserve unter dem
-- 2-MB-Antwortlimit der Edge Function. VALIDATE prueft auch Bestandsdaten.
ALTER TABLE public.scenarios
  ADD CONSTRAINT scenarios_data_size
    CHECK (octet_length(data::text) <= 750000) NOT VALID,
  ADD CONSTRAINT scenarios_analysis_size
    CHECK (analysis IS NULL OR octet_length(analysis::text) <= 750000) NOT VALID;

ALTER TABLE public.scenarios
  VALIDATE CONSTRAINT scenarios_data_size,
  VALIDATE CONSTRAINT scenarios_analysis_size;

-- Ein Draft speichert exakt das Envelope aus app/src/agent/draft.ts. user_id
-- stammt immer aus auth.uid(); die Edge Function nimmt keine user_id entgegen.
CREATE TABLE IF NOT EXISTS public.scenario_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scenario_drafts_user_updated
  ON public.scenario_drafts (user_id, updated_at DESC);

-- Gleiche generische JSON-Grenzen wie in der Edge Function: maximal zehn
-- Ebenen, maximal 120 Eintraege je Array/Objekt und keine Prototype-Schluessel.
CREATE OR REPLACE FUNCTION public.is_bounded_agent_json(
  value JSONB,
  depth INTEGER DEFAULT 0
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  item JSONB;
  pair RECORD;
BEGIN
  IF depth > 10 THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(value) = 'array' THEN
    IF jsonb_array_length(value) > 120 THEN
      RETURN false;
    END IF;
    FOR item IN SELECT child FROM jsonb_array_elements(value) AS entry(child) LOOP
      IF NOT public.is_bounded_agent_json(item, depth + 1) THEN
        RETURN false;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'object' THEN
    IF (SELECT count(*) FROM jsonb_object_keys(value)) > 120 THEN
      RETURN false;
    END IF;
    FOR pair IN SELECT key, child FROM jsonb_each(value) AS entry(key, child) LOOP
      IF length(pair.key) > 160
        OR pair.key IN ('__proto__', 'prototype', 'constructor')
        OR NOT public.is_bounded_agent_json(pair.child, depth + 1)
      THEN
        RETURN false;
      END IF;
    END LOOP;
  ELSIF jsonb_typeof(value) = 'number' THEN
    IF abs((value #>> '{}')::NUMERIC) > 9007199254740991 THEN
      RETURN false;
    END IF;
  ELSIF jsonb_typeof(value) NOT IN ('string', 'boolean', 'null') THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- Der Draft-Vertrag akzeptiert nur echte ISO-Zeitstempel mit Zeitzone. Der
-- Regex begrenzt das Format; dieser Cast faengt unmoegliche Kalenderwerte ab.
CREATE OR REPLACE FUNCTION public.is_valid_agent_timestamp(value TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM value::TIMESTAMPTZ;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- Sichere Teilmenge von IncreaseRule aus app/src/lib/io.ts. Neben den dortigen
-- Typ- und Wertebereichen akzeptiert der Agent-Vertrag nur die exakten Keys und
-- begrenzt IDs, damit ein Draft keine unkontrollierten Zusatzdaten tragen kann.
CREATE OR REPLACE FUNCTION public.is_valid_agent_increase_rules(value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  rule JSONB;
  kind_value TEXT;
  numeric_value NUMERIC;
BEGIN
  IF jsonb_typeof(value) <> 'array'
    OR jsonb_array_length(value) > 120
  THEN
    RETURN false;
  END IF;

  FOR rule IN SELECT item FROM jsonb_array_elements(value) AS entry(item) LOOP
    IF jsonb_typeof(rule) <> 'object'
      OR NOT jsonb_exists_all(rule, ARRAY['id', 'kind', 'fromYear'])
      OR jsonb_typeof(rule -> 'id') <> 'string'
      OR NOT (rule ->> 'id' ~ '[^[:space:]]')
      OR length(rule ->> 'id') > 500
      OR jsonb_typeof(rule -> 'kind') <> 'string'
      OR jsonb_typeof(rule -> 'fromYear') <> 'number'
    THEN
      RETURN false;
    END IF;

    numeric_value := (rule ->> 'fromYear')::NUMERIC;
    IF numeric_value <> trunc(numeric_value)
      OR numeric_value < 1
      OR numeric_value > 50
    THEN
      RETURN false;
    END IF;

    kind_value := rule ->> 'kind';
    IF kind_value = 'step' THEN
      IF NOT jsonb_exists(rule, 'percent')
        OR rule - ARRAY['id', 'kind', 'fromYear', 'percent', 'wirksamAbMonat'] <> '{}'::jsonb
        OR jsonb_typeof(rule -> 'percent') <> 'number'
      THEN
        RETURN false;
      END IF;

      numeric_value := (rule ->> 'percent')::NUMERIC;
      IF numeric_value < -100 OR numeric_value > 100 THEN
        RETURN false;
      END IF;

      IF jsonb_exists(rule, 'wirksamAbMonat') THEN
        IF jsonb_typeof(rule -> 'wirksamAbMonat') <> 'number' THEN
          RETURN false;
        END IF;
        numeric_value := (rule ->> 'wirksamAbMonat')::NUMERIC;
        IF numeric_value <> trunc(numeric_value)
          OR numeric_value < 1
          OR numeric_value > 12
        THEN
          RETURN false;
        END IF;
      END IF;
    ELSIF kind_value = 'rate' THEN
      IF NOT jsonb_exists(rule, 'percentPerYear')
        OR rule - ARRAY['id', 'kind', 'fromYear', 'percentPerYear'] <> '{}'::jsonb
        OR jsonb_typeof(rule -> 'percentPerYear') <> 'number'
      THEN
        RETURN false;
      END IF;

      numeric_value := (rule ->> 'percentPerYear')::NUMERIC;
      IF numeric_value < -100 OR numeric_value > 100 THEN
        RETURN false;
      END IF;
    ELSE
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- Sichere Teilmenge von Sanierungsmassnahme aus app/src/lib/io.ts. IDs muessen
-- innerhalb eines Arrays eindeutig sein; auch leere Arrays bleiben gueltig.
CREATE OR REPLACE FUNCTION public.is_valid_agent_sanierungen(value JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  massnahme JSONB;
  current_id TEXT;
  seen_ids TEXT[] := ARRAY[]::TEXT[];
  numeric_value NUMERIC;
BEGIN
  IF jsonb_typeof(value) <> 'array'
    OR jsonb_array_length(value) > 120
  THEN
    RETURN false;
  END IF;

  FOR massnahme IN SELECT item FROM jsonb_array_elements(value) AS entry(item) LOOP
    IF jsonb_typeof(massnahme) <> 'object'
      OR NOT jsonb_exists_all(massnahme, ARRAY[
        'id',
        'bezeichnung',
        'jahr',
        'betrag',
        'steuerart',
        'verteilungsJahre',
        'mieterhoehungMoeglich'
      ])
      OR massnahme - ARRAY[
        'id',
        'bezeichnung',
        'jahr',
        'betrag',
        'steuerart',
        'verteilungsJahre',
        'mieterhoehungMoeglich'
      ] <> '{}'::jsonb
      OR jsonb_typeof(massnahme -> 'id') <> 'string'
      OR NOT (massnahme ->> 'id' ~ '[^[:space:]]')
      OR length(massnahme ->> 'id') > 500
      OR jsonb_typeof(massnahme -> 'bezeichnung') <> 'string'
      OR NOT (massnahme ->> 'bezeichnung' ~ '[^[:space:]]')
      OR length(massnahme ->> 'bezeichnung') > 500
      OR jsonb_typeof(massnahme -> 'jahr') <> 'number'
      OR jsonb_typeof(massnahme -> 'betrag') <> 'number'
      OR jsonb_typeof(massnahme -> 'steuerart') <> 'string'
      OR massnahme ->> 'steuerart' NOT IN (
        'sofort',
        'verteilt',
        'herstellung',
        'denkmal7i',
        'denkmal11b',
        'keine'
      )
      OR jsonb_typeof(massnahme -> 'verteilungsJahre') <> 'number'
      OR jsonb_typeof(massnahme -> 'mieterhoehungMoeglich') <> 'boolean'
    THEN
      RETURN false;
    END IF;

    current_id := massnahme ->> 'id';
    IF seen_ids @> ARRAY[current_id] THEN
      RETURN false;
    END IF;
    seen_ids := array_append(seen_ids, current_id);

    numeric_value := (massnahme ->> 'jahr')::NUMERIC;
    IF numeric_value <> trunc(numeric_value)
      OR numeric_value < 1
      OR numeric_value > 40
    THEN
      RETURN false;
    END IF;

    numeric_value := (massnahme ->> 'betrag')::NUMERIC;
    IF numeric_value < 0 OR numeric_value > 9007199254740991 THEN
      RETURN false;
    END IF;

    numeric_value := (massnahme ->> 'verteilungsJahre')::NUMERIC;
    IF numeric_value <> trunc(numeric_value)
      OR numeric_value < 2
      OR numeric_value > 5
    THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- Defense in depth: Auch ein direkter PostgREST-Aufruf mit einem gueltigen MCP-
-- JWT kann nur das kanonische Draft-Format und die im Frontend-Vertrag erlaubten
-- Pfade speichern. Die Edge Function prueft Werte und Textlimits noch strenger.
CREATE OR REPLACE FUNCTION public.is_valid_immo_checker_agent_draft(payload JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
DECLARE
  source JSONB;
  operation JSONB;
  evidence JSONB;
  warning JSONB;
  source_ids TEXT[] := ARRAY[]::TEXT[];
  path_value TEXT;
  numeric_value NUMERIC;
BEGIN
  IF jsonb_typeof(payload) <> 'object'
    OR NOT jsonb_exists_all(payload, ARRAY['format', 'version', 'name', 'sources', 'operations'])
    OR payload - ARRAY['format', 'version', 'name', 'sources', 'operations', 'warnings'] <> '{}'::jsonb
    OR jsonb_typeof(payload -> 'format') <> 'string'
    OR payload ->> 'format' <> 'immo-checker-agent-draft'
    OR payload -> 'version' <> '1'::jsonb
    OR jsonb_typeof(payload -> 'name') <> 'string'
    OR NOT (payload ->> 'name' ~ '[^[:space:]]')
    OR length(payload ->> 'name') > 500
    OR jsonb_typeof(payload -> 'sources') <> 'array'
    OR jsonb_typeof(payload -> 'operations') <> 'array'
    OR jsonb_array_length(payload -> 'sources') > 20
    OR jsonb_array_length(payload -> 'operations') > 120
    OR octet_length(payload::text) > 1000000
  THEN
    RETURN false;
  END IF;

  IF jsonb_exists(payload, 'warnings') THEN
    IF jsonb_typeof(payload -> 'warnings') <> 'array'
      OR jsonb_array_length(payload -> 'warnings') > 50
    THEN
      RETURN false;
    END IF;
    FOR warning IN SELECT value FROM jsonb_array_elements(payload -> 'warnings') LOOP
      IF jsonb_typeof(warning) <> 'string'
        OR NOT (warning #>> '{}' ~ '[^[:space:]]')
        OR length(warning #>> '{}') > 500
      THEN
        RETURN false;
      END IF;
    END LOOP;
  END IF;

  FOR source IN SELECT value FROM jsonb_array_elements(payload -> 'sources') LOOP
    IF jsonb_typeof(source) <> 'object'
      OR NOT jsonb_exists_all(source, ARRAY['id', 'kind', 'label'])
      OR source - ARRAY['id', 'kind', 'label', 'url', 'sha256', 'retrievedAt'] <> '{}'::jsonb
      OR jsonb_typeof(source -> 'id') <> 'string'
      OR NOT (source ->> 'id' ~ '[^[:space:]]')
      OR length(source ->> 'id') > 120
      OR jsonb_typeof(source -> 'kind') <> 'string'
      OR source ->> 'kind' NOT IN ('pdf', 'web', 'api', 'text', 'manual')
      OR jsonb_typeof(source -> 'label') <> 'string'
      OR NOT (source ->> 'label' ~ '[^[:space:]]')
      OR length(source ->> 'label') > 500
      OR (jsonb_exists(source, 'url') AND (
        jsonb_typeof(source -> 'url') <> 'string' OR length(source ->> 'url') > 2000
      ))
      OR (jsonb_exists(source, 'sha256') AND (
        jsonb_typeof(source -> 'sha256') <> 'string'
        OR source ->> 'sha256' !~ '^[0-9A-Fa-f]{64}$'
      ))
      OR (jsonb_exists(source, 'retrievedAt') AND (
        jsonb_typeof(source -> 'retrievedAt') <> 'string'
        OR source ->> 'retrievedAt' !~
          '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
        OR NOT public.is_valid_agent_timestamp(source ->> 'retrievedAt')
      ))
      OR source_ids @> ARRAY[source ->> 'id']
    THEN
      RETURN false;
    END IF;
    source_ids := array_append(source_ids, source ->> 'id');
  END LOOP;

  IF (
    SELECT count(*) <> count(DISTINCT item ->> 'path')
    FROM jsonb_array_elements(payload -> 'operations') AS item
  ) THEN
    RETURN false;
  END IF;

  FOR operation IN SELECT value FROM jsonb_array_elements(payload -> 'operations') LOOP
    IF jsonb_typeof(operation) <> 'object'
      OR NOT jsonb_exists_all(operation, ARRAY['op', 'path', 'value', 'origin'])
      OR operation - ARRAY['op', 'path', 'value', 'origin', 'confidence', 'reason', 'evidence'] <> '{}'::jsonb
      OR jsonb_typeof(operation -> 'op') <> 'string'
      OR operation ->> 'op' <> 'set'
      OR jsonb_typeof(operation -> 'origin') <> 'string'
      OR operation ->> 'origin' NOT IN ('extracted', 'inferred', 'assumption', 'conflict')
      OR jsonb_typeof(operation -> 'path') <> 'string'
      OR NOT (operation ->> 'path' = ANY (ARRAY[
        '/name',
        '/notizen',
        '/objekt/kaufpreis',
        '/objekt/wohnflaeche',
        '/objekt/grundstuecksflaeche',
        '/objekt/miteigentumsanteilZaehler',
        '/objekt/miteigentumsanteilNenner',
        '/objekt/fertigstellungsjahr',
        '/objekt/bundesland',
        '/objekt/objektTyp',
        '/objekt/bodenwertMode',
        '/objekt/bodenwertAnteilPct',
        '/objekt/bodenrichtwertProSqm',
        '/objekt/sanierungskosten',
        '/knk/grestPct',
        '/knk/notarPct',
        '/knk/maklerPct',
        '/knk/mitfinanzieren',
        '/knk/finanzierungsPct',
        '/finanzierung/equityMode',
        '/finanzierung/equityPct',
        '/finanzierung/equityAbsolute',
        '/finanzierung/sollzinsPct',
        '/finanzierung/tilgungPct',
        '/finanzierung/zinsbindungJahre',
        '/finanzierung/anschlusszinsPct',
        '/finanzierung/anschlussTilgungPct',
        '/finanzierung/sondertilgungProJahr',
        '/finanzierung/disagioPct',
        '/miete/rentMode',
        '/miete/kaltmieteProMonat',
        '/miete/kaltmieteProJahr',
        '/miete/kaltmieteProSqm',
        '/miete/leerstandPct',
        '/miete/mietspiegel/untererSpannwertProSqm',
        '/miete/mietspiegel/mittelwertProSqm',
        '/miete/mietspiegel/obererSpannwertProSqm',
        '/miete/steigerungen',
        '/kosten/maintenanceMode',
        '/kosten/instandhaltungProSqm',
        '/kosten/instandhaltungPctRent',
        '/kosten/instandhaltungAbsolut',
        '/kosten/ruecklagenAnteilPct',
        '/kosten/verwaltungProJahr',
        '/kosten/sonstigeKostenProJahr',
        '/kosten/kostensteigerungPctPa',
        '/steuer/taxMode',
        '/steuer/bruttoJahresEinkommen',
        '/steuer/grenzsteuersatzPct',
        '/steuer/veranlagung',
        '/steuer/soli',
        '/steuer/kirchensteuerPct',
        '/afa/modus',
        '/afa/linearSatzPct',
        '/sanierungen',
        '/wertentwicklung/szenario',
        '/exit/haltedauerJahre',
        '/exit/verkaufsnebenkostenMode',
        '/exit/verkaufsnebenkostenPct',
        '/exit/verkaufsnebenkostenAbsolut',
        '/exit/vorfaelligkeitPct'
      ]::TEXT[]))
      OR (jsonb_exists(operation, 'confidence') AND (
        jsonb_typeof(operation -> 'confidence') <> 'number'
        OR (operation ->> 'confidence')::NUMERIC < 0
        OR (operation ->> 'confidence')::NUMERIC > 1
      ))
      OR (jsonb_exists(operation, 'reason') AND (
        jsonb_typeof(operation -> 'reason') <> 'string'
        OR length(operation ->> 'reason') > 500
      ))
      OR (jsonb_exists(operation, 'evidence') AND (
        jsonb_typeof(operation -> 'evidence') <> 'array'
        OR jsonb_array_length(operation -> 'evidence') > 20
      ))
    THEN
      RETURN false;
    END IF;

    path_value := operation ->> 'path';
    IF path_value = '/notizen' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR length(operation ->> 'value') > 20000
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/name' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR NOT (operation ->> 'value' ~ '[^[:space:]]')
        OR length(operation ->> 'value') > 500
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = ANY (ARRAY[
      '/knk/mitfinanzieren',
      '/steuer/soli'
    ]::TEXT[]) THEN
      IF jsonb_typeof(operation -> 'value') <> 'boolean' THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/objekt/bundesland' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN (
          'BW', 'BY', 'BE', 'BB', 'HB', 'HH', 'HE', 'MV',
          'NI', 'NW', 'RP', 'SL', 'SN', 'ST', 'SH', 'TH'
        )
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/objekt/objektTyp' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('bestand', 'neubau', 'denkmal')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/objekt/bodenwertMode' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('percent', 'perSqm')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/finanzierung/equityMode' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('percent', 'absolute')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/miete/rentMode' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('perMonth', 'perYear', 'perSqm')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/kosten/maintenanceMode' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('perSqm', 'percentRent', 'absolute')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/steuer/taxMode' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('income', 'marginalRate')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/steuer/veranlagung' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('single', 'splitting')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/afa/modus' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('linear', 'degressiv', 'sonder7b', 'denkmal7i')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/exit/verkaufsnebenkostenMode' THEN
      IF jsonb_typeof(operation -> 'value') <> 'string'
        OR operation ->> 'value' NOT IN ('percent', 'absolute')
      THEN
        RETURN false;
      END IF;
    ELSIF path_value = ANY (ARRAY[
      '/miete/steigerungen',
      '/wertentwicklung/szenario'
    ]::TEXT[]) THEN
      IF NOT public.is_valid_agent_increase_rules(operation -> 'value') THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/sanierungen' THEN
      IF NOT public.is_valid_agent_sanierungen(operation -> 'value') THEN
        RETURN false;
      END IF;
    ELSIF path_value = '/finanzierung/anschlussTilgungPct' THEN
      IF jsonb_typeof(operation -> 'value') = 'null' THEN
        NULL;
      ELSIF jsonb_typeof(operation -> 'value') <> 'number' THEN
        RETURN false;
      ELSE
        numeric_value := (operation ->> 'value')::NUMERIC;
        IF numeric_value < 0 OR numeric_value > 100 THEN
          RETURN false;
        END IF;
      END IF;
    ELSE
      IF jsonb_typeof(operation -> 'value') <> 'number' THEN
        RETURN false;
      END IF;
      numeric_value := (operation ->> 'value')::NUMERIC;
      IF numeric_value < 0 OR numeric_value > 9007199254740991 THEN
        RETURN false;
      END IF;

      IF path_value = ANY (ARRAY[
        '/objekt/bodenwertAnteilPct',
        '/knk/grestPct',
        '/knk/notarPct',
        '/knk/maklerPct',
        '/knk/finanzierungsPct',
        '/finanzierung/equityPct',
        '/finanzierung/sollzinsPct',
        '/finanzierung/tilgungPct',
        '/finanzierung/anschlusszinsPct',
        '/miete/leerstandPct',
        '/kosten/instandhaltungPctRent',
        '/kosten/ruecklagenAnteilPct',
        '/kosten/kostensteigerungPctPa',
        '/steuer/grenzsteuersatzPct',
        '/steuer/kirchensteuerPct',
        '/afa/linearSatzPct',
        '/exit/verkaufsnebenkostenPct',
        '/exit/vorfaelligkeitPct'
      ]::TEXT[]) AND numeric_value > 100 THEN
        RETURN false;
      ELSIF path_value = '/finanzierung/disagioPct' AND numeric_value > 99.999 THEN
        RETURN false;
      ELSIF path_value = ANY (ARRAY[
        '/objekt/kaufpreis',
        '/objekt/wohnflaeche'
      ]::TEXT[]) AND numeric_value < 1 THEN
        RETURN false;
      ELSIF path_value = ANY (ARRAY[
        '/objekt/miteigentumsanteilZaehler',
        '/objekt/miteigentumsanteilNenner'
      ]::TEXT[]) AND numeric_value < 1 THEN
        RETURN false;
      ELSIF path_value = '/objekt/fertigstellungsjahr' AND (
        numeric_value <> trunc(numeric_value)
        OR numeric_value < 1
        OR numeric_value > 2100
      ) THEN
        RETURN false;
      ELSIF path_value = '/finanzierung/zinsbindungJahre' AND (
        numeric_value <> trunc(numeric_value)
        OR numeric_value < 1
        OR numeric_value > 30
      ) THEN
        RETURN false;
      ELSIF path_value = '/exit/haltedauerJahre' AND (
        numeric_value <> trunc(numeric_value)
        OR numeric_value < 1
        OR numeric_value > 40
      ) THEN
        RETURN false;
      END IF;
    END IF;

    IF jsonb_exists(operation, 'evidence') THEN
      FOR evidence IN SELECT value FROM jsonb_array_elements(operation -> 'evidence') LOOP
        IF jsonb_typeof(evidence) <> 'object'
          OR NOT jsonb_exists(evidence, 'sourceId')
          OR evidence - ARRAY['sourceId', 'page', 'locator', 'excerpt'] <> '{}'::jsonb
          OR jsonb_typeof(evidence -> 'sourceId') <> 'string'
          OR NOT (source_ids @> ARRAY[evidence ->> 'sourceId'])
          OR (jsonb_exists(evidence, 'page') AND (
            jsonb_typeof(evidence -> 'page') <> 'number'
            OR (evidence ->> 'page')::NUMERIC <> trunc((evidence ->> 'page')::NUMERIC)
            OR (evidence ->> 'page')::NUMERIC < 1
            OR (evidence ->> 'page')::NUMERIC > 100000
          ))
          OR (jsonb_exists(evidence, 'locator') AND (
            jsonb_typeof(evidence -> 'locator') <> 'string'
            OR length(evidence ->> 'locator') > 500
          ))
          OR (jsonb_exists(evidence, 'excerpt') AND (
            jsonb_typeof(evidence -> 'excerpt') <> 'string'
            OR length(evidence ->> 'excerpt') > 500
          ))
        THEN
          RETURN false;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  IF (
    SELECT (operation ->> 'value')::NUMERIC
    FROM jsonb_array_elements(payload -> 'operations') AS operation
    WHERE operation ->> 'path' = '/objekt/miteigentumsanteilZaehler'
  ) > (
    SELECT (operation ->> 'value')::NUMERIC
    FROM jsonb_array_elements(payload -> 'operations') AS operation
    WHERE operation ->> 'path' = '/objekt/miteigentumsanteilNenner'
  ) THEN
    RETURN false;
  END IF;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

ALTER TABLE public.scenario_drafts
  DROP CONSTRAINT IF EXISTS scenario_drafts_valid_data;

ALTER TABLE public.scenario_drafts
  ADD CONSTRAINT scenario_drafts_valid_data
  CHECK (public.is_valid_immo_checker_agent_draft(data)) NOT VALID;

ALTER TABLE public.scenario_drafts
  VALIDATE CONSTRAINT scenario_drafts_valid_data;

-- Jede Aenderung erhoeht die Revision in der Datenbank. Der MCP-Handler filtert
-- beim UPDATE zugleich auf die vom Agenten gelesene Revision (CAS).
CREATE OR REPLACE FUNCTION public.bump_scenario_draft_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.revision := OLD.revision + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS scenario_drafts_revision_trigger ON public.scenario_drafts;
CREATE TRIGGER scenario_drafts_revision_trigger
  BEFORE UPDATE ON public.scenario_drafts
  FOR EACH ROW EXECUTE FUNCTION public.bump_scenario_draft_revision();

-- Direkte Web-Sessions haben keine OAuth-client_id. Andere OAuth-Clients werden
-- nicht automatisch wie die Web-App behandelt.
CREATE OR REPLACE FUNCTION public.is_direct_web_session()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public, auth, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND NULLIF(auth.jwt() ->> 'client_id', '') IS NULL
    AND COALESCE(auth.jwt() -> 'immo_checker_mcp', 'false'::jsonb) <> 'true'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.is_approved_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.approved = true
    );
$$;

-- Dynamisch registrierte und vorregistrierte OAuth-Clients werden gleich
-- behandelt: Token-Claim, Audience, aktueller User-Grant und approved-Profil
-- muessen bei jedem Zugriff weiterhin gueltig sein.
CREATE OR REPLACE FUNCTION public.is_immo_checker_mcp()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  claims JSONB := auth.jwt();
  configured_enabled BOOLEAN;
  configured_audience TEXT;
  audience_claim JSONB;
  token_client_id TEXT := NULLIF(claims ->> 'client_id', '');
  audience_matches BOOLEAN := false;
BEGIN
  SELECT config.enabled, config.audience
  INTO configured_enabled, configured_audience
  FROM public.agent_mcp_config AS config
  WHERE config.id = true;

  IF auth.uid() IS NULL
    OR COALESCE(configured_enabled, false) IS NOT true
    OR configured_audience IS NULL
    OR token_client_id IS NULL
    OR length(token_client_id) > 500
    OR claims -> 'immo_checker_mcp' IS DISTINCT FROM 'true'::jsonb
  THEN
    RETURN false;
  END IF;

  audience_claim := claims -> 'aud';
  audience_matches := CASE jsonb_typeof(audience_claim)
    WHEN 'string' THEN audience_claim #>> '{}' = configured_audience
    WHEN 'array' THEN jsonb_exists(audience_claim, configured_audience)
    ELSE false
  END;

  IF audience_matches IS NOT true THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    JOIN public.agent_oauth_grants AS grant
      ON grant.user_id = profile.id
     AND grant.client_id = token_client_id
    WHERE profile.id = auth.uid()
      AND profile.approved = true
  );
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- OAuth-Tokens sind niemals Admin-Tokens, auch wenn der zugrunde liegende User
-- in der Web-App Administrator ist.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT public.is_direct_web_session()
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.id = auth.uid()
        AND profile.is_admin = true
    );
$$;

REVOKE EXECUTE ON FUNCTION public.is_immo_checker_mcp() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_direct_web_session() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_immo_checker_mcp() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_direct_web_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved_user() TO authenticated;

-- Direkter Profilzugriff bleibt der Web-App vorbehalten. Die MCP-Function
-- prueft approved/Grant ausschliesslich ueber die eng begrenzten Funktionen.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins update profiles" ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    auth.uid() = id
    AND public.is_direct_web_session()
  );

CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Nur das freigegebene Konto selbst darf Grants in einer direkten Web-Session
-- verwalten. Ein OAuth-Token kann seine eigene Freigabe nicht erzeugen.
ALTER TABLE public.agent_oauth_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own agent OAuth grants" ON public.agent_oauth_grants;
DROP POLICY IF EXISTS "Users insert own agent OAuth grants" ON public.agent_oauth_grants;
DROP POLICY IF EXISTS "Users update own agent OAuth grants" ON public.agent_oauth_grants;
DROP POLICY IF EXISTS "Users delete own agent OAuth grants" ON public.agent_oauth_grants;

CREATE POLICY "Users read own agent OAuth grants" ON public.agent_oauth_grants
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_direct_web_session()
    AND public.is_approved_user()
  );

CREATE POLICY "Users insert own agent OAuth grants" ON public.agent_oauth_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_direct_web_session()
    AND public.is_approved_user()
  );

CREATE POLICY "Users update own agent OAuth grants" ON public.agent_oauth_grants
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_direct_web_session()
    AND public.is_approved_user()
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_direct_web_session()
    AND public.is_approved_user()
  );

CREATE POLICY "Users delete own agent OAuth grants" ON public.agent_oauth_grants
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_direct_web_session()
    AND public.is_approved_user()
  );

REVOKE ALL ON TABLE public.agent_oauth_grants FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.agent_oauth_grants TO authenticated;

-- Freigegebene Web-Sessions behalten CRUD. Genehmigte MCP-Clients duerfen nur
-- eigene Szenarien lesen. Es gibt keine Admin-Read-All-Policy.
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own scenarios" ON public.scenarios;
DROP POLICY IF EXISTS "Users insert own scenarios" ON public.scenarios;
DROP POLICY IF EXISTS "Users update own scenarios" ON public.scenarios;
DROP POLICY IF EXISTS "Users delete own scenarios" ON public.scenarios;
DROP POLICY IF EXISTS "Admins read all scenarios" ON public.scenarios;

CREATE POLICY "Users read own scenarios" ON public.scenarios
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND (public.is_direct_web_session() OR public.is_immo_checker_mcp())
  );

CREATE POLICY "Users insert own scenarios" ON public.scenarios
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND public.is_direct_web_session()
  );

CREATE POLICY "Users update own scenarios" ON public.scenarios
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND public.is_direct_web_session()
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND public.is_direct_web_session()
  );

CREATE POLICY "Users delete own scenarios" ON public.scenarios
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND public.is_direct_web_session()
  );

-- Drafts: Web-Sessions haben CRUD. MCP darf eigene Drafts lesen, anlegen und
-- per CAS aktualisieren, aber nicht loeschen oder final committen.
ALTER TABLE public.scenario_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own scenario drafts" ON public.scenario_drafts;
DROP POLICY IF EXISTS "Users insert own scenario drafts" ON public.scenario_drafts;
DROP POLICY IF EXISTS "Users update own scenario drafts" ON public.scenario_drafts;
DROP POLICY IF EXISTS "Users delete own scenario drafts" ON public.scenario_drafts;

CREATE POLICY "Users read own scenario drafts" ON public.scenario_drafts
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND (public.is_direct_web_session() OR public.is_immo_checker_mcp())
  );

CREATE POLICY "Users insert own scenario drafts" ON public.scenario_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND (public.is_direct_web_session() OR public.is_immo_checker_mcp())
  );

CREATE POLICY "Users update own scenario drafts" ON public.scenario_drafts
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND (public.is_direct_web_session() OR public.is_immo_checker_mcp())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND (public.is_direct_web_session() OR public.is_immo_checker_mcp())
  );

CREATE POLICY "Users delete own scenario drafts" ON public.scenario_drafts
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND public.is_approved_user()
    AND public.is_direct_web_session()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.scenario_drafts TO authenticated;

-- Der Hook markiert nur OAuth-Tokens, deren Nutzer freigegeben ist und genau
-- diesem client_id zuvor in einer direkten Web-Session einen Grant erteilt hat.
-- Fehlende Konfiguration bleibt fuer normale Logins ein No-op.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims JSONB := COALESCE(event -> 'claims', '{}'::jsonb);
  original_claims JSONB := COALESCE(event -> 'claims', '{}'::jsonb);
  event_client_id_text TEXT := NULLIF(event ->> 'client_id', '');
  claim_client_id_text TEXT := NULLIF(claims ->> 'client_id', '');
  token_client_id TEXT := COALESCE(event_client_id_text, claim_client_id_text);
  event_user_id_text TEXT := NULLIF(event ->> 'user_id', '');
  claim_user_id_text TEXT := NULLIF(claims ->> 'sub', '');
  token_user_id UUID;
  configured_enabled BOOLEAN;
  configured_audience TEXT;
BEGIN
  -- Dieser Claim darf ausschliesslich aus der serverseitigen Konfiguration kommen.
  claims := claims - 'immo_checker_mcp';

  -- Wenn Hook-Event und Token-Claims beide eine User-ID liefern, muessen sie
  -- uebereinstimmen. Andernfalls wird der reservierte Claim fail-closed entfernt.
  IF event_user_id_text IS NOT NULL
    AND claim_user_id_text IS NOT NULL
    AND event_user_id_text IS DISTINCT FROM claim_user_id_text
  THEN
    RETURN jsonb_build_object('claims', claims);
  END IF;

  -- Supabase kann client_id als eigenes Hook-Event-Feld und/oder bereits im
  -- Claims-Objekt liefern. Bei zwei widerspruechlichen Werten gilt fail-closed.
  IF event_client_id_text IS NOT NULL
    AND claim_client_id_text IS NOT NULL
    AND event_client_id_text IS DISTINCT FROM claim_client_id_text
  THEN
    RETURN jsonb_build_object('claims', claims);
  END IF;

  token_user_id := COALESCE(event_user_id_text, claim_user_id_text)::UUID;

  SELECT config.enabled, config.audience
  INTO configured_enabled, configured_audience
  FROM public.agent_mcp_config AS config
  WHERE config.id = true;

  IF COALESCE(configured_enabled, false) IS true
    AND configured_audience IS NOT NULL
    AND token_user_id IS NOT NULL
    AND NULLIF(token_client_id, '') IS NOT NULL
    AND length(token_client_id) <= 500
    AND EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      JOIN public.agent_oauth_grants AS grant
        ON grant.user_id = profile.id
       AND grant.client_id = token_client_id
      WHERE profile.id = token_user_id
        AND profile.approved = true
  )
  THEN
    claims := jsonb_set(claims, '{client_id}', to_jsonb(token_client_id), true);
    claims := jsonb_set(claims, '{aud}', to_jsonb(configured_audience), true);
    claims := jsonb_set(claims, '{immo_checker_mcp}', 'true'::jsonb, true);
  END IF;

  RETURN jsonb_build_object('claims', claims);
EXCEPTION WHEN OTHERS THEN
  -- Auch im Fehlerfall darf ein vom Client eingeschleuster MCP-Claim niemals
  -- erhalten bleiben. Alle anderen Claims bleiben fuer normale Logins gleich.
  RETURN jsonb_build_object('claims', original_claims - 'immo_checker_mcp');
END;
$$;

GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(JSONB)
  FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.custom_access_token_hook(JSONB) IS
  'Markiert pro Nutzer explizit genehmigte OAuth-Clients mit MCP-Audience und immo_checker_mcp=true.';

-- Beispielkonfiguration (Werte muessen mit der Edge Function uebereinstimmen):
-- UPDATE public.agent_mcp_config
-- SET enabled = true,
--     audience = 'https://<PROJECT-REF>.supabase.co/functions/v1/agent-mcp',
--     updated_at = now()
-- WHERE id = true;
