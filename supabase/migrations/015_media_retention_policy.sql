-- Política de retenção de mídias pesadas
-- Remove arquivos de áudio/vídeo do storage após 90 dias, mantendo metadados

-- Função para expurgar mídias antigas do bucket chat-files
CREATE OR REPLACE FUNCTION cleanup_old_media()
RETURNS void AS $$
DECLARE
  deleted_count INT := 0;
  cutoff_date TIMESTAMPTZ := now() - interval '90 days';
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT name
    FROM storage.objects
    WHERE bucket_id = 'chat-files'
      AND (name LIKE '%.ogg' OR name LIKE '%.mp3' OR name LIKE '%.wav' OR name LIKE '%.m4a'
           OR name LIKE '%.mp4' OR name LIKE '%.mov' OR name LIKE '%.webm'
           OR name LIKE '%.pdf' OR name LIKE '%.doc' OR name LIKE '%.docx')
      AND created_at < cutoff_date
  LOOP
    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-files' AND name = rec.name;
    deleted_count := deleted_count + 1;
  END LOOP;

  RAISE NOTICE 'Mídias antigas removidas: %', deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Exemplo: executar manualmente ou agendar via pg_cron
-- SELECT cleanup_old_media();
