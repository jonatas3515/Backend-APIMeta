-- ============================================================================
-- MIGRATION 058: Restringir views internas a service_role
-- ============================================================================
-- Views em Postgres sao SECURITY DEFINER por padrao e tinham acesso publico
-- implicito via PostgREST. Uso real: apenas backend service role
-- (pages/api/lgpd.js, pages/api/insights.js, auth).
-- Nao destrutiva: apenas revoga/concede permissoes. Nao altera dados.
-- ============================================================================

REVOKE ALL ON public.expired_leads FROM anon, authenticated;
REVOKE ALL ON public.similar_insights FROM anon, authenticated;
REVOKE ALL ON public.active_users FROM anon, authenticated;
REVOKE ALL ON public.user_hierarchy FROM anon, authenticated;

GRANT SELECT ON public.expired_leads TO service_role;
GRANT SELECT ON public.similar_insights TO service_role;
GRANT SELECT ON public.active_users TO service_role;
GRANT SELECT ON public.user_hierarchy TO service_role;
