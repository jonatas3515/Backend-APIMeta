-- ============================================================================
-- MIGRATION: Criar tabelas de templates de documentos e rotinas jurídicas
-- ============================================================================

-- ============================================================================
-- 1. TABELA: document_templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  legal_area VARCHAR(100),
  case_type VARCHAR(100),
  template_text TEXT NOT NULL,
  placeholders TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE document_templates IS 'Templates de documentos reutilizáveis por área jurídica e tipo de caso';
COMMENT ON COLUMN document_templates.name IS 'Nome do template (ex: Petição Inicial - Licença Prêmio)';
COMMENT ON COLUMN document_templates.legal_area IS 'Área jurídica (ex: Direito Trabalhista)';
COMMENT ON COLUMN document_templates.case_type IS 'Tipo de caso (ex: Licença Prêmio)';
COMMENT ON COLUMN document_templates.template_text IS 'Texto com placeholders como {{client_name}}, {{municipality}}, {{case_summary}}';
COMMENT ON COLUMN document_templates.placeholders IS 'Array de placeholders usados no template';

CREATE INDEX IF NOT EXISTS idx_document_templates_legal_area ON document_templates(legal_area);
CREATE INDEX IF NOT EXISTS idx_document_templates_case_type ON document_templates(case_type);
CREATE INDEX IF NOT EXISTS idx_document_templates_is_active ON document_templates(is_active);

-- ============================================================================
-- 2. TABELA: legal_routines
-- ============================================================================
CREATE TABLE IF NOT EXISTS legal_routines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  legal_area VARCHAR(100) NOT NULL,
  case_type VARCHAR(100),
  funnel_stage VARCHAR(50),
  steps JSONB DEFAULT '[]',
  documents_to_generate TEXT[],
  reminders_to_create JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  created_by VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE legal_routines IS 'Rotinas jurídicas automatizadas por área e tipo de caso';
COMMENT ON COLUMN legal_routines.name IS 'Nome da rotina (ex: Rotina Licença Prêmio)';
COMMENT ON COLUMN legal_routines.legal_area IS 'Área jurídica obrigatória';
COMMENT ON COLUMN legal_routines.case_type IS 'Tipo de caso (opcional, para filtrar melhor)';
COMMENT ON COLUMN legal_routines.funnel_stage IS 'Etapa do funil em que a rotina se aplica';
COMMENT ON COLUMN legal_routines.steps IS 'Array de passos/instruções da rotina';
COMMENT ON COLUMN legal_routines.documents_to_generate IS 'Array de IDs de templates a gerar';
COMMENT ON COLUMN legal_routines.reminders_to_create IS 'Array de lembretes a criar (com prazos)';

CREATE INDEX IF NOT EXISTS idx_legal_routines_legal_area ON legal_routines(legal_area);
CREATE INDEX IF NOT EXISTS idx_legal_routines_case_type ON legal_routines(case_type);
CREATE INDEX IF NOT EXISTS idx_legal_routines_funnel_stage ON legal_routines(funnel_stage);
CREATE INDEX IF NOT EXISTS idx_legal_routines_is_active ON legal_routines(is_active);

-- ============================================================================
-- 3. TABELA: generated_documents
-- ============================================================================
CREATE TABLE IF NOT EXISTS generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  template_id UUID NOT NULL REFERENCES document_templates(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE generated_documents IS 'Documentos gerados a partir de templates';
COMMENT ON COLUMN generated_documents.status IS 'draft, review, approved, sent';

CREATE INDEX IF NOT EXISTS idx_generated_documents_conversation ON generated_documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_case ON generated_documents(case_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_status ON generated_documents(status);

-- ============================================================================
-- 4. TABELA: routine_executions
-- ============================================================================
CREATE TABLE IF NOT EXISTS routine_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  routine_id UUID NOT NULL REFERENCES legal_routines(id) ON DELETE RESTRICT,
  status VARCHAR(50) DEFAULT 'pending',
  documents_generated TEXT[],
  reminders_created TEXT[],
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE routine_executions IS 'Histórico de execução de rotinas';
COMMENT ON COLUMN routine_executions.status IS 'pending, in_progress, completed, failed';

CREATE INDEX IF NOT EXISTS idx_routine_executions_conversation ON routine_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_routine_executions_case ON routine_executions(case_id);
CREATE INDEX IF NOT EXISTS idx_routine_executions_routine ON routine_executions(routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_executions_status ON routine_executions(status);

-- ============================================================================
-- 5. TRIGGERS para updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_document_templates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_legal_routines_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_generated_documents_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_routine_executions_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_document_templates_updated_at ON document_templates;
CREATE TRIGGER trigger_document_templates_updated_at
BEFORE UPDATE ON document_templates
FOR EACH ROW
EXECUTE FUNCTION update_document_templates_timestamp();

DROP TRIGGER IF EXISTS trigger_legal_routines_updated_at ON legal_routines;
CREATE TRIGGER trigger_legal_routines_updated_at
BEFORE UPDATE ON legal_routines
FOR EACH ROW
EXECUTE FUNCTION update_legal_routines_timestamp();

DROP TRIGGER IF EXISTS trigger_generated_documents_updated_at ON generated_documents;
CREATE TRIGGER trigger_generated_documents_updated_at
BEFORE UPDATE ON generated_documents
FOR EACH ROW
EXECUTE FUNCTION update_generated_documents_timestamp();

DROP TRIGGER IF EXISTS trigger_routine_executions_updated_at ON routine_executions;
CREATE TRIGGER trigger_routine_executions_updated_at
BEFORE UPDATE ON routine_executions
FOR EACH ROW
EXECUTE FUNCTION update_routine_executions_timestamp();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Resumo:
-- ✓ Tabela document_templates para templates reutilizáveis
-- ✓ Tabela legal_routines para rotinas por área/tipo/stage
-- ✓ Tabela generated_documents para documentos gerados
-- ✓ Tabela routine_executions para histórico de execução
-- ✓ Triggers automáticos para updated_at
-- ✓ Índices para performance
-- ============================================================================
