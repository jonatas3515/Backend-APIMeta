/**
 * API: Contagem de Notificações
 * Retorna contagem rápida de notificações não lidas para o badge
 */

import { createClient } from '@supabase/supabase-js';
import notificationCache from '../../../lib/notificationCache';
import { aggregateNotifications } from '../../../lib/notificationAggregator';
import { withAuth } from '../../../lib/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
async function countNotifications(userId, userRole) {
  try {
    const now = new Date();
    const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const counts = await Promise.allSettled([
      // Mensagens não lidas (filtrar por assigned_user_id se não for admin)
      supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('unread', true)
        .then(async ({ data, count, error }) => {
          if (error || userRole === 'admin') return count || 0;
          // Filtrar por assigned_user_id se não for admin
          const { count: filteredCount } = await supabase
            .from('conversations')
            .select('id', { count: 'exact', head: true })
            .eq('unread', true)
            .eq('assigned_user_id', userId);
          return filteredCount || 0;
        }),

      // Lembretes pendentes
      supabase
        .from('chat_reminders')
        .select('id', { count: 'exact', head: true })
        .eq('completed', false)
        .eq('cancelled', false)
        .lte('scheduled_for', next7Days.toISOString())
        .eq(userRole !== 'admin' ? 'created_by_user_id' : 'id', userRole !== 'admin' ? userId : undefined)
        .then(({ count }) => count || 0),

      // Prazos próximos
      supabase
        .from('cases')
        .select('id', { count: 'exact', head: true })
        .not('deadline_date', 'is', null)
        .lte('deadline_date', next7Days.toISOString().split('T')[0])
        .neq('status', 'encerrado')
        .then(({ count }) => count || 0),

      // Movimentações não revisadas
      supabase
        .from('process_movements')
        .select('id', { count: 'exact', head: true })
        .is('reviewed_at', null)
        .then(({ count }) => count || 0),

      // Assinaturas pendentes
      supabase
        .from('document_signatures')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .eq(userRole !== 'admin' ? 'created_by_user_id' : 'id', userRole !== 'admin' ? userId : undefined)
        .then(({ count }) => count || 0)
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

  if (!userId || !userRole) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!notificationCache.checkRateLimit(userId)) {
    return res.status(429).json({
      error: 'Too many requests',
      unreadCount: 0,
      countReliable: false
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
    const result = await aggregateNotifications({ userId, userRole });

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
