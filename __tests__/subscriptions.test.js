/**
 * Testes - Modulo comercial SaaS (planos, trial e Stripe)
 */

const { createMocks } = require('node-mocks-http');
const crypto = require('crypto');

const OFFICE_ID = '00000000-0000-0000-0000-000000000001';

function supabaseBuilder() {
  const chain = {
    from: jest.fn(() => chain),
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    in: jest.fn(() => chain),
    ilike: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    upsert: jest.fn(() => chain),
    update: jest.fn((payload) => {
      global.__supabaseUpdates = global.__supabaseUpdates || [];
      global.__supabaseUpdates.push(payload);
      return chain;
    }),
    insert: jest.fn((payload) => {
      global.__supabaseInserts = global.__supabaseInserts || [];
      global.__supabaseInserts.push(payload);
      return chain;
    }),
    delete: jest.fn(() => chain),
    maybeSingle: jest.fn(() => chain),
    single: jest.fn(() => chain),
    then: (onFulfilled) => {
      const next = global.__supabaseQueue ? global.__supabaseQueue.shift() : { data: null, error: null };
      return onFulfilled ? onFulfilled(next) : Promise.resolve(next);
    }
  };
  return chain;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseBuilder())
}));

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'advogado', id: 'user-1' };
    return fn(req, res);
  },
  hasMinimumRole: () => true,
  supabaseAdmin: supabaseBuilder()
}));

const { PLANS, getPlanDetails, calculateTrialDaysRemaining } = require('../lib/plans');
const currentHandler = require('../pages/api/subscriptions/current').default;
const checkoutHandler = require('../pages/api/subscriptions/create-checkout').default;
const stripeWebhookHandler = require('../pages/api/webhooks/stripe').default;

describe('lib/plans', () => {
  test('getPlanDetails retorna dados dos 3 planos', () => {
    expect(getPlanDetails('basico')).toEqual({ name: 'Básico', price: 49, interval: 'mês', description: 'Para advogados autônomos' });
    expect(getPlanDetails('profissional').price).toBe(99);
    expect(getPlanDetails('enterprise').price).toBe(199);
    expect(Object.keys(PLANS)).toEqual(['basico', 'profissional', 'enterprise']);
  });

  test('getPlanDetails retorna null para plano inexistente', () => {
    expect(getPlanDetails('inexistente')).toBeNull();
    expect(getPlanDetails(undefined)).toBeNull();
  });

  test('calculateTrialDaysRemaining calcula dias corretamente', () => {
    const future = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
    const remaining = calculateTrialDaysRemaining(future);
    expect(remaining).toBeGreaterThanOrEqual(9);
    expect(remaining).toBeLessThanOrEqual(10);
  });

  test('calculateTrialDaysRemaining retorna 0 para trial expirado ou ausente', () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(calculateTrialDaysRemaining(past)).toBe(0);
    expect(calculateTrialDaysRemaining(null)).toBe(0);
    expect(calculateTrialDaysRemaining('invalido')).toBe(0);
  });
});

