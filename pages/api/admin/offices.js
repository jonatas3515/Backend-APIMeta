import { withAuth, supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';
import { PLANS } from '@/lib/plans';

const VALID_PLANS = ['trial', 'pro', 'basico', 'profissional', 'enterprise'];

async function listOffices(res, userId) {
  const { data: offices, error } = await supabaseAdmin
    .from('offices')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: subs, error: subError } = await supabaseAdmin
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false });
  if (subError && !/subscriptions/i.test(subError.message || '')) throw subError;

  const subByOffice = {};
  for (const s of subs || []) {
    if (!subByOffice[s.office_id]) subByOffice[s.office_id] = s;
  }

  logger('info', 'ADMIN_OFFICES_LIST', { userId, httpStatus: 200, count: (offices || []).length });
  return res.status(200).json({
    offices: (offices || []).map((o) => ({ ...o, subscription: subByOffice[o.id] || null }))
  });
}

async function handler(req, res) {
  const userId = req.user?.id;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  try {
    if (req.method === 'GET') {
      return await listOffices(res, userId);
    }

    if (req.method !== 'PATCH') {
      return res.status(405).json({ error: 'Método não permitido' });
    }

    const { office_id, action, plan, days, name } = req.body || {};
    if (!office_id || !action) {
      return res.status(400).json({ error: 'office_id e action são obrigatórios' });
    }

    const updates = { updated_at: new Date().toISOString() };
    let syncSubscription = null;

    if (action === 'activate') {
      updates.status = 'active';
      syncSubscription = { status: 'active' };
    } else if (action === 'suspend') {
      updates.status = 'blocked';
      syncSubscription = { status: 'cancelled' };
    } else if (action === 'set_plan') {
      if (!VALID_PLANS.includes(plan)) {
        return res.status(400).json({ error: `Plano inválido. Válidos: ${VALID_PLANS.join(', ')}` });
      }
      updates.plan = plan;
      syncSubscription = { plan, status: plan === 'trial' ? 'trialing' : 'active' };
    } else if (action === 'extend_trial') {
      const addDays = Number.isFinite(Number(days)) ? Number(days) : 30;
      const { data: office, error: findError } = await supabaseAdmin
        .from('offices')
        .select('trial_ends_at')
        .eq('id', office_id)
        .single();
      if (findError || !office) {
        return res.status(404).json({ error: 'Escritório não encontrado' });
      }
      const base = office.trial_ends_at && new Date(office.trial_ends_at) > new Date()
        ? new Date(office.trial_ends_at)
        : new Date();
      updates.trial_ends_at = new Date(base.getTime() + addDays * 24 * 60 * 60 * 1000).toISOString();
      updates.status = 'trial';
      syncSubscription = { status: 'trialing', current_period_end: updates.trial_ends_at };
    } else if (action === 'edit') {
      if (!name || !String(name).trim()) {
        return res.status(400).json({ error: 'Nome é obrigatório para edição' });
      }
      updates.name = String(name).trim();
    } else {
      return res.status(400).json({ error: `Ação inválida: ${action}` });
    }

    const { data: office, error: updateError } = await supabaseAdmin
      .from('offices')
      .update(updates)
      .eq('id', office_id)
      .select()
      .single();

    if (updateError) {
      logger('error', 'ADMIN_OFFICES_UPDATE_ERROR', { userId, httpStatus: 500 });
      return res.status(500).json({ error: 'Erro ao atualizar escritório' });
    }

    if (syncSubscription) {
      const { error: syncError } = await supabaseAdmin
        .from('subscriptions')
        .update({ ...syncSubscription, updated_at: new Date().toISOString() })
        .eq('office_id', office_id);
      if (syncError && !/subscriptions/i.test(syncError.message || '')) {
        logger('warn', 'ADMIN_SUB_SYNC_WARN', { userId });
      }
    }

    logger('info', 'ADMIN_OFFICES_PATCH', { userId, officeId: office_id, action, httpStatus: 200 });
    return res.status(200).json({ success: true, office });
  } catch (error) {
    logger('error', 'ADMIN_OFFICES_ERROR', { userId, httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao processar escritórios' });
  }
}

export default withAuth(handler, { minRole: 'admin' });
