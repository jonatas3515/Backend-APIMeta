-- Ajusta a busca RAG para usar OR entre palavras-chave,
-- evitando que perguntas longas sejam descartadas por falta de um termo no mesmo chunk.
-- Sempre filtra apenas documentos com status 'aprovado'.
CREATE OR REPLACE FUNCTION search_knowledge(
  search_query TEXT,
  filter_status TEXT DEFAULT 'aprovado',
  filter_area TEXT DEFAULT NULL,
  filter_tribunal TEXT DEFAULT NULL,
  filter_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  chunk_id UUID,
  document_id UUID,
  chunk_index INT,
  content TEXT,
  rank REAL,
  title TEXT,
  doc_type TEXT,
  area TEXT,
  tribunal TEXT,
  tags TEXT[]
) AS $$
DECLARE
  tsq tsquery;
  clean_query TEXT;
BEGIN
  IF search_query IS NULL OR length(trim(search_query)) = 0 THEN
    RETURN;
  END IF;

  -- mantém apenas letras, números e espaços
  clean_query := regexp_replace(search_query, '[^[:alnum:] ]', ' ', 'g');
  clean_query := trim(regexp_replace(clean_query, '\s+', ' ', 'g'));

  IF length(clean_query) = 0 THEN
    RETURN;
  END IF;

  -- cada palavra é opcional (OR)
  tsq := to_tsquery('portuguese', regexp_replace(clean_query, '\s+', ' | ', 'g'));

  RETURN QUERY
  SELECT
    kc.id AS chunk_id,
    kc.document_id,
    kc.chunk_index,
    kc.content,
    ts_rank_cd(kc.content_fts, tsq)::REAL AS rank,
    kd.title,
    kd.type AS doc_type,
    kd.area,
    kd.tribunal,
    kd.tags
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE
    kc.content_fts @@ tsq
    AND kd.status = 'aprovado'
    AND (filter_area IS NULL OR kd.area = filter_area)
    AND (filter_tribunal IS NULL OR kd.tribunal = filter_tribunal)
    AND (filter_type IS NULL OR kd.type = filter_type)
  ORDER BY rank DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

ALTER FUNCTION search_knowledge OWNER TO postgres;

REVOKE ALL ON FUNCTION search_knowledge FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION search_knowledge TO service_role;
