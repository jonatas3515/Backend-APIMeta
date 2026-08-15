-- ============================================================================
-- MIGRATION 042: Google Calendar - Fase 2 (OAuth completo e sincronização)
-- ============================================================================
-- Alterações NÃO destrutivas: apenas adiciona colunas e tabelas novas.
-- ============================================================================

-- Adiciona campos para controle de expiração e metadados da integração
ALTER TABLE public.user_calendar_integrations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token_encrypted TEXT,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS state_token TEXT, -- usado temporariamente durante OAuth
  ADD COLUMN IF NOT EXISTS state_expires_at TIMESTAMPTZ;

-- Garante que tokens legados sejam limpos de forma segura (não remove dados, apenas marca)
UPDATE public.user_calendar_integrations
  SET is_active = false
  WHERE is_active IS NULL;

-- Índice para consultar integração ativa do usuário
CREATE INDEX IF NOT EXISTS idx_user_calendar_active
  ON public.user_calendar_integrations(user_id, provider)
  WHERE is_active = true;

-- Tabela para armazenar estados OAuth temporários com expiração
CREATE TABLE IF NOT EXISTS public.calendar_oauth_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_calendar_oauth_state_state
  ON public.calendar_oauth_states(state);

CREATE INDEX IF NOT EXISTS idx_calendar_oauth_state_expires
  ON public.calendar_oauth_states(expires_at);

-- Tabela para rastrear eventos sincronizados e evitar duplicação
CREATE TABLE IF NOT EXISTS public.calendar_synced_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_event_id UUID NOT NULL,
  internal_table TEXT NOT NULL, -- 'case_events', 'chat_reminders', 'cases'
  provider TEXT NOT NULL,
  external_event_id TEXT NOT NULL,
  external_calendar_id TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  synced_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_sync_status TEXT DEFAULT 'success',
  UNIQUE (internal_event_id, internal_table, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_synced_internal
  ON public.calendar_synced_events(internal_event_id, internal_table, provider);

CREATE INDEX IF NOT EXISTS idx_calendar_synced_user
  ON public.calendar_synced_events(user_id);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_calendar_synced_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calendar_synced_updated_at
  BEFORE UPDATE ON public.calendar_synced_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_synced_timestamp();

-- Política de limpeza de estados expirados (RLS friendly)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM public.calendar_oauth_states
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql;
