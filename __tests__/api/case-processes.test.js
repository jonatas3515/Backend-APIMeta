/**
 * case-processes API tests
 * Validates DataJud process CRUD, permissions and safe responses
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

describe('case-processes API', () => {
  let mockSupabase;
  let handler;

  beforeAll(() => {
    mockSupabase = {
      from: jest.fn().mockReturnValue(makeChain({ data: null, error: null })),
      auth: { getUser: jest.fn() },
    };
    jest.doMock('@supabase/supabase-js', () => ({
      createClient: jest.fn(() => mockSupabase),
    }));
    jest.resetModules();
    handler = require('../../pages/api/case-processes').default;
  });

  afterAll(() => {
    jest.dontMock('@supabase/supabase-js');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSupabase.from.mockReturnValue(makeChain({ data: null, error: null }));
  });

  const buildReq = (overrides = {}) => ({
    method: 'POST',
    headers: { authorization: 'Bearer mock-token' },
    user: SYNTHETIC_USER_ADVOGADO,
    body: {
      case_id: SYNTHETIC_CASE.id,
      process_number: '0000001-83.0000.0.00.0000',
      court_code: 'TJSP',
      client_role: 'autor',
      monitoring_frequency: 'manual',
    },
    ...overrides,
  });

  test('sem autenticação retorna 401', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {},
      user: null,
      body: buildReq().body,
    });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  test('POST com case_id sem acesso retorna 403', async () => {
    const { verifyCaseAccess } = require('../../lib/caseAuth');
    verifyCaseAccess.mockResolvedValueOnce({ allowed: false, caseId: null });

    const { req, res } = createMocks(buildReq());
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('Acesso não autorizado');
  });

  test('POST com CNJ inválido retorna 400', async () => {
    const { req, res } = createMocks(buildReq({
      body: { ...buildReq().body, process_number: '12345' },
    }));
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('20 dígitos');
  });

  test('POST com tribunal não habilitado retorna 400', async () => {
    const { req, res } = createMocks(buildReq({
      body: { ...buildReq().body, court_code: 'INVALID' },
    }));
    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    const body = JSON.parse(res._getData());
    expect(body.error).toContain('não habilitado');
  });

  test('POST bem-sucedido retorna 201 e não expõe datajud_alias', async () => {
    mockSupabase.from.mockReturnValue(makeChain({
      data: { ...SYNTHETIC_CASE_PROCESS, datajud_alias: 'api_publica_tjsp' },
      error: null,
    }));

    const { req, res } = createMocks(buildReq());
    await handler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const body = JSON.parse(res._getData());
    expect(body.id).toBe(SYNTHETIC_CASE_PROCESS.id);
    expect(body).not.toHaveProperty('datajud_alias');
  });

  test('PATCH em processo de outro usuário retorna 403', async () => {
    const { resolveCaseIdForProcess } = require('../../lib/caseAuth');
    resolveCaseIdForProcess.mockResolvedValueOnce(SYNTHETIC_CASE.id);
    const { verifyCaseAccess } = require('../../lib/caseAuth');
    verifyCaseAccess.mockResolvedValueOnce({ allowed: false, caseId: null });

    const { req, res } = createMocks({
      method: 'PATCH',
      headers: { authorization: 'Bearer mock-token' },
      user: SYNTHETIC_USER_ADVOGADO,
      query: { id: SYNTHETIC_CASE_PROCESS.id },
      body: { court_code: 'TJSP' },
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
  });

  test('DELETE requer advogado/admin e respeita acesso', async () => {
    mockSupabase.from.mockReturnValue(makeChain({
      data: { id: SYNTHETIC_CASE_PROCESS.id },
      error: null,
    }));

    const { req, res } = createMocks({
      method: 'DELETE',
      headers: { authorization: 'Bearer mock-token' },
      user: SYNTHETIC_USER_ADVOGADO,
      query: { id: SYNTHETIC_CASE_PROCESS.id },
      body: {},
    });
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = JSON.parse(res._getData());
    expect(body.success).toBe(true);
  });

  test('estagiário pode listar mas não alterar', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: { authorization: 'Bearer mock-token' },
      user: SYNTHETIC_USER_ESTAGIARIO,
      query: { case_id: SYNTHETIC_CASE.id },
    });

    const { verifyCaseAccess } = require('../../lib/caseAuth');
    verifyCaseAccess.mockResolvedValueOnce({ allowed: false, caseId: null });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('resposta GET lista não contém datajud_alias', async () => {
    mockSupabase.from.mockReturnValue(makeChain({
      data: [{ ...SYNTHETIC_CASE_PROCESS, datajud_alias: 'api_publica_tjsp' }],
      error: null,
    }));

    const { req, res } = createMocks({
      method: 'GET',
      headers: { authorization: 'Bearer mock-token' },
      user: SYNTHETIC_USER_ADVOGADO,
      query: { case_id: SYNTHETIC_CASE.id },
    });
    await handler(req, res);

    const body = JSON.parse(res._getData());
    expect(Array.isArray(body)).toBe(true);
    expect(body[0]).not.toHaveProperty('datajud_alias');
  });
});
