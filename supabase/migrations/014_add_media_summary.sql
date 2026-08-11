-- Adiciona campos para transcrição de áudio e resumo de mídia
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_summary TEXT;

-- Índice para busca por texto transcrito/resumido
CREATE INDEX IF NOT EXISTS idx_messages_media_summary ON messages USING gin (to_tsvector('portuguese', media_summary));
