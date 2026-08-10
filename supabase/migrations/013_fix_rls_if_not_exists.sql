-- ============================================================================
-- MIGRATION: Corrigir RLS do Storage sem dar erro se já existir
-- ============================================================================

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Permitir upload autenticado" ON storage.objects;
DROP POLICY IF EXISTS "Permitir leitura pública" ON storage.objects;
DROP POLICY IF EXISTS "Permitir update autenticado" ON storage.objects;
DROP POLICY IF EXISTS "Permitir delete autenticado" ON storage.objects;

-- Criar novas políticas
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
