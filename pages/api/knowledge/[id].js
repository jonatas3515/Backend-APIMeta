import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { getDocument, deleteDocument } from '@/lib/knowledge';
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

  if (req.method === 'GET') {
    return handleGet(req, res);
  }

  if (req.method === 'DELETE') {
    return handleDelete(req, res);
  }

  logger('warn', 'KNOWLEDGE_DETAIL_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
  return res.status(405).json({ error: 'Método não permitido' });
}

async function handleGet(req, res) {
  const user = req.user;
  const { id } = req.query;

  try {
    const doc = await getDocument(supabase, id);

    if (!doc) {
      logger('warn', 'KNOWLEDGE_DETAIL_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    logger('info', 'KNOWLEDGE_DETAIL_SUCCESS', { httpStatus: 200, userId: user.id });
    return res.status(200).json(doc);
  } catch (error) {
    logger('error', 'KNOWLEDGE_DETAIL_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'KNOWLEDGE_DETAIL_FAILED' });
    return res.status(500).json({ error: 'Erro ao buscar documento' });
  }
}

async function handleDelete(req, res) {
  const user = req.user;
  const { id } = req.query;

  try {
    const result = await deleteDocument(supabase, id, user.id);

    if (!result) {
      logger('warn', 'KNOWLEDGE_DELETE_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Documento não encontrado' });
    }

    logger('info', 'KNOWLEDGE_DELETE_SUCCESS', { httpStatus: 200, userId: user.id });
    return res.status(200).json({ success: true });
  } catch (error) {
    logger('error', 'KNOWLEDGE_DELETE_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'KNOWLEDGE_DELETE_FAILED' });
    return res.status(500).json({ error: 'Erro ao excluir documento' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
