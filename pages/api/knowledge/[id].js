import { createClient } from '@supabase/supabase-js';
import { withAuth, getTenantOfficeId } from '@/lib/auth';
import { getDocument, deleteDocument } from '@/lib/knowledge';
import { canAccessFeature } from '@/lib/plans';
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

  const user = req.user;
  const office = user?.office;
  const isMasterOrMatriz = user?.is_master || office?.id === '00000000-0000-0000-0000-000000000001';
  const hasAccess = isMasterOrMatriz || canAccessFeature(office?.plan, 'rag_custom', office);

  if (!hasAccess) {
    return res.status(403).json({
      error: 'A Base de Conhecimento e RAG Jurídico é exclusiva do Plano Enterprise.',
      upgradeRequired: true,
      requiredPlan: 'Enterprise'
    });
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
  const officeId = getTenantOfficeId(req);

  try {
    let query = supabase.from('knowledge_documents').select('*').eq('id', id);
    if (!user?.is_master && user?.office_id !== '00000000-0000-0000-0000-000000000001') {
      query = query.eq('office_id', officeId);
    }

    const { data: doc, error } = await query.single();

    if (error || !doc) {
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
  const officeId = getTenantOfficeId(req);

  try {
    let deleteQuery = supabase.from('knowledge_documents').delete().eq('id', id);
    if (!user?.is_master && user?.office_id !== '00000000-0000-0000-0000-000000000001') {
      deleteQuery = deleteQuery.eq('office_id', officeId);
    }

    const { error } = await deleteQuery;

    if (error) {
      logger('warn', 'KNOWLEDGE_DELETE_ERROR', { httpStatus: 400, userId: user.id });
      return res.status(400).json({ error: 'Erro ao excluir documento' });
    }

    logger('info', 'KNOWLEDGE_DELETE_SUCCESS', { httpStatus: 200, userId: user.id });
    return res.status(200).json({ success: true });
  } catch (error) {
    logger('error', 'KNOWLEDGE_DELETE_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'KNOWLEDGE_DELETE_FAILED' });
    return res.status(500).json({ error: 'Erro ao excluir documento' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
