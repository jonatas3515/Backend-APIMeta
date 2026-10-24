-- ============================================================================
-- MIGRATION 067: Tabela de Tarefas Juridicas (modulo absorvido do legado)
-- ============================================================================
-- Tarefas rapidas por usuario/escritorio: titulo, prioridade, data limite,
-- conclusao. Idempotente com IF NOT EXISTS / DROP POLICY IF EXISTS.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  office_id UUID DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id UUID,
  title VARCHAR(255) NOT NULL,
  priority VARCHAR(20) DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'baixa')),
  due_date DATE,
  done BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.tasks IS 'Tarefas juridicas rapidas do escritorio';
COMMENT ON COLUMN public.tasks.priority IS 'alta, media ou baixa';

CREATE INDEX IF NOT EXISTS idx_tasks_office ON public.tasks(office_id);
CREATE INDEX IF NOT EXISTS idx_tasks_done ON public.tasks(done);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_auth_all ON public.tasks;
CREATE POLICY tasks_auth_all ON public.tasks
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
