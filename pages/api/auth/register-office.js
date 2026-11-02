import { supabaseAdmin } from '@/lib/auth';
import logger from '@/lib/logger';
import { PLANS } from '@/lib/plans';

const TRIAL_DAYS = 30;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function detectCardBrand(number) {
  const clean = String(number || '').replace(/\D/g, '');
  if (/^4/.test(clean)) return 'Visa';
  if (/^(5[1-5]|222[1-9]|22[3-9]|2[3-6]|27[01]|2720)/.test(clean)) return 'Mastercard';
  if (/^(4011|438935|451416|4576|504175|5067|5090|627780|636297|636368)/.test(clean)) return 'Elo';
  if (/^(34|37)/.test(clean)) return 'American Express';
  if (/^(606282|3841)/.test(clean)) return 'Hipercard';
  return 'Cartão de Crédito';
}

async function handler(req, res) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const {
    office_name,
    cnpj,
    admin_name,
    email,
    phone,
    password,
    plan = 'trial',
    billing_cycle = 'monthly',
    // Endereço
    address_street,
    address_number,
    address_complement,
    address_neighborhood,
    address_city,
    address_state,
    address_zip,
    // Faturamento / Pagamento (se pago)
    billing_cpf_cnpj,
    card_number,
    card_name,
    card_exp,
    card_cvc
  } = req.body || {};

  if (!office_name || !admin_name || !email || !password) {
    return res.status(400).json({ error: 'office_name, admin_name, email e password são obrigatórios' });
  }

  if (!EMAIL_REGEX.test(String(email).trim())) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres' });
  }

  const planKey = (PLANS[plan] && plan !== 'trial') ? plan : 'trial';
  const isPaid = planKey !== 'trial';

  // Se plano pago, validação obrigatória dos dados de cobrança e cartão
  if (isPaid) {
    if (!billing_cpf_cnpj || !String(billing_cpf_cnpj).trim()) {
      return res.status(400).json({ error: 'CPF ou CNPJ para faturamento é obrigatório no plano contratado' });
    }
    const cleanCard = String(card_number || '').replace(/\D/g, '');
    if (cleanCard.length < 13 || cleanCard.length > 19) {
      return res.status(400).json({ error: 'Número de cartão de crédito inválido' });
    }
    if (!card_name || !String(card_name).trim()) {
      return res.status(400).json({ error: 'Nome impresso no cartão é obrigatório' });
    }
    if (!card_exp || !String(card_exp).trim()) {
      return res.status(400).json({ error: 'Data de validade do cartão é obrigatória' });
    }
    if (!card_cvc || !String(card_cvc).trim()) {
      return res.status(400).json({ error: 'Código de segurança (CVC) é obrigatório' });
    }
  }

  const cleanEmail = String(email).trim().toLowerCase();
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const isYearly = billing_cycle === 'yearly';
  const periodEnd = new Date(Date.now() + (isYearly ? 365 : 30) * 24 * 60 * 60 * 1000).toISOString();

  const last4 = isPaid && card_number ? String(card_number).replace(/\D/g, '').slice(-4) : null;
  const brand = isPaid ? detectCardBrand(card_number) : null;

  try {
    // 1. Cria o escritorio
    const officePayload = {
      name: String(office_name).trim(),
      email: cleanEmail,
      phone: phone ? String(phone).trim() : null,
      cnpj: cnpj ? String(cnpj).trim() : null,
      address_street: address_street ? String(address_street).trim() : null,
      address_number: address_number ? String(address_number).trim() : null,
      address_complement: address_complement ? String(address_complement).trim() : null,
      address_neighborhood: address_neighborhood ? String(address_neighborhood).trim() : null,
      address_city: address_city ? String(address_city).trim() : null,
      address_state: address_state ? String(address_state).trim() : null,
      address_zip: address_zip ? String(address_zip).trim() : null,
      plan: planKey,
      status: isPaid ? 'active' : 'trial',
      trial_ends_at: isPaid ? null : trialEndsAt,
      billing_cpf_cnpj: billing_cpf_cnpj ? String(billing_cpf_cnpj).trim() : null,
      payment_method: isPaid ? 'credit_card' : null,
      last4_card: last4,
      card_brand: brand,
      billing_cycle: isPaid ? (isYearly ? 'yearly' : 'monthly') : 'monthly'
    };

    const { data: office, error: officeError } = await supabaseAdmin
      .from('offices')
      .insert(officePayload)
      .select()
      .single();

    if (officeError) {
      logger('error', 'REGISTER_OFFICE_ERROR', { error: officeError.message, httpStatus: 500 });
      return res.status(500).json({ error: 'Erro ao criar escritório' });
    }

    // 2. Cria a assinatura
    const subPayload = {
      office_id: office.id,
      plan: planKey,
      status: isPaid ? 'active' : 'trialing',
      current_period_start: new Date().toISOString(),
      current_period_end: isPaid ? periodEnd : trialEndsAt,
      billing_cpf_cnpj: billing_cpf_cnpj ? String(billing_cpf_cnpj).trim() : null,
      payment_method: isPaid ? 'credit_card' : null,
      last4_card: last4,
      card_brand: brand,
      billing_cycle: isPaid ? (isYearly ? 'yearly' : 'monthly') : 'monthly'
    };

    const { error: subError } = await supabaseAdmin
      .from('subscriptions')
      .insert(subPayload);

    if (subError) {
      logger('error', 'REGISTER_SUBSCRIPTION_ERROR', { officeId: office.id, error: subError.message, httpStatus: 500 });
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

    // 4. Vincula na tabela users como admin do escritorio criado (sem privilégios master)
    const { error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        name: String(admin_name).trim(),
        email: cleanEmail,
        role: 'admin',
        is_active: true,
        auth_user_id: authData.user.id,
        office_id: office.id,
        is_master: false
      });

    if (userError) {
      logger('error', 'REGISTER_USER_ERROR', { officeId: office.id, error: userError.message, httpStatus: 500 });
      return res.status(500).json({ error: 'Erro ao vincular usuário administrador' });
    }

    logger('info', 'REGISTER_OFFICE_SUCCESS', { officeId: office.id, isPaid, plan: planKey, httpStatus: 201 });
    return res.status(201).json({
      success: true,
      office: { id: office.id, name: office.name, plan: office.plan, status: office.status, trial_ends_at: office.trial_ends_at },
      user: { email: cleanEmail, role: 'admin' },
      plan: planKey,
      is_paid: isPaid,
      trial_days: isPaid ? 0 : TRIAL_DAYS
    });
  } catch (error) {
    logger('error', 'REGISTER_OFFICE_EXCEPTION', { httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao registrar escritório' });
  }
}

export default handler;
