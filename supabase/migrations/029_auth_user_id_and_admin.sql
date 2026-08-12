-- ============================================================================
-- MIGRATION: Integrar tabela users com Supabase Auth e criar admin inicial
-- ============================================================================

-- ============================================================================
-- 1. ADICIONAR auth_user_id À TABELA users
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

COMMENT ON COLUMN users.auth_user_id IS 'ID do usuário no Supabase Auth (auth.users.id)';

CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);

-- ============================================================================
-- 2. GARANTIR RLS E PERMISSÕES BÁSICAS (SE RLS ESTIVER ATIVO)
-- ============================================================================

-- Tabela users já deveria existir; se não existir, criar políticas padrão
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'users'
  ) THEN
    -- Política: usuários autenticados podem ver próprios dados e dados de gestão
    -- (usaremos validação por aplicação para simplicidade, mas RLS pode ser ativado depois)
    NULL;
  END IF;
END $$;

-- ============================================================================
-- 3. CRIAR USUÁRIO ADMIN INICIAL (se não existir)
-- ============================================================================

INSERT INTO users (id, name, email, role, is_active, auth_user_id)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Jonatas Costa',
  'jonatascosta.adv@gmail.com',
  'admin',
  true,
  NULL
)
ON CONFLICT (email) DO UPDATE 
SET role = 'admin', is_active = true
WHERE users.email = 'jonatascosta.adv@gmail.com';

-- ============================================================================
-- 4. FUNÇÃO AUXILIAR PARA CRIAR/ATUALIZAR VÍNCULO COM SUPABASE AUTH
-- ============================================================================

CREATE OR REPLACE FUNCTION link_user_to_auth(
  p_email VARCHAR,
  p_auth_user_id UUID
)
RETURNS VOID AS $$
BEGIN
  UPDATE users 
  SET auth_user_id = p_auth_user_id
  WHERE email = p_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
