-- ============================================================================
-- MIGRATION: Habilitar RLS nas tabelas do CHAT
-- (Apenas para as tabelas do sistema de chat, não afeta outras tabelas do site)
-- ============================================================================

-- Habilitar RLS nas tabelas do chat
ALTER TABLE chat_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Políticas para chat_admin_users (apenas service role pode acessar)
CREATE POLICY "Service role can manage chat_admin_users"
  ON chat_admin_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para chat_clients (apenas service role pode acessar)
CREATE POLICY "Service role can manage chat_clients"
  ON chat_clients
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para conversations (apenas service role pode acessar)
CREATE POLICY "Service role can manage conversations"
  ON conversations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Políticas para messages (apenas service role pode acessar)
CREATE POLICY "Service role can manage messages"
  ON messages
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- IMPORTANTE: Estas políticas permitem acesso apenas via service_role
-- O frontend usa a API que usa a service_role key, então continuará funcionando
-- Mas acesso direto via anon ou authenticated será bloqueado
-- ============================================================================

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
