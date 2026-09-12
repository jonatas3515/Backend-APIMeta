import { withAuth } from '@/lib/auth';
import { getMetricsSnapshot } from '@/lib/metrics';
import logger from '@/lib/logger';

async function handler(req, res) {
  if (req.method !== 'GET') {
    logger('warn', 'METRICS_INVALID_METHOD', { httpStatus: 405, userId: req.user?.id });
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const user = req.user;

  if (user?.role !== 'admin') {
    logger('warn', 'METRICS_ACCESS_DENIED', { httpStatus: 403, userId: user?.id });
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    const snapshot = getMetricsSnapshot();
    logger('info', 'METRICS_ACCESS_SUCCESS', { httpStatus: 200, userId: user?.id });
    return res.status(200).json({ metrics: snapshot });
  } catch (error) {
    logger('error', 'METRICS_ACCESS_ERROR', { httpStatus: 500, userId: user?.id });
    return res.status(500).json({ error: 'Erro ao buscar metricas' });
  }
}

export default withAuth(handler, { allowedRoles: ['admin'] });
