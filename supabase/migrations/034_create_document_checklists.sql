-- ============================================================================
-- MIGRATION 034: Checklist de documentos por caso
-- ============================================================================

--- 1. Tabela de templates de checklist por tipo de caso
CREATE TABLE IF NOT EXISTS document_checklist_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_type VARCHAR(100) NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  required BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (case_type, document_name)
);

COMMENT ON TABLE document_checklist_templates IS 'Templates de documentos necessários por tipo de caso';
COMMENT ON COLUMN document_checklist_templates.case_type IS 'Tipo de caso (ex: Ação Trabalhista, Benefício Previdenciário)';
COMMENT ON COLUMN document_checklist_templates.document_name IS 'Nome do documento exigido';
COMMENT ON COLUMN document_checklist_templates.required IS 'Se o documento é obrigatório para o caso';

--- 2. Tabela de checklist por caso
CREATE TABLE IF NOT EXISTS case_document_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  document_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'received', 'verified')),
  received_at TIMESTAMP WITH TIME ZONE,
  received_by UUID REFERENCES users(id) ON DELETE SET NULL,
  media_url TEXT,
  media_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE case_document_checklists IS 'Checklist de documentos vinculado a cada caso';
COMMENT ON COLUMN case_document_checklists.status IS 'pending, sent, received, verified';
COMMENT ON COLUMN case_document_checklists.received_by IS 'Usuário que marcou o documento como recebido';
COMMENT ON COLUMN case_document_checklists.media_url IS 'URL do arquivo anexado (WhatsApp ou upload)';

--- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_document_checklist_templates_case_type 
  ON document_checklist_templates(case_type);
CREATE INDEX IF NOT EXISTS idx_case_document_checklists_case_id 
  ON case_document_checklists(case_id);
CREATE INDEX IF NOT EXISTS idx_case_document_checklists_status 
  ON case_document_checklists(status);
CREATE INDEX IF NOT EXISTS idx_case_document_checklists_case_status 
  ON case_document_checklists(case_id, status);

--- 4. Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_document_checklist_templates_updated_at ON document_checklist_templates;
CREATE TRIGGER trigger_update_document_checklist_templates_updated_at
  BEFORE UPDATE ON document_checklist_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_case_document_checklists_updated_at ON case_document_checklists;
CREATE TRIGGER trigger_update_case_document_checklists_updated_at
  BEFORE UPDATE ON case_document_checklists
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
