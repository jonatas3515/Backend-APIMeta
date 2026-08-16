-- ============================================================================
-- 049 - Correção RLS do monitoramento processual
-- PostgreSQL não suporta CREATE POLICY IF NOT EXISTS.
-- Aplica/reatualiza as políticas de forma idempotente.
-- ============================================================================

DROP POLICY IF EXISTS case_processes_select ON public.case_processes;
DROP POLICY IF EXISTS case_processes_insert ON public.case_processes;
DROP POLICY IF EXISTS case_processes_update ON public.case_processes;
DROP POLICY IF EXISTS case_processes_delete ON public.case_processes;
DROP POLICY IF EXISTS process_movements_select ON public.process_movements;
DROP POLICY IF EXISTS process_movements_update ON public.process_movements;
DROP POLICY IF EXISTS process_query_logs_select ON public.process_query_logs;

CREATE POLICY case_processes_select
  ON public.case_processes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = case_processes.case_id
      AND (c.assigned_user_id = auth.uid() OR c.created_by = auth.uid() OR c.responsible_id = auth.uid())
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
      AND (c.assigned_user_id = auth.uid() OR c.created_by = auth.uid() OR c.responsible_id = auth.uid())
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

CREATE POLICY process_movements_select
  ON public.process_movements
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.case_processes cp
      JOIN public.cases c ON c.id = cp.case_id
      WHERE cp.id = process_movements.case_process_id
      AND (c.assigned_user_id = auth.uid() OR c.created_by = auth.uid() OR c.responsible_id = auth.uid())
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

CREATE POLICY process_query_logs_select
  ON public.process_query_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.case_processes cp
      JOIN public.cases c ON c.id = cp.case_id
      WHERE cp.id = process_query_logs.case_process_id
      AND (c.assigned_user_id = auth.uid() OR c.created_by = auth.uid() OR c.responsible_id = auth.uid())
    )
    OR
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.auth_user_id = auth.uid() AND u.role = 'admin'
    )
  );
