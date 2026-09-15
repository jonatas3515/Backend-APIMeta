-- ============================================================================
-- MIGRATION 059: Tabela temporária de estado da simulação trabalhista
-- ============================================================================
-- Armazena o estado de multi-turn do cálculo de verbas trabalhistas.
-- Regras:
-- - O conteúdo sensível (salário, datas, motivo etc.) fica em protected_payload,
--   que deve ser cifrado pela aplicação antes de ser persistido.
-- - Não armazena texto original da mensagem, resposta da IA nem prompts.
-- - RLS ativo, acessível apenas por service_role, com acesso controlado
--   exclusivamente por funções server-side autorizadas.
-- - A aplicação deve validar que a conversa pertence ao contexto autorizado
--   antes de ler, salvar ou excluir o estado.
-- - ON DELETE CASCADE garante eliminação do estado junto com a conversa.
-- - expires_at impede retenção prolongada de PII.
-- ============================================================================

-- Tabela de estado da simulação trabalhista
CREATE TABLE IF NOT EXISTS conversation_labor_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT false,
  intent VARCHAR(50),
  status VARCHAR(50) NOT NULL DEFAULT 'idle',
  asked_fields TEXT[] NOT NULL DEFAULT '{}',
  protected_payload TEXT NOT NULL
    CHECK (protected_payload ~ '^[0-9a-fA-F]{32}:[0-9a-fA-F]{32}:[0-9a-fA-F]+$'),
  last_message_hash VARCHAR(64),
  flow_version VARCHAR(20) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE conversation_labor_states IS
  'Estado temporário da simulação de verbas trabalhistas. O payload sensível deve ser cifrado pela aplicação.';
COMMENT ON COLUMN conversation_labor_states.protected_payload IS
  'JSON cifrado (AES-256-GCM) com os dados coletados (salário, datas, motivo etc.).';
COMMENT ON COLUMN conversation_labor_states.last_message_hash IS
  'Hash da última mensagem processada, para idempotência. Não armazena o texto original.';
COMMENT ON COLUMN conversation_labor_states.expires_at IS
  'Momento de expiração do estado; a aplicação deve descartar linhas vencidas.';

-- Índices
CREATE INDEX IF NOT EXISTS idx_conversation_labor_states_conversation_id
  ON conversation_labor_states(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_labor_states_expires_at
  ON conversation_labor_states(expires_at);

-- Trigger para atualizar updated_at
DROP TRIGGER IF EXISTS trigger_conversation_labor_states_updated_at ON conversation_labor_states;
CREATE TRIGGER trigger_conversation_labor_states_updated_at
  BEFORE UPDATE ON conversation_labor_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE conversation_labor_states ENABLE ROW LEVEL SECURITY;

-- Aviso: service_role bypassa RLS. Esta policy intencionalmente restringe
-- o acesso a funções que possuem a chave de serviço, mas a aplicação ainda
-- deve validar o escopo da conversa antes de qualquer operação.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_labor_states'
      AND policyname = 'conversation_labor_states_service_role_only'
  ) THEN
    CREATE POLICY conversation_labor_states_service_role_only
      ON conversation_labor_states
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Garante que não exista acesso anônimo/publico/autenticado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_labor_states'
      AND policyname = 'conversation_labor_states_no_anon'
  ) THEN
    CREATE POLICY conversation_labor_states_no_anon
      ON conversation_labor_states
      FOR ALL
      TO anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'conversation_labor_states'
      AND policyname = 'conversation_labor_states_no_authenticated'
  ) THEN
    CREATE POLICY conversation_labor_states_no_authenticated
      ON conversation_labor_states
      FOR ALL
      TO authenticated
      USING (false)
      WITH CHECK (false);
  END IF;
END $$;
