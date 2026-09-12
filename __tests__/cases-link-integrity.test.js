const { createMocks } = require('node-mocks-http');
const casesHandler = require('../pages/api/cases').default;

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'advogado', id: 'user-1' };
    return fn(req, res);
  },
  hasMinimumRole: () => true
}));

function supabaseBuilder() {
  const chain = {
    from: jest.fn(() => chain),
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    update: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    in: jest.fn(() => chain),
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

describe('API /api/cases - integridade do vinculo caso-conversa', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('PATCH rejeita conversa inativa', async () => {
    global.__supabaseQueue = [
      { data: { id: 'conv-1', client_status: 'inativo' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'case-1' },
      body: { conversation_id: 'conv-1' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/Conversa nao esta ativa/i);
  });

  test('PATCH rejeita conversa inexistente', async () => {
    global.__supabaseQueue = [
      { data: null, error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'case-1' },
      body: { conversation_id: 'conv-2' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);
    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error).toMatch(/Conversa nao encontrada/i);
  });

  test('PATCH permite vincular conversa ativa', async () => {
    global.__supabaseQueue = [
      { data: { id: 'conv-1', client_status: 'ativo' }, error: null },
      { data: [], error: null },
      { data: { id: 'case-1', conversation_id: 'conv-1' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'case-1' },
      body: { conversation_id: 'conv-1' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().conversation_id).toBe('conv-1');
  });

  test('PATCH desvincular bloqueado quando ha solicitacao pendente', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'req-1', status: 'draft' }], error: null },
      { data: [], error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { id: 'case-1' },
      body: { conversation_id: null },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await casesHandler(req, res);
    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toMatch(/Nao e possivel remover/i);
  });
});
