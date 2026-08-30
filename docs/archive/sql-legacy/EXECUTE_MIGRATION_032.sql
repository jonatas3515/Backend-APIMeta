-- Execute this in Supabase SQL Editor to add assigned_user_id column

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user_id 
ON conversations(assigned_user_id);

SELECT 'Migration 032 executada com sucesso!' as status;
