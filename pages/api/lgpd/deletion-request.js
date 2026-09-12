import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { validateDeletionRequest, hasActiveCases } from '@/lib/lgpd-deletion';
import logger from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const AUDIT_ENTITY = 'client';

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Serviço indisponível' });
  }

  if (req.method !== 'POST') {
    logger('warn', 'LGPD_DELETION_REQUEST_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  return handlePost(req, res);
}

async function handlePost(req, res) {
  const user = req.user;
  const { clientId, mode = 'anonymized', reason = 'lgpd_request', notes } = req.body;

  const validation = validateDeletionRequest({ clientId, mode, reason, notes });
  if (!validation.valid) {
    logger('warn', 'LGPD_DELETION_REQUEST_VALIDATION', { httpStatus: 400, userId: user.id, errorCode: 'INVALID_FIELDS' });
    return res.status(400).json({ error: validation.errors.join('; ') });
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, client_phone, assigned_user_id, is_client')
      .eq('id', clientId)
      .single();

    if (convError || !conversation) {
      logger('warn', 'LGPD_DELETION_REQUEST_NOT_FOUND', { httpStatus: 404, userId: user.id, conversationId: clientId });
      return res.status(404).json({ error: 'Titular não encontrado' });
    }

    const isAdmin = user.role === 'admin';
    const isOwner = conversation.assigned_user_id === user.id;
    const isClientItself = conversation.id === user.id;

    if (!isAdmin && !isOwner && !isClientItself) {
      logger('warn', 'LGPD_DELETION_REQUEST_FORBIDDEN', { httpStatus: 403, userId: user.id, conversationId: clientId });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const { data: activeCases, error: casesError } = await supabase
      .from('cases')
      .select('id, status')
      .eq('conversation_id', clientId)
      .not('status', 'in', '("closed","encerrado","arquivado")');

    if (casesError) throw casesError;

    if (mode === 'full' && activeCases && activeCases.length > 0) {
      logger('warn', 'LGPD_DELETION_REQUEST_ACTIVE_CASES', { httpStatus: 409, userId: user.id, conversationId: clientId });
      return res.status(409).json({ error: 'Existem casos ativos. A exclusão completa não é permitida.' });
    }

    const request = {
      conversation_id: clientId,
      requested_by: user.id,
      mode,
      reason,
      notes: notes || null,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const { data: created, error: insertError } = await supabase
      .from('anonymized_data')
      .insert(request)
      .select('id, conversation_id, mode, reason, notes, status, created_at')
      .single();

    if (insertError) throw insertError;

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: AUDIT_ENTITY,
      p_entity_id: clientId,
      p_action: mode === 'full' ? 'request_deletion' : 'request_anonymization',
      p_old_value: null,
      p_new_value: 'pending',
      p_details: JSON.stringify({ requestId: created.id, mode, reason, by: user.id })
    });

    logger('info', 'LGPD_DELETION_REQUEST_SUCCESS', { httpStatus: 201, userId: user.id, conversationId: clientId });
    return res.status(201).json({
      requestId: created.id,
      clientId,
      mode,
      reason,
      status: 'pending',
      createdAt: created.created_at
    });
  } catch (error) {
    logger('error', 'LGPD_DELETION_REQUEST_ERROR', { httpStatus: 500, userId: user.id, conversationId: clientId, errorCode: 'REQUEST_FAILED' });
    return res.status(500).json({ error: 'Erro ao registrar solicitação' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
