/**
 * API: Contagem de Notificações
 * Retorna contagem rápida de notificações não lidas para o badge
 */

import { createClient } from '@supabase/supabase-js';
import notificationCache from '../../../lib/notificationCache';
import { aggregateNotifications } from '../../../lib/notificationAggregator';
import { withAuth, getTenantOfficeId } from '../../../lib/auth';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase = (SUPABASE_URL && SUPABASE_SERVICE_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

function sanitizeError(error) {
  if (!error) return 'Unknown error';
  return {
    message: error.message || 'Unknown error',
    code: error.code
  };
}

/**
 * Conta notificações de forma otimizada
 */
async function countNotifications(userId, userRole, officeId) {
  if (!supabase) return 0;
  try {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const counts = await Promise.allSettled([
      // Mensagens não lidas
      (() => {
        let q = supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('unread', true);
        if (officeId) q = q.eq('office_id', officeId);
        if (userRole !== 'admin') q = q.eq('assigned_user_id', userId);
        return q.then(({ count }) => count || 0);
      })(),

      // Lembretes pendentes
      (() => {
        let q = supabase.from('chat_reminders').select('id', { count: 'exact', head: true })
          .eq('status', 'pending')
          .lte('scheduled_for', next7Days.toISOString());
        if (officeId) q = q.eq('office_id', officeId);
        if (userRole !== 'admin') q = q.eq('created_by', userId);
        return q.then(({ count }) => count || 0);
      })(),

      // Prazos próximos
      (() => {
        let q = supabase.from('cases').select('id', { count: 'exact', head: true })
          .not('deadline_date', 'is', null)
          .lte('deadline_date', next7Days.toISOString().split('T')[0])
          .neq('status', 'encerrado');
        if (officeId) q = q.eq('office_id', officeId);
        return q.then(({ count }) => count || 0);
      })(),

      // Assinaturas pendentes
      (() => {
        let q = supabase.from('document_signatures').select('id', { count: 'exact', head: true })
          .eq('status', 'pending');
        if (officeId) q = q.eq('office_id', officeId);
        if (userRole !== 'admin') q = q.eq('created_by', userId);
        return q.then(({ count }) => count || 0);
      })()
    ]);

    let total = 0;
    counts.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        total += result.value;
      } else {
        console.error(`[NOTIFICATIONS/COUNT] Erro na fonte ${i}:`, result.reason);
      }
    });

    return total;
  } catch (error) {
    console.error('[NOTIFICATIONS/COUNT] Erro:', sanitizeError(error));
    return 0;
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = req.user?.id;
  const userRole = req.user?.role;
  const officeId = getTenantOfficeId(req);

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!notificationCache.checkRateLimit(userId)) {
    res.setHeader('Retry-After', '3');
    return res.status(429).json({
      error: 'rate_limited',
      retryAfterSeconds: 3,
      unreadCount: 0,
      countReliable: false,
      errors: []
    });
  }

  // Parâmetro refresh é reconhecido somente como '1'
  const isRefresh = req.query?.refresh === '1';
  if (isRefresh) {
    notificationCache.invalidate(userId, userRole);
  }

  const cached = notificationCache.get(userId, 'count', userRole);
  if (cached !== null) {
    return res.status(200).json(cached);
  }

  try {
    const result = await aggregateNotifications({ userId, userRole, officeId });

    const response = {
      unreadCount: result.notifications.length,
      countReliable: result.countReliable,
      errors: result.errors
    };

    if (result.countReliable) {
      notificationCache.set(userId, response, 'count', userRole);
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('[NOTIFICATIONS/COUNT] Erro:', sanitizeError(error));
    return res.status(500).json({
      error: 'Internal server error',
      unreadCount: 0,
      countReliable: false,
      errors: [{ source: 'server', code: 'internal_error' }]
    });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
