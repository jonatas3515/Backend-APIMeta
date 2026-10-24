-- ============================================================================
-- MIGRATION 066: office_id na tabela users (vinculo usuario-escritorio)
-- ============================================================================
-- Completa o isolamento por tenant iniciado na migration 064: cada usuario
-- passa a pertencer a um escritorio. Registros existentes recebem a matriz.
-- Idempotente: IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS office_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';

COMMENT ON COLUMN public.users.office_id IS 'Tenant (escritorio) ao qual o usuario pertence';

CREATE INDEX IF NOT EXISTS idx_users_office_id ON public.users(office_id);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
