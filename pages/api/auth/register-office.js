import { supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';
import { PLANS } from '@/lib/plans';

const TRIAL_DAYS = 14;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { office_name, admin_name, email, phone, password, plan = 'trial' } = req.body || {};

  if (!office_name || !admin_name || !email || !password) {
    return res.status(400).json({ error: 'office_name, admin_name, email e password são obrigatórios' });
  }

  if (!EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const planKey = PLANS[plan] ? plan : 'trial';

  try {
    // 1. Cria o escritorio em trial
    const { data: office, error: officeError } = await supabaseAdmin
      .from('offices')
      .insert({
        name: String(office_name).trim(),
        email: cleanEmail,
        phone: phone ? String(phone).trim() : null,
        plan: planKey,
        status: 'trial',
        trial_ends_at: trialEndsAt
      })
      .select()
      .single();

    if (officeError) {
      logger('error', 'REGISTER_OFFICE_ERROR', { httpStatus: 500 });
      return res.status(500).json({ error: 'Erro ao criar escritório' });
    }

    // 2. Cria a assinatura em trialing
    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .insert({
        office_id: office.id,
        plan: planKey,
        status: 'trialing',
        current_period_start: new Date().toISOString(),
        current_period_end: trialEndsAt
      });

    if (subError) {
      logger('error', 'REGISTER_SUBSCRIPTION_ERROR', { officeId: office.id, httpStatus: 500 });
    }

    // 3. Cria o usuario admin no Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { name: String(admin_name).trim(), office_id: office.id }
    });

    if (authError) {
      const already = /already been registered|already exists/i.test(authError.message || '');
      logger('warn', 'REGISTER_AUTH_ERROR', { officeId: office.id, httpStatus: already ? 409 : 500 });
      return res.status(already ? 409 : 500).json({
        error: already ? 'E-mail já cadastrado' : 'Erro ao criar usuário'
      });
    }

    // 4. Vincula na tabela users (office_id se a coluna existir)
    let { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        name: String(admin_name).trim(),
        email: cleanEmail,
        role: 'admin',
        is_active: true,
        auth_user_id: authData.user.id,
        office_id: office.id
      });

    if (userError && /office_id/i.test(userError.message || '')) {
      const { error: retryError } = await supabaseAdmin
        .from('users')
        .insert({
          name: String(admin_name).trim(),
          email: cleanEmail,
          role: 'admin',
          is_active: true,
          auth_user_id: authData.user.id
        });
      userError = retryError;
    }

    if (userError) {
      logger('error', 'REGISTER_USER_ERROR', { officeId: office.id, httpStatus: 500 });
      return res.status(500).json({ error: 'Erro ao vincular usuário administrador' });
    }

    logger('info', 'REGISTER_OFFICE_SUCCESS', { officeId: office.id, httpStatus: 201 });
    return res.status(201).json({
      success: true,
      office: { id: office.id, name: office.name, plan: office.plan, status: office.status, trial_ends_at: office.trial_ends_at },
      user: { email: cleanEmail, role: 'admin' },
      trial_days: TRIAL_DAYS
    });
  } catch (error) {
    logger('error', 'REGISTER_OFFICE_EXCEPTION', { httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao registrar escritório' });
  }
}

export default handler;
