-- ============================================================================
-- MIGRATION: Adicionar tabelas de chat WhatsApp + Gemini ao projeto existente
-- ============================================================================
-- Esta migration APENAS ADICIONA novas tabelas, sem alterar ou excluir nada
-- Seguro para rodar em um projeto Supabase que já tem outras tabelas
-- ============================================================================

-- ============================================================================
-- 1. CRIAR TABELA: conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_phone VARCHAR(20) NOT NULL UNIQUE,
  client_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  mode VARCHAR(20) DEFAULT 'bot' CHECK (mode IN ('bot', 'human')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- 2. CRIAR TABELA: messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('client', 'bot', 'human')),
  content_type VARCHAR(50) DEFAULT 'text' CHECK (content_type IN ('text', 'audio', 'video', 'image', 'document')),
  text TEXT,
  media_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- 3. CRIAR TABELA: admin_users (opcional, para autenticação futura)
-- ============================================================================
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- 4. CRIAR ÍNDICES (para melhor performance)
-- ============================================================================

-- Índices na tabela conversations
CREATE INDEX IF NOT EXISTS idx_conversations_client_phone 
  ON conversations(client_phone);

CREATE INDEX IF NOT EXISTS idx_conversations_status 
  ON conversations(status);

CREATE INDEX IF NOT EXISTS idx_conversations_mode 
  ON conversations(mode);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at 
  ON conversations(updated_at DESC);

-- Índices na tabela messages
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id 
  ON messages(conversation_id);

CREATE INDEX IF NOT EXISTS idx_messages_created_at 
  ON messages(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_sender_type 
  ON messages(sender_type);

CREATE INDEX IF NOT EXISTS idx_messages_direction 
  ON messages(direction);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created 
  ON messages(conversation_id, created_at DESC);

-- Índices na tabela admin_users
CREATE INDEX IF NOT EXISTS idx_admin_users_email 
  ON admin_users(email);

CREATE INDEX IF NOT EXISTS idx_admin_users_is_active 
  ON admin_users(is_active);

-- ============================================================================
-- 5. CRIAR FUNÇÃO: atualizar updated_at automaticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. CRIAR TRIGGERS: atualizar updated_at nas tabelas
-- ============================================================================
DROP TRIGGER IF EXISTS trigger_conversations_updated_at ON conversations;
CREATE TRIGGER trigger_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_admin_users_updated_at ON admin_users;
CREATE TRIGGER trigger_admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
-- Resumo do que foi criado:
-- ✓ Tabela conversations (para armazenar conversas com clientes)
-- ✓ Tabela messages (para armazenar mensagens do chat)
-- ✓ Tabela admin_users (para autenticação de admins, opcional)
-- ✓ Índices para melhor performance
-- ✓ Triggers para atualizar updated_at automaticamente
--
-- Nenhuma tabela existente foi alterada ou deletada.
-- ============================================================================
