-- ============================================================================
-- MIGRATION: Criar tabela de usuários administradores DO CHAT
-- (prefixo chat_ para evitar conflitos com outras tabelas do site)
-- ============================================================================

CREATE TABLE IF NOT EXISTS chat_admin_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para busca rápida por username
CREATE INDEX IF NOT EXISTS idx_chat_admin_users_username ON chat_admin_users(username);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_chat_admin_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_chat_admin_users_updated_at
  BEFORE UPDATE ON chat_admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_chat_admin_users_updated_at();

-- ============================================================================
-- INSERIR USUÁRIO PADRÃO
-- Usuário: admin
-- Senha: admin123 (MUDE ISSO IMEDIATAMENTE APÓS O PRIMEIRO LOGIN!)
-- Hash SHA256 de "admin123": 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
-- ============================================================================

INSERT INTO chat_admin_users (username, password_hash, name, email)
VALUES (
  'admin',
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
  'Administrador',
  'admin@nevescosta.com'
)
ON CONFLICT (username) DO NOTHING;

-- ============================================================================
-- IMPORTANTE: Após fazer login pela primeira vez, execute este comando
-- para criar um novo usuário com SUA senha:
--
-- INSERT INTO chat_admin_users (username, password_hash, name, email)
-- VALUES (
--   'seu_usuario',
--   'SEU_HASH_SHA256_AQUI',
--   'Seu Nome',
--   'seu@email.com'
-- );
--
-- Para gerar o hash SHA256 da sua senha, use:
-- https://emn178.github.io/online-tools/sha256.html
-- ============================================================================

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
