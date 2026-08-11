-- ============================================================================
-- MIGRATION: Adicionar módulo de usuários, atribuição e colaboração
-- ============================================================================

-- ============================================================================
-- 1. CRIAR/APRIMORAR TABELA users (se não existir)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  role VARCHAR(50) DEFAULT 'estagiario' CHECK (role IN ('admin', 'advogado', 'estagiario')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE users IS 'Usuários do sistema (advogados, estagiários, admins)';
COMMENT ON COLUMN users.role IS 'admin: acesso total, advogado: gerencia casos, estagiario: suporte';

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- ============================================================================
-- 2. ADICIONAR CAMPOS À TABELA conversations
-- ============================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_client BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_created_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS lead_last_contact_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.assigned_user_id IS 'Usuário responsável pelo atendimento';
COMMENT ON COLUMN conversations.is_client IS 'true se virou cliente, false se é apenas lead';
COMMENT ON COLUMN conversations.lead_created_at IS 'Data de criação do lead';
COMMENT ON COLUMN conversations.lead_last_contact_at IS 'Data do último contato com o lead';

CREATE INDEX IF NOT EXISTS idx_conversations_assigned_user ON conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_is_client ON conversations(is_client);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_last_contact ON conversations(lead_last_contact_at);

-- ============================================================================
-- 3. ADICIONAR CAMPOS À TABELA cases
-- ============================================================================

ALTER TABLE cases ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN cases.assigned_user_id IS 'Usuário responsável pelo caso';

CREATE INDEX IF NOT EXISTS idx_cases_assigned_user ON cases(assigned_user_id);

-- ============================================================================
-- 4. ADICIONAR CAMPO À TABELA messages
-- ============================================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS human_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

COMMENT ON COLUMN messages.human_user_id IS 'Usuário humano que respondeu a mensagem (quando sender_type = human)';

CREATE INDEX IF NOT EXISTS idx_messages_human_user ON messages(human_user_id);

-- ============================================================================
-- 5. CRIAR TABELA internal_notes
-- ============================================================================

CREATE TABLE IF NOT EXISTS internal_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  is_visible_to_client BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE internal_notes IS 'Notas internas sobre conversas/casos (visíveis ou não ao cliente)';
COMMENT ON COLUMN internal_notes.is_visible_to_client IS 'Se true, nota é compartilhada com cliente; se false, é apenas interna';

CREATE INDEX IF NOT EXISTS idx_internal_notes_conversation ON internal_notes(conversation_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_case ON internal_notes(case_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_user ON internal_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_created_at ON internal_notes(created_at DESC);

-- ============================================================================
-- 6. CRIAR TABELA audit_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(100) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Trilha de auditoria de operações críticas';
COMMENT ON COLUMN audit_logs.entity_type IS 'conversation, case, message, user, etc.';
COMMENT ON COLUMN audit_logs.action IS 'update_status, mark_confidential, change_assigned_user, etc.';
COMMENT ON COLUMN audit_logs.user_id IS 'Quem fez a ação (NULL se foi sistema/bot)';

CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- 7. TRIGGERS para updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_users_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_internal_notes_timestamp()
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
EXECUTE FUNCTION update_users_timestamp();

DROP TRIGGER IF EXISTS trigger_internal_notes_updated_at ON internal_notes;
CREATE TRIGGER trigger_internal_notes_updated_at
BEFORE UPDATE ON internal_notes
FOR EACH ROW
EXECUTE FUNCTION update_internal_notes_timestamp();

-- ============================================================================
-- 8. FUNÇÃO PARA REGISTRAR AUDIT LOG
-- ============================================================================

CREATE OR REPLACE FUNCTION log_audit(
  p_user_id UUID,
  p_entity_type VARCHAR,
  p_entity_id UUID,
  p_action VARCHAR,
  p_old_value TEXT DEFAULT NULL,
  p_new_value TEXT DEFAULT NULL,
  p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO audit_logs (user_id, entity_type, entity_id, action, old_value, new_value, details)
  VALUES (p_user_id, p_entity_type, p_entity_id, p_action, p_old_value, p_new_value, p_details)
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Resumo:
-- ✓ Tabela users com roles (admin, advogado, estagiario)
-- ✓ Campos assigned_user_id em conversations e cases
-- ✓ Campo human_user_id em messages
-- ✓ Campos is_client, lead_created_at, lead_last_contact_at em conversations
-- ✓ Tabela internal_notes para notas internas/visíveis
-- ✓ Tabela audit_logs para trilha de auditoria
-- ✓ Função log_audit para registrar operações críticas
-- ============================================================================
