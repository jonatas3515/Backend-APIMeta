import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { buildDocumentRequestMessage } from '@/lib/documentChecklists';
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
  const user = req.user;

  try {
    if (method === 'GET') {
      return await handleGet(req, res, user);
    } else if (method === 'POST') {
      return await handlePost(req, res, user);
    } else {
      return res.status(405).json({ error: 'Metodo nao permitido' });
    }
  } catch (error) {
    console.error('[DOC_CHECKLIST_REQUESTS] Erro:', error.message);
    return res.status(500).json({ error: 'Erro interno do servidor' });
  }
}

export default withAuth(handler, { allowedRoles: ['admin', 'advogado'] });

async function canAccessCase(caseId, user) {
  if (user.role === 'admin' || user.role === 'advogado') return true;
  const { data } = await supabase.from('cases').select('assigned_user_id').eq('id', caseId).single();
  return data?.assigned_user_id === user.id;
}

async function handleGet(req, res, user) {
  const { case_id } = req.query;

  if (!case_id) {
    return res.status(400).json({ error: 'case_id e obrigatorio' });
  }

  const accessible = await canAccessCase(case_id, user);
  if (!accessible) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const { data, error } = await supabase
      .from('document_checklist_requests')
      .select('*')
      .eq('case_id', case_id)
      .order('requested_at', { ascending: false });

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    console.error('[DOC_CHECKLIST_REQUESTS] Erro ao listar:', error.message);
    return res.status(500).json({ error: 'Erro ao listar solicitacoes' });
  }
}

async function handlePost(req, res, user) {
  const { action } = req.query;

  if (action === 'send' || action === 'resend') {
    return await handleSend(req, res, user, action);
  }

  return await handleCreateDraft(req, res, user);
}

