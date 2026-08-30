-- ============================================================================
-- SCRIPT ÚNICO: Criar tabelas de Documentos, Rotinas e Insights
-- Execute no SQL Editor do Supabase
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

CREATE INDEX IF NOT EXISTS idx_routine_executions_conversation ON routine_executions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_routine_executions_case ON routine_executions(case_id);
CREATE INDEX IF NOT EXISTS idx_routine_executions_routine ON routine_executions(routine_id);
CREATE INDEX IF NOT EXISTS idx_routine_executions_status ON routine_executions(status);

-- ============================================================================
-- 5. TABELA: case_insights
-- ============================================================================
CREATE TABLE IF NOT EXISTS case_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  legal_area VARCHAR(100),
  case_type VARCHAR(100),
  municipality VARCHAR(255),
  agency VARCHAR(255),
  client_role VARCHAR(100),
  summary TEXT,
  strategy_notes TEXT,
  risk_notes TEXT,
  outcome_notes TEXT,
  similar_patterns TEXT,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'ai_assisted')),
  confidential BOOLEAN DEFAULT false,
  confidential_reason VARCHAR(255)
);

COMMENT ON TABLE case_insights IS 'Central de conhecimento: insights de casos encerrados';

CREATE INDEX IF NOT EXISTS idx_case_insights_case ON case_insights(case_id);
CREATE INDEX IF NOT EXISTS idx_case_insights_conversation ON case_insights(conversation_id);
CREATE INDEX IF NOT EXISTS idx_case_insights_legal_area ON case_insights(legal_area);
CREATE INDEX IF NOT EXISTS idx_case_insights_case_type ON case_insights(case_type);
CREATE INDEX IF NOT EXISTS idx_case_insights_municipality ON case_insights(municipality);
CREATE INDEX IF NOT EXISTS idx_case_insights_agency ON case_insights(agency);
CREATE INDEX IF NOT EXISTS idx_case_insights_client_role ON case_insights(client_role);
CREATE INDEX IF NOT EXISTS idx_case_insights_created_by ON case_insights(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_case_insights_confidential ON case_insights(confidential);
CREATE INDEX IF NOT EXISTS idx_case_insights_created_at ON case_insights(created_at DESC);

-- ============================================================================
-- 6. TABELA: insight_usage
-- ============================================================================
CREATE TABLE IF NOT EXISTS insight_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id UUID NOT NULL REFERENCES case_insights(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('view', 'apply', 'reference')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insight_usage_insight ON insight_usage(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_usage_conversation ON insight_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_insight_usage_user ON insight_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_insight_usage_created_at ON insight_usage(created_at);

-- ============================================================================
-- 7. VIEW: similar_insights
-- ============================================================================
CREATE OR REPLACE VIEW similar_insights AS
SELECT 
  ci1.id as insight_id,
  ci1.legal_area,
  ci1.case_type,
  ci1.municipality,
  ci1.agency,
  ci1.client_role,
  ci1.summary,
  ci1.created_at,
  COUNT(iu.id) as usage_count
FROM case_insights ci1
LEFT JOIN insight_usage iu ON iu.insight_id = ci1.id
WHERE ci1.confidential = false
GROUP BY ci1.id, ci1.legal_area, ci1.case_type, ci1.municipality, ci1.agency, ci1.client_role, ci1.summary, ci1.created_at
ORDER BY ci1.created_at DESC;

-- ============================================================================
-- 8. TRIGGERS para updated_at
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

CREATE OR REPLACE FUNCTION update_case_insights_timestamp()
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

DROP TRIGGER IF EXISTS trigger_case_insights_updated_at ON case_insights;
CREATE TRIGGER trigger_case_insights_updated_at
BEFORE UPDATE ON case_insights
FOR EACH ROW
EXECUTE FUNCTION update_case_insights_timestamp();

-- ============================================================================
-- 9. FUNÇÃO find_similar_insights
-- ============================================================================
CREATE OR REPLACE FUNCTION find_similar_insights(
  p_legal_area VARCHAR,
  p_case_type VARCHAR,
  p_municipality VARCHAR,
  p_agency VARCHAR,
  p_client_role VARCHAR,
  p_limit INT DEFAULT 5
)
RETURNS TABLE (
  insight_id UUID,
  legal_area VARCHAR,
  case_type VARCHAR,
  municipality VARCHAR,
  agency VARCHAR,
  client_role VARCHAR,
  summary TEXT,
  strategy_notes TEXT,
  risk_notes TEXT,
  outcome_notes TEXT,
  similar_patterns TEXT,
  created_at TIMESTAMPTZ,
  match_score INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ci.id,
    ci.legal_area,
    ci.case_type,
    ci.municipality,
    ci.agency,
    ci.client_role,
    ci.summary,
    ci.strategy_notes,
    ci.risk_notes,
    ci.outcome_notes,
    ci.similar_patterns,
    ci.created_at,
    (
      (CASE WHEN ci.legal_area = p_legal_area THEN 2 ELSE 0 END) +
      (CASE WHEN ci.case_type = p_case_type THEN 2 ELSE 0 END) +
      (CASE WHEN ci.municipality = p_municipality THEN 1 ELSE 0 END) +
      (CASE WHEN ci.agency = p_agency THEN 1 ELSE 0 END) +
      (CASE WHEN ci.client_role = p_client_role THEN 1 ELSE 0 END)
    ) as match_score
  FROM case_insights ci
  WHERE ci.confidential = false
    AND (
      ci.legal_area = p_legal_area
      OR ci.case_type = p_case_type
      OR ci.municipality = p_municipality
      OR ci.agency = p_agency
    )
  ORDER BY match_score DESC, ci.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICAÇÃO
-- ============================================================================
SELECT 'document_templates' as tabela, COUNT(*) as registros FROM document_templates
UNION ALL
SELECT 'legal_routines', COUNT(*) FROM legal_routines
UNION ALL
SELECT 'generated_documents', COUNT(*) FROM generated_documents
UNION ALL
SELECT 'routine_executions', COUNT(*) FROM routine_executions
UNION ALL
SELECT 'case_insights', COUNT(*) FROM case_insights
UNION ALL
SELECT 'insight_usage', COUNT(*) FROM insight_usage;
