const { createMocks } = require('node-mocks-http');

const mockFromChain = (data, error = null) => ({
  select: () => mockFromChain(data, error),
  eq: () => mockFromChain(data, error),
  order: () => mockFromChain(data, error),
  limit: () => mockFromChain(data, error),
  is: () => mockFromChain(data, error),
  not: () => mockFromChain(data, error),
  in: () => mockFromChain(data, error),
  insert: () => mockFromChain(data, error),
  update: () => mockFromChain(data, error),
  single: jest.fn().mockResolvedValue({ data, error }),
  then: (resolve) => resolve({ data, error })
});

const mockRpc = jest.fn().mockResolvedValue({ data: 'log-id', error: null });
const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    rpc: mockRpc
  }))
}));

jest.mock('../lib/auth', () => ({
  withAuth: (fn, options) => (req, res) => {
    const user = req.__testUser || { role: 'admin', id: 'user-1' };
    if (options?.minRole === 'admin' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    req.user = user;
    return fn(req, res);
  }
}));

jest.mock('../lib/logger', () => jest.fn());

const requestHandler = require('../pages/api/lgpd/deletion-request').default;
const executeHandler = require('../pages/api/lgpd/deletion-execute').default;

const adminUser = { id: 'u1', role: 'admin' };
const estagiarioUser = { id: 'u3', role: 'estagiario' };

const mockConversation = {
  id: 'c1',
  client_name: 'Cliente Teste',
  client_phone: '5511999999999',
  client_email: 'teste@email.com',
  client_cpf_cnpj: '12345678901',
  assigned_user_id: 'u2'
};

const mockRequest = {
  id: 'req-1',
  conversation_id: 'c1',
  mode: 'anonymized',
  reason: 'lgpd_request',
  notes: null,
  status: 'pending',
  created_at: '2026-01-15T10:00:00Z'
};

describe('API /api/lgpd/deletion-request', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('POST cria solicitação de anonimização para admin', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain(mockConversation))
      .mockImplementationOnce(() => mockFromChain([]))
      .mockImplementationOnce(() => mockFromChain(mockRequest));

    const { req, res } = createMocks({
      method: 'POST',
      body: { clientId: 'c1', mode: 'anonymized', reason: 'lgpd_request' },
      __testUser: adminUser
    });

    await requestHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const json = res._getJSONData();
    expect(json.clientId).toBe('c1');
    expect(json.mode).toBe('anonymized');
    expect(json.status).toBe('pending');
  });

  test('POST rejeita modo inválido', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { clientId: 'c1', mode: 'invalid', reason: 'lgpd_request' },
      __testUser: adminUser
    });

    await requestHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('mode');
  });

  test('POST full rejeita casos ativos', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain(mockConversation))
      .mockImplementationOnce(() => mockFromChain([{ id: 'case-1', status: 'open' }]));

    const { req, res } = createMocks({
      method: 'POST',
      body: { clientId: 'c1', mode: 'full', reason: 'lgpd_request' },
      __testUser: adminUser
    });

    await requestHandler(req, res);

    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toContain('casos ativos');
  });

  test('estagiario não titular recebe 403', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain(mockConversation));

    const { req, res } = createMocks({
      method: 'POST',
      body: { clientId: 'c1', mode: 'anonymized', reason: 'lgpd_request' },
      __testUser: estagiarioUser
    });

    await requestHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toBe('Acesso negado');
  });
});

describe('API /api/lgpd/deletion-execute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('POST executa anonimização e registra auditoria', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain(mockRequest))
      .mockImplementationOnce(() => mockFromChain(mockConversation))
      .mockImplementationOnce(() => mockFromChain({}))
      .mockImplementationOnce(() => mockFromChain({}))
      .mockImplementationOnce(() => mockFromChain({}))
      .mockImplementationOnce(() => mockFromChain({}));

    const { req, res } = createMocks({
      method: 'POST',
      body: { requestId: 'req-1', confirm: true },
      __testUser: adminUser
    });

    await executeHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.status).toBe('completed');
    expect(json.mode).toBe('anonymized');
  });

  test('não-admin recebe 403', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { requestId: 'req-1', confirm: true },
      __testUser: estagiarioUser
    });

    await executeHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toBe('Acesso negado');
  });

  test('solicitação já processada retorna 409', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain({ ...mockRequest, status: 'completed' }));

    const { req, res } = createMocks({
      method: 'POST',
      body: { requestId: 'req-1', confirm: true },
      __testUser: adminUser
    });

    await executeHandler(req, res);

    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toBe('Solicitação já foi processada');
  });
});
