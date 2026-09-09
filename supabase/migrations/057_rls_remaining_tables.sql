-- ============================================================================
-- MIGRATION 057: RLS nas tabelas restantes alertadas pelo Supabase
-- ============================================================================
-- Registra exatamente o que foi aplicado manualmente no projeto
-- uytvsxualogrimpueran:
--   A) Tabelas backend-only: RLS + policy service_role FOR ALL.
--   B) Tabelas do painel autenticado: RLS + policies authenticated_all e
--      service_role_bypass.
--   C) users: RLS + users_select_authenticated (SELECT) e
--      users_service_role (ALL).
-- Idempotente: DROP POLICY IF EXISTS nos grupos B/C; IF NOT EXISTS no grupo A.
-- Nao remove nem altera policies criadas por outras migrations.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A) Tabelas backend-only: acesso exclusivo via service_role
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'generated_documents',
    'routine_executions',
    'case_insights',
    'insight_usage',
    'user_notification_preferences',
    'internal_notes',
    'audit_logs',
    'data_retention_policy',
    'anonymized_data',
    'consent_logs',
    'case_events',
    'admin_users'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t
        AND policyname = 'service_role_only_' || t
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        'service_role_only_' || t, t
      );
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- B) Tabelas do painel autenticado: authenticated_all + service_role_bypass
--    (nomes exatos das policies aplicadas manualmente)
-- ----------------------------------------------------------------------------
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_routines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

-- cases
DROP POLICY IF EXISTS authenticated_all ON public.cases;
CREATE POLICY authenticated_all
  ON public.cases
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass ON public.cases;
CREATE POLICY service_role_bypass
  ON public.cases
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- chat_reminders
DROP POLICY IF EXISTS authenticated_all ON public.chat_reminders;
CREATE POLICY authenticated_all
  ON public.chat_reminders
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass ON public.chat_reminders;
CREATE POLICY service_role_bypass
  ON public.chat_reminders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- legal_routines
DROP POLICY IF EXISTS authenticated_all ON public.legal_routines;
CREATE POLICY authenticated_all
  ON public.legal_routines
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass ON public.legal_routines;
CREATE POLICY service_role_bypass
  ON public.legal_routines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- document_templates
DROP POLICY IF EXISTS authenticated_all ON public.document_templates;
CREATE POLICY authenticated_all
  ON public.document_templates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS service_role_bypass ON public.document_templates;
CREATE POLICY service_role_bypass
  ON public.document_templates
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- C) users: SELECT para authenticated + ALL para service_role
-- ----------------------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_authenticated ON public.users;
CREATE POLICY users_select_authenticated
  ON public.users
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS users_service_role ON public.users;
CREATE POLICY users_service_role
  ON public.users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
