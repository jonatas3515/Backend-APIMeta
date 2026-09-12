import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { anonymizeClientProfile } from '@/lib/lgpd-deletion';
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
    logger('warn', 'LGPD_DELETION_EXECUTE_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  return handlePost(req, res);
}

async function handlePost(req, res) {
  const user = req.user;
  const { requestId, confirm } = req.body;

  if (user.role !== 'admin') {
    logger('warn', 'LGPD_DELETION_EXECUTE_FORBIDDEN', { httpStatus: 403, userId: user.id });
    return res.status(403).json({ error: 'Acesso negado' });
  }

  if (!requestId || confirm !== true) {
    logger('warn', 'LGPD_DELETION_EXECUTE_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: 'requestId e confirm=true são obrigatórios' });
  }

  try {
    const { data: request, error: reqError } = await supabase
      .from('anonymized_data')
      .select('id, conversation_id, mode, reason, notes, status')
      .eq('id', requestId)
      .single();

    if (reqError || !request) {
      logger('warn', 'LGPD_DELETION_EXECUTE_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Solicitação não encontrada' });
    }

    if (request.status !== 'pending') {
      logger('warn', 'LGPD_DELETION_EXECUTE_ALREADY_PROCESSED', { httpStatus: 409, userId: user.id });
      return res.status(409).json({ error: 'Solicitação já foi processada' });
    }

    const clientId = request.conversation_id;
    const { mode } = request;

    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*')
      .eq('id', clientId)
      .single();

    if (convError || !conversation) {
      logger('warn', 'LGPD_DELETION_EXECUTE_CLIENT_NOT_FOUND', { httpStatus: 404, userId: user.id });
      return res.status(404).json({ error: 'Titular não encontrado' });
    }

    const anonPayload = anonymizeClientProfile(conversation);

    const { error: updateError } = await supabase
      .from('conversations')
      .update(anonPayload)
      .eq('id', clientId);

    if (updateError) throw updateError;

    if (mode === 'full') {
      const { error: messagesError } = await supabase
        .from('messages')
        .update({ text: '[conteúdo removido por solicitação LGPD]', media_url: null, media_caption: null })
        .eq('conversation_id', clientId);

      if (messagesError) throw messagesError;
    } else {
      const { error: messagesError } = await supabase
        .from('messages')
        .update({ sender_name: null })
        .eq('conversation_id', clientId)
        .not('sender_type', 'eq', 'system');

      if (messagesError) throw messagesError;
    }

    const { error: consentsError } = await supabase
      .from('consent_logs')
      .update({ revoked_at: new Date().toISOString() })
      .eq('conversation_id', clientId)
      .is('revoked_at', null);

    if (consentsError) throw consentsError;

    const { error: requestUpdateError } = await supabase
      .from('anonymized_data')
      .update({ status: 'completed', executed_at: new Date().toISOString(), executed_by: user.id })
      .eq('id', requestId);

    if (requestUpdateError) throw requestUpdateError;

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: AUDIT_ENTITY,
      p_entity_id: clientId,
      p_action: mode === 'full' ? 'execute_deletion' : 'execute_anonymization',
      p_old_value: 'pending',
      p_new_value: 'completed',
      p_details: JSON.stringify({ requestId, mode, by: user.id })
    });

    logger('info', 'LGPD_DELETION_EXECUTE_SUCCESS', { httpStatus: 200, userId: user.id, conversationId: clientId });
    return res.status(200).json({
      requestId,
      clientId,
      mode,
      status: 'completed'
    });
  } catch (error) {
    logger('error', 'LGPD_DELETION_EXECUTE_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'EXECUTION_FAILED' });
    return res.status(500).json({ error: 'Erro ao executar exclusão/anonimização' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
