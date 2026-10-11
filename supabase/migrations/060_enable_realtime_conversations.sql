-- ============================================================================
-- MIGRATION 060: Habilitar Supabase Realtime em conversations e messages
-- ============================================================================
-- Sem entrada na publicacao supabase_realtime, o Postgres nao emite eventos
-- postgres_changes via WebSocket. O listener em pages/index.js
-- (conversations-notifications) nunca recebia INSERT/UPDATE de novas
-- mensagens, exigindo F5 manual e impedindo maybeNotify() de disparar.
--
-- REPLICA IDENTITY FULL: garante que o payload realtime carregue a linha
-- completa (new/old), necessario para filtros por assigned_user_id e unread.
--
-- Nao destrutiva e idempotente: guards evitam erro se a tabela ja estiver
-- na publicacao.
-- ============================================================================

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
