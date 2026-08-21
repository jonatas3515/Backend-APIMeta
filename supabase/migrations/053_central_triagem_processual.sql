-- ============================================================================
-- 053 - Central de Triagem Processual
-- ============================================================================
-- Implementação #15: Central de Prazos e Triagem Jurídica de Movimentações
-- Ajustes obrigatórios aplicados conforme especificação do usuário
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ADICIONAR CAMPOS DE TRIAGEM EM process_movements
-- ----------------------------------------------------------------------------
ALTER TABLE public.process_movements 
  ADD COLUMN IF NOT EXISTS triage_status TEXT DEFAULT 'novo' 
    CHECK (triage_status IN ('novo','em_analise','revisado','ignorado','convertido_em_nota','convertido_em_lembrete','convertido_em_agenda')),
  ADD COLUMN IF NOT EXISTS legal_classification TEXT DEFAULT 'ainda_nao_classificada'
    CHECK (legal_classification IN (
      'ainda_nao_classificada','intimacao','prazo_potencial','audiencia',
      'pericia','despacho','decisao','sentenca','juntada','peticao',
      'citacao','acordo','baixa_arquivado','movimentacao_administrativa',
      'duplicada','irrelevante','outro'
    )),
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'media'
    CHECK (priority IN ('baixa','media','alta','urgente')),
  ADD COLUMN IF NOT EXISTS assigned_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triage_notes TEXT,
  ADD COLUMN IF NOT EXISTS suggested_classification TEXT,
  ADD COLUMN IF NOT EXISTS suggested_priority TEXT,
  ADD COLUMN IF NOT EXISTS reminder_id UUID REFERENCES public.chat_reminders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS note_id UUID REFERENCES public.internal_notes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agenda_event_id UUID REFERENCES public.case_events(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triaged_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS triaged_at TIMESTAMPTZ;

COMMENT ON COLUMN public.process_movements.triage_status IS 'Status de triagem: novo, em_analise, revisado, ignorado';
COMMENT ON COLUMN public.process_movements.legal_classification IS 'Classificação jurídica da movimentação';
COMMENT ON COLUMN public.process_movements.priority IS 'Prioridade: baixa, media, alta, urgente';
COMMENT ON COLUMN public.process_movements.suggested_classification IS 'Sugestão automática de classificação (não definitiva)';
COMMENT ON COLUMN public.process_movements.suggested_priority IS 'Sugestão automática de prioridade (não definitiva)';
COMMENT ON COLUMN public.process_movements.reminder_id IS 'FK para chat_reminders se foi criado lembrete';
COMMENT ON COLUMN public.process_movements.note_id IS 'FK para internal_notes se foi criada nota';
COMMENT ON COLUMN public.process_movements.agenda_event_id IS 'FK para case_events se foi criado evento de agenda';

-- ----------------------------------------------------------------------------
-- 2. ÍNDICES PARA PERFORMANCE
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_process_movements_triage_status 
  ON public.process_movements(triage_status) WHERE triage_status IN ('novo','em_analise');
CREATE INDEX IF NOT EXISTS idx_process_movements_priority 
  ON public.process_movements(priority) WHERE priority IN ('alta','urgente');
CREATE INDEX IF NOT EXISTS idx_process_movements_legal_classification 
  ON public.process_movements(legal_classification);
CREATE INDEX IF NOT EXISTS idx_process_movements_assigned_user 
  ON public.process_movements(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_process_movements_movement_date 
  ON public.process_movements(movement_date DESC);
CREATE INDEX IF NOT EXISTS idx_process_movements_detected_at 
  ON public.process_movements(detected_at DESC);

-- ----------------------------------------------------------------------------
-- 3. TABELA DE HISTÓRICO DE TRIAGEM (AUDITORIA)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.triage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID NOT NULL REFERENCES public.process_movements(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  old_classification TEXT,
  new_classification TEXT,
  old_priority TEXT,
  new_priority TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.triage_history IS 'Histórico de auditoria de ações de triagem (sem PII ou texto integral)';
COMMENT ON COLUMN public.triage_history.action IS 'Ação realizada: update_status, update_classification, update_priority, assign_user, create_note, create_reminder, create_event';

CREATE INDEX IF NOT EXISTS idx_triage_history_movement 
  ON public.triage_history(movement_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_history_user 
  ON public.triage_history(user_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 4. RLS PARA triage_history
-- ----------------------------------------------------------------------------
ALTER TABLE public.triage_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS triage_history_select ON public.triage_history;
CREATE POLICY triage_history_select
  ON public.triage_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() 
      AND u.role IN ('admin','advogado')
    )
  );

DROP POLICY IF EXISTS triage_history_insert ON public.triage_history;
CREATE POLICY triage_history_insert
  ON public.triage_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() 
      AND u.role IN ('admin','advogado')
    )
  );

GRANT SELECT, INSERT ON public.triage_history TO authenticated;

-- ----------------------------------------------------------------------------
-- 5. ATUALIZAR RLS DE process_movements PARA TRIAGEM
-- ----------------------------------------------------------------------------
-- Estagiários NÃO podem ver todas as movimentações
-- Apenas admin e advogado podem acessar a Central de Triagem

DROP POLICY IF EXISTS process_movements_select ON public.process_movements;
CREATE POLICY process_movements_select
  ON public.process_movements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.case_processes cp
      JOIN public.cases c ON c.id = cp.case_id
      WHERE cp.id = process_movements.case_process_id
      AND (
        EXISTS (
          SELECT 1 FROM public.users u
          WHERE u.auth_user_id = auth.uid() 
          AND (u.role IN ('admin','advogado') OR u.id = c.assigned_user_id)
        )
      )
    )
  );

