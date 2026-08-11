-- Adiciona colunas para filtros e arquivamento de conversas
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS unread BOOLEAN DEFAULT true;

-- Índices para filtros rápidos
CREATE INDEX IF NOT EXISTS idx_conversations_archived ON conversations(archived);
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations(unread);
