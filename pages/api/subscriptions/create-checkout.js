import { withAuth, supabaseAdmin } from '@/lib/auth';
import { getDefaultOfficeId } from '@/lib/officeContext';
import { PLANS, getPlanDetails } from '@/lib/plans';
import logger from '@/lib/logger';

const STRIPE_API_URL = 'https://api.stripe.com/v1/checkout/sessions';

async function handler(req, res) {
  const userId = req.user?.id;

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase não configurado' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { plan } = req.body || {};
  const planDetails = getPlanDetails(plan);

  if (!planDetails) {
    return res.status(400).json({
      error: 'Plano inválido',
      valid_plans: Object.keys(PLANS)
    });
  }

  const officeId = req.body?.office_id || req.user?.office_id || getDefaultOfficeId();
  const stripeSecret = process.env.STRIPE_SECRET_KEY;

  // Modo demonstracao: sem chave Stripe configurada, retorna simulacao segura
  if (!stripeSecret) {
    logger('info', 'CHECKOUT_SIMULATED', { userId, officeId, plan, httpStatus: 200 });
    return res.status(200).json({
      simulated: true,
      message: 'Stripe em modo demonstração',
      plan,
      plan_details: planDetails,
      checkoutUrl: null
    });
  }

  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.nevesecosta.com.br';

    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', `${baseUrl}/?tab=cases&checkout=success`);
    params.append('cancel_url', `${baseUrl}/?tab=cases&checkout=cancelled`);
    params.append('client_reference_id', officeId);
    params.append('metadata[office_id]', officeId);
    params.append('metadata[plan]', plan);
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'brl');
    params.append('line_items[0][price_data][unit_amount]', String(Math.round(planDetails.price * 100)));
    params.append('line_items[0][price_data][recurring][interval]', 'month');
    params.append('line_items[0][price_data][product_data][name]', `Plano ${planDetails.name}`);
    params.append('line_items[0][price_data][product_data][description]', planDetails.description);
    params.append('subscription_data[metadata][office_id]', officeId);
    params.append('subscription_data[metadata][plan]', plan);

    const response = await fetch(STRIPE_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    const session = await response.json();

    if (!response.ok) {
      logger('error', 'CHECKOUT_STRIPE_ERROR', { userId, officeId, plan, httpStatus: 502, stripeStatus: response.status });
      return res.status(502).json({ error: 'Não foi possível criar a sessão de pagamento' });
    }

    logger('info', 'CHECKOUT_CREATED', { userId, officeId, plan, httpStatus: 200 });
    return res.status(200).json({
      checkoutUrl: session.url,
      session_id: session.id,
      plan
    });
  } catch (error) {
    logger('error', 'CHECKOUT_ERROR', { userId, officeId, plan, httpStatus: 500 });
    return res.status(500).json({ error: 'Erro ao criar checkout' });
  }
}

export default withAuth(handler, { minRole: 'advogado' });
