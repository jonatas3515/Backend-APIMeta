-- Script para corrigir status de mensagens antigas
-- Execute este script no Supabase SQL Editor

-- 1. Atualizar mensagens enviadas (outbound) que não têm status
UPDATE messages
SET status = 'sent'
WHERE direction = 'outbound'
  AND status IS NULL
  AND created_at < NOW();

-- 2. Atualizar mensagens enviadas que têm wa_message_id mas status está como 'pending'
UPDATE messages
SET status = 'sent'
WHERE direction = 'outbound'
  AND status = 'pending'
  AND wa_message_id IS NOT NULL;

-- 3. Verificar quantas mensagens foram atualizadas
SELECT 
  direction,
  status,
  COUNT(*) as total
FROM messages
WHERE direction = 'outbound'
GROUP BY direction, status
ORDER BY direction, status;
