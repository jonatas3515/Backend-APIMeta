-- ============================================================================
-- MIGRATION: Adicionar campos de transcrição e processamento de mídia
-- ============================================================================

ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_transcript TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_summary TEXT;

COMMENT ON COLUMN messages.media_status IS 'Estado do processamento: pending, processed, failed';
COMMENT ON COLUMN messages.media_transcript IS 'Transcrição completa do áudio/vídeo';
COMMENT ON COLUMN messages.media_summary IS 'Resumo curto gerado da transcrição';

CREATE INDEX IF NOT EXISTS idx_messages_media_status ON messages(media_status);

-- Suporte a busca textual simples no transcript
CREATE INDEX IF NOT EXISTS idx_messages_media_transcript_trgm ON messages USING gin(media_transcript gin_trgm_ops);

-- ============================================================================
-- FIM DA MIGRATION
-- ============================================================================
