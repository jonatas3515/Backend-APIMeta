-- ============================================================================
-- MIGRATION: Criar bucket de storage para arquivos do chat
-- ============================================================================

-- Criar bucket público para arquivos do chat
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

-- Política: Permitir upload autenticado
CREATE POLICY "Permitir upload de arquivos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'chat-files');

-- Política: Permitir leitura pública
CREATE POLICY "Permitir leitura pública de arquivos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'chat-files');

-- Política: Permitir delete autenticado
CREATE POLICY "Permitir delete de arquivos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'chat-files');

-- ============================================================================
-- Adicionar coluna media_url na tabela messages
-- ============================================================================
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS media_url TEXT,
ADD COLUMN IF NOT EXISTS media_type VARCHAR(50);

-- Índice para buscar mensagens com mídia
CREATE INDEX IF NOT EXISTS idx_messages_media_url 
  ON messages(media_url) 
  WHERE media_url IS NOT NULL;

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
