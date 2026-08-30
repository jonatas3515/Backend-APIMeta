-- ============================================================================
-- REMOVE: Trigger de auditoria que depende de audit_logs
-- ============================================================================
-- Execute este arquivo para remover o trigger problemático
-- ============================================================================

-- Remover o trigger de auditoria
DROP TRIGGER IF EXISTS trigger_audit_user_changes ON users;

-- Remover a função de auditoria
DROP FUNCTION IF EXISTS audit_user_changes();

-- Verificar que foi removido
SELECT 'Trigger removido com sucesso!' as status;
