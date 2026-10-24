import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';
import { PLANS } from '@/lib/plans';

// 'pro' (plano da matriz) equivale comercialmente ao Profissional para fins de MRR
const PRICE_BY_PLAN = { pro: PLANS.profissional.price, basico: PLANS.basico.price, profissional: PLANS.profissional.price, enterprise: PLANS.enterprise.price, trial: 0 };

async function handler(req, res) {
  const userId = req.user?.id;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  try {
    const { data: offices, error } = await supabaseAdmin
      .from('offices')
      .select('id, plan, status');
    if (error) throw error;

    const { data: subs, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('office_id, plan, status');
    const subscriptions = subError ? [] : (subs || []);

    const activeSubByOffice = {};
    for (const s of subscriptions) {
      if (s.status === 'active' && !activeSubByOffice[s.office_id]) {
        activeSubByOffice[s.office_id] = s;
      }
    }

    const all = offices || [];
    const total = all.length;
    const trial_count = all.filter((o) => o.status === 'trial' || o.status === 'trialing').length;
    const active_count = all.filter((o) => o.status === 'active').length;
    const blocked_count = all.filter((o) => o.status === 'blocked' || o.status === 'suspended').length;

    const mrr = all.reduce((sum, o) => {
      if (o.status !== 'active') return sum;
      const sub = activeSubByOffice[o.id];
      const plan = sub?.plan || o.plan;
      return sum + (PRICE_BY_PLAN[plan] || 0);
    }, 0);

    const conversion_rate = total > 0 ? Math.round((active_count / total) * 100) : 0;

    logger('info', 'ADMIN_METRICS_SUCCESS', { userId, httpStatus: 200 });
    return res.status(200).json({
      mrr,
      arr: mrr * 12,
      total_offices: total,
      trial_count,
      active_count,
      blocked_count,
      conversion_rate
    });
  } catch (error) {
    logger('error', 'ADMIN_METRICS_ERROR', { userId, httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao calcular métricas do SaaS' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
