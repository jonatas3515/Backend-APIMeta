-- ============================================================================
-- MIGRATION 049: Tabelas de referência de preços (OAB / Escritório)
-- ============================================================================
-- Aditiva, reversível (DROP IF EXISTS) e sem alterar tabelas existentes.
-- Permite fazer upload de tabelas de preços para consulta futura.
-- ============================================================================

DROP TABLE IF EXISTS fee_uploaded_tables;

CREATE TABLE fee_uploaded_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  table_type VARCHAR(20) NOT NULL CHECK (table_type IN ('oab', 'escritorio')),
  source_file_name VARCHAR(255),
  file_url TEXT,
  table_data JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fee_uploaded_tables IS 'Tabelas de referência de preços enviadas via upload (OAB ou escritório)';
COMMENT ON COLUMN fee_uploaded_tables.table_type IS 'oab (Tabela da OAB) ou escritorio (valores cobrados pelo escritório)';

CREATE INDEX idx_fee_uploaded_tables_type ON fee_uploaded_tables(table_type);
CREATE INDEX idx_fee_uploaded_tables_active ON fee_uploaded_tables(is_active);

CREATE OR REPLACE FUNCTION update_fee_uploaded_tables_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fee_uploaded_tables_update_timestamp
BEFORE UPDATE ON fee_uploaded_tables
FOR EACH ROW EXECUTE FUNCTION update_fee_uploaded_tables_timestamp();

ALTER TABLE fee_uploaded_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY fee_uploaded_tables_select_all ON fee_uploaded_tables
  FOR SELECT USING (true);

CREATE POLICY fee_uploaded_tables_admin_modify ON fee_uploaded_tables
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

GRANT SELECT ON fee_uploaded_tables TO authenticated;
GRANT INSERT, UPDATE, DELETE ON fee_uploaded_tables TO authenticated;
