import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { sendWhatsAppMessage } from '@/lib/whatsapp';
import { applyTemplate } from '@/lib/whatsapp-templates';
import { evaluateFunnelAutomation, registerFunnelEvent } from '@/lib/funnel-whatsapp';
import logger from '@/lib/logger';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

const SUPPORTED_TYPES = ['text', 'image', 'document', 'audio', 'video', 'template'];

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
  const { to, type = 'text', content, templateId, variables = {}, clientId, conversationId, mediaUrl = null } = req.body;

  if (!to || !SUPPORTED_TYPES.includes(type)) {
    logger('warn', 'WHATSAPP_SEND_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: 'to e type são obrigatórios e type deve ser suportado' });
  }

  const conversationIdUsed = clientId || conversationId;

  if (!conversationIdUsed) {
    logger('warn', 'WHATSAPP_SEND_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: 'clientId ou conversationId é obrigatório' });
  }

  let template = null;
  let messageText = content;
  let action = 'send_message';

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

    if (type === 'template') {
      if (!templateId) {
        logger('warn', 'WHATSAPP_SEND_VALIDATION', { httpStatus: 400, userId: user.id });
        return res.status(400).json({ error: 'templateId é obrigatório para type=template' });
      }

      const { data: t, error: tError } = await supabase
        .from('whatsapp_templates')
        .select('id, name, content, status')
        .eq('id', templateId)
        .eq('status', 'approved')
        .single();

      if (tError || !t) {
        logger('warn', 'WHATSAPP_TEMPLATE_NOT_FOUND', { httpStatus: 404, userId: user.id, templateId });
        return res.status(404).json({ error: 'Template não encontrado ou não aprovado' });
      }

      template = t;
      messageText = applyTemplate(t.content, variables);
      action = 'send_template_message';
    }

    const waMessageId = await sendWhatsAppMessage(phone, messageText);

    const { data: inserted, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id: conversationIdUsed,
        direction: 'outbound',
        sender_type: 'human',
        content_type: type,
        text: messageText,
        media_url: mediaUrl,
        wa_message_id: waMessageId || null,
        template_id: template ? template.id : null,
        status: 'sent'
      })
      .select('id')
      .single();

    if (msgError) throw msgError;

    const auditDetails = {
      to: hashPhone(phone),
      type,
      conversationId: conversationIdUsed
    };

    if (template) {
      auditDetails.templateId = template.id;
      auditDetails.templateName = template.name;
    }

    await supabase.rpc('log_audit', {
      p_user_id: user.id,
      p_entity_type: 'whatsapp_message',
      p_entity_id: inserted.id,
      p_action: action,
      p_old_value: null,
      p_new_value: 'sent',
      p_details: JSON.stringify(auditDetails)
    });

    const eventType = evaluateFunnelAutomation({
      direction: 'outbound',
      text: messageText,
      templateName: template ? template.name : ''
    });

    if (eventType) {
      await registerFunnelEvent({
        supabase,
        conversationId: conversationIdUsed,
        eventType,
        triggeredBy: user.id,
        metadata: {
          messageId: inserted.id,
          templateId: template ? template.id : null,
          direction: 'outbound',
          trigger: 'automation'
        }
      });
    }

    const logKey = template ? 'WHATSAPP_SEND_TEMPLATE_SUCCESS' : 'WHATSAPP_SEND_SUCCESS';
    logger('info', logKey, { httpStatus: 200, userId: user.id, conversationId: conversationIdUsed });

    return res.status(200).json({
      success: true,
      messageId: inserted.id,
      waMessageId: waMessageId || null
    });
  } catch (error) {
    const logKey = template ? 'WHATSAPP_SEND_TEMPLATE_ERROR' : 'WHATSAPP_SEND_ERROR';
    logger('error', logKey, { httpStatus: 500, userId: user.id, conversationId: conversationIdUsed, errorCode: 'WHATSAPP_SEND_FAILED' });
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
