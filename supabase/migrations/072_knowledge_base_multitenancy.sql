-- Migration 072: Multi-Tenancy Isolation for Knowledge Base (RAG)
-- Ensures each office has its own isolated knowledge documents, chunks, and logs.

-- 1. Add office_id to knowledge_documents and knowledge_query_logs
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_documents' AND column_name = 'office_id') THEN
    ALTER TABLE public.knowledge_documents ADD COLUMN office_id UUID REFERENCES public.offices(id) DEFAULT '00000000-0000-0000-0000-000000000001'::uuid;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_query_logs' AND column_name = 'office_id') THEN
    ALTER TABLE public.knowledge_query_logs ADD COLUMN office_id UUID REFERENCES public.offices(id);
  END IF;
END $$;

-- 2. Backfill existing knowledge documents and query logs to Matriz (Neves & Costa)
UPDATE public.knowledge_documents
SET office_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE office_id IS NULL;

UPDATE public.knowledge_query_logs
SET office_id = '00000000-0000-0000-0000-000000000001'::uuid
WHERE office_id IS NULL;

-- 3. Create index for tenant lookup performance
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_office_id ON public.knowledge_documents(office_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_query_logs_office_id ON public.knowledge_query_logs(office_id);

-- 4. Update search_knowledge to filter by office_id
DROP FUNCTION IF EXISTS search_knowledge(TEXT, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS search_knowledge(TEXT, TEXT, TEXT, TEXT, TEXT, UUID);

CREATE OR REPLACE FUNCTION search_knowledge(
  search_query TEXT,
  filter_status TEXT DEFAULT 'aprovado',
  filter_area TEXT DEFAULT NULL,
  filter_tribunal TEXT DEFAULT NULL,
  filter_type TEXT DEFAULT NULL,
  filter_office_id UUID DEFAULT NULL
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
  tags TEXT[],
  office_id UUID
) AS $$
DECLARE
  tsq tsquery;
  clean_query TEXT;
BEGIN
  IF search_query IS NULL OR length(trim(search_query)) = 0 THEN
    RETURN;
  END IF;

  clean_query := regexp_replace(search_query, '[^[:alnum:] ]', ' ', 'g');
  clean_query := trim(regexp_replace(clean_query, '\s+', ' ', 'g'));

  IF length(clean_query) = 0 THEN
    RETURN;
  END IF;

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
    kd.tags,
    kd.office_id
  FROM knowledge_chunks kc
  JOIN knowledge_documents kd ON kd.id = kc.document_id
  WHERE
    kc.content_fts @@ tsq
    AND kd.status = 'aprovado'
    AND (filter_office_id IS NULL OR kd.office_id = filter_office_id)
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

-- 5. RLS policies on knowledge_documents
ALTER TABLE public.knowledge_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_documents_tenant_isolation" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_select_authenticated" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_insert_admin_advogado" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_update_admin_advogado" ON public.knowledge_documents;
DROP POLICY IF EXISTS "knowledge_documents_delete_admin_advogado" ON public.knowledge_documents;

CREATE POLICY "knowledge_documents_tenant_isolation" ON public.knowledge_documents
  FOR ALL TO authenticated
  USING (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  )
  WITH CHECK (
    office_id = public.current_user_office_id()
    OR public.current_user_is_master() = true
  );

DROP POLICY IF EXISTS "knowledge_documents_service_role" ON public.knowledge_documents;
CREATE POLICY "knowledge_documents_service_role" ON public.knowledge_documents
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 6. RLS policies on knowledge_chunks
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "knowledge_chunks_tenant_isolation" ON public.knowledge_chunks;

CREATE POLICY "knowledge_chunks_tenant_isolation" ON public.knowledge_chunks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents kd
      WHERE kd.id = knowledge_chunks.document_id
      AND (kd.office_id = public.current_user_office_id() OR public.current_user_is_master() = true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.knowledge_documents kd
      WHERE kd.id = knowledge_chunks.document_id
      AND (kd.office_id = public.current_user_office_id() OR public.current_user_is_master() = true)
    )
  );

DROP POLICY IF EXISTS "knowledge_chunks_service_role" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_service_role" ON public.knowledge_chunks
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
