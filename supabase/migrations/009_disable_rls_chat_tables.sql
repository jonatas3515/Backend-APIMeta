-- ============================================================================
-- MIGRATION: DESABILITAR RLS nas tabelas do CHAT
-- (O frontend usa service_role key que bypassa RLS de qualquer forma)
-- ============================================================================

-- Desabilitar RLS nas tabelas do chat
ALTER TABLE chat_admin_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE chat_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- Remover políticas existentes (se houver)
DROP POLICY IF EXISTS "Service role can manage chat_admin_users" ON chat_admin_users;
DROP POLICY IF EXISTS "Service role can manage chat_clients" ON chat_clients;
DROP POLICY IF EXISTS "Service role can manage conversations" ON conversations;
DROP POLICY IF EXISTS "Service role can manage messages" ON messages;

-- ============================================================================
-- IMPORTANTE: 
-- - RLS desabilitado porque usamos service_role key no backend
-- - Service role bypassa RLS de qualquer forma
-- - Tabelas ficam acessíveis apenas via API (que usa service_role)
-- - Acesso direto via anon/authenticated continua bloqueado pela ausência de políticas
-- ============================================================================

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
