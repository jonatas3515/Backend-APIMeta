-- ============================================================================
-- MIGRATION: Adicionar camada de LGPD e retenção de dados
-- ============================================================================

-- ============================================================================
-- 1. REFORÇAR COLUNA confidential EM conversations
-- ============================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confidential_reason VARCHAR(255);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confidential_marked_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS confidential_marked_at TIMESTAMPTZ;

COMMENT ON COLUMN conversations.confidential_reason IS 'Motivo da marcação como confidencial (ex: assédio, denúncia, tema sensível)';
COMMENT ON COLUMN conversations.confidential_marked_by IS 'Usuário que marcou como confidencial';
COMMENT ON COLUMN conversations.confidential_marked_at IS 'Data/hora da marcação';

CREATE INDEX IF NOT EXISTS idx_conversations_confidential ON conversations(confidential);
CREATE INDEX IF NOT EXISTS idx_conversations_confidential_marked_at ON conversations(confidential_marked_at);

-- ============================================================================
-- 2. CRIAR TABELA data_retention_policy
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_retention_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  entity_type VARCHAR(50) NOT NULL,
  retention_days INTEGER NOT NULL,
  action_on_expiry VARCHAR(50) NOT NULL CHECK (action_on_expiry IN ('anonymize', 'delete')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE data_retention_policy IS 'Políticas de retenção de dados por tipo de entidade';
COMMENT ON COLUMN data_retention_policy.entity_type IS 'conversation, lead, message, etc.';
COMMENT ON COLUMN data_retention_policy.action_on_expiry IS 'anonymize: remove dados pessoais, delete: apagar completamente';

CREATE INDEX IF NOT EXISTS idx_data_retention_entity_type ON data_retention_policy(entity_type);
CREATE INDEX IF NOT EXISTS idx_data_retention_is_active ON data_retention_policy(is_active);

-- ============================================================================
-- 3. CRIAR TABELA anonymized_data
-- ============================================================================

CREATE TABLE IF NOT EXISTS anonymized_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_entity_type VARCHAR(50) NOT NULL,
  original_entity_id UUID NOT NULL,
  anonymized_at TIMESTAMPTZ DEFAULT NOW(),
  reason VARCHAR(255),
  anonymized_by UUID REFERENCES users(id) ON DELETE SET NULL,
  backup_hash VARCHAR(255)
);

COMMENT ON TABLE anonymized_data IS 'Registro de dados que foram anonimizados (para auditoria)';
COMMENT ON COLUMN anonymized_data.backup_hash IS 'Hash dos dados originais (para verificação)';

CREATE INDEX IF NOT EXISTS idx_anonymized_data_entity ON anonymized_data(original_entity_type, original_entity_id);
CREATE INDEX IF NOT EXISTS idx_anonymized_data_anonymized_at ON anonymized_data(anonymized_at);

-- ============================================================================
-- 4. CRIAR TABELA consent_logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS consent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  consent_type VARCHAR(100) NOT NULL,
  value BOOLEAN NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE consent_logs IS 'Registro de consentimentos do cliente (LGPD)';
COMMENT ON COLUMN consent_logs.consent_type IS 'marketing, data_processing, etc.';
COMMENT ON COLUMN consent_logs.ip_address IS 'IP de onde veio o consentimento';

CREATE INDEX IF NOT EXISTS idx_consent_logs_conversation ON consent_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_consent_logs_consent_type ON consent_logs(consent_type);
CREATE INDEX IF NOT EXISTS idx_consent_logs_created_at ON consent_logs(created_at);

-- ============================================================================
-- 5. ADICIONAR COLUNA À TABELA messages PARA SENSIBILIDADE
-- ============================================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sensitive_reason VARCHAR(255);

COMMENT ON COLUMN messages.is_sensitive IS 'true se mensagem contém dados sensíveis';
COMMENT ON COLUMN messages.sensitive_reason IS 'Motivo da marcação (ex: dados bancários, SSN, etc.)';

