import { supabaseServer } from '../../../lib/supabaseServer';
import { searchKnowledge } from '../../../lib/knowledgeSearch';
import { askRag } from '../../../lib/aiRag';
import { anonymizeText } from '../../../lib/anonymize';
import { safeLog, safeError } from '../../../lib/safeLogger';

const MAX_QUERY_LENGTH = 1000;
const MAX_CONTEXT_LENGTH = 5000;
const ABSTENTION_PHRASE = 'não contém informações suficientes';

async function getUserFromToken(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) return null;
  const { data, error } = await supabaseServer.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function canUseAssistant(userId) {
  const { data } = await supabaseServer
    .from('users')
    .select('role')
    .eq('auth_user_id', userId)
    .single();
  return data && ['admin', 'advogado', 'estagiario'].includes(data.role);
}

function buildContext(chunks, maxChars = MAX_CONTEXT_LENGTH) {
  let context = '';
  for (const chunk of chunks) {
    const source = `---\nFonte: ${chunk.title} (${chunk.doc_type}${chunk.area ? ` - ${chunk.area}` : ''}${chunk.tribunal ? ` - ${chunk.tribunal}` : ''}) - trecho ${chunk.chunk_index ?? 0}\n${chunk.content || ''}\n`;
    if (context.length + source.length > maxChars) break;
    context += source;
  }
  return context || '';
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (req.headers['x-user-id'] || req.headers['x-user-role']) {
    return res.status(401).json({ error: 'Autenticação inválida' });
  }

  const user = await getUserFromToken(req);
  if (!user) {
    return res.status(401).json({ error: 'Não autenticado' });
  }

  const allowed = await canUseAssistant(user.id);
  if (!allowed) {
    return res.status(403).json({ error: 'Permissão negada' });
  }

  const { query, area = null, tribunal = null, type = null } = req.body || {};
  const safeQuery = (query || '').trim().slice(0, MAX_QUERY_LENGTH);
  if (safeQuery.length < 3) {
    return res.status(400).json({ error: 'Pergunta muito curta' });
  }

  const start = Date.now();

  try {
    safeLog('info', 'RAG_QUERY_START', {
      userId: user.id,
      queryLength: safeQuery.length
    });

    const { results, documents } = await searchKnowledge({
      query: safeQuery,
      status: 'aprovado',
      area,
      tribunal,
      type,
      limit: 8
    });

    safeLog('info', 'rag_search', {
      route: '/api/ai/ask',
      queryLength: safeQuery.length,
      status: 'aprovado',
      area,
      tribunal,
      type,
      resultsCount: results?.length,
      documentsCount: documents?.length,
      contextLength: (results || []).reduce((acc, r) => acc + (r.content?.length || 0), 0)
    });

    const context = buildContext(results, MAX_CONTEXT_LENGTH);
    const answer = await askRag(safeQuery, context);
    const latencyMs = Date.now() - start;
    const emptyRetrieval = !results || results.length === 0;
    const abstentionUsed = (answer || '').toLowerCase().includes(ABSTENTION_PHRASE);

    safeLog('info', 'RAG_QUERY_SUCCESS', {
      userId: user.id,
      queryLength: safeQuery.length,
      documentsCount: documents.length,
      contextLength: context.length,
      latencyMs
    });

    safeLog('info', 'RAG_METRICS', {
      userId: user.id,
      route: '/api/ai/ask',
      queryLength: safeQuery.length,
      retrievalCount: results?.length ?? 0,
      approvedResultCount: documents?.length ?? 0,
      emptyRetrieval,
      abstentionUsed,
      providerError: false,
      latencyMs
    });

    if (supabaseServer && typeof supabaseServer.rpc === 'function') {
      try {
        await supabaseServer.rpc('log_audit', {
          p_user_id: user.id,
          p_entity_type: 'rag_query',
          p_entity_id: null,
          p_action: 'rag_answer',
          p_old_value: null,
          p_new_value: null,
          p_details: JSON.stringify({
            queryLength: safeQuery.length,
            documentsCount: documents.length,
            documentIds: documents.map(d => d.document_id)
          })
        });
      } catch (auditError) {
        safeError('rag_audit_log_failed', auditError, {
          route: '/api/ai/ask'
        });
      }
    }

    const { error: logError } = await supabaseServer
      .from('knowledge_query_logs')
      .insert({
        user_id: user.id,
        query: anonymizeText(safeQuery),
        area_filter: area,
        tribunal_filter: tribunal,
        type_filter: type,
        document_ids_used: documents.map(d => d.document_id)
      });

    if (logError) {
      safeError('rag_log_failed', logError, {
        route: '/api/ai/ask'
      });
    }

    const sourceDocs = documents.map(d => ({
      title: d.title,
      type: d.type,
      area: d.area,
      tribunal: d.tribunal,
      tags: d.tags
    }));

    return res.status(200).json({
      answer,
      sources: sourceDocs
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    safeLog('error', 'RAG_QUERY_ERROR', {
      userId: user.id,
      errorCode: 'RAG_QUERY_FAILED',
      providerError: true,
      latencyMs
    });
    safeError('rag_handler_failed', error, {
      route: '/api/ai/ask'
    });
    return res.status(500).json({ error: 'Erro ao processar a consulta' });
  }
}
