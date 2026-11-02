-- Migration 073: Multi-Tenancy Isolation for Case Processes, Process Movements, and Triage
-- Ensures complete isolation between offices for process monitoring and triage.

-- 1. Add office_id to case_processes, process_movements, triage_history, internal_notes
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'case_processes' AND column_name = 'office_id') THEN
    ALTER TABLE public.case_processes ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'process_movements' AND column_name = 'office_id') THEN
    ALTER TABLE public.process_movements ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'triage_history' AND column_name = 'office_id') THEN
    ALTER TABLE public.triage_history ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'internal_notes' AND column_name = 'office_id') THEN
    ALTER TABLE public.internal_notes ADD COLUMN office_id UUID REFERENCES public.offices(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Backfill office_id from linked cases
UPDATE public.case_processes cp
SET office_id = COALESCE(c.office_id, '00000000-0000-0000-0000-000000000001'::uuid)
FROM public.cases c
WHERE cp.case_id = c.id AND cp.office_id IS NULL;

UPDATE public.case_processes
SET office_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE office_id IS NULL;

UPDATE public.process_movements pm
SET office_id = COALESCE(cp.office_id, '00000000-0000-0000-0000-000000000001'::uuid)
FROM public.case_processes cp
WHERE pm.case_process_id = cp.id AND pm.office_id IS NULL;

UPDATE public.process_movements
SET office_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE office_id IS NULL;

UPDATE public.triage_history th
SET office_id = COALESCE(pm.office_id, '00000000-0000-0000-0000-000000000001'::uuid)
FROM public.process_movements pm
WHERE th.movement_id = pm.id AND th.office_id IS NULL;

UPDATE public.triage_history
SET office_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE office_id IS NULL;

UPDATE public.internal_notes
SET office_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE office_id IS NULL;

-- 3. Indexes for multi-tenant query performance
CREATE INDEX IF NOT EXISTS idx_case_processes_office_id ON public.case_processes(office_id);
CREATE INDEX IF NOT EXISTS idx_process_movements_office_id ON public.process_movements(office_id);
CREATE INDEX IF NOT EXISTS idx_triage_history_office_id ON public.triage_history(office_id);
CREATE INDEX IF NOT EXISTS idx_internal_notes_office_id ON public.internal_notes(office_id);

-- 4. Enable Row Level Security (RLS) on case_processes
ALTER TABLE public.case_processes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "case_processes_tenant_isolation" ON public.case_processes;
DROP POLICY IF EXISTS "case_processes_service_role" ON public.case_processes;

CREATE POLICY "case_processes_tenant_isolation" ON public.case_processes
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

CREATE POLICY "case_processes_service_role" ON public.case_processes
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Enable Row Level Security (RLS) on process_movements
ALTER TABLE public.process_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "process_movements_tenant_isolation" ON public.process_movements;
DROP POLICY IF EXISTS "process_movements_service_role" ON public.process_movements;

CREATE POLICY "process_movements_tenant_isolation" ON public.process_movements
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

CREATE POLICY "process_movements_service_role" ON public.process_movements
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. Enable Row Level Security (RLS) on triage_history
ALTER TABLE public.triage_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "triage_history_tenant_isolation" ON public.triage_history;
DROP POLICY IF EXISTS "triage_history_service_role" ON public.triage_history;

CREATE POLICY "triage_history_tenant_isolation" ON public.triage_history
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

CREATE POLICY "triage_history_service_role" ON public.triage_history
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
