-- ============================================================================
-- MIGRATION 070: Multi-tenancy RLS Rigoroso e Separação de Master Admin
-- ============================================================================
-- 1. Garante colunas office_id e is_master na tabela users.
-- 2. Define isolamento estrito de dados por escritório (conversations, cases, 
--    chat_clients, tasks) via Row Level Security (RLS).
-- 3. Impede vazamento entre tenants: cada escritório acessa somente seus dados.
-- 4. Somente o Master Admin da Plataforma possui acesso global.
-- ============================================================================

-- 1. Adicionar colunas office_id e is_master em users
ALTER TABLE public.users 
  ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES public.offices(id) DEFAULT '00000000-0000-0000-0000-000000000001',
  ADD COLUMN IF NOT EXISTS is_master BOOLEAN DEFAULT false;

-- 2. Funções auxiliares para RLS
CREATE OR REPLACE FUNCTION public.current_user_office_id()
RETURNS UUID AS $$
  SELECT office_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_is_master()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(is_master, false) FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- 3. RLS na tabela conversations
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON public.conversations;
DROP POLICY IF EXISTS "conversations_update_authenticated" ON public.conversations;
DROP POLICY IF EXISTS "conversations_tenant_isolation" ON public.conversations;

CREATE POLICY "conversations_tenant_isolation" ON public.conversations
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

-- 4. RLS na tabela cases
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON public.cases;
DROP POLICY IF EXISTS "cases_tenant_isolation" ON public.cases;

CREATE POLICY "cases_tenant_isolation" ON public.cases
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

-- 5. RLS na tabela chat_clients
ALTER TABLE public.chat_clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_all" ON public.chat_clients;
DROP POLICY IF EXISTS "chat_clients_tenant_isolation" ON public.chat_clients;

CREATE POLICY "chat_clients_tenant_isolation" ON public.chat_clients
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

-- 6. RLS na tabela tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks_auth_all" ON public.tasks;
DROP POLICY IF EXISTS "tasks_anon_all" ON public.tasks;
DROP POLICY IF EXISTS "tasks_tenant_isolation" ON public.tasks;

CREATE POLICY "tasks_tenant_isolation" ON public.tasks
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
