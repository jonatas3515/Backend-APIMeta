import { withAuth } from '@/lib/auth';
import { getMetricsSnapshot } from '@/lib/metrics';
import logger from '@/lib/logger';

const SOURCE = 'backend-api-meta';

function toCsv(collectedAt, snapshot) {
  const header = 'collectedAt,source,metric,value';
  const lines = [header];

  const sortedKeys = Object.keys(snapshot).sort();
  for (const key of sortedKeys) {
    lines.push(`${collectedAt},${SOURCE},${key},${snapshot[key]}`);
  }

  if (sortedKeys.length === 0) {
    lines.push(`${collectedAt},${SOURCE},,0`);
  }

  return lines.join('\n') + '\n';
}

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
    const collectedAt = new Date().toISOString();
    const snapshot = getMetricsSnapshot();
    const format = req.query?.format || 'json';

    if (format === 'csv') {
      const csv = toCsv(collectedAt, snapshot);
      logger('info', 'METRICS_CSV_SUCCESS', { httpStatus: 200, userId: user?.id });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="metrics-${collectedAt.replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)}.csv"`);
      return res.status(200).send(csv);
    }

    logger('info', 'METRICS_ACCESS_SUCCESS', { httpStatus: 200, userId: user?.id });
    return res.status(200).json({
      collectedAt,
      source: SOURCE,
      metrics: snapshot
    });
  } catch (error) {
    logger('error', 'METRICS_ACCESS_ERROR', { httpStatus: 500, userId: user?.id });
    return res.status(500).json({ error: 'Erro ao buscar metricas' });
  }
}

export default withAuth(handler, { allowedRoles: ['admin'] });
