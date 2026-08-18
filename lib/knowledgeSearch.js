import { supabaseServer } from './supabaseServer';

export async function searchKnowledge({ query, status = 'aprovado', area = null, tribunal = null, type = null, limit = 8 }) {
  if (!supabaseServer) {
    throw new Error('Cliente Supabase do servidor não configurado');
  }

  const { data, error } = await supabaseServer.rpc('search_knowledge', {
    search_query: query,
    filter_status: status,
    filter_area: area,
    filter_tribunal: tribunal,
    filter_type: type
  });

  if (error) throw error;

  const results = (data || []).slice(0, limit);
  const uniqueDocs = [...new Map(results.map(r => [r.document_id, {
    document_id: r.document_id,
    title: r.title,
    type: r.doc_type,
    area: r.area,
    tribunal: r.tribunal,
    tags: r.tags
  }])).values()];

  return { results, documents: uniqueDocs };
}
