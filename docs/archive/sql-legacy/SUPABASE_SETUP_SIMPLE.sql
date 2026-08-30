-- ============================================================================
-- SUPABASE SETUP SIMPLES - Sem dependência de audit_logs
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

-- 4. View: usuários ativos
CREATE OR REPLACE VIEW active_users AS
SELECT id, name, email, role, auth_user_id, created_at, updated_at
FROM users
WHERE is_active = true
ORDER BY name;

-- 5. View: hierarquia de usuários
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
