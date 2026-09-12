import { createClient } from '@supabase/supabase-js';
import { withAuth } from '@/lib/auth';
import { computeFunnelWhatsAppMetrics } from '@/lib/funnel-whatsapp-metrics';
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

  if (req.method !== 'GET') {
    logger('warn', 'WHATSAPP_FUNNEL_METRICS_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const user = req.user;
  const { from, to, clientId, conversationId, stage } = req.query;

  try {
    const metrics = await computeFunnelWhatsAppMetrics(supabase, { from, to, clientId, conversationId, stage });

    logger('info', 'WHATSAPP_FUNNEL_METRICS_SUCCESS', {
      httpStatus: 200,
      userId: user.id,
      totalConversations: metrics.totalConversations,
      totalMessages: metrics.totalMessages
    });

    return res.status(200).json(metrics);
  } catch (error) {
    logger('error', 'WHATSAPP_FUNNEL_METRICS_ERROR', { httpStatus: 500, userId: user.id, errorCode: 'FUNNEL_METRICS_FAILED' });
    return res.status(500).json({ error: 'Erro ao calcular métricas' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
