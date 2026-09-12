import logger from './logger';

export const WHATSAPP_FUNNEL_EVENT_TYPES = [
  'first_contact',
  'qualification',
  'proposal_sent',
  'negotiation',
  'closed',
  'lost'
];

const EVENT_TO_FUNNEL_STAGE = {
  first_contact: 'lead_novo',
  qualification: 'intake_concluido',
  proposal_sent: 'proposta_enviada',
  negotiation: 'proposta_enviada',
  closed: 'contrato_assinado',
  lost: 'encerrado'
};

const KEYWORDS = {
  closed: ['fechar', 'contratar', 'fechado', 'quero prosseguir'],
  lost: ['não tenho interesse', 'não quero', 'desistir', 'não vou prosseguir']
};

export function isValidEventType(eventType) {
  return WHATSAPP_FUNNEL_EVENT_TYPES.includes(eventType);
}

export function getFunnelStageForEvent(eventType) {
  return EVENT_TO_FUNNEL_STAGE[eventType] || null;
}

export function evaluateFunnelAutomation({ direction, text = '', templateName = '', firstContactAt = null }) {
  const lowerText = (text || '').toLowerCase();

  if (direction === 'inbound' && !firstContactAt) {
    return 'first_contact';
  }

  if (direction === 'inbound') {
    for (const [eventType, words] of Object.entries(KEYWORDS)) {
      if (words.some(w => lowerText.includes(w))) {
        return eventType;
      }
    }
  }

  if (direction === 'outbound') {
    const lowerTemplate = (templateName || '').toLowerCase();
    if (lowerTemplate.includes('proposta') || lowerText.includes('proposta')) {
      return 'proposal_sent';
    }
  }

  return null;
}

export async function registerFunnelEvent({
  supabase,
  conversationId,
  clientId,
  eventType,
  triggeredBy = 'system',
  metadata = {}
}) {
  if (!supabase || !conversationId || !isValidEventType(eventType)) {
    return null;
  }

  try {
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('id, funnel_stage')
      .eq('id', conversationId)
      .single();

    if (convError || !conversation) {
      logger('warn', 'WHATSAPP_FUNNEL_REGISTER_NOT_FOUND', { conversationId, eventType });
      return null;
    }

    const targetStage = getFunnelStageForEvent(eventType);

    const reason = JSON.stringify({
      eventType,
      ...metadata
    });

    const { data: history, error: historyError } = await supabase
      .from('funnel_history')
      .insert({
        conversation_id: conversationId,
        from_stage: conversation.funnel_stage,
        to_stage: eventType,
        changed_by: String(triggeredBy),
        reason
      })
      .select('id')
      .single();

    if (historyError) throw historyError;

    const updates = {
      updated_at: new Date().toISOString()
    };

    if (eventType === 'first_contact') {
      updates.first_contact_at = new Date().toISOString();
    }

    if (targetStage) {
      updates.funnel_stage = targetStage;
      if (targetStage === 'contrato_assinado') {
        updates.converted_at = new Date().toISOString();
      }
      if (targetStage === 'encerrado') {
        updates.closed_at = new Date().toISOString();
      }
    }

    const { error: updateError } = await supabase
      .from('conversations')
      .update(updates)
      .eq('id', conversationId);

    if (updateError) throw updateError;

    await supabase.rpc('log_audit', {
      p_user_id: triggeredBy === 'system' ? null : triggeredBy,
      p_entity_type: 'funnel_event',
      p_entity_id: history.id,
      p_action: metadata.trigger === 'automation' ? 'whatsapp_funnel_auto_event' : 'whatsapp_funnel_event',
      p_old_value: conversation.funnel_stage,
      p_new_value: eventType,
      p_details: JSON.stringify({
        conversationId,
        clientId,
        eventType,
        direction: metadata.direction,
        trigger: metadata.trigger
      })
    });

    logger('info', 'WHATSAPP_FUNNEL_EVENT_SUCCESS', {
      conversationId,
      eventType,
      trigger: metadata.trigger
    });

    return { id: history.id };
  } catch (error) {
    logger('error', 'WHATSAPP_FUNNEL_EVENT_ERROR', { conversationId, eventType, errorCode: 'FUNNEL_REGISTER_FAILED' });
    return null;
  }
}
