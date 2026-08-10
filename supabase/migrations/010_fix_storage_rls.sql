-- ============================================================================
-- MIGRATION: Corrigir RLS do Storage para permitir upload do frontend
-- ============================================================================

-- Criar políticas para o bucket chat-files permitir upload/download
CREATE POLICY "Permitir upload autenticado"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-files');

CREATE POLICY "Permitir leitura pública"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'chat-files');

CREATE POLICY "Permitir update autenticado"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'chat-files')
  WITH CHECK (bucket_id = 'chat-files');

CREATE POLICY "Permitir delete autenticado"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-files');

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
