-- ============================================================================
-- MIGRATION: Criar tabela de casos jurídicos com prazos
-- ============================================================================

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  legal_area VARCHAR(100),
  case_type VARCHAR(100),
  municipality VARCHAR(100),
  agency VARCHAR(100),
  client_role VARCHAR(100),
  status VARCHAR(50) DEFAULT 'prospect',
  priority VARCHAR(20) DEFAULT 'media',
  deadline_date DATE,
  deadline_type VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE cases IS 'Casos jurídicos associados a conversas, com prazos e status';
COMMENT ON COLUMN cases.status IS 'prospect, em_analise, proposta_enviada, contrato_assinado, acao_protocolada, aguardando_decisao, encerrado';
COMMENT ON COLUMN cases.priority IS 'baixa, media, alta';
COMMENT ON COLUMN cases.deadline_type IS 'prazo_para_ajuizar_acao, prazo_para_recurso, data_de_audiencia, prazo_para_resposta_administrativa, outro';

CREATE INDEX idx_cases_conversation_id ON cases(conversation_id);
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_deadline_date ON cases(deadline_date);
CREATE INDEX idx_cases_priority ON cases(priority);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_cases_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cases_update_timestamp
BEFORE UPDATE ON cases
FOR EACH ROW
EXECUTE FUNCTION update_cases_timestamp();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
