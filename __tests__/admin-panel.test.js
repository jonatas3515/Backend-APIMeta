/**
 * Testes - Painel Admin Master (gestao de escritorios e metricas SaaS)
 */

const { createMocks } = require('node-mocks-http');

function supabaseBuilder() {
  const chain = {
    from: jest.fn(() => chain),
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    update: jest.fn((payload) => {
      global.__supabaseUpdates = global.__supabaseUpdates || [];
      global.__supabaseUpdates.push(payload);
      return chain;
    }),
    insert: jest.fn(() => chain),
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
    req.user = req.__testUser || { role: 'admin', id: 'admin-1' };
    return fn(req, res);
  },
  hasMinimumRole: () => true,
  supabaseAdmin: supabaseBuilder()
}));

const officesHandler = require('../pages/api/admin/offices').default;
const metricsHandler = require('../pages/api/admin/metrics').default;

const ADMIN = { role: 'admin', id: 'admin-1' };

describe('GET /api/admin/offices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('lista escritorios com assinatura vinculada', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'o1', name: 'Neves & Costa', plan: 'pro', status: 'active' }, { id: 'o2', name: 'Silva Adv', plan: 'trial', status: 'trial' }], error: null },
      { data: [{ office_id: 'o1', plan: 'pro', status: 'active' }], error: null }
    ];

    const { req, res } = createMocks({ method: 'GET', __testUser: ADMIN });
    await officesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const { offices } = res._getJSONData();
    expect(offices).toHaveLength(2);
    expect(offices[0].subscription.plan).toBe('pro');
    expect(offices[1].subscription).toBeNull();
  });
});

describe('PATCH /api/admin/offices', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    global.__supabaseUpdates = [];
  });

  test('suspend bloqueia escritorio e cancela assinatura', async () => {
    global.__supabaseQueue = [
      { data: { id: 'o1', status: 'blocked' }, error: null }, // offices update select single
      { data: [{}], error: null } // subscriptions sync
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      body: { office_id: 'o1', action: 'suspend' },
      __testUser: ADMIN
    });
    await officesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseUpdates[0].status).toBe('blocked');
    expect(global.__supabaseUpdates[1].status).toBe('cancelled');
  });

  test('extend_trial soma 30 dias a partir de agora quando trial expirado', async () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    global.__supabaseQueue = [
      { data: { trial_ends_at: past }, error: null }, // find
      { data: { id: 'o2', status: 'trial' }, error: null }, // update
      { data: [{}], error: null } // subs sync
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      body: { office_id: 'o2', action: 'extend_trial', days: 30 },
      __testUser: ADMIN
    });
    await officesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const newEnd = new Date(global.__supabaseUpdates[0].trial_ends_at);
    const expectedMin = Date.now() + 29 * 86400000;
    expect(newEnd.getTime()).toBeGreaterThan(expectedMin);
    expect(global.__supabaseUpdates[0].status).toBe('trial');
  });

  test('set_plan invalido retorna 400', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      body: { office_id: 'o1', action: 'set_plan', plan: 'diamante' },
      __testUser: ADMIN
    });
    await officesHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  test('sem office_id ou action retorna 400', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      body: {},
      __testUser: ADMIN
    });
    await officesHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });
});

describe('GET /api/admin/metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('calcula MRR, ARR, totais e conversao', async () => {
    global.__supabaseQueue = [
      { data: [
        { id: 'o1', plan: 'pro', status: 'active' },
        { id: 'o2', plan: 'trial', status: 'trial' },
        { id: 'o3', plan: 'basico', status: 'blocked' },
        { id: 'o4', plan: 'enterprise', status: 'active' }
      ], error: null },
      { data: [
        { office_id: 'o1', plan: 'pro', status: 'active' },
        { office_id: 'o4', plan: 'enterprise', status: 'active' },
        { office_id: 'o2', plan: 'trial', status: 'trialing' }
      ], error: null }
    ];

    const { req, res } = createMocks({ method: 'GET', __testUser: ADMIN });
    await metricsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const m = res._getJSONData();
    expect(m.mrr).toBe(99 + 199);          // pro->99 + enterprise->199; trial/blocked nao contam
    expect(m.arr).toBe(m.mrr * 12);
    expect(m.total_offices).toBe(4);
    expect(m.active_count).toBe(2);
    expect(m.trial_count).toBe(1);
    expect(m.blocked_count).toBe(1);
    expect(m.conversion_rate).toBe(50);
  });
});
