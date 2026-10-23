/**
 * Testes - Multi-tenancy (multi-escritorios)
 * Cobre office_id padrao em casos, endpoint /api/office/current e retrocompatibilidade
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
    is: jest.fn(() => chain),
    in: jest.fn(() => chain),
    ilike: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    upsert: jest.fn(() => chain),
    update: jest.fn((payload) => {
      global.__supabaseUpdate = payload;
      return chain;
    }),
    insert: jest.fn((payload) => {
      global.__supabaseInsert = payload;
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

const casesHandler = require('../pages/api/cases').default;
const officeCurrentHandler = require('../pages/api/office/current').default;
const { getDefaultOfficeId, DEFAULT_OFFICE_ID } = require('../lib/officeContext');

describe('officeContext - getDefaultOfficeId', () => {
  afterEach(() => {
    delete process.env.DEFAULT_OFFICE_ID;
  });

  test('retorna UUID fixo da matriz sem env', () => {
    expect(getDefaultOfficeId()).toBe(OFFICE_ID);
    expect(DEFAULT_OFFICE_ID).toBe(OFFICE_ID);
  });

  test('respeita DEFAULT_OFFICE_ID do ambiente', () => {
    process.env.DEFAULT_OFFICE_ID = 'custom-office-id';
    expect(getDefaultOfficeId()).toBe('custom-office-id');
  });
});

describe('POST /api/cases - office_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    global.__supabaseInsert = null;
    delete process.env.DEFAULT_OFFICE_ID;
  });

  test('atribui office_id da matriz quando nao informado', async () => {
    global.__supabaseQueue = [
      { data: { id: 'case-new' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { title: 'Caso Novo' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(global.__supabaseInsert.office_id).toBe(OFFICE_ID);
  });

  test('respeita office_id informado no body (tenant alternativo)', async () => {
    global.__supabaseQueue = [
      { data: { id: 'case-new' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: { title: 'Caso Outro Escritorio', office_id: 'office-xyz' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(global.__supabaseInsert.office_id).toBe('office-xyz');
  });
});

describe('GET /api/office/current', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('retorna dados do escritorio ativo', async () => {
    global.__supabaseQueue = [
      {
        data: {
          id: OFFICE_ID,
          name: 'Neves & Costa Advogados',
          plan: 'pro',
          status: 'active',
          logo_url: null
        },
        error: null
      }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await officeCurrentHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body).toMatchObject({
      id: OFFICE_ID,
      name: 'Neves & Costa Advogados',
      plan: 'pro',
      status: 'active'
    });
  });

  test('retorna 404 quando escritorio nao existe', async () => {
    global.__supabaseQueue = [
      { data: null, error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await officeCurrentHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error).toMatch(/n[aã]o encontrado/i);
  });

  test('retorna 405 para metodo nao suportado', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await officeCurrentHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});

describe('Retrocompatibilidade - dados sem office_id', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('GET /api/cases lista casos legados sem office_id normalmente', async () => {
    global.__supabaseQueue = [
      {
        data: [
          { id: 'case-legacy-1', title: 'Caso Antigo 1', status: 'em_analise' },
          { id: 'case-legacy-2', title: 'Caso Antigo 2', status: 'prospect' }
        ],
        error: null
      }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: {},
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data).toHaveLength(2);
    expect(data[0].id).toBe('case-legacy-1');
  });
});
