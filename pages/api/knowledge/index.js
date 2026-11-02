import { createClient } from '@supabase/supabase-js';
import { withAuth, getTenantOfficeId } from '@/lib/auth';
import { searchDocuments, createDocument } from '@/lib/knowledge';
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

  if (req.method === 'POST') {
    return handlePost(req, res);
  }

  logger('warn', 'KNOWLEDGE_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
  return res.status(405).json({ error: 'Método não permitido' });
}

async function handleGet(req, res) {
  const user = req.user;
  const officeId = getTenantOfficeId(req);
  const { query = '', type = null, status = 'aprovado', page = '1', limit = '20' } = req.query;

  try {
    const isMasterOrMatriz = user?.is_master || user?.office_id === '00000000-0000-0000-0000-000000000001';
    const result = await searchDocuments(supabase, {
      query,
      type,
      status,
      office_id: isMasterOrMatriz && !officeId ? null : officeId,
      page: parseInt(page, 10) || 1,
      limit: Math.min(parseInt(limit, 10) || 20, 100)
    });

    logger('info', 'KNOWLEDGE_LIST_SUCCESS', {
      httpStatus: 200,
      userId: user.id,
      count: result.documents.length,
      total: result.total
    });

    return res.status(200).json(result);
  } catch (error) {
    logger('error', 'KNOWLEDGE_LIST_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'KNOWLEDGE_LIST_FAILED' });
    return res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
}

async function handlePost(req, res) {
  const user = req.user;
  const officeId = getTenantOfficeId(req);

  try {
    const payload = {
      ...req.body,
      office_id: officeId
    };
    const doc = await createDocument(supabase, payload, user.id);
    logger('info', 'KNOWLEDGE_CREATE_SUCCESS', { httpStatus: 201, userId: user.id, documentId: doc.id });
    return res.status(201).json(doc);
  } catch (error) {
    logger('warn', 'KNOWLEDGE_CREATE_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: error.message || 'Erro ao criar documento' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
