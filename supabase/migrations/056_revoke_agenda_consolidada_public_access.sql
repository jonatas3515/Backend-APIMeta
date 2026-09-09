-- ============================================================================
-- MIGRATION 056: Revogar exposicao publica de agenda_consolidada e get_agenda
-- ============================================================================
-- Contexto: migrations 045/046 concederam SELECT na view e EXECUTE na funcao
-- get_agenda para anon e authenticated. O uso real e 100% backend service role
-- (pages/api/agenda.js, pages/api/calendar/ical.js). Qualquer pessoa com a
-- chave anon poderia ler toda a agenda do escritorio via PostgREST.
-- Nao destrutiva: apenas revoga/concede permissoes. Nao altera dados.
-- ============================================================================

-- 1. Revogar acesso publico da view
REVOKE SELECT ON public.agenda_consolidada FROM anon;
REVOKE SELECT ON public.agenda_consolidada FROM authenticated;

-- 2. Revogar acesso publico da funcao get_agenda
REVOKE EXECUTE ON FUNCTION public.get_agenda(
  DATE, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_agenda(
  DATE, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR
) FROM authenticated;

-- 3. Conceder acesso apenas a service_role
GRANT SELECT ON public.agenda_consolidada TO service_role;

GRANT EXECUTE ON FUNCTION public.get_agenda(
  DATE, DATE, VARCHAR, VARCHAR, VARCHAR, VARCHAR
) TO service_role;
