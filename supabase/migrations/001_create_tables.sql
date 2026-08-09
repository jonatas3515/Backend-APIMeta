-- Criar tabela conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_phone VARCHAR(20) NOT NULL UNIQUE,
  client_name VARCHAR(255),
  status VARCHAR(20) DEFAULT 'open',
  mode VARCHAR(20) DEFAULT 'bot',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Criar tabela messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction VARCHAR(20) NOT NULL,
  sender_type VARCHAR(20) NOT NULL,
  content_type VARCHAR(50) DEFAULT 'text',
  text TEXT,
  media_url TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Criar índices para melhor performance
CREATE INDEX idx_conversations_client_phone ON conversations(client_phone);
CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Criar tabela de usuários admin (opcional, para autenticação simples)
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
