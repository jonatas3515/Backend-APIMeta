-- ============================================================================
-- MIGRATION 061: Function de auto-arquivamento de conversas inativas
-- ============================================================================
-- Espelha a logica do endpoint /api/cron/auto-archive: arquiva conversas sem
-- atividade ha mais de 7 dias, SEM tocar em conversas com mensagem nao lida
-- (regra de seguranca) nem em conversas ja arquivadas.
--
-- Idempotente: CREATE OR REPLACE. Execucao restrita a service_role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.auto_archive_inactive_conversations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.conversations
  SET archived = true,
      archived_at = NOW()
  WHERE (archived IS NULL OR archived = false)
    AND (unread IS NULL OR unread = false)
    AND updated_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_archive_inactive_conversations() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_archive_inactive_conversations() TO service_role;
