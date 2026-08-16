-- ============================================================================
-- 048 - Monitoramento Processual DataJud (Fase 13.1)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Processos vinculados a casos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.case_processes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  process_number TEXT NOT NULL,
  process_number_normalized TEXT NOT NULL,
  court_code TEXT,
  court_name TEXT,
  datajud_alias TEXT,
  branch TEXT,
  instance TEXT,
  court_unit TEXT,
  case_class TEXT,
  main_subject TEXT,
  client_role TEXT NOT NULL DEFAULT 'outro' CHECK (client_role IN ('autor','reu','requerente','requerido','interessado','terceiro','outro')),
  is_primary BOOLEAN NOT NULL DEFAULT false,
  monitoring_status TEXT NOT NULL DEFAULT 'ativo' CHECK (monitoring_status IN ('nao_monitorado','ativo','pausado','erro_de_consulta','processo_nao_localizado','sigiloso_restrito','encerrado')),
  monitoring_frequency TEXT NOT NULL DEFAULT 'manual' CHECK (monitoring_frequency IN ('manual','diaria','semanal','quinzenal','mensal')),
  last_checked_at TIMESTAMPTZ,
  next_check_at TIMESTAMPTZ,
  last_movement_at TIMESTAMPTZ,
  last_movement_summary TEXT,
  public_consultation_url TEXT,
  last_error TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evita duplicar mesmo processo no mesmo caso
CREATE UNIQUE INDEX IF NOT EXISTS idx_case_processes_unique_case_number
  ON public.case_processes (case_id, process_number_normalized);

CREATE INDEX IF NOT EXISTS idx_case_processes_case_id
  ON public.case_processes (case_id);
CREATE INDEX IF NOT EXISTS idx_case_processes_next_check_at
  ON public.case_processes (next_check_at)
  WHERE monitoring_status = 'ativo';

-- ----------------------------------------------------------------------------
-- 2. Movimentações processuais
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.process_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_process_id UUID NOT NULL REFERENCES public.case_processes(id) ON DELETE CASCADE,
  external_movement_id TEXT,
  movement_date TIMESTAMPTZ,
  movement_text TEXT NOT NULL,
  movement_text_normalized TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'datajud',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  review_status TEXT NOT NULL DEFAULT 'nova' CHECK (review_status IN ('nova','revisada','ignorada','convertida_em_nota','convertida_em_agenda')),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_movements_process_id
  ON public.process_movements (case_process_id);
CREATE INDEX IF NOT EXISTS idx_process_movements_review_status
  ON public.process_movements (case_process_id, review_status);
CREATE INDEX IF NOT EXISTS idx_process_movements_detected
  ON public.process_movements (case_process_id, detected_at DESC);

-- ----------------------------------------------------------------------------
-- 3. Logs de consulta (sem dados sensíveis)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.process_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_process_id UUID NOT NULL REFERENCES public.case_processes(id) ON DELETE CASCADE,
  queried_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  query_type TEXT NOT NULL DEFAULT 'manual' CHECK (query_type IN ('manual','cron','teste')),
  status TEXT NOT NULL CHECK (status IN ('success','no_change','not_found','restricted','rate_limited','error')),
  response_summary JSONB,
  error_summary TEXT,
  queried_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_process_query_logs_process_id
  ON public.process_query_logs (case_process_id, queried_at DESC);

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.case_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_query_logs ENABLE ROW LEVEL SECURITY;

-- Idempotência: remove políticas se existirem
DROP POLICY IF EXISTS case_processes_select ON public.case_processes;
DROP POLICY IF EXISTS case_processes_insert ON public.case_processes;
DROP POLICY IF EXISTS case_processes_update ON public.case_processes;
DROP POLICY IF EXISTS case_processes_delete ON public.case_processes;
DROP POLICY IF EXISTS process_movements_select ON public.process_movements;
DROP POLICY IF EXISTS process_movements_update ON public.process_movements;
DROP POLICY IF EXISTS process_query_logs_select ON public.process_query_logs;

-- case_processes: usuários veem processos dos casos aos quais têm acesso
CREATE POLICY case_processes_select
  ON public.case_processes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_processes.case_id
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid() AND u.id = c.assigned_user_id
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY case_processes_insert
  ON public.case_processes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_processes.case_id
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid() AND u.id = c.assigned_user_id
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY case_processes_update
  ON public.case_processes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  );

CREATE POLICY case_processes_delete
  ON public.case_processes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  );

-- process_movements
CREATE POLICY process_movements_select
  ON public.process_movements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.case_processes cp
      JOIN public.cases c ON c.id = cp.case_id
      WHERE cp.id = process_movements.case_process_id
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid() AND u.id = c.assigned_user_id
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'admin'
    )
  );

CREATE POLICY process_movements_update
  ON public.process_movements
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role IN ('admin','advogado')
    )
  );

-- process_query_logs: somente leitura
CREATE POLICY process_query_logs_select
  ON public.process_query_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.case_processes cp
      JOIN public.cases c ON c.id = cp.case_id
      WHERE cp.id = process_query_logs.case_process_id
      AND EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.auth_user_id = auth.uid() AND u.id = c.assigned_user_id
      )
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'admin'
    )
  );

-- ----------------------------------------------------------------------------
-- 5. Triggers updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_processes_updated_at ON public.case_processes;
CREATE TRIGGER case_processes_updated_at
  BEFORE UPDATE ON public.case_processes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS process_movements_updated_at ON public.process_movements;
CREATE TRIGGER process_movements_updated_at
  BEFORE UPDATE ON public.process_movements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 6. Grants
-- ----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_processes TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.process_movements TO authenticated;
GRANT SELECT, INSERT ON public.process_query_logs TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.case_processes_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.process_movements_id_seq TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.process_query_logs_id_seq TO authenticated;

-- ============================================================================
-- FIM
-- ============================================================================
