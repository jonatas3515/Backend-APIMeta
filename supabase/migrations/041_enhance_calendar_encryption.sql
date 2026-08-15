-- ============================================================================
-- MIGRATION 041: Calendário - Fase 1 (iCal com Criptografia)
-- ============================================================================

-- Adiciona coluna para armazenar chave de criptografia do token iCal
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ical_encryption_key TEXT; -- Chave derivada de CALENDAR_ENCRYPTION_KEY

-- Adiciona coluna para rastrear quando o token foi gerado/regenerado
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ical_token_generated_at TIMESTAMPTZ DEFAULT now();

-- Adiciona coluna para desabilitar token iCal sem deletar
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ical_token_disabled BOOLEAN DEFAULT false;

-- Índice para buscar usuários com token iCal ativo
CREATE INDEX IF NOT EXISTS idx_users_ical_token_active
  ON public.users(ical_token)
  WHERE ical_token_disabled = false;

-- Tabela para rastrear acessos ao iCal (auditoria)
CREATE TABLE IF NOT EXISTS public.ical_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_used TEXT NOT NULL, -- Hash do token para auditoria
  ip_address INET,
  user_agent TEXT,
  accessed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ical_access_logs_user_id
  ON public.ical_access_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_ical_access_logs_accessed_at
  ON public.ical_access_logs(accessed_at DESC);

-- Tabela para preparar integração OAuth (Fase 2)
CREATE TABLE IF NOT EXISTS public.calendar_oauth_providers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL, -- 'google', 'microsoft', 'apple'
  oauth_code TEXT, -- Código temporário do OAuth
  access_token_encrypted TEXT, -- Criptografado
  refresh_token_encrypted TEXT, -- Criptografado
  token_expires_at TIMESTAMPTZ,
  calendar_id TEXT, -- ID do calendário no provedor
  is_syncing BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_calendar_oauth_user_id
  ON public.calendar_oauth_providers(user_id);

CREATE INDEX IF NOT EXISTS idx_calendar_oauth_provider
  ON public.calendar_oauth_providers(provider);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_calendar_oauth_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calendar_oauth_updated_at
  BEFORE UPDATE ON public.calendar_oauth_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_oauth_timestamp();
