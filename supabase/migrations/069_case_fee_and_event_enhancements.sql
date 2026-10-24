-- ============================================================================
-- MIGRATION 069: Campos de Honorários Personalizados na Tabela cases
-- ============================================================================
-- Permite que o advogado defina o modelo de honorários por processo:
-- - Percentual customizado (ex: 20%, 30%, etc.)
-- - Base de cálculo (sobre a condenação/acordo ou sobre o valor da causa)
-- - Valor da condenação ou acordo obtido em juízo (ex: Amanda R$ 6.207,59)
-- - Valor fixo de honorários (para causas com valor acordado predefinido)
-- - Valor final apurado de honorários
--
-- Idempotente: ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS fee_type VARCHAR(20) DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS fee_percentage NUMERIC(5, 2) DEFAULT 30.00,
  ADD COLUMN IF NOT EXISTS fee_basis VARCHAR(30) DEFAULT 'condenacao',
  ADD COLUMN IF NOT EXISTS awarded_value NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS fee_fixed_value NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS fee_final_value NUMERIC(15, 2);

COMMENT ON COLUMN public.cases.fee_type IS 'percentual ou fixo';
COMMENT ON COLUMN public.cases.fee_percentage IS 'Percentual de honorarios (ex: 20.00 ou 30.00)';
COMMENT ON COLUMN public.cases.fee_basis IS 'Base de calculo: condenacao (valor da condenacao/acordo) ou causa (valor da causa)';
COMMENT ON COLUMN public.cases.awarded_value IS 'Valor final obtido na condenacao ou acordo';
COMMENT ON COLUMN public.cases.fee_fixed_value IS 'Valor fixo pactuado em reais (se fee_type = fixo)';
COMMENT ON COLUMN public.cases.fee_final_value IS 'Valor final apurado dos honorarios a receber';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
