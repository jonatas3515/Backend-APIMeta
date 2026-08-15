-- ============================================================================
-- MIGRATION: Filtro Global por Área Jurídica
-- ============================================================================

-- Preferência do usuário
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_legal_area VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_users_preferred_legal_area ON users(preferred_legal_area);

-- Índices para performance de filtros por área
CREATE INDEX IF NOT EXISTS idx_cases_legal_area ON cases(legal_area);
CREATE INDEX IF NOT EXISTS idx_conversations_legal_area ON conversations(legal_area);
CREATE INDEX IF NOT EXISTS idx_case_insights_legal_area ON case_insights(legal_area);
