-- ============================================================================
-- MIGRATION 063: Cadastro completo de clientes PF e PJ
-- ============================================================================
-- Absorve a estrutura de clientes do sistema legado de referencia: suporte a
-- Pessoa Juridica (CNPJ, Razao Social via client_name, contato corporativo e
-- e-mail) e Pessoa Fisica (CPF, nascimento, e-mail).
--
-- Todas as colunas novas sao opcionais (NULL permitido) e person_type tem
-- default 'fisica', garantindo retrocompatibilidade com registros existentes.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
-- ============================================================================

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS person_type VARCHAR(10) DEFAULT 'fisica',
  ADD COLUMN IF NOT EXISTS document_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS company_contact_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS birth_or_foundation_date DATE;

ALTER TABLE public.chat_clients
  ADD COLUMN IF NOT EXISTS person_type VARCHAR(10) DEFAULT 'fisica',
  ADD COLUMN IF NOT EXISTS document_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS company_contact_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS birth_or_foundation_date DATE;

COMMENT ON COLUMN public.conversations.person_type IS 'Tipo de pessoa: fisica ou juridica';
COMMENT ON COLUMN public.conversations.document_number IS 'CPF (PF) ou CNPJ (PJ), apenas digitos';
COMMENT ON COLUMN public.conversations.company_contact_name IS 'Nome do contato/responsavel na PJ';
COMMENT ON COLUMN public.conversations.email IS 'E-mail do cliente ou e-mail corporativo da PJ';
COMMENT ON COLUMN public.conversations.birth_or_foundation_date IS 'Data de nascimento (PF) ou fundacao/abertura (PJ)';

COMMENT ON COLUMN public.chat_clients.person_type IS 'Tipo de pessoa: fisica ou juridica';
COMMENT ON COLUMN public.chat_clients.document_number IS 'CPF (PF) ou CNPJ (PJ), apenas digitos';
COMMENT ON COLUMN public.chat_clients.company_contact_name IS 'Nome do contato/responsavel na PJ';
COMMENT ON COLUMN public.chat_clients.email IS 'E-mail do cliente ou e-mail corporativo da PJ';
COMMENT ON COLUMN public.chat_clients.birth_or_foundation_date IS 'Data de nascimento (PF) ou fundacao/abertura (PJ)';

CREATE INDEX IF NOT EXISTS idx_conversations_document_number ON public.conversations(document_number);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
