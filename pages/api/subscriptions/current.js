import { withAuth, supabaseAdmin } from '@/lib/auth';
import { getDefaultOfficeId } from '@/lib/officeContext';
import { getPlanDetails, calculateTrialDaysRemaining } from '@/lib/plans';
import logger from '@/lib/logger';

async function handler(req, res) {
  const userId = req.user?.id;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const officeId = req.query.office_id || req.user?.office_id || getDefaultOfficeId();

  try {
    const { data: office, error: officeError } = await supabaseAdmin
      .from('offices')
      .select('id, name, plan, status, trial_ends_at')
      .eq('id', officeId)
      .maybeSingle();

    if (officeError) throw officeError;

    if (!office) {
      return res.status(404).json({ error: 'Escritório não encontrado' });
    }

    const { data: subscription, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('id, office_id, plan, status, current_period_start, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id')
      .eq('office_id', officeId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subError) throw subError;

    const effectivePlan = subscription?.plan || office.plan || 'trial';
    const trialDaysRemaining = calculateTrialDaysRemaining(office.trial_ends_at);

    logger('info', 'SUBSCRIPTION_CURRENT_SUCCESS', { userId, officeId, httpStatus: 200 });
    return res.status(200).json({
      office: {
        id: office.id,
        name: office.name,
        plan: office.plan,
        status: office.status,
        trial_ends_at: office.trial_ends_at
      },
      subscription: subscription || null,
      plan: effectivePlan,
      plan_details: getPlanDetails(effectivePlan),
      trial: {
        active: office.status === 'trialing' || (subscription?.status === 'trialing'),
        days_remaining: trialDaysRemaining,
        ends_at: office.trial_ends_at
      }
    });
  } catch (error) {
    logger('error', 'SUBSCRIPTION_CURRENT_ERROR', { userId, officeId, httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao buscar assinatura' });
  }
}

export default withAuth(handler, { minRole: 'estagiario' });
