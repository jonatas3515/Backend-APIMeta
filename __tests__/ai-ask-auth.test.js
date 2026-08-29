/**
 * Testes de autenticação e hardening do endpoint /api/ai/ask.
 * Garante que identidade/papel não vêm de header manipulável e que regras de acesso são respeitadas.
 */

const { createMocks } = require('node-mocks-http');
const askHandler = require('../pages/api/ai/ask').default;

jest.mock('../lib/supabaseServer', () => ({
  supabaseServer: {
    auth: { getUser: jest.fn() },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn() })) })),
      insert: jest.fn(() => Promise.resolve({ error: null }))
    }))
  }
}));

jest.mock('../lib/knowledgeSearch', () => ({
  searchKnowledge: jest.fn(() => Promise.resolve({ results: [], documents: [] }))
}));

jest.mock('../lib/aiRag', () => ({
  askRag: jest.fn(() => Promise.resolve('Resposta segura de teste'))
}));

const { supabaseServer } = require('../lib/supabaseServer');
const { searchKnowledge } = require('../lib/knowledgeSearch');

describe('/api/ai/ask - autenticação e acesso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockUser(role = 'advogado') {
    supabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-synthetic-001' } },
      error: null
    });
    supabaseServer.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { role }, error: null }))
            }))
          }))
        };
      }
      return { insert: jest.fn(() => Promise.resolve({ error: null })) };
    });
  }

  test('requisição GET não é permitida', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  test('x-user-id não altera identidade: rejeita autenticação', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { 'x-user-id': 'user-malicious' },
      body: { query: 'O que fazer?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Autenticação inválida');
  });

  test('x-user-role não altera papel: rejeita autenticação', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { 'x-user-role': 'admin' },
      body: { query: 'O que fazer?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    const data = JSON.parse(res._getData());
    expect(data.error).toBe('Autenticação inválida');
  });

  test('token ausente retorna 401', async () => {
    const { req, res } = createMocks({ method: 'POST', body: { query: 'O que fazer?' } });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  test('token inválido/expirado retorna 401', async () => {
    supabaseServer.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('Token inválido') });
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer invalid-token' },
      body: { query: 'O que fazer?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  test('perfil inexistente retorna 403', async () => {
    supabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-synthetic-002' } },
      error: null
    });
    supabaseServer.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: null, error: new Error('not found') }))
            }))
          }))
        };
      }
      return { insert: jest.fn(() => Promise.resolve({ error: null })) };
    });
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: 'O que fazer?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('papel não permitido retorna 403', async () => {
    mockUser('cliente');
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: 'O que fazer?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('estagiário autenticado pode usar o assistente', async () => {
    mockUser('estagiario');
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: 'O que fazer?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data.answer).toBe('Resposta segura de teste');
  });

  test('admin/advogado podem usar o assistente', async () => {
    mockUser('advogado');
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: 'Como funciona?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  test('query muito curta retorna 400', async () => {
    mockUser('advogado');
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: 'oi' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  test('query excessiva é truncada para 1000 caracteres', async () => {
    mockUser('advogado');
    const bigQuery = 'pergunta '.repeat(200);
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: bigQuery }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(searchKnowledge).toHaveBeenCalled();
    const sentQuery = searchKnowledge.mock.calls[0][0].query;
    expect(sentQuery.length).toBeLessThanOrEqual(1000);
  });
});
