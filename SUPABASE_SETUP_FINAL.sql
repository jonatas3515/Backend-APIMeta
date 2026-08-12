-- ============================================================================
-- SUPABASE SETUP FINAL - Autenticação Robusta com Supabase Auth
-- ============================================================================
-- Execute este arquivo APÓS a migration 031_create_users_table.sql
-- ============================================================================

-- 1. Função para validar role
CREATE OR REPLACE FUNCTION validate_role(role_value TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN role_value IN ('admin', 'advogado', 'estagiario');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 2. Função para obter hierarquia de role
CREATE OR REPLACE FUNCTION get_role_level(role_value TEXT)
RETURNS INTEGER AS $$
BEGIN
  CASE role_value
    WHEN 'admin' THEN RETURN 3;
    WHEN 'advogado' THEN RETURN 2;
    WHEN 'estagiario' THEN RETURN 1;
    ELSE RETURN 0;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. Função para verificar permissão mínima
CREATE OR REPLACE FUNCTION has_minimum_role(user_role TEXT, minimum_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_role_level(user_role) >= get_role_level(minimum_role);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 4. Função para auditoria de usuários
CREATE OR REPLACE FUNCTION audit_user_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, entity_type, entity_id, action, new_value, details, created_at)
    VALUES (
      NEW.id,
      'user',
      NEW.id,
      'create',
      NEW.name || ' (' || NEW.role || ')',
      jsonb_build_object(
        'email', NEW.email,
        'role', NEW.role,
        'is_active', NEW.is_active
      ),
      NOW()
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role != NEW.role OR OLD.is_active != NEW.is_active THEN
      INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_value, new_value, details, created_at)
      VALUES (
        NEW.id,
        'user',
        NEW.id,
        'update',
        OLD.role || ' (active: ' || OLD.is_active || ')',
        NEW.role || ' (active: ' || NEW.is_active || ')',
        jsonb_build_object(
          'email', NEW.email,
          'role_changed', OLD.role != NEW.role,
          'active_changed', OLD.is_active != NEW.is_active
        ),
        NOW()
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger para auditoria de usuários
DROP TRIGGER IF EXISTS trigger_audit_user_changes ON users;
CREATE TRIGGER trigger_audit_user_changes
AFTER INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION audit_user_changes();

-- 6. View: usuários ativos
CREATE OR REPLACE VIEW active_users AS
SELECT id, name, email, role, auth_user_id, created_at, updated_at
FROM users
WHERE is_active = true
ORDER BY name;

-- 7. View: hierarquia de usuários
CREATE OR REPLACE VIEW user_hierarchy AS
SELECT 
  id,
  name,
  email,
  role,
  get_role_level(role) as role_level,
  is_active,
  created_at
FROM users
ORDER BY get_role_level(role) DESC, name;

-- ============================================================================
-- VERIFICAÇÃO FINAL
-- ============================================================================
SELECT 'Setup completo!' as status;
SELECT COUNT(*) as total_users FROM users;
SELECT COUNT(*) as total_active FROM active_users;
