import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { verifyCaseAccess } from '@/lib/caseAuth';
import logger from '@/lib/logger';
import { incrementMetric } from '@/lib/metrics';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase nao configurado' });
  }

  const { method } = req;

  try {
    if (method === 'GET') {
      return handleGet(req, res);
    } else if (method === 'PATCH') {
      return handlePatch(req, res);
    } else if (method === 'DELETE') {
      return handleDelete(req, res);
    } else {
      return res.status(405).json({ error: 'Metodo nao permitido' });
    }
  } catch (error) {
    console.error('[GENERATED_DOCS] Erro interno');
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });

const MANAGE_ROLES = ['admin', 'advogado'];

function canManageDocuments(user) {
  return user && MANAGE_ROLES.includes(user.role);
}

async function handleGet(req, res) {
  const start = Date.now();
  const userId = req.user?.id;
  const { case_id, conversation_id, id } = req.query;

  logger('info', 'GENERATED_DOCUMENTS_LIST_START', { userId, caseId: case_id, conversationId: conversation_id });

  try {
    if (id) {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('*, document_templates(name, legal_area)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return res.status(200).json(data);
    }

    if (case_id) {
      let query = supabase
        .from('generated_documents')
        .select('*, document_templates(name, legal_area)')
        .order('generated_at', { ascending: false });

      query = query.eq('case_id', case_id);

      const { data: directDocs, error: directError } = await query;
      if (directError) throw directError;

      if (conversation_id) {
        const { data: legacyDocs, error: legacyError } = await supabase
          .from('generated_documents')
          .select('*, document_templates(name, legal_area)')
          .eq('conversation_id', conversation_id)
          .is('case_id', null)
          .order('generated_at', { ascending: false });

        if (legacyError) throw legacyError;

        const combined = [
          ...(directDocs || []),
          ...(legacyDocs || []).map(doc => ({ ...doc, is_legacy: true }))
        ];

        return res.status(200).json(combined);
      }

      return res.status(200).json(directDocs || []);
    }

    if (conversation_id) {
      const { data, error } = await supabase
        .from('generated_documents')
        .select('*, document_templates(name, legal_area)')
        .eq('conversation_id', conversation_id)
        .order('generated_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    logger('warn', 'GENERATED_DOCUMENTS_LIST_VALIDATION', { userId, httpStatus: 400, errorCode: 'MISSING_FILTER' });
    return res.status(400).json({ error: 'case_id ou conversation_id obrigatorio' });
  } catch (error) {
    logger('error', 'GENERATED_DOCUMENTS_LIST_ERROR', { userId, httpStatus: 500, durationMs: Date.now() - start });
    return res.status(500).json({ error: 'Erro ao buscar documentos' });
  }
}

async function handlePatch(req, res) {
  const start = Date.now();
  const userId = req.user?.id;

  if (!canManageDocuments(req.user)) {
    logger('warn', 'GENERATED_DOCUMENTS_UPDATE_FORBIDDEN', { userId, httpStatus: 403 });
    return res.status(403).json({ error: 'Apenas advogados e administradores podem alterar documentos gerados.' });
  }

  const { id } = req.query;
  const { status } = req.body;

  logger('info', 'GENERATED_DOCUMENTS_UPDATE_START', { userId, documentId: id });

  if (!id) {
    logger('warn', 'GENERATED_DOCUMENTS_UPDATE_VALIDATION', { userId, httpStatus: 400, errorCode: 'ID_MISSING' });
    return res.status(400).json({ error: 'ID obrigatorio' });
  }

  if (!status) {
    logger('warn', 'GENERATED_DOCUMENTS_UPDATE_VALIDATION', { userId, documentId: id, httpStatus: 400, errorCode: 'STATUS_MISSING' });
    return res.status(400).json({ error: 'status obrigatorio' });
  }

  const validStatuses = ['draft', 'review', 'approved', 'sent'];
  if (!validStatuses.includes(status)) {
    logger('warn', 'GENERATED_DOCUMENTS_UPDATE_VALIDATION', { userId, documentId: id, httpStatus: 400, errorCode: 'STATUS_INVALID' });
    return res.status(400).json({ error: 'status invalido' });
  }

  try {
    const { data: doc, error: docError } = await supabase
      .from('generated_documents')
      .select('case_id')
      .eq('id', id)
      .single();

    if (docError || !doc) {
      logger('warn', 'GENERATED_DOCUMENTS_UPDATE_NOT_FOUND', { userId, documentId: id, httpStatus: 404 });
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }

    if (doc.case_id) {
      const { allowed } = await verifyCaseAccess({ supabase, caseId: doc.case_id, user: req.user });
      if (!allowed) {
        logger('warn', 'GENERATED_DOCUMENTS_UPDATE_FORBIDDEN', { userId, caseId: doc.case_id, documentId: id, httpStatus: 403 });
        return res.status(403).json({ error: 'Acesso nao autorizado ao caso' });
      }
    }

    const { data, error } = await supabase
      .from('generated_documents')
      .update({ status })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    incrementMetric('generated_documents', 'update');
    logger('info', 'GENERATED_DOCUMENTS_UPDATE_SUCCESS', { userId, documentId: id, caseId: doc.case_id, httpStatus: 200, durationMs: Date.now() - start });
    return res.status(200).json(data);
  } catch (error) {
    logger('error', 'GENERATED_DOCUMENTS_UPDATE_ERROR', { userId, documentId: id, httpStatus: 500, durationMs: Date.now() - start });
    return res.status(500).json({ error: 'Erro ao atualizar documento' });
  }
}

async function handleDelete(req, res) {
  const start = Date.now();
  const userId = req.user?.id;

  if (!canManageDocuments(req.user)) {
    logger('warn', 'GENERATED_DOCUMENTS_DELETE_FORBIDDEN', { userId, httpStatus: 403 });
    return res.status(403).json({ error: 'Apenas advogados e administradores podem excluir documentos gerados.' });
  }

  const { id } = req.query;

  logger('info', 'GENERATED_DOCUMENTS_DELETE_START', { userId, documentId: id });

  if (!id) {
    logger('warn', 'GENERATED_DOCUMENTS_DELETE_VALIDATION', { userId, httpStatus: 400, errorCode: 'ID_MISSING' });
    return res.status(400).json({ error: 'ID obrigatorio' });
  }

  try {
    const { data: doc, error: docError } = await supabase
      .from('generated_documents')
      .select('case_id')
      .eq('id', id)
      .single();

    if (docError || !doc) {
      logger('warn', 'GENERATED_DOCUMENTS_DELETE_NOT_FOUND', { userId, documentId: id, httpStatus: 404 });
      return res.status(404).json({ error: 'Documento nao encontrado' });
    }

    if (doc.case_id) {
      const { allowed } = await verifyCaseAccess({ supabase, caseId: doc.case_id, user: req.user });
      if (!allowed) {
        logger('warn', 'GENERATED_DOCUMENTS_DELETE_FORBIDDEN', { userId, caseId: doc.case_id, documentId: id, httpStatus: 403 });
        return res.status(403).json({ error: 'Acesso nao autorizado ao caso' });
      }
    }

    const { error } = await supabase
      .from('generated_documents')
      .delete()
      .eq('id', id);

    if (error) throw error;
    incrementMetric('generated_documents', 'delete');
    logger('info', 'GENERATED_DOCUMENTS_DELETE_SUCCESS', { userId, documentId: id, caseId: doc.case_id, httpStatus: 204, durationMs: Date.now() - start });
    return res.status(204).end();
  } catch (error) {
    logger('error', 'GENERATED_DOCUMENTS_DELETE_ERROR', { userId, documentId: id, httpStatus: 500, durationMs: Date.now() - start });
    return res.status(500).json({ error: 'Erro ao deletar documento' });
  }
}
