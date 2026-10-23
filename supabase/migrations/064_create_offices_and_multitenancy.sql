-- ============================================================================
-- MIGRATION 064: Multi-tenancy - tabela de escritorios e office_id nas entidades
-- ============================================================================
-- Prepara o sistema para SaaS multi-escritorio. A matriz "Neves & Costa" usa
-- UUID fixo '00000000-0000-0000-0000-000000000001' como padrao absoluto para
-- todos os dados existentes e novos registros.
--
-- Nao destrutiva: colunas novas sao nullable com DEFAULT, preservando 100%
-- dos dados em producao.
--
-- Idempotente: IF NOT EXISTS / ON CONFLICT DO NOTHING.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Tabela de escritorios (tenants)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  cnpj VARCHAR(20),
  email VARCHAR(255),
  phone VARCHAR(20),
  logo_url TEXT,
  plan VARCHAR(50) DEFAULT 'trial',
  status VARCHAR(50) DEFAULT 'active',
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.offices IS 'Escritorios tenants do SaaS (multi-tenancy)';
COMMENT ON COLUMN public.offices.plan IS 'Plano contratado: trial, basic, pro, enterprise';
COMMENT ON COLUMN public.offices.status IS 'Status do tenant: active, suspended, cancelled';

-- ----------------------------------------------------------------------------
-- 2. Escritorio matriz (default absoluto)
-- ----------------------------------------------------------------------------
INSERT INTO public.offices (id, name, plan, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Neves & Costa Advogados', 'pro', 'active')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. Coluna office_id nas entidades principais (default = matriz)
-- ----------------------------------------------------------------------------
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS office_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS office_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';

ALTER TABLE public.chat_clients
  ADD COLUMN IF NOT EXISTS office_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';

COMMENT ON COLUMN public.conversations.office_id IS 'Tenant (escritorio) dono do registro';
COMMENT ON COLUMN public.cases.office_id IS 'Tenant (escritorio) dono do registro';
COMMENT ON COLUMN public.chat_clients.office_id IS 'Tenant (escritorio) dono do registro';

-- ----------------------------------------------------------------------------
-- 4. Indices para isolamento por tenant
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conversations_office_id ON public.conversations(office_id);
CREATE INDEX IF NOT EXISTS idx_cases_office_id ON public.cases(office_id);
CREATE INDEX IF NOT EXISTS idx_chat_clients_office_id ON public.chat_clients(office_id);

-- ----------------------------------------------------------------------------
-- 5. RLS na tabela offices (leitura autenticada, escrita somente service_role)
-- ----------------------------------------------------------------------------
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'offices' AND policyname = 'offices_select_authenticated'
  ) THEN
    CREATE POLICY offices_select_authenticated
      ON public.offices FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
