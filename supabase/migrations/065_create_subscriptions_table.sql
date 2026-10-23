-- ============================================================================
-- MIGRATION 065: Assinaturas comerciais (planos, trial e Stripe)
-- ============================================================================
-- Tabela de assinaturas por escritorio (tenant). A matriz Neves & Costa recebe
-- seed com plano PRO ativo vitalicio.
--
-- Idempotente: IF NOT EXISTS / WHERE NOT EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  plan VARCHAR(50) NOT NULL DEFAULT 'trial',
  status VARCHAR(50) NOT NULL DEFAULT 'trialing',
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.subscriptions IS 'Assinaturas SaaS por escritorio (Stripe)';
COMMENT ON COLUMN public.subscriptions.plan IS 'Plano: trial, basico, profissional, pro, enterprise';
COMMENT ON COLUMN public.subscriptions.status IS 'Status: trialing, active, past_due, cancelled';

CREATE INDEX IF NOT EXISTS idx_subscriptions_office_id ON public.subscriptions(office_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription ON public.subscriptions(stripe_subscription_id);

-- Seed: matriz Neves & Costa com plano PRO ativo vitalicio
INSERT INTO public.subscriptions (office_id, plan, status)
SELECT '00000000-0000-0000-0000-000000000001', 'pro', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscriptions
  WHERE office_id = '00000000-0000-0000-0000-000000000001'
);

-- RLS: leitura autenticada, escrita somente via service_role
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions' AND policyname = 'subscriptions_select_authenticated'
  ) THEN
    CREATE POLICY subscriptions_select_authenticated
      ON public.subscriptions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
