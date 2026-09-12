import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { isValidEventType, registerFunnelEvent } from '@/lib/funnel-whatsapp';
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

  if (req.method !== 'POST') {
    logger('warn', 'WHATSAPP_FUNNEL_EVENT_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const user = req.user;
  const { conversationId, clientId, eventType, metadata = {} } = req.body;

  if (!conversationId || !isValidEventType(eventType)) {
    logger('warn', 'WHATSAPP_FUNNEL_EVENT_VALIDATION', { httpStatus: 400, userId: user.id });
    return res.status(400).json({ error: 'conversationId e eventType válidos são obrigatórios' });
  }

  try {
    const result = await registerFunnelEvent({
      supabase,
      conversationId,
      clientId,
      eventType,
      triggeredBy: user.id,
      metadata: {
        ...metadata,
        trigger: 'manual'
      }
    });

    if (!result) {
      return res.status(500).json({ error: 'Erro ao registrar evento de funil' });
    }

    logger('info', 'WHATSAPP_FUNNEL_EVENT_SUCCESS', { httpStatus: 200, userId: user.id, conversationId, eventType });
    return res.status(201).json({
      success: true,
      eventId: result.id,
      conversationId,
      eventType
    });
  } catch (error) {
    logger('error', 'WHATSAPP_FUNNEL_EVENT_ERROR', { httpStatus: 500, userId: user.id, conversationId, errorCode: 'FUNNEL_EVENT_FAILED' });
    return res.status(500).json({ error: 'Erro ao registrar evento de funil' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
