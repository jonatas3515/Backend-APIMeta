-- ============================================================================
-- MIGRATION: Criar tabela case_insights para Central de Conhecimento
-- ============================================================================

-- ============================================================================
-- 1. CRIAR TABELA case_insights
-- ============================================================================

CREATE TABLE IF NOT EXISTS case_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES cases(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Chaves de classificação
  legal_area VARCHAR(100),
  case_type VARCHAR(100),
  municipality VARCHAR(255),
  agency VARCHAR(255),
  client_role VARCHAR(100),
  
  -- Conteúdo do insight
  summary TEXT,
  strategy_notes TEXT,
  risk_notes TEXT,
  outcome_notes TEXT,
  similar_patterns TEXT,
  
  -- Metadados
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'ai_assisted')),
  
  -- Segurança
  confidential BOOLEAN DEFAULT false,
  confidential_reason VARCHAR(255)
);

COMMENT ON TABLE case_insights IS 'Central de conhecimento: insights de casos encerrados para reutilização em novos atendimentos';
COMMENT ON COLUMN case_insights.case_id IS 'Referência ao caso (opcional se não houver case formal)';
COMMENT ON COLUMN case_insights.conversation_id IS 'Referência à conversa (obrigatório)';
COMMENT ON COLUMN case_insights.summary IS 'Visão geral do caso e problema principal';
COMMENT ON COLUMN case_insights.strategy_notes IS 'Principais estratégias usadas ou recomendadas';
COMMENT ON COLUMN case_insights.risk_notes IS 'Riscos jurídicos/probatórios observados';
COMMENT ON COLUMN case_insights.outcome_notes IS 'Resultado do caso (acordo, procedência, improcedência, etc.)';
COMMENT ON COLUMN case_insights.similar_patterns IS 'Padrões recorrentes observados';
COMMENT ON COLUMN case_insights.source IS 'manual: criado manualmente, ai_assisted: gerado com IA';
COMMENT ON COLUMN case_insights.confidential IS 'Se true, apenas admin/advogado podem ver';

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
-- 2. CRIAR TABELA insight_usage (para rastrear quando insights são consultados)
-- ============================================================================

CREATE TABLE IF NOT EXISTS insight_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  insight_id UUID NOT NULL REFERENCES case_insights(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL CHECK (action IN ('view', 'apply', 'reference')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE insight_usage IS 'Rastreamento de uso de insights (para métricas de reutilização)';
COMMENT ON COLUMN insight_usage.action IS 'view: consultado, apply: aplicado em novo caso, reference: usado como referência';

CREATE INDEX IF NOT EXISTS idx_insight_usage_insight ON insight_usage(insight_id);
CREATE INDEX IF NOT EXISTS idx_insight_usage_conversation ON insight_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_insight_usage_user ON insight_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_insight_usage_created_at ON insight_usage(created_at);

-- ============================================================================
-- 3. VIEW PARA INSIGHTS SIMILARES
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

COMMENT ON VIEW similar_insights IS 'View para encontrar insights similares (não confidenciais)';

-- ============================================================================
-- 4. TRIGGER PARA updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_case_insights_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_case_insights_updated_at ON case_insights;
CREATE TRIGGER trigger_case_insights_updated_at
BEFORE UPDATE ON case_insights
FOR EACH ROW
EXECUTE FUNCTION update_case_insights_timestamp();

-- ============================================================================
-- 5. TRIGGER PARA AUDITORIA DE INSIGHTS
-- ============================================================================

CREATE OR REPLACE FUNCTION audit_case_insights_changes()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      NEW.created_by_user_id,
      'case_insight',
      NEW.id,
      'create',
      NULL,
      NEW.summary,
      jsonb_build_object('legal_area', NEW.legal_area, 'case_type', NEW.case_type)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.summary IS DISTINCT FROM NEW.summary 
       OR OLD.strategy_notes IS DISTINCT FROM NEW.strategy_notes
       OR OLD.risk_notes IS DISTINCT FROM NEW.risk_notes
       OR OLD.outcome_notes IS DISTINCT FROM NEW.outcome_notes THEN
      PERFORM log_audit(
        NULL,
        'case_insight',
        NEW.id,
        'update',
        OLD.summary,
        NEW.summary,
        jsonb_build_object('field', 'content')
      );
    END IF;
    
    IF OLD.confidential IS DISTINCT FROM NEW.confidential THEN
      PERFORM log_audit(
        NULL,
        'case_insight',
        NEW.id,
        'update_confidential',
        OLD.confidential::text,
        NEW.confidential::text,
        jsonb_build_object('reason', NEW.confidential_reason)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_audit_case_insights_changes ON case_insights;
CREATE TRIGGER trigger_audit_case_insights_changes
AFTER INSERT OR UPDATE ON case_insights
FOR EACH ROW
EXECUTE FUNCTION audit_case_insights_changes();

-- ============================================================================
-- 6. FUNÇÃO PARA ENCONTRAR INSIGHTS SIMILARES
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

COMMENT ON FUNCTION find_similar_insights IS 'Encontra insights similares baseado em critérios de classificação';

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Resumo:
-- ✓ Tabela case_insights com campos de classificação e conteúdo
-- ✓ Tabela insight_usage para rastrear reutilização
-- ✓ View similar_insights para encontrar insights similares
-- ✓ Trigger automático para auditoria
-- ✓ Função find_similar_insights para buscar insights similares
-- ✓ Suporte a confidencialidade
-- ============================================================================
