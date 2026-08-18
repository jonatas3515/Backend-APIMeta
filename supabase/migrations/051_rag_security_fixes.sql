-- Correção de segurança do RAG
-- Aplica SECURITY DEFINER na função search_knowledge, restringe execução ao service_role
-- e remove as permissões de SELECT direto no conhecimento para usuários autenticados.

-- 1. Função executa com os privilégios do dono (postgres), bypassando RLS de forma controlada
ALTER FUNCTION search_knowledge OWNER TO postgres;

-- 2. Remove políticas que expunham conteúdo integral a qualquer usuário autenticado
DROP POLICY IF EXISTS knowledge_documents_select_authenticated ON knowledge_documents;
DROP POLICY IF EXISTS knowledge_chunks_select_authenticated ON knowledge_chunks;

-- 3. Recria a função como SECURITY DEFINER, limitando o search_path para evitar sequestro
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
BEGIN
  RETURN QUERY
  SELECT
    kc.id AS chunk_id,
    kc.document_id,
    kc.chunk_index,
    kc.content,
    ts_rank_cd(kc.content_fts, websearch_to_tsquery('portuguese', search_query))::REAL AS rank,
    kd.title,
    kd.type AS doc_type,
    kd.area,
    kd.tribunal,
    kd.tags
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE
    kc.content_fts @@ websearch_to_tsquery('portuguese', search_query)
    AND kd.status = filter_status
    AND (filter_area IS NULL OR kd.area = filter_area)
    AND (filter_tribunal IS NULL OR kd.tribunal = filter_tribunal)
    AND (filter_type IS NULL OR kd.type = filter_type)
  ORDER BY rank DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Garante que só o backend (service_role) possa chamar a função
REVOKE ALL ON FUNCTION search_knowledge FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION search_knowledge TO service_role;
