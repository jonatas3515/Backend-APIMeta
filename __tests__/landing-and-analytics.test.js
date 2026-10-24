/**
 * Testes - Landing/Onboarding SaaS e metricas processuais
 */

const { createMocks } = require('node-mocks-http');

const OFFICE_ID = '00000000-0000-0000-0000-000000000001';

function supabaseBuilder() {
  const chain = {
    from: jest.fn(() => chain),
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    update: jest.fn(() => chain),
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
  supabaseAdmin: Object.assign(supabaseBuilder(), {
    auth: {
      admin: {
        createUser: jest.fn(async () => ({ data: { user: { id: 'auth-u1' } }, error: null }))
      }
    }
  })
}));

const metricsHandler = require('../pages/api/cases/metrics').default;
const registerOfficeHandler = require('../pages/api/auth/register-office').default;

describe('GET /api/cases/metrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('agrega casos por tribunal, fase e valor da causa', async () => {
    global.__supabaseQueue = [
      {
        data: [
          { court: 'TRT', procedural_step: 'instrucao', case_value: 10000, status: 'em_analise' },
          { court: 'TRT', procedural_step: 'execucao', case_value: 30000, status: 'acao_protocolada' },
          { court: 'TJ', procedural_step: 'instrucao', case_value: null, status: 'prospect' },
          { court: null, procedural_step: null, case_value: null, status: 'em_analise' },
          { court: 'TJ', procedural_step: 'acordo', case_value: 20000, status: 'encerrado' } // encerrado: fora via neq no mock? neq nao filtra no builder
        ],
        error: null
      }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await metricsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.by_court.TRT).toBe(2);
    expect(body.by_court.TJ).toBeGreaterThanOrEqual(1);
    expect(body.by_procedural_step.instrucao).toBe(2);
    expect(body.case_value.count).toBeGreaterThanOrEqual(3);
    expect(body.case_value.average).toBeCloseTo(body.case_value.total / body.case_value.count);
  });

  test('retorna zerado quando nao ha casos', async () => {
    global.__supabaseQueue = [{ data: [], error: null }];

    const { req, res } = createMocks({ method: 'GET', __testUser: { role: 'admin', id: 'u' } });
    await metricsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.total).toBe(0);
    expect(body.case_value.average).toBe(0);
  });
});

describe('POST /api/auth/register-office', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    global.__supabaseInserts = [];
  });

  test('cria escritorio em trial de 14 dias + assinatura trialing + admin', async () => {
    global.__supabaseQueue = [
      { data: { id: 'office-new', name: 'Silva Advogados', plan: 'trial', status: 'trial', trial_ends_at: 'x' }, error: null }, // offices insert
      { data: { id: 'sub-1' }, error: null }, // subscriptions insert
      { data: { id: 'user-1' }, error: null } // users insert
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        office_name: 'Silva Advogados',
        admin_name: 'Ana Silva',
        email: 'ana@silva.adv.br',
        phone: '82999990000',
        password: 'senhaForte123'
      }
    });

    await registerOfficeHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const body = res._getJSONData();
    expect(body.success).toBe(true);
    expect(body.trial_days).toBe(14);

    const [officeInsert, subInsert, userInsert] = global.__supabaseInserts;
    expect(officeInsert.status).toBe('trial');
    expect(officeInsert.name).toBe('Silva Advogados');
    expect(new Date(officeInsert.trial_ends_at).getTime()).toBeGreaterThan(Date.now());

    expect(subInsert).toMatchObject({ office_id: 'office-new', status: 'trialing' });
    expect(userInsert).toMatchObject({ email: 'ana@silva.adv.br', role: 'admin', office_id: 'office-new' });
  });

  test('campos obrigatorios ausentes retornam 400', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { office_name: 'X' }
    });

    await registerOfficeHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  test('senha curta e email invalido retornam 400', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { office_name: 'X', admin_name: 'Y', email: 'invalido', password: '123' }
    });

    await registerOfficeHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });
});