DROP POLICY IF EXISTS process_movements_update ON public.process_movements;
CREATE POLICY process_movements_update
  ON public.process_movements
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() 
      AND u.role IN ('admin','advogado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() 
      AND u.role IN ('admin','advogado')
    )
  );

-- ----------------------------------------------------------------------------
-- 6. FUNÇÃO PARA SUGERIR CLASSIFICAÇÃO (APENAS SUGESTÃO)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.suggest_movement_classification(movement_text TEXT)
RETURNS TABLE(classification TEXT, priority TEXT) AS $$
DECLARE
  text_lower TEXT := lower(COALESCE(movement_text, ''));
BEGIN
  -- IMPORTANTE: Esta é apenas uma SUGESTÃO baseada em palavras-chave
  -- NÃO gera conclusão jurídica automática
  -- Usuário deve confirmar antes de utilizar
  
  -- Intimação
  IF text_lower ~ 'intima(ção|cao|r|do|da)' THEN
    RETURN QUERY SELECT 'intimacao'::TEXT, 'alta'::TEXT;
  -- Audiência
  ELSIF text_lower ~ 'audi[eê]ncia|designa(ção|cao) de audi' THEN
    RETURN QUERY SELECT 'audiencia'::TEXT, 'urgente'::TEXT;
  -- Perícia
  ELSIF text_lower ~ 'per[ií]cia|laudo' THEN
    RETURN QUERY SELECT 'pericia'::TEXT, 'media'::TEXT;
  -- Sentença
  ELSIF text_lower ~ 'senten[çc]a|julga(do|mento)' THEN
    RETURN QUERY SELECT 'sentenca'::TEXT, 'alta'::TEXT;
  -- Decisão
  ELSIF text_lower ~ 'decis[ãa]o|deferi(do|mento)|indeferi(do|mento)' THEN
    RETURN QUERY SELECT 'decisao'::TEXT, 'alta'::TEXT;
  -- Despacho
  ELSIF text_lower ~ 'despacho' THEN
    RETURN QUERY SELECT 'despacho'::TEXT, 'media'::TEXT;
  -- Juntada
  ELSIF text_lower ~ 'junta(da|do)|anexa(do|r)' THEN
    RETURN QUERY SELECT 'juntada'::TEXT, 'baixa'::TEXT;
  -- Petição
  ELSIF text_lower ~ 'peti[çc][ãa]o' THEN
    RETURN QUERY SELECT 'peticao'::TEXT, 'baixa'::TEXT;
  -- Citação
  ELSIF text_lower ~ 'cita[çc][ãa]o|citar' THEN
    RETURN QUERY SELECT 'citacao'::TEXT, 'alta'::TEXT;
  -- Acordo
  ELSIF text_lower ~ 'acordo|homologa[çc][ãa]o de acordo|concilia[çc][ãa]o' THEN
    RETURN QUERY SELECT 'acordo'::TEXT, 'media'::TEXT;
  -- Baixa/Arquivado
  ELSIF text_lower ~ 'baixa|arquiva(do|mento)|encerra(do|mento)' THEN
    RETURN QUERY SELECT 'baixa_arquivado'::TEXT, 'baixa'::TEXT;
  -- Movimentação administrativa
  ELSIF text_lower ~ 'distribu[ií](do|[çc][ãa]o)|remessa|conclus[ãa]o' THEN
    RETURN QUERY SELECT 'movimentacao_administrativa'::TEXT, 'baixa'::TEXT;
  -- Padrão
  ELSE
    RETURN QUERY SELECT 'outro'::TEXT, 'media'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.suggest_movement_classification IS 'Sugestão automática de classificação baseada em palavras-chave (NÃO é conclusão jurídica definitiva)';

