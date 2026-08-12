-- Migration 032: Adicionar coluna assigned_user_id em conversations
-- Esta coluna permite rastrear qual usuário está responsável pela conversa

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user_id 
ON conversations(assigned_user_id);

-- Log
SELECT 'Migration 032: Coluna assigned_user_id adicionada com sucesso' as status;