describe('GET /api/subscriptions/current', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('retorna assinatura ativa do escritorio', async () => {
    global.__supabaseQueue = [
      { data: { id: OFFICE_ID, name: 'Neves & Costa Advogados', plan: 'pro', status: 'active', trial_ends_at: null }, error: null },
      { data: { id: 'sub-1', office_id: OFFICE_ID, plan: 'pro', status: 'active', current_period_end: null, cancel_at_period_end: false }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await currentHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.office.name).toBe('Neves & Costa Advogados');
    expect(body.plan).toBe('pro');
    expect(body.subscription.status).toBe('active');
  });

  test('retorna escritorio em trial com dias restantes', async () => {
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    global.__supabaseQueue = [
      { data: { id: OFFICE_ID, name: 'Escritorio Novo', plan: 'trial', status: 'trialing', trial_ends_at: trialEnd }, error: null },
      { data: null, error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await currentHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.subscription).toBeNull();
    expect(body.trial.active).toBe(true);
    expect(body.trial.days_remaining).toBeGreaterThanOrEqual(13);
    expect(body.trial.ends_at).toBe(trialEnd);
  });
});

describe('POST /api/subscriptions/create-checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    delete process.env.STRIPE_SECRET_KEY;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
  });

  test('sem STRIPE_SECRET_KEY retorna simulacao segura', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { plan: 'basico' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await checkoutHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.simulated).toBe(true);
    expect(body.message).toBe('Stripe em modo demonstração');
    expect(body.checkoutUrl).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('plano invalido retorna 400', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { plan: 'vip-diamante' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await checkoutHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().valid_plans).toContain('enterprise');
  });

  test('com STRIPE_SECRET_KEY cria sessao e retorna checkoutUrl', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'cs_test_123', url: 'https://checkout.stripe.com/pay/cs_test_123' })
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: { plan: 'profissional' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await checkoutHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test_123');
    expect(body.plan).toBe('profissional');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.stripe.com/v1/checkout/sessions',
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('POST /api/webhooks/stripe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    global.__supabaseInserts = [];
    global.__supabaseUpdates = [];
    delete process.env.STRIPE_WEBHOOK_SECRET;
  });

  test('checkout.session.completed cria assinatura para o escritorio', async () => {
    global.__supabaseQueue = [
      { data: null, error: null },      // subscriptions maybeSingle (nao existe)
      { data: { id: 'sub-new' }, error: null }, // insert
      { data: [{ id: OFFICE_ID }], error: null } // offices update
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            customer: 'cus_123',
            subscription: 'sub_123',
            metadata: { office_id: OFFICE_ID, plan: 'basico' }
          }
        }
      }
    });

    await stripeWebhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().received).toBe(true);
    expect(global.__supabaseInserts[0]).toMatchObject({
      office_id: OFFICE_ID,
      plan: 'basico',
      status: 'active',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123'
    });
  });

  test('customer.subscription.deleted marca assinatura como cancelada', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'sub-1', office_id: OFFICE_ID }], error: null }, // update subscriptions select
      { data: [{ id: OFFICE_ID }], error: null } // offices update
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        type: 'customer.subscription.deleted',
        data: { object: { id: 'sub_123', status: 'canceled' } }
      }
    });

    await stripeWebhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseUpdates[0].status).toBe('cancelled');
  });

  test('com STRIPE_WEBHOOK_SECRET, assinatura invalida retorna 400', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';

    const { req, res } = createMocks({
      method: 'POST',
      body: { type: 'checkout.session.completed', data: { object: {} } },
      headers: { 'stripe-signature': 't=123,v1=assinaturaerrada' }
    });

    await stripeWebhookHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(global.__supabaseInserts).toHaveLength(0);
  });

  test('com STRIPE_WEBHOOK_SECRET, assinatura valida processa o evento', async () => {
    const secret = 'whsec_fake';
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    global.__supabaseQueue = [
      { data: null, error: null },
      { data: { id: 'sub-new' }, error: null },
      { data: [{ id: OFFICE_ID }], error: null }
    ];

    const body = {
      type: 'checkout.session.completed',
      data: { object: { customer: 'cus_9', subscription: 'sub_9', metadata: { office_id: OFFICE_ID, plan: 'enterprise' } } }
    };
    const rawBody = JSON.stringify(body);
    const timestamp = Math.floor(Date.now() / 1000);
    const v1 = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');

    const { req, res } = createMocks({
      method: 'POST',
      body,
      headers: { 'stripe-signature': `t=${timestamp},v1=${v1}` }
    });

    await stripeWebhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseInserts[0].plan).toBe('enterprise');
  });

  test('evento nao mapeado retorna received sem erro', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { type: 'invoice.paid', data: { object: {} } }
    });

    await stripeWebhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().type).toBe('invoice.paid');
  });
});