-- ----------------------------------------------------------------------------
-- 7. FUNÇÃO PARA SINCRONIZAR review_status E triage_status (SEM RECURSÃO)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_review_and_triage_status()
RETURNS TRIGGER AS $$
BEGIN
  -- Sincronização bidirecional entre review_status (legado) e triage_status (novo)
  -- Usa IS DISTINCT FROM para evitar loop/recursão
  -- Não executa UPDATE recursivo na mesma tabela
  
  -- Se review_status mudou, atualizar triage_status
  IF NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    NEW.triage_status := CASE NEW.review_status
      WHEN 'nova' THEN 'novo'
      WHEN 'revisada' THEN 'revisado'
      WHEN 'ignorada' THEN 'ignorado'
      WHEN 'convertida_em_nota' THEN 'convertido_em_nota'
      WHEN 'convertida_em_agenda' THEN 'convertido_em_agenda'
      ELSE NEW.triage_status
    END;
  -- Se triage_status mudou (e review_status não mudou), atualizar review_status
  ELSIF NEW.triage_status IS DISTINCT FROM OLD.triage_status THEN
    NEW.review_status := CASE NEW.triage_status
      WHEN 'novo' THEN 'nova'
      WHEN 'em_analise' THEN 'nova'
      WHEN 'revisado' THEN 'revisada'
      WHEN 'ignorado' THEN 'ignorada'
      WHEN 'convertido_em_nota' THEN 'convertida_em_nota'
      WHEN 'convertido_em_lembrete' THEN 'revisada'
      WHEN 'convertido_em_agenda' THEN 'convertida_em_agenda'
      ELSE NEW.review_status
    END;
  END IF;
  
  -- Validar consistência entre FKs e status
  IF NEW.note_id IS NOT NULL AND NEW.triage_status NOT IN ('convertido_em_nota', 'revisado') THEN
    NEW.triage_status := 'convertido_em_nota';
    NEW.review_status := 'convertida_em_nota';
  END IF;
  
  IF NEW.reminder_id IS NOT NULL AND NEW.triage_status NOT IN ('convertido_em_lembrete', 'revisado') THEN
    NEW.triage_status := 'convertido_em_lembrete';
    NEW.review_status := 'revisada';
  END IF;
  
  IF NEW.agenda_event_id IS NOT NULL AND NEW.triage_status NOT IN ('convertido_em_agenda', 'revisado') THEN
    NEW.triage_status := 'convertido_em_agenda';
    NEW.review_status := 'convertida_em_agenda';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_review_triage_status ON public.process_movements;
CREATE TRIGGER sync_review_triage_status
  BEFORE UPDATE ON public.process_movements
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_review_and_triage_status();

COMMENT ON FUNCTION public.sync_review_and_triage_status IS 'Sincroniza automaticamente review_status (legado) e triage_status (novo) no backend sem recursão';

-- ----------------------------------------------------------------------------
-- 8. GRANTS
-- ----------------------------------------------------------------------------
GRANT SELECT, UPDATE ON public.process_movements TO authenticated;

-- ============================================================================
-- RESUMO DA MIGRATION 053
-- ============================================================================
-- ✅ Campos de triagem adicionados em process_movements
-- ✅ FKs corretas: reminder_id, note_id, agenda_event_id
-- ✅ Tabela triage_history para auditoria (sem PII)
-- ✅ RLS restrito: apenas admin e advogado acessam Central de Triagem
-- ✅ Função suggest_movement_classification (apenas sugestão)
-- ✅ Trigger para sincronizar review_status ↔ triage_status no backend
-- ✅ Índices para performance
-- ✅ Compatibilidade com estrutura existente preservada
-- ============================================================================
