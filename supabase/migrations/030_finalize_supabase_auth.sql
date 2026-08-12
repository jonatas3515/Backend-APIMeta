-- Migration 030: Finalizar Supabase Auth
-- Adiciona índices, constraints e funções para autenticação robusta

-- Índice em auth_user_id para buscas rápidas
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- Índice em role para filtros
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Índice em is_active para listagens
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Constraint: email único
ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE(email) ON CONFLICT DO NOTHING;

-- Constraint: auth_user_id único (quando preenchido)
ALTER TABLE users ADD CONSTRAINT users_auth_user_id_unique UNIQUE(auth_user_id) ON CONFLICT DO NOTHING;

-- Função para validar role
CREATE OR REPLACE FUNCTION validate_role(role_value TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN role_value IN ('admin', 'advogado', 'estagiario');
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Constraint: validar role
ALTER TABLE users ADD CONSTRAINT users_role_valid 
  CHECK (validate_role(role)) ON CONFLICT DO NOTHING;

-- Função para obter hierarquia de role
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

-- Função para verificar se um role tem permissão mínima
CREATE OR REPLACE FUNCTION has_minimum_role(user_role TEXT, minimum_role TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN get_role_level(user_role) >= get_role_level(minimum_role);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para atualizar updated_at em users
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_users_updated_at ON users;
CREATE TRIGGER trigger_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_users_updated_at();

-- Função para registrar auditoria de usuários
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

DROP TRIGGER IF EXISTS trigger_audit_user_changes ON users;
CREATE TRIGGER trigger_audit_user_changes
AFTER INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION audit_user_changes();

-- View: usuários ativos
CREATE OR REPLACE VIEW active_users AS
SELECT id, name, email, role, auth_user_id, created_at, updated_at
FROM users
WHERE is_active = true
ORDER BY name;

-- View: hierarquia de usuários (admin > advogado > estagiario)
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

-- Permissões RLS (se necessário)
-- ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY users_select_own ON users FOR SELECT USING (auth.uid()::text = auth_user_id);
-- CREATE POLICY users_admin_all ON users FOR ALL USING (auth.jwt() ->> 'role' = 'admin');

-- Comentários para documentação
COMMENT ON TABLE users IS 'Tabela de usuários com integração Supabase Auth';
COMMENT ON COLUMN users.auth_user_id IS 'ID do usuário no Supabase Auth (UUID)';
COMMENT ON COLUMN users.role IS 'Papel do usuário: admin, advogado, estagiario';
COMMENT ON COLUMN users.is_active IS 'Indica se usuário pode fazer login';
COMMENT ON FUNCTION validate_role(TEXT) IS 'Valida se role é um dos valores permitidos';
COMMENT ON FUNCTION get_role_level(TEXT) IS 'Retorna nível numérico do role (admin=3, advogado=2, estagiario=1)';
COMMENT ON FUNCTION has_minimum_role(TEXT, TEXT) IS 'Verifica se um role tem permissão mínima';
