-- Adiciona coluna paused_until para controle de automação temporária
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS paused_until TIMESTAMP WITH TIME ZONE;

-- Adiciona índice para buscar conversas que precisam reativar
CREATE INDEX IF NOT EXISTS idx_conversations_paused_until 
  ON conversations(paused_until) 
  WHERE paused_until IS NOT NULL;
