/**
 * Manual DataJud query endpoint tests
 */

const { createMocks } = require('node-mocks-http');
const {
  SYNTHETIC_USER_ADVOGADO,
  SYNTHETIC_USER_ESTAGIARIO,
  SYNTHETIC_CASE,
  SYNTHETIC_CASE_PROCESS,
} = require('../fixtures/synthetic-data');
const { makeChain } = require('../helpers/datajud-chains');

jest.mock('../../lib/auth', () => {
  const ROLE_HIERARCHY = { admin: 3, advogado: 2, estagiario: 1 };
  return {
    withAuth: jest.fn((handler, options = {}) => async (req, res) => {
      if (!req.headers?.authorization) {
        return res.status(401).json({ error: 'Token não fornecido' });
      }
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Perfil não encontrado' });
      }
      if (options.minRole && (ROLE_HIERARCHY[user.role] || 0) < ROLE_HIERARCHY[options.minRole]) {
        return res.status(403).json({ error: 'Acesso negado' });
      }
      return handler(req, res);
    }),
    ROLE_HIERARCHY,
  };
});

jest.mock('../../lib/caseAuth', () => ({
  verifyCaseAccess: jest.fn(async () => ({ allowed: true, caseId: SYNTHETIC_CASE.id })),
  resolveCaseIdForProcess: jest.fn(async () => SYNTHETIC_CASE.id),
}));

jest.mock('../../lib/datajudClient', () => ({
  queryDataJud: jest.fn(),
}));

describe('DataJud query endpoint', () => {
  let mockSupabase;
  let handler;
  const processChain = makeChain({ data: SYNTHETIC_CASE_PROCESS, error: null });
  const emptyChain = makeChain({ data: [], error: null });
  const logChain = makeChain({ data: null, error: null });

  const baseReq = (overrides = {}) => ({
    method: 'POST',
    headers: { authorization: 'Bearer mock-token' },
    user: SYNTHETIC_USER_ADVOGADO,
    query: { id: SYNTHETIC_CASE_PROCESS.id },
    ...overrides,
  });

  beforeAll(() => {
    mockSupabase = {
      from: jest.fn((table) => {
        if (table === 'case_processes') return processChain;
        if (table === 'process_movements') return emptyChain;
        return logChain;
      }),
      auth: { getUser: jest.fn() },
    };
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => mockSupabase),
    }));
    jest.resetModules();
    handler = require('../../pages/api/case-processes/[id]/query').default;
  });

  afterAll(() => {
    jest.dontMock('@supabase/supabase-js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const { queryDataJud } = require('../../lib/datajudClient');
    queryDataJud.mockReset();
  });

  test('rejeita método GET com 405', async () => {
    const { req, res } = createMocks(baseReq({ method: 'GET' }));
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  test('requer ID do processo', async () => {
    const { req, res } = createMocks(baseReq({ query: {} }));
    await handler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  test('retorna 403 quando acesso ao caso é negado', async () => {
    const { verifyCaseAccess } = require('../../lib/caseAuth');
    verifyCaseAccess.mockResolvedValueOnce({ allowed: false, caseId: null });

    const { req, res } = createMocks(baseReq());
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  test('sucesso sem novas movimentações retorna 200 sem alias', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');
    queryDataJud.mockResolvedValueOnce({
      status: 'success',
      source: 'datajud',
      tribunalCode: 'TJSP',
      court: { name: 'Tribunal de Justiça de São Paulo' },
      movements: [],
      lastMovement: null,
    });

    const { req, res } = createMocks(baseReq());
    await handler(req, res);

    const status = res._getStatusCode();
    expect(status).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.data).not.toHaveProperty('alias');
    expect(body.data).not.toHaveProperty('apiKey');
    expect(body.data).not.toHaveProperty('url');
  });

  test('retorna status e mensagem segura para 429', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');
    queryDataJud.mockResolvedValueOnce({
      status: 'rate_limited',
      error: 'Limite de requisições atingido.',
    });

    const { req, res } = createMocks(baseReq());
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.status).toBe('rate_limited');
  });

  test('retorna not_found sem expor detalhes', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');
    queryDataJud.mockResolvedValueOnce({
      status: 'not_found',
      error: 'Processo não localizado.',
    });

    const { req, res } = createMocks(baseReq());
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.status).toBe('not_found');
  });

  test('retorna restricted para processo sigiloso', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');
    queryDataJud.mockResolvedValueOnce({
      status: 'restricted',
      error: 'Dados não disponíveis.',
    });

    const { req, res } = createMocks(baseReq());
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.status).toBe('restricted');
  });

  test('estagiário pode consultar', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');
    queryDataJud.mockResolvedValueOnce({
      status: 'success',
      court: { name: 'Tribunal de Justiça de São Paulo' },
      movements: [],
      lastMovement: null,
    });

    const { req, res } = createMocks(baseReq({ user: SYNTHETIC_USER_ESTAGIARIO }));
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  test('persistencia de log não contém texto de movimentação, CNJ ou alias', async () => {
    const { queryDataJud } = require('../../lib/datajudClient');
    queryDataJud.mockResolvedValueOnce({
      status: 'success',
      court: { name: 'Tribunal de Justiça de São Paulo' },
      lastMovement: { date: '2024-01-01', text: 'Movimentação sigilosa sintética' },
      movements: [{ external_id: '1', date: '2024-01-01', text: 'Movimentação sigilosa sintética' }],
    });

    const { req, res } = createMocks(baseReq());
    await handler(req, res);

    const logInsert = logChain.insert.mock.calls[0][0];
    expect(logInsert).toBeDefined();
    expect(logInsert.response_summary).toBeDefined();
    expect(logInsert.response_summary).not.toHaveProperty('movements');
    expect(logInsert.response_summary).not.toHaveProperty('lastMovement');
    expect(logInsert).not.toHaveProperty('processNumber');
    expect(logInsert).not.toHaveProperty('alias');
  });
});
