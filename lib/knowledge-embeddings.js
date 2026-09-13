import logger from './logger';

export async function semanticSearch(supabase, { query, topK = 5, area = null, tribunal = null, type = null }) {
  if (!supabase) throw new Error('Supabase não configurado');
  if (!query || query.trim().length < 3) throw new Error('query deve ter pelo menos 3 caracteres');

  try {
    const { data, error } = await supabase.rpc('search_knowledge', {
      search_query: query.trim().toLowerCase().slice(0, 500),
      filter_status: 'aprovado',
      filter_area: area || null,
      filter_tribunal: tribunal || null,
      filter_type: type || null
    });

    if (error) throw error;

    const results = (data || []).slice(0, Math.max(1, topK));

    const uniqueDocs = [...new Map(results.map(r => [r.document_id, {
      documentId: r.document_id,
      title: r.title,
      type: r.doc_type,
      area: r.area,
      tribunal: r.tribunal,
      tags: r.tags
    }])).values()];

    logger('info', 'RAG_QUERY_SUCCESS', { queryLength: query.length, resultCount: results.length, documentCount: uniqueDocs.length });

    return {
      chunks: results.map(r => ({
        documentId: r.document_id,
        chunkIndex: r.chunk_index,
        content: r.content,
        title: r.title,
        type: r.doc_type,
        area: r.area,
        tribunal: r.tribunal
      })),
      documents: uniqueDocs
    };
  } catch (error) {
    logger('error', 'RAG_QUERY_ERROR', { errorCode: 'SEMANTIC_SEARCH_FAILED' });
    throw error;
  }
}
