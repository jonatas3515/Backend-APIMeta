-- Adiciona campo para marcar conversas como sigilosas (LGPD)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confidential BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_conversations_confidential ON conversations(confidential);
