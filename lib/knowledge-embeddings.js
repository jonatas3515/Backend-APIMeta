import { safeLog, safeError } from './safeLogger.js';
import { expandQuery } from './knowledgeQueryExpansion.js';

export async function semanticSearch(supabase, { query, topK = 5, area = null, tribunal = null, type = null, minRank = 0 }) {
  if (!supabase) throw new Error('Supabase não configurado');
  if (!query || query.trim().length < 3) throw new Error('query deve ter pelo menos 3 caracteres');

  const expandedQuery = expandQuery(query);
  const searchQuery = expandedQuery.trim().toLowerCase().slice(0, 500);

  safeLog('info', 'knowledge_search_start', {
    rawQueryLength: query?.length,
    expandedQueryLength: expandedQuery?.length,
    queryLength: searchQuery.length,
    filterStatus: 'aprovado',
    filterArea: area,
    filterTribunal: tribunal,
    filterType: type,
    topK
  });

  try {
    const { data, error } = await supabase.rpc('search_knowledge', {
      search_query: searchQuery,
      filter_status: 'aprovado',
      filter_area: area || null,
      filter_tribunal: tribunal || null,
      filter_type: type || null
    });

    if (error) throw error;

    const minRankValue = parseFloat(minRank) || 0;
    const results = (data || [])
      .filter(r => (r.rank || 0) >= minRankValue)
      .slice(0, Math.max(1, topK));

    const uniqueDocs = [...new Map(results.map(r => [r.document_id, {
      documentId: r.document_id,
      title: r.title,
      type: r.doc_type,
      area: r.area,
      tribunal: r.tribunal,
      tags: r.tags
    }])).values()];

    safeLog('info', 'knowledge_search_success', {
      queryLength: searchQuery.length,
      retrievalCount: results.length,
      approvedResultCount: uniqueDocs.length,
      emptyRetrieval: results.length === 0,
      filterStatus: 'aprovado',
      filterArea: area,
      filterTribunal: tribunal,
      filterType: type,
      minRank: minRankValue
    });

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
    safeError('knowledge_search_failed', error, {
      queryLength: searchQuery.length,
      errorCode: 'SEMANTIC_SEARCH_FAILED',
      providerError: true
    });
    throw error;
  }
}
