-- ============================================================================
-- MIGRATION 062: Campos processuais avancados na tabela cases
-- ============================================================================
-- Absorve os dados processuais do sistema legado de referencia para a tabela
-- cases. Todas as colunas sao opcionais (NULL permitido), garantindo
-- retrocompatibilidade total com os casos ja cadastrados.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS process_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS court VARCHAR(50),
  ADD COLUMN IF NOT EXISTS court_division VARCHAR(100),
  ADD COLUMN IF NOT EXISTS judicial_district VARCHAR(100),
  ADD COLUMN IF NOT EXISTS procedural_step VARCHAR(50),
  ADD COLUMN IF NOT EXISTS case_value NUMERIC(15, 2),
  ADD COLUMN IF NOT EXISTS distribution_date DATE;

COMMENT ON COLUMN public.cases.process_number IS 'Numero do processo no formato CNJ';
COMMENT ON COLUMN public.cases.court IS 'Tribunal (ex: TRT, TRF, TJ, STJ, STF)';
COMMENT ON COLUMN public.cases.court_division IS 'Vara ou Juizado';
COMMENT ON COLUMN public.cases.judicial_district IS 'Comarca';
COMMENT ON COLUMN public.cases.procedural_step IS 'Fase processual: conciliacao, instrucao, sentenca, recurso, execucao, acordo, outro';
COMMENT ON COLUMN public.cases.case_value IS 'Valor da causa';
COMMENT ON COLUMN public.cases.distribution_date IS 'Data de distribuicao do processo';

CREATE INDEX IF NOT EXISTS idx_cases_process_number ON public.cases(process_number);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
