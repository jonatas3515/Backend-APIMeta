import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { semanticSearch } from '@/lib/knowledge-embeddings';
import logger from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Serviço indisponível' });
  }

  if (req.method !== 'POST') {
    logger('warn', 'KNOWLEDGE_SEARCH_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const user = req.user;
  const { query, topK = 5, area = null, tribunal = null, type = null } = req.body || {};

  if (!query || query.trim().length < 3) {
    logger('warn', 'KNOWLEDGE_SEARCH_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: 'query deve ter pelo menos 3 caracteres' });
  }

  try {
    const results = await semanticSearch(supabase, { query, topK, area, tribunal, type });

    logger('info', 'KNOWLEDGE_SEARCH_SUCCESS', {
      httpStatus: 200,
      userId: user.id,
      resultCount: results.chunks.length,
      documentCount: results.documents.length
    });

    return res.status(200).json(results);
  } catch (error) {
    logger('error', 'KNOWLEDGE_SEARCH_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'KNOWLEDGE_SEARCH_FAILED' });
    return res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