async function handleCreateDraft(req, res, user) {
  const start = Date.now();
  const { case_id, conversation_id, items } = req.body;

  logger('info', 'DOC_REQUEST_CREATE_DRAFT_START', { userId: user.id, caseId: case_id, conversationId });

  if (!case_id || !Array.isArray(items) || items.length === 0) {
    logger('warn', 'DOC_REQUEST_CREATE_DRAFT_VALIDATION', { userId: user.id, httpStatus: 400, errorCode: 'MISSING_FIELDS' });
    return res.status(400).json({ error: 'case_id e items sao obrigatorios' });
  }

  if (items.length > 3) {
    logger('warn', 'DOC_REQUEST_CREATE_DRAFT_VALIDATION', { userId: user.id, httpStatus: 400, errorCode: 'ITEM_LIMIT' });
    return res.status(400).json({ error: 'Limite de 3 itens por solicitacao' });
  }

  const accessible = await canAccessCase(case_id, user);
  if (!accessible) {
    logger('warn', 'DOC_REQUEST_CREATE_DRAFT_FORBIDDEN', { userId: user.id, caseId: case_id, httpStatus: 403 });
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const { data: itemDetails, error: itemError } = await supabase
      .from('case_document_checklists')
      .select('id, title, description, is_sensitive')
      .in('id', items)
      .eq('case_id', case_id);

    if (itemError) throw itemError;

    if (!itemDetails || itemDetails.length !== items.length) {
      logger('warn', 'DOC_REQUEST_CREATE_DRAFT_VALIDATION', { userId: user.id, caseId: case_id, httpStatus: 400, errorCode: 'ITEMS_NOT_IN_CASE' });
      return res.status(400).json({ error: 'Um ou mais itens nao pertencem ao caso' });
    }

    if (itemDetails.some(i => i.is_sensitive)) {
      logger('warn', 'DOC_REQUEST_CREATE_DRAFT_VALIDATION', { userId: user.id, caseId: case_id, httpStatus: 400, errorCode: 'SENSITIVE_ITEM' });
      return res.status(400).json({ error: 'Nao e permitido solicitar documentos sensiveis por WhatsApp' });
    }

    const { message, template_key } = buildDocumentRequestMessage(itemDetails);

    const { data: request, error: insertError } = await supabase
      .from('document_checklist_requests')
      .insert([{
        case_id,
        conversation_id: conversation_id || null,
        requested_by: user.id,
        items: items,
        message_template_key: template_key,
        status: 'draft',
        batch_number: 1
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    incrementMetric('document_requests', 'create');
    logger('info', 'DOC_REQUEST_CREATE_DRAFT_SUCCESS', { userId: user.id, caseId: case_id, documentId: request.id, httpStatus: 201, durationMs: Date.now() - start });
    return res.status(201).json({
      ...request,
      message
    });
  } catch (error) {
    logger('error', 'DOC_REQUEST_CREATE_DRAFT_ERROR', { userId: user.id, caseId: case_id, httpStatus: 500, durationMs: Date.now() - start });
    return res.status(500).json({ error: 'Erro ao criar rascunho' });
  }
}

async function handleSend(req, res, user, action) {
  const start = Date.now();
  const { id } = req.body;

  const eventPrefix = action === 'resend' ? 'DOC_REQUEST_RESEND' : 'DOC_REQUEST_SEND';
  logger('info', `${eventPrefix}_START`, { userId: user.id, documentId: id });

  if (!id) {
    logger('warn', `${eventPrefix}_VALIDATION`, { userId: user.id, httpStatus: 400, errorCode: 'ID_MISSING' });
    return res.status(400).json({ error: 'id da solicitacao e obrigatorio' });
  }

  try {
    const { data: request, error } = await supabase
      .from('document_checklist_requests')
      .select('*, cases:case_id(conversation_id)')
      .eq('id', id)
      .single();

    if (error || !request) {
      logger('warn', `${eventPrefix}_NOT_FOUND`, { userId: user.id, documentId: id, httpStatus: 404 });
      return res.status(404).json({ error: 'Solicitacao nao encontrada' });
    }

    const accessible = await canAccessCase(request.case_id, user);
    if (!accessible) {
      logger('warn', `${eventPrefix}_FORBIDDEN`, { userId: user.id, caseId: request.case_id, documentId: id, httpStatus: 403 });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const conversationId = request.conversation_id;
    if (!conversationId) {
      logger('warn', `${eventPrefix}_VALIDATION`, { userId: user.id, documentId: id, httpStatus: 400, errorCode: 'NO_CONVERSATION' });
      return res.status(400).json({ error: 'Conversa nao vinculada a solicitacao' });
    }

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('client_phone')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation?.client_phone) {
      logger('warn', `${eventPrefix}_VALIDATION`, { userId: user.id, documentId: id, conversationId, httpStatus: 400, errorCode: 'CLIENT_NO_PHONE' });
      return res.status(400).json({ error: 'Cliente sem telefone configurado' });
    }

    const { data: itemDetails } = await supabase
      .from('case_document_checklists')
      .select('id, title, description')
      .in('id', request.items || [])
      .eq('case_id', request.case_id);

    const message = req.body.message || buildDocumentRequestMessage(itemDetails || []).message;

    const waMessageId = await sendWhatsAppMessage(conversation.client_phone, message);

    const newStatus = action === 'resend' ? 'resent' : 'sent';

    const { data: updated, error: updateError } = await supabase
      .from('document_checklist_requests')
      .update({
        status: newStatus,
        wa_message_id: waMessageId,
        requested_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    const requestedAt = new Date().toISOString();
    for (const itemId of request.items || []) {
      const { data: current } = await supabase
        .from('case_document_checklists')
        .select('status')
        .eq('id', itemId)
        .single();

      if (current && current.status === 'pendente') {
        await supabase
          .from('case_document_checklists')
          .update({
            status: 'solicitado',
            requested_at: requestedAt,
            requested_by: user.id
          })
          .eq('id', itemId);
      }
    }

    if (action === 'resend') {
      incrementMetric('document_requests', 'resend');
    } else {
      incrementMetric('document_requests', 'send');
    }
    logger('info', `${eventPrefix}_SUCCESS`, { userId: user.id, caseId: request.case_id, documentId: id, conversationId, httpStatus: 200, durationMs: Date.now() - start });
    return res.status(200).json({ ...updated, message });
  } catch (error) {
    logger('error', `${eventPrefix}_ERROR`, { userId: user.id, documentId: id, httpStatus: 500, durationMs: Date.now() - start });
    return res.status(500).json({ error: 'Erro ao enviar solicitacao' });
  }
}
