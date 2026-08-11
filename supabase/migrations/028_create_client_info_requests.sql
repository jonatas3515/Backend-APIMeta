-- ============================================================================
-- MIGRATION: Criar tabela para rastrear requisições de informação do cliente
-- ============================================================================

CREATE TABLE IF NOT EXISTS client_info_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  intent_type VARCHAR(50) NOT NULL CHECK (intent_type IN ('summary', 'status', 'documents')),
  request_text TEXT,
  response_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE client_info_requests IS 'Rastreia requisições de informação do cliente (resumo, status, documentos)';
COMMENT ON COLUMN client_info_requests.intent_type IS 'summary: resumo do caso, status: andamento, documents: documentos faltantes';
COMMENT ON COLUMN client_info_requests.request_text IS 'Texto original da requisição do cliente';
COMMENT ON COLUMN client_info_requests.response_text IS 'Resposta gerada automaticamente';

CREATE INDEX IF NOT EXISTS idx_client_info_requests_conversation ON client_info_requests(conversation_id);
CREATE INDEX IF NOT EXISTS idx_client_info_requests_case ON client_info_requests(case_id);
CREATE INDEX IF NOT EXISTS idx_client_info_requests_intent ON client_info_requests(intent_type);
CREATE INDEX IF NOT EXISTS idx_client_info_requests_created_at ON client_info_requests(created_at DESC);

-- ============================================================================
-- TRIGGER PARA updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_client_info_requests_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_client_info_requests_updated_at ON client_info_requests;
CREATE TRIGGER trigger_client_info_requests_updated_at
BEFORE UPDATE ON client_info_requests
FOR EACH ROW
EXECUTE FUNCTION update_client_info_requests_timestamp();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
