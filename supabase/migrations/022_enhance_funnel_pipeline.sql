-- ============================================================================
-- MIGRATION: Aprofundar e padronizar o funil de atendimento
-- ============================================================================
-- Objetivo: Adicionar campos para métricas de funil, padronizar stages e
-- permitir rastreamento detalhado de conversão e tempo em cada etapa.
-- ============================================================================

-- ============================================================================
-- 1. ADICIONAR CAMPOS DE FUNIL DETALHADO À TABELA conversations
-- ============================================================================

-- Padronizar funnel_stage com valores bem definidos
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS funnel_stage_updated_at TIMESTAMPTZ;

-- Adicionar campos para rastreamento de tempo em cada etapa
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS intake_started_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS intake_completed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS proposal_sent_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS action_filed_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS case_closed_at TIMESTAMPTZ;

-- Adicionar campo para rastrear se há caso jurídico associado
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS has_case BOOLEAN DEFAULT false;

-- Adicionar campo para indicar se está em atendimento humano
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS human_assigned_at TIMESTAMPTZ;

-- ============================================================================
-- 2. ATUALIZAR COMENTÁRIOS COM VALORES PADRONIZADOS
-- ============================================================================

COMMENT ON COLUMN conversations.funnel_stage IS 
'Etapas padronizadas do funil: 
- lead_novo: primeiro contato, antes de intake
- intake_em_andamento: cliente respondendo perguntas de triagem
- intake_concluido: triagem finalizada, caso qualificado
- proposta_enviada: proposta de serviço enviada ao cliente
- contrato_assinado: contrato assinado, caso ativo
- acao_protocolada: ação judicial protocolada
- aguardando_decisao: aguardando decisão judicial
- encerrado: caso finalizado/encerrado';

COMMENT ON COLUMN conversations.funnel_stage_updated_at IS 'Data/hora da última mudança de funnel_stage';

-- ============================================================================
-- 3. CRIAR TABELA DE HISTÓRICO DE FUNIL (para auditoria e métricas)
-- ============================================================================

CREATE TABLE IF NOT EXISTS funnel_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_stage VARCHAR(50),
  to_stage VARCHAR(50) NOT NULL,
  changed_by VARCHAR(255),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE funnel_history IS 'Histórico de mudanças de etapa do funil para auditoria e análise de conversão';

CREATE INDEX IF NOT EXISTS idx_funnel_history_conversation ON funnel_history(conversation_id);
CREATE INDEX IF NOT EXISTS idx_funnel_history_to_stage ON funnel_history(to_stage);
CREATE INDEX IF NOT EXISTS idx_funnel_history_created_at ON funnel_history(created_at);

-- ============================================================================
-- 4. CRIAR FUNÇÃO PARA REGISTRAR MUDANÇAS DE FUNIL
-- ============================================================================

CREATE OR REPLACE FUNCTION log_funnel_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.funnel_stage IS DISTINCT FROM NEW.funnel_stage THEN
    INSERT INTO funnel_history (conversation_id, from_stage, to_stage, changed_by)
    VALUES (NEW.id, OLD.funnel_stage, NEW.funnel_stage, 'system');
    
    NEW.funnel_stage_updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. CRIAR TRIGGER PARA REGISTRAR MUDANÇAS DE FUNIL
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_funnel_stage_change ON conversations;
CREATE TRIGGER trigger_funnel_stage_change
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION log_funnel_stage_change();

-- ============================================================================
-- 6. CRIAR VIEW PARA MÉTRICAS DE FUNIL
-- ============================================================================

CREATE OR REPLACE VIEW funnel_metrics AS
SELECT 
  funnel_stage,
  COUNT(*) as total_count,
  COUNT(CASE WHEN has_case THEN 1 END) as with_case_count,
  COUNT(CASE WHEN mode = 'human' THEN 1 END) as human_mode_count,
  ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(closed_at, NOW()) - created_at)) / 86400)::numeric, 2) as avg_days_in_stage
FROM conversations
GROUP BY funnel_stage
ORDER BY 
  CASE funnel_stage
    WHEN 'lead_novo' THEN 1
    WHEN 'intake_em_andamento' THEN 2
    WHEN 'intake_concluido' THEN 3
    WHEN 'proposta_enviada' THEN 4
    WHEN 'contrato_assinado' THEN 5
    WHEN 'acao_protocolada' THEN 6
    WHEN 'aguardando_decisao' THEN 7
    WHEN 'encerrado' THEN 8
    ELSE 99
  END;

-- ============================================================================
-- 7. CRIAR VIEW PARA TAXA DE CONVERSÃO
-- ============================================================================

CREATE OR REPLACE VIEW funnel_conversion_rates AS
WITH stage_counts AS (
  SELECT 
    funnel_stage,
    COUNT(*) as count,
    ROW_NUMBER() OVER (ORDER BY 
      CASE funnel_stage
        WHEN 'lead_novo' THEN 1
        WHEN 'intake_em_andamento' THEN 2
        WHEN 'intake_concluido' THEN 3
        WHEN 'proposta_enviada' THEN 4
        WHEN 'contrato_assinado' THEN 5
        WHEN 'acao_protocolada' THEN 6
        WHEN 'aguardando_decisao' THEN 7
        WHEN 'encerrado' THEN 8
        ELSE 99
      END) as stage_order
  FROM conversations
  GROUP BY funnel_stage
)
SELECT 
  sc.funnel_stage,
  sc.count,
  ROUND((sc.count::numeric / (SELECT count FROM stage_counts WHERE stage_order = 1) * 100)::numeric, 2) as conversion_from_first,
  ROUND((LAG(sc.count) OVER (ORDER BY sc.stage_order) - sc.count)::numeric / NULLIF(LAG(sc.count) OVER (ORDER BY sc.stage_order), 0) * 100, 2) as drop_rate_from_previous
FROM stage_counts sc
ORDER BY sc.stage_order;

-- ============================================================================
-- 8. CRIAR ÍNDICES ADICIONAIS PARA PERFORMANCE
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_conversations_funnel_stage_updated ON conversations(funnel_stage_updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_has_case ON conversations(has_case);
CREATE INDEX IF NOT EXISTS idx_conversations_intake_completed ON conversations(intake_completed_at);
CREATE INDEX IF NOT EXISTS idx_conversations_contract_signed ON conversations(contract_signed_at);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Resumo:
-- ✓ Adicionados campos de timestamp para cada etapa do funil
-- ✓ Criada tabela funnel_history para auditoria de mudanças
-- ✓ Criada função e trigger para registrar automaticamente mudanças de stage
-- ✓ Criadas views para métricas de funil e taxas de conversão
-- ✓ Adicionados índices para melhor performance
--
-- Valores padronizados de funnel_stage:
-- lead_novo, intake_em_andamento, intake_concluido, proposta_enviada,
-- contrato_assinado, acao_protocolada, aguardando_decisao, encerrado
-- ============================================================================
