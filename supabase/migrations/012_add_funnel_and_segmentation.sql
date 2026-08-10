-- ============================================================================
-- MIGRATION: Adicionar funil de atendimento, segmentação e dados do cliente
-- ============================================================================

-- Campos de funil de atendimento
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS funnel_stage VARCHAR(50) DEFAULT 'intake';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS campaign VARCHAR(100);

-- Campos de segmentação geográfica e institucional
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS municipality VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS state VARCHAR(50);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS organ VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS position VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_public_employee BOOLEAN DEFAULT false;

-- Campos de dados do caso (intake coletado pelo bot)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS case_type VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS case_summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS intake_data JSONB DEFAULT '{}';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pending_documents TEXT[];
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS next_due_date DATE;

-- Comentários
COMMENT ON COLUMN conversations.funnel_stage IS 'Etapas: intake, qualificacao, proposta, contrato, andamento, pos_caso';
COMMENT ON COLUMN conversations.source IS 'Origem do lead: whatsapp_organico, facebook, instagram, indicacao, etc';
COMMENT ON COLUMN conversations.campaign IS 'Campanha de marketing/tráfego';
COMMENT ON COLUMN conversations.intake_data IS 'Dados coletados pelo bot em formato JSON';
COMMENT ON COLUMN conversations.pending_documents IS 'Lista de documentos pendentes';

-- Índices
CREATE INDEX IF NOT EXISTS idx_conversations_funnel_stage ON conversations(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_conversations_source ON conversations(source);
CREATE INDEX IF NOT EXISTS idx_conversations_campaign ON conversations(campaign);
CREATE INDEX IF NOT EXISTS idx_conversations_municipality ON conversations(municipality);
CREATE INDEX IF NOT EXISTS idx_conversations_organ ON conversations(organ);
CREATE INDEX IF NOT EXISTS idx_conversations_first_contact_at ON conversations(first_contact_at);
CREATE INDEX IF NOT EXISTS idx_conversations_converted_at ON conversations(converted_at);

-- Tabela de lembretes automáticos
CREATE TABLE IF NOT EXISTS chat_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  client_phone VARCHAR(50),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255),
  message TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status VARCHAR(20) DEFAULT 'pending',
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_reminders_conversation ON chat_reminders(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_reminders_status ON chat_reminders(status);
CREATE INDEX IF NOT EXISTS idx_chat_reminders_scheduled ON chat_reminders(scheduled_for);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS trigger_chat_reminders_updated_at ON chat_reminders;
CREATE TRIGGER trigger_chat_reminders_updated_at
  BEFORE UPDATE ON chat_reminders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
