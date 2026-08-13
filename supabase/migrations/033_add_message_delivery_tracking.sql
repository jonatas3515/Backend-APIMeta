-- ============================================================================
-- MIGRATION 033: Rastreamento de entrega de mensagens WhatsApp
-- ============================================================================

-- Adicionar campos para rastrear ID da mensagem no WhatsApp, status e erro
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS wa_message_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS error_info JSONB;

-- Comentários
COMMENT ON COLUMN messages.wa_message_id IS 'ID da mensagem no WhatsApp Cloud API (wamid)';
COMMENT ON COLUMN messages.status IS 'Status de entrega: pending, sent, delivered, read, failed';
COMMENT ON COLUMN messages.error_info IS 'Detalhes do erro caso a entrega falhe';

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_messages_wa_message_id ON messages(wa_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
