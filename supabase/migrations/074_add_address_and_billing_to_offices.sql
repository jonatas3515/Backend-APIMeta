-- ============================================================================
-- MIGRATION 074: Adiciona campos de endereco e faturamento/pagamento a offices e subscriptions
-- ============================================================================

ALTER TABLE public.offices
  ADD COLUMN IF NOT EXISTS address_street VARCHAR(255),
  ADD COLUMN IF NOT EXISTS address_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS address_complement VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_neighborhood VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS address_state VARCHAR(10),
  ADD COLUMN IF NOT EXISTS address_zip VARCHAR(20),
  ADD COLUMN IF NOT EXISTS billing_cpf_cnpj VARCHAR(25),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last4_card VARCHAR(4),
  ADD COLUMN IF NOT EXISTS card_brand VARCHAR(50),
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_cpf_cnpj VARCHAR(25),
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
  ADD COLUMN IF NOT EXISTS last4_card VARCHAR(4),
  ADD COLUMN IF NOT EXISTS card_brand VARCHAR(50),
  ADD COLUMN IF NOT EXISTS billing_cycle VARCHAR(20) DEFAULT 'monthly';

COMMENT ON COLUMN public.offices.address_street IS 'Logradouro do escritorio';
COMMENT ON COLUMN public.offices.address_zip IS 'CEP do escritorio';
COMMENT ON COLUMN public.offices.billing_cpf_cnpj IS 'CPF ou CNPJ para cobranca/faturamento';
