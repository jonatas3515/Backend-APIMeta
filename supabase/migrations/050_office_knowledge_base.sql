-- Base de conhecimento do escritório (RAG)

-- Documentos anonimizados aprovados
CREATE TABLE IF NOT EXISTS knowledge_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('modelo_peca','clausula','tese','checklist','jurisprudencia')),
  area TEXT,
  tribunal TEXT,
  tags TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','revisado','aprovado')),
  version TEXT DEFAULT 'v1.0',
  content TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chunks indexáveis para busca semântica/textual
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  content_fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('portuguese', COALESCE(content,''))) STORED,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Logs de consulta anonimizados
CREATE TABLE IF NOT EXISTS knowledge_query_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  query TEXT NOT NULL,
  area_filter TEXT,
  tribunal_filter TEXT,
  type_filter TEXT,
  document_ids_used UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx ON knowledge_chunks USING GIN (content_fts);
CREATE INDEX IF NOT EXISTS knowledge_chunks_document_id_idx ON knowledge_chunks(document_id);
CREATE INDEX IF NOT EXISTS knowledge_documents_status_idx ON knowledge_documents(status);
CREATE INDEX IF NOT EXISTS knowledge_documents_type_idx ON knowledge_documents(type);
CREATE INDEX IF NOT EXISTS knowledge_documents_area_idx ON knowledge_documents(area);
CREATE INDEX IF NOT EXISTS knowledge_documents_tribunal_idx ON knowledge_documents(tribunal);
CREATE INDEX IF NOT EXISTS knowledge_documents_created_by_idx ON knowledge_documents(created_by);
CREATE INDEX IF NOT EXISTS knowledge_query_logs_user_id_idx ON knowledge_query_logs(user_id);

-- Atualização automática de updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS knowledge_documents_updated_at ON knowledge_documents;
CREATE TRIGGER knowledge_documents_updated_at
  BEFORE UPDATE ON knowledge_documents
  FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

-- Função de busca full-text em chunks
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
$$ LANGUAGE plpgsql;

-- RLS
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_query_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_documents_select_authenticated ON knowledge_documents;
CREATE POLICY knowledge_documents_select_authenticated
  ON knowledge_documents FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS knowledge_documents_insert_admin_advogado ON knowledge_documents;
CREATE POLICY knowledge_documents_insert_admin_advogado
  ON knowledge_documents FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('admin','advogado')));

DROP POLICY IF EXISTS knowledge_documents_update_admin_advogado ON knowledge_documents;
CREATE POLICY knowledge_documents_update_admin_advogado
  ON knowledge_documents FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('admin','advogado')));

DROP POLICY IF EXISTS knowledge_documents_delete_admin_advogado ON knowledge_documents;
CREATE POLICY knowledge_documents_delete_admin_advogado
  ON knowledge_documents FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('admin','advogado')));

DROP POLICY IF EXISTS knowledge_chunks_select_authenticated ON knowledge_chunks;
CREATE POLICY knowledge_chunks_select_authenticated
  ON knowledge_chunks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS knowledge_chunks_insert_admin_advogado ON knowledge_chunks;
CREATE POLICY knowledge_chunks_insert_admin_advogado
  ON knowledge_chunks FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('admin','advogado')));

DROP POLICY IF EXISTS knowledge_chunks_update_admin_advogado ON knowledge_chunks;
CREATE POLICY knowledge_chunks_update_admin_advogado
  ON knowledge_chunks FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('admin','advogado')));

DROP POLICY IF EXISTS knowledge_chunks_delete_admin_advogado ON knowledge_chunks;
CREATE POLICY knowledge_chunks_delete_admin_advogado
  ON knowledge_chunks FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('admin','advogado')));

DROP POLICY IF EXISTS knowledge_query_logs_insert_own ON knowledge_query_logs;
CREATE POLICY knowledge_query_logs_insert_own
  ON knowledge_query_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS knowledge_query_logs_select_admin ON knowledge_query_logs;
CREATE POLICY knowledge_query_logs_select_admin
  ON knowledge_query_logs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role IN ('admin','advogado')));
