-- ============================================================================
-- MIGRATION 047: Simulador interno de honorários advocatícios
-- ============================================================================
-- Aditiva, reversível (DROP IF EXISTS) e sem alterar tabelas existentes.
-- Nunca expõe valores internos ao cliente.
-- ============================================================================

-- ============================================================================
-- 1. TABELA DE SERVIÇOS DE HONORÁRIOS
-- ============================================================================

DROP TABLE IF EXISTS fee_simulations;
DROP TABLE IF EXISTS fee_adjustment_rules;
DROP TABLE IF EXISTS fee_service_catalog;

CREATE TABLE fee_service_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  legal_area VARCHAR(100) NOT NULL,
  case_type VARCHAR(100),
  description TEXT,
  base_amount NUMERIC(12,2) NOT NULL,
  min_amount NUMERIC(12,2) NOT NULL,
  max_amount NUMERIC(12,2) NOT NULL,
  billing_model VARCHAR(50) NOT NULL DEFAULT 'fixo',
  success_fee_percent NUMERIC(5,2) DEFAULT 0,
  default_installments INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  reference_source VARCHAR(50) DEFAULT 'tabela_interna',
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fee_service_catalog IS 'Tabela interna de referência de honorários advocatícios';
COMMENT ON COLUMN fee_service_catalog.base_amount IS 'Valor-base do serviço';
COMMENT ON COLUMN fee_service_catalog.billing_model IS 'fixo, percentual, entrada_parcelas, por_etapa, sob_consulta';

CREATE INDEX idx_fee_services_legal_area ON fee_service_catalog(legal_area);
CREATE INDEX idx_fee_services_case_type ON fee_service_catalog(case_type);
CREATE INDEX idx_fee_services_active ON fee_service_catalog(is_active);

-- ============================================================================
-- 2. TABELA DE REGRAS DE AJUSTE
-- ============================================================================

CREATE TABLE fee_adjustment_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES fee_service_catalog(id) ON DELETE CASCADE,
  rule_type VARCHAR(50) NOT NULL,
  rule_value VARCHAR(100) NOT NULL,
  adjustment_kind VARCHAR(20) NOT NULL DEFAULT 'percentual',
  adjustment_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fee_adjustment_rules IS 'Regras de ajuste de honorários por serviço';
COMMENT ON COLUMN fee_adjustment_rules.rule_type IS 'complexidade, urgencia, etapa, volume_documental, deslocamento, desconto';
COMMENT ON COLUMN fee_adjustment_rules.adjustment_kind IS 'percentual ou valor_fixo';

CREATE INDEX idx_fee_rules_service ON fee_adjustment_rules(service_id);
CREATE INDEX idx_fee_rules_active ON fee_adjustment_rules(is_active);

-- ============================================================================
-- 3. TABELA DE SIMULAÇÕES
-- ============================================================================

CREATE TABLE fee_simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES fee_service_catalog(id) ON DELETE RESTRICT,
  status VARCHAR(50) NOT NULL DEFAULT 'rascunho',
  complexity VARCHAR(20),
  urgency VARCHAR(20),
  service_stage VARCHAR(50),
  document_volume VARCHAR(20),
  estimated_economic_value NUMERIC(14,2),
  base_amount NUMERIC(12,2) NOT NULL,
  adjustments_snapshot JSONB DEFAULT '[]',
  suggested_amount NUMERIC(12,2) NOT NULL,
  min_amount_snapshot NUMERIC(12,2) NOT NULL,
  max_amount_snapshot NUMERIC(12,2) NOT NULL,
  final_amount NUMERIC(12,2),
  billing_model VARCHAR(50),
  down_payment NUMERIC(12,2),
  installments_count INTEGER,
  installment_amount NUMERIC(12,2),
  success_fee_percent NUMERIC(5,2),
  internal_notes TEXT,
  out_of_range_justification TEXT,
  proposal_valid_until DATE,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  generated_proposal_document_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fee_simulations IS 'Simulações internas de honorários (nunca enviadas automaticamente)';
COMMENT ON COLUMN fee_simulations.status IS 'rascunho, aguardando_aprovacao, aprovada, rejeitada, expirada, substituida, convertida_em_proposta';

CREATE INDEX idx_fee_simulations_case ON fee_simulations(case_id);
CREATE INDEX idx_fee_simulations_status ON fee_simulations(status);
CREATE INDEX idx_fee_simulations_created_by ON fee_simulations(created_by);

-- ============================================================================
-- 4. TRIGGERS DE updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_fee_service_catalog_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_fee_adjustment_rules_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_fee_simulations_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fee_service_catalog_update_timestamp
BEFORE UPDATE ON fee_service_catalog
FOR EACH ROW EXECUTE FUNCTION update_fee_service_catalog_timestamp();

CREATE TRIGGER fee_adjustment_rules_update_timestamp
BEFORE UPDATE ON fee_adjustment_rules
FOR EACH ROW EXECUTE FUNCTION update_fee_adjustment_rules_timestamp();

CREATE TRIGGER fee_simulations_update_timestamp
BEFORE UPDATE ON fee_simulations
FOR EACH ROW EXECUTE FUNCTION update_fee_simulations_timestamp();

-- ============================================================================
-- 5. RLS
-- ============================================================================

ALTER TABLE fee_service_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_adjustment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_simulations ENABLE ROW LEVEL SECURITY;

-- Serviços: todos podem ver, só admin altera
CREATE POLICY fee_service_catalog_select_all ON fee_service_catalog
  FOR SELECT USING (true);

CREATE POLICY fee_service_catalog_admin_modify ON fee_service_catalog
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Regras: todos podem ver ativas, só admin altera
CREATE POLICY fee_adjustment_rules_select_active ON fee_adjustment_rules
  FOR SELECT USING (true);

CREATE POLICY fee_adjustment_rules_admin_modify ON fee_adjustment_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Simulações: admin vê todas; advogado vê casos de conversas atribuídas a ele ou onde foi criador
CREATE POLICY fee_simulations_select ON fee_simulations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
        AND (u.role = 'admin' OR fee_simulations.created_by = u.id)
    )
    OR
    EXISTS (
      SELECT 1 FROM users u
      JOIN cases c ON c.id = fee_simulations.case_id
      JOIN conversations conv ON conv.id = c.conversation_id
      WHERE u.auth_user_id = auth.uid()
        AND u.role = 'advogado'
        AND conv.assigned_user_id = u.id
    )
  );

CREATE POLICY fee_simulations_modify ON fee_simulations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_user_id = auth.uid()
        AND (u.role IN ('admin', 'advogado') OR fee_simulations.created_by = u.id)
    )
  );

-- ============================================================================
-- 6. GRANTS
-- ============================================================================

GRANT SELECT ON fee_service_catalog TO authenticated;
GRANT SELECT ON fee_adjustment_rules TO authenticated;
GRANT SELECT ON fee_simulations TO authenticated;

GRANT INSERT, UPDATE, DELETE ON fee_service_catalog TO authenticated;
GRANT INSERT, UPDATE, DELETE ON fee_adjustment_rules TO authenticated;
GRANT INSERT, UPDATE, DELETE ON fee_simulations TO authenticated;

-- ============================================================================
-- FIM
-- ============================================================================