CREATE INDEX IF NOT EXISTS idx_messages_is_sensitive ON messages(is_sensitive);

-- ============================================================================
-- 6. VIEW PARA LEADS EXPIRADOS
-- ============================================================================

CREATE OR REPLACE VIEW expired_leads AS
SELECT 
  c.id,
  c.client_name,
  c.client_phone,
  c.lead_created_at,
  c.lead_last_contact_at,
  EXTRACT(DAY FROM NOW() - c.lead_last_contact_at) as days_since_last_contact,
  drp.retention_days,
  drp.action_on_expiry
FROM conversations c
LEFT JOIN data_retention_policy drp ON drp.entity_type = 'lead' AND drp.is_active = true
WHERE c.is_client = false
  AND c.lead_last_contact_at IS NOT NULL
  AND EXTRACT(DAY FROM NOW() - c.lead_last_contact_at) > COALESCE(drp.retention_days, 180)
ORDER BY c.lead_last_contact_at ASC;

COMMENT ON VIEW expired_leads IS 'Leads que expiraram conforme política de retenção';

-- ============================================================================
-- 7. TRIGGERS PARA AUDITORIA AUTOMÁTICA
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_conversation_changes()
RETURNS TRIGGER AS $$
BEGIN
  -- Log quando status muda
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_audit(
      NULL,
      'conversation',
      NEW.id,
      'update_status',
      OLD.status,
      NEW.status,
      jsonb_build_object('field', 'status')
    );
  END IF;

  -- Log quando assigned_user_id muda
  IF OLD.assigned_user_id IS DISTINCT FROM NEW.assigned_user_id THEN
    PERFORM log_audit(
      NULL,
      'conversation',
      NEW.id,
      'change_assigned_user',
      OLD.assigned_user_id::text,
      NEW.assigned_user_id::text,
      jsonb_build_object('field', 'assigned_user_id')
    );
  END IF;

  -- Log quando confidential muda
  IF OLD.confidential IS DISTINCT FROM NEW.confidential THEN
    PERFORM log_audit(
      NEW.confidential_marked_by,
      'conversation',
      NEW.id,
      'mark_confidential',
      OLD.confidential::text,
      NEW.confidential::text,
      jsonb_build_object('reason', NEW.confidential_reason)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_conversation_changes ON conversations;
CREATE TRIGGER trigger_audit_conversation_changes
AFTER UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION audit_conversation_changes();

-- ============================================================================
-- 8. FUNÇÃO PARA ANONIMIZAR LEAD
-- ============================================================================

CREATE OR REPLACE FUNCTION anonymize_lead(p_conversation_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS BOOLEAN AS $$
DECLARE
  v_client_name_hash VARCHAR(255);
BEGIN
  -- Calcula hash dos dados originais
  SELECT md5(client_name || client_phone)
  INTO v_client_name_hash
  FROM conversations
  WHERE id = p_conversation_id;

  -- Registra anonimização
  INSERT INTO anonymized_data (original_entity_type, original_entity_id, reason, backup_hash)
  VALUES ('conversation', p_conversation_id, p_reason, v_client_name_hash);

  -- Anonimiza dados
  UPDATE conversations
  SET 
    client_name = 'Cliente Anonimizado',
    client_phone = NULL,
    municipality = NULL,
    agency = NULL,
    client_role = NULL
  WHERE id = p_conversation_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Resumo:
-- ✓ Campos confidential_reason, confidential_marked_by, confidential_marked_at
-- ✓ Tabela data_retention_policy para políticas de retenção
-- ✓ Tabela anonymized_data para auditoria de anonimizações
-- ✓ Tabela consent_logs para registro de consentimentos (LGPD)
-- ✓ Campos is_sensitive e sensitive_reason em messages
-- ✓ View expired_leads para leads que expiraram
-- ✓ Trigger automático para auditoria de mudanças
-- ✓ Função anonymize_lead para anonimizar dados
-- ============================================================================
