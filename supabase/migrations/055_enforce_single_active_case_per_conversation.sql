-- ============================================================================
-- MIGRATION 055: Garantir um único caso ativo por conversa
-- ============================================================================
-- Implementa regra de negócio:
-- - Uma conversa pode ter vários casos no histórico
-- - Uma conversa pode ter apenas UM caso ativo principal por vez
-- - Casos com status 'encerrado' não bloqueiam criação de novos casos
-- - Sincroniza conversations.has_case automaticamente
-- ============================================================================

-- 1. Criar índice parcial para casos ativos por conversa
-- Garante performance e unicidade de casos ativos
CREATE UNIQUE INDEX IF NOT EXISTS idx_cases_active_per_conversation
ON cases(conversation_id)
WHERE status != 'encerrado';

COMMENT ON INDEX idx_cases_active_per_conversation IS 
'Garante que cada conversa tenha no máximo um caso ativo (status != encerrado). Casos encerrados não são considerados.';

-- 2. Função para sincronizar has_case baseado em casos ativos
CREATE OR REPLACE FUNCTION sync_conversation_has_case()
RETURNS TRIGGER AS $$
BEGIN
  -- Quando um caso é inserido, atualizado ou deletado
  -- Atualiza has_case da conversa correspondente
  
  IF TG_OP = 'DELETE' THEN
    -- Ao deletar, verifica se ainda há casos ativos
    UPDATE conversations
    SET has_case = EXISTS (
      SELECT 1 FROM cases 
      WHERE conversation_id = OLD.conversation_id 
      AND status != 'encerrado'
    )
    WHERE id = OLD.conversation_id;
    RETURN OLD;
  ELSE
    -- Ao inserir ou atualizar, verifica casos ativos
    UPDATE conversations
    SET has_case = EXISTS (
      SELECT 1 FROM cases 
      WHERE conversation_id = NEW.conversation_id 
      AND status != 'encerrado'
    )
    WHERE id = NEW.conversation_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_conversation_has_case IS 
'Sincroniza automaticamente conversations.has_case quando casos são criados, atualizados ou deletados. Considera apenas casos com status != encerrado.';

-- 3. Criar triggers para sincronização automática
DROP TRIGGER IF EXISTS trigger_sync_has_case_insert ON cases;
CREATE TRIGGER trigger_sync_has_case_insert
AFTER INSERT ON cases
FOR EACH ROW
EXECUTE FUNCTION sync_conversation_has_case();

DROP TRIGGER IF EXISTS trigger_sync_has_case_update ON cases;
CREATE TRIGGER trigger_sync_has_case_update
AFTER UPDATE ON cases
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id)
EXECUTE FUNCTION sync_conversation_has_case();

DROP TRIGGER IF EXISTS trigger_sync_has_case_delete ON cases;
CREATE TRIGGER trigger_sync_has_case_delete
AFTER DELETE ON cases
FOR EACH ROW
EXECUTE FUNCTION sync_conversation_has_case();

-- 4. Sincronizar has_case para conversas existentes (idempotente)
-- Atualiza baseado no estado real dos casos
UPDATE conversations c
SET has_case = EXISTS (
  SELECT 1 FROM cases 
  WHERE conversation_id = c.id 
  AND status != 'encerrado'
);

-- 5. Adicionar comentários para documentação
COMMENT ON COLUMN conversations.has_case IS 
'Indica se a conversa possui pelo menos um caso ativo (status != encerrado). Atualizado automaticamente via triggers.';

-- ============================================================================
-- VALIDAÇÃO DA MIGRATION
-- ============================================================================
-- Testes que devem passar após aplicar esta migration:
--
-- 1. Criar caso ativo → has_case = true
-- 2. Encerrar único caso ativo → has_case = false
-- 3. Criar segundo caso ativo na mesma conversa → ERRO (violação de índice único)
-- 4. Criar caso ativo após encerrar anterior → SUCESSO
-- 5. Deletar único caso ativo → has_case = false
-- 6. Alterar conversation_id de caso → has_case sincronizado em ambas conversas
-- ============================================================================

-- FIM DA MIGRATION
