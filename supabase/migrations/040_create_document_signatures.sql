-- ============================================================================
-- MIGRATION 040: Assinatura Eletrônica (Zapsign)
-- ============================================================================

-- Tabela para rastrear documentos enviados para assinatura
CREATE TABLE IF NOT EXISTS public.document_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  document_name TEXT NOT NULL,
  document_url TEXT,
  document_type VARCHAR(50) NOT NULL, -- 'proposta', 'contrato', 'termo_consentimento'
  status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'signed', 'completed', 'rejected', 'expired'
  platform VARCHAR(50) NOT NULL DEFAULT 'zapsign', -- 'zapsign', 'clicksign', 'docusign'
  platform_document_id TEXT UNIQUE, -- ID do documento na plataforma
  signers JSONB, -- Array de signatários com status
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_document_signatures_case_id
  ON public.document_signatures(case_id);

CREATE INDEX IF NOT EXISTS idx_document_signatures_status
  ON public.document_signatures(status);

CREATE INDEX IF NOT EXISTS idx_document_signatures_platform_id
  ON public.document_signatures(platform_document_id);

CREATE INDEX IF NOT EXISTS idx_document_signatures_created_at
  ON public.document_signatures(created_at DESC);

-- Tabela para armazenar configurações de integração (criptografadas)
CREATE TABLE IF NOT EXISTS public.signature_integration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  api_key_encrypted TEXT NOT NULL, -- Criptografado com CALENDAR_ENCRYPTION_KEY
  api_secret_encrypted TEXT, -- Opcional, para plataformas que usam
  is_active BOOLEAN DEFAULT true,
  tested_at TIMESTAMPTZ,
  test_status VARCHAR(50), -- 'success', 'failed'
  test_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_signature_config_user_id
  ON public.signature_integration_config(user_id);

CREATE INDEX IF NOT EXISTS idx_signature_config_platform
  ON public.signature_integration_config(platform);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_document_signatures_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_document_signatures_updated_at
  BEFORE UPDATE ON public.document_signatures
  FOR EACH ROW
  EXECUTE FUNCTION update_document_signatures_timestamp();

CREATE TRIGGER trigger_signature_config_updated_at
  BEFORE UPDATE ON public.signature_integration_config
  FOR EACH ROW
  EXECUTE FUNCTION update_document_signatures_timestamp();
