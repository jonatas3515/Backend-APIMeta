/**
 * API: Notificacoes
 * Agrega notificacoes de multiplas fontes para o usuario autenticado
 * SEGURANCA: Filtra por user_id, sem PII em titulos
 */

import { withAuth } from '../../lib/auth';
import notificationCache from '../../lib/notificationCache';
import { aggregateNotifications } from '../../lib/notificationAggregator';

/**
 * Sanitiza erro para log
 */
function sanitizeError(error) {
  if (!error) return 'Unknown error';
  return {
    message: error.message || 'Unknown error',
    code: error.code,
    hint: error.hint
  };
}


/**
 * Handler principal
 */
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
    res.setHeader('Retry-After', '3');
    return res.status(429).json({
      error: 'rate_limited',
      retryAfterSeconds: 3,
      unreadCount: 0,
      countReliable: false,
      notifications: [],
      errors: []
    });
  }

  // Parametro refresh e reconhecido somente como '1'
  const isRefresh = req.query?.refresh === '1';

  try {
    if (isRefresh) {
      notificationCache.invalidate(userId, userRole);
    }

    const cached = notificationCache.get(userId, 'list', userRole);
    if (cached) {
      return res.status(200).json(cached);
    }

    const result = await aggregateNotifications({ userId, userRole });

    const response = {
      notifications: result.notifications,
      unreadCount: result.notifications.length,
      countReliable: result.countReliable,
      errors: result.errors
    };

    if (result.countReliable) {
      notificationCache.set(userId, response, 'list', userRole);
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('[NOTIFICATIONS] Erro:', sanitizeError(error));
    return res.status(500).json({
      error: 'Internal server error',
      unreadCount: 0,
      countReliable: false,
      errors: [{ source: 'server', code: 'internal_error' }]
    });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
