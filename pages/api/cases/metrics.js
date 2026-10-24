import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';

const COURTS = ['TRT', 'TRF', 'TJ', 'STJ', 'STF', 'Outro'];
const STEPS = ['conciliacao', 'instrucao', 'sentenca', 'recurso', 'execucao', 'acordo', 'outro'];

async function handler(req, res) {
  const userId = req.user?.id;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    let query = supabaseAdmin
      .from('cases')
      .select('court, procedural_step, case_value, status')
      .neq('status', 'encerrado');

    if (req.query.office_id) {
      query = query.eq('office_id', req.query.office_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    const by_court = Object.fromEntries(COURTS.map((c) => [c, 0]));
    const by_procedural_step = Object.fromEntries(STEPS.map((s) => [s, 0]));
    let valueTotal = 0;
    let valueCount = 0;

    for (const row of data || []) {
      const court = COURTS.includes(row.court) ? row.court : (row.court ? 'Outro' : null);
      if (court) by_court[court] += 1;

      const step = STEPS.includes(row.procedural_step) ? row.procedural_step : (row.procedural_step ? 'outro' : null);
      if (step) by_procedural_step[step] += 1;

      const value = Number(row.case_value);
      if (Number.isFinite(value) && value > 0) {
        valueTotal += value;
        valueCount += 1;
      }
    }

    logger('info', 'CASES_METRICS_SUCCESS', { userId, httpStatus: 200, count: (data || []).length });
    return res.status(200).json({
      total: (data || []).length,
      by_court,
      by_procedural_step,
      case_value: {
        count: valueCount,
        total: valueTotal,
        average: valueCount > 0 ? valueTotal / valueCount : 0
      }
    });
  } catch (error) {
    logger('error', 'CASES_METRICS_ERROR', { userId, httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao calcular métricas' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
