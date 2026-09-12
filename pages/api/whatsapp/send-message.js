import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import logger from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const SUPPORTED_TYPES = ['text', 'image', 'document', 'audio', 'video'];

function hashPhone(phone) {
  if (!phone) return null;
  return `***${phone.slice(-4)}`;
}

async function handler(req, res) {
  if (!supabase) {
    return res.status(500).json({ error: 'Serviço indisponível' });
  }

  if (req.method !== 'POST') {
    logger('warn', 'WHATSAPP_SEND_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const user = req.user;
  const { to, type = 'text', content, clientId, conversationId, mediaUrl = null } = req.body;

  if (!to || !SUPPORTED_TYPES.includes(type) || !content) {
    logger('warn', 'WHATSAPP_SEND_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: 'to, type e content são obrigatórios e type deve ser suportado' });
  }

  const conversationIdUsed = clientId || conversationId;

  if (!conversationIdUsed) {
    logger('warn', 'WHATSAPP_SEND_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: 'clientId ou conversationId é obrigatório' });
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, client_phone, assigned_user_id')
      .eq('id', conversationIdUsed)
      .single();

    if (convError || !conversation) {
      logger('warn', 'WHATSAPP_SEND_NOT_FOUND', { httpStatus: 404, userId: user.id, conversationId: conversationIdUsed });
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const isAdmin = user.role === 'admin';
    const isLawyer = user.role === 'advogado';
    const isOwner = conversation.assigned_user_id === user.id;

    if (!isAdmin && !isLawyer && !isOwner) {
      logger('warn', 'WHATSAPP_SEND_FORBIDDEN', { httpStatus: 403, userId: user.id, conversationId: conversationIdUsed });
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const phone = to.startsWith('5') ? to : conversation.client_phone;
    const waMessageId = await sendWhatsAppMessage(phone, content);

    const { data: inserted, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationIdUsed,
        direction: 'outbound',
        sender_type: 'human',
        content_type: type,
        text: content,
        media_url: mediaUrl,
        wa_message_id: waMessageId || null,
        status: 'sent'
      })
      .select('id')
      .single();

    if (msgError) throw msgError;

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: 'whatsapp_message',
      p_entity_id: inserted.id,
      p_action: 'send_message',
      p_old_value: null,
      p_new_value: 'sent',
      p_details: JSON.stringify({ to: hashPhone(phone), type, conversationId: conversationIdUsed })
    });

    logger('info', 'WHATSAPP_SEND_SUCCESS', { httpStatus: 200, userId: user.id, conversationId: conversationIdUsed });
    return res.status(200).json({
      success: true,
      messageId: inserted.id,
      waMessageId: waMessageId || null
    });
  } catch (error) {
    logger('error', 'WHATSAPP_SEND_ERROR', { httpStatus: 500, userId: user.id, conversationId: conversationIdUsed, errorCode: 'WHATSAPP_SEND_FAILED' });
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
