-- ============================================================================
-- MIGRATION: Criar tabela de clientes
-- ============================================================================

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL UNIQUE,
  first_contact_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contact_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  total_messages INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_first_contact ON clients(first_contact_date DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_clients_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW
  EXECUTE FUNCTION update_clients_updated_at();

-- Função para sincronizar clientes com conversations
CREATE OR REPLACE FUNCTION sync_client_from_conversation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO clients (name, phone, first_contact_date, last_contact_date)
  VALUES (NEW.client_name, NEW.client_phone, NEW.created_at, NEW.updated_at)
  ON CONFLICT (phone) 
  DO UPDATE SET 
    name = EXCLUDED.name,
    last_contact_date = EXCLUDED.last_contact_date;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_client_from_conversation
  AFTER INSERT OR UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION sync_client_from_conversation();

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
