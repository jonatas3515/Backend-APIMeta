const { createMocks } = require('node-mocks-http');

const mockFromChain = (data, error = null) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    insert: () => chain,
    delete: () => chain,
    single: jest.fn().mockResolvedValue({ data, error }),
    then: (resolve) => resolve({ data, error })
  };
  return chain;
};

const mockRpc = jest.fn().mockResolvedValue({ data: 'log-id', error: null });
const mockFrom = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    rpc: mockRpc
  }))
}));

jest.mock('@/lib/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn().mockResolvedValue('wa-msg-1')
}));

jest.mock('../lib/auth', () => ({
  withAuth: (fn, options) => (req, res) => {
    const user = req.__testUser || { role: 'admin', id: 'user-1' };
    if (options?.minRole === 'advogado' && user.role === 'estagiario') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    req.user = user;
    return fn(req, res);
  }
}));

jest.mock('../lib/logger', () => jest.fn());

const templatesHandler = require('../pages/api/whatsapp/templates/index').default;
const templateDetailHandler = require('../pages/api/whatsapp/templates/[id]').default;
const sendHandler = require('../pages/api/whatsapp/send-message').default;

describe('API /api/whatsapp/templates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('GET retorna lista de templates', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain([
      { id: 't1', name: 'welcome', category: 'UTILITY', content: 'Olá {{1}}', variables: ['1'], status: 'approved', created_at: '2026-01-15T10:00:00Z' }
    ]));

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await templatesHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(1);
    expect(json[0].name).toBe('welcome');
  });

  test('POST cria template válido', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain(
      { id: 't1', name: 'welcome', category: 'UTILITY', content: 'Olá {{1}}', variables: ['1'], status: 'approved', created_at: '2026-01-15T10:00:00Z' }
    ));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        name: 'welcome',
        category: 'UTILITY',
        content: 'Olá {{1}}',
        variables: ['1'],
        status: 'approved'
      },
      __testUser: { id: 'u1', role: 'admin' }
    });

    await templatesHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData().name).toBe('welcome');
  });

  test('POST rejeita variável ausente', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        name: 'welcome',
        category: 'UTILITY',
        content: 'Olá {{1}} {{2}}',
        variables: ['1'],
        status: 'approved'
      },
      __testUser: { id: 'u1', role: 'admin' }
    });

    await templatesHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('{{2}}');
  });

  test('DELETE exclui template', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ id: 't1', name: 'welcome' }))
      .mockImplementationOnce(() => mockFromChain({}));

    const { req, res } = createMocks({
      method: 'DELETE',
      query: { id: 't1' },
      __testUser: { id: 'u1', role: 'admin' }
    });

    await templateDetailHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().success).toBe(true);
  });
});

describe('POST /api/whatsapp/send-message com template', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('envia mensagem com template aprovado', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ id: 'c1', client_phone: '5511999999999', assigned_user_id: 'u1' }))
      .mockImplementationOnce(() => mockFromChain({ id: 't1', name: 'welcome', content: 'Olá {{1}}', status: 'approved' }))
      .mockImplementationOnce(() => mockFromChain({ id: 'm1' }));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        to: 'conversation',
        type: 'template',
        templateId: 't1',
        variables: { '1': 'Maria' },
        clientId: 'c1'
      },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await sendHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.success).toBe(true);
    expect(json.waMessageId).toBe('wa-msg-1');
  });

  test('rejeita template não aprovado', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ id: 'c1', client_phone: '5511999999999', assigned_user_id: 'u1' }))
      .mockImplementationOnce(() => mockFromChain(null, { message: 'not found' }));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        to: 'conversation',
        type: 'template',
        templateId: 't9',
        variables: { '1': 'Maria' },
        clientId: 'c1'
      },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await sendHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error).toBe('Template não encontrado ou não aprovado');
  });
});
