-- ============================================================================
-- MIGRATION 068: Configuracoes do escritorio + campos extras em tasks
-- ============================================================================
-- offices: template de mensagem de aniversario, versao semanal, horario/fuso
-- das notificacoes. tasks: status (pendente/em_andamento/concluida/cancelada),
-- descricao e vinculo com caso. Idempotente.
-- ============================================================================

ALTER TABLE public.offices ADD COLUMN IF NOT EXISTS birthday_message TEXT;
ALTER TABLE public.offices ADD COLUMN IF NOT EXISTS birthday_message_weekly TEXT;
ALTER TABLE public.offices ADD COLUMN IF NOT EXISTS notify_hour INT DEFAULT 9;
ALTER TABLE public.offices ADD COLUMN IF NOT EXISTS notify_timezone VARCHAR(50) DEFAULT 'America/Bahia';

ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pendente';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS case_id UUID;

COMMENT ON COLUMN public.tasks.status IS 'pendente, em_andamento, concluida, cancelada';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
