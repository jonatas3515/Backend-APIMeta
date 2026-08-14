-- Integrações com calendários externos (Fase 1: schema e iCal)

-- Tabela de integrações OAuth de calendário
CREATE TABLE IF NOT EXISTS public.user_calendar_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  email TEXT,
  connected_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_user_calendar_user_id
  ON public.user_calendar_integrations(user_id);

CREATE INDEX IF NOT EXISTS idx_user_calendar_provider
  ON public.user_calendar_integrations(provider);

-- Token público para assinatura iCal
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ical_token UUID UNIQUE,
  ADD COLUMN IF NOT EXISTS ical_token_updated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ical_token
  ON public.users(ical_token);

-- Gera token para usuários que ainda não possuem
UPDATE public.users
  SET ical_token = gen_random_uuid(),
      ical_token_updated_at = now()
  WHERE ical_token IS NULL;
