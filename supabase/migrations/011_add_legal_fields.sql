-- ============================================================================
-- MIGRATION: Adicionar campos jurídicos para organização profissional
-- ============================================================================

-- Adicionar campos de classificação jurídica na tabela conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS legal_area VARCHAR(50);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS legal_situation VARCHAR(50);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_status VARCHAR(50) DEFAULT 'lead';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived_by VARCHAR(255);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255);

-- Comentários para documentação
COMMENT ON COLUMN conversations.legal_area IS 'Área jurídica: trabalhista, previdenciario, civel, consumidor, administrativo';
COMMENT ON COLUMN conversations.legal_situation IS 'Situação: consulta_rapida, potencial_acao, acompanhamento_processo, caso_encerrado';
COMMENT ON COLUMN conversations.client_status IS 'Status: lead, cliente_ativo, cliente_antigo, caso_recusado';
COMMENT ON COLUMN conversations.tags IS 'Tags para classificação adicional';
COMMENT ON COLUMN conversations.archived IS 'Se a conversa foi arquivada';
COMMENT ON COLUMN conversations.priority IS 'Prioridade: baixa, normal, alta, urgente';
COMMENT ON COLUMN conversations.assigned_to IS 'Advogado responsável';

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_conversations_legal_area ON conversations(legal_area);
CREATE INDEX IF NOT EXISTS idx_conversations_legal_situation ON conversations(legal_situation);
CREATE INDEX IF NOT EXISTS idx_conversations_client_status ON conversations(client_status);
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(archived);
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations(priority);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_to ON conversations(assigned_to);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
