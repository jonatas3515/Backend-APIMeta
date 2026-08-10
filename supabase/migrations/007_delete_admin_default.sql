-- ============================================================================
-- MIGRATION: Deletar usuário admin padrão (SEGURANÇA)
-- ============================================================================

-- Remove o usuário admin padrão por questões de segurança
-- Execute isso SOMENTE DEPOIS de criar seu próprio usuário!

DELETE FROM chat_admin_users 
WHERE username = 'admin' 
AND password_hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
