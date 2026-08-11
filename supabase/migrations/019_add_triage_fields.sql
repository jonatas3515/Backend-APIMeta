-- ============================================================================
-- MIGRATION: Adicionar campos estruturados de triagem jurídica
-- ============================================================================
-- Adiciona colunas faltantes para triagem: agency e client_role.
-- As colunas legal_area, case_type, municipality e outras já existem
-- nas migrations 011 e 012.
-- ============================================================================

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS agency VARCHAR(100);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS client_role VARCHAR(100);

COMMENT ON COLUMN conversations.agency IS 'Entidade/órgão envolvido: prefeitura, camara, autarquia, empresa privada, etc';
COMMENT ON COLUMN conversations.client_role IS 'Papel do cliente: servidor efetivo, contratado, comissionado, empregado CLT, empregador, etc';

CREATE INDEX IF NOT EXISTS idx_conversations_agency ON conversations(agency);
CREATE INDEX IF NOT EXISTS idx_conversations_client_role ON conversations(client_role);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
