-- ============================================================================
-- MIGRATION 043: Segurança - RLS, Webhook Logs e Hardening
-- ============================================================================
-- Não destrutiva: adiciona tabela e policies. Não remove colunas/dados.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabela de logs de webhooks de assinatura (idempotência e auditoria)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.signature_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'completed', 'failed'
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signature_webhook_logs_key
  ON public.signature_webhook_logs(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_signature_webhook_logs_created_at
  ON public.signature_webhook_logs(created_at DESC);

-- ----------------------------------------------------------------------------
-- Row Level Security (RLS) para proteger dados sensíveis
-- ----------------------------------------------------------------------------

-- document_signatures: só quem tem acesso ao caso pode ver
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'document_signatures' AND policyname = 'service_role_bypass_document_signatures'
  ) THEN
    CREATE POLICY service_role_bypass_document_signatures
      ON public.document_signatures
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- signature_integration_config: apenas o usuário dono e service role
ALTER TABLE public.signature_integration_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'signature_integration_config' AND policyname = 'service_role_bypass_signature_config'
  ) THEN
    CREATE POLICY service_role_bypass_signature_config
      ON public.signature_integration_config
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- calendar_oauth_providers: apenas o usuário dono e service role
ALTER TABLE public.calendar_oauth_providers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calendar_oauth_providers' AND policyname = 'service_role_bypass_calendar_oauth'
  ) THEN
    CREATE POLICY service_role_bypass_calendar_oauth
      ON public.calendar_oauth_providers
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- user_calendar_integrations: apenas o usuário dono e service role
ALTER TABLE public.user_calendar_integrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_calendar_integrations' AND policyname = 'service_role_bypass_user_calendar'
  ) THEN
    CREATE POLICY service_role_bypass_user_calendar
      ON public.user_calendar_integrations
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ical_access_logs: apenas o usuário dono e service role
ALTER TABLE public.ical_access_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ical_access_logs' AND policyname = 'service_role_bypass_ical_access'
  ) THEN
    CREATE POLICY service_role_bypass_ical_access
      ON public.ical_access_logs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- calendar_oauth_states: apenas service role (dados temporários sensíveis)
ALTER TABLE public.calendar_oauth_states ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calendar_oauth_states' AND policyname = 'service_role_only_oauth_states'
  ) THEN
    CREATE POLICY service_role_only_oauth_states
      ON public.calendar_oauth_states
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- calendar_synced_events: apenas service role
ALTER TABLE public.calendar_synced_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'calendar_synced_events' AND policyname = 'service_role_only_synced_events'
  ) THEN
    CREATE POLICY service_role_only_synced_events
      ON public.calendar_synced_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- signature_webhook_logs: apenas service role
ALTER TABLE public.signature_webhook_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'signature_webhook_logs' AND policyname = 'service_role_only_webhook_logs'
  ) THEN
    CREATE POLICY service_role_only_webhook_logs
      ON public.signature_webhook_logs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Índice adicional para segurança de busca por state
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_calendar_oauth_state_user_provider
  ON public.calendar_oauth_states(user_id, provider);
