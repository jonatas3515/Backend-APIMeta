const { createMocks } = require('node-mocks-http');

const mockFromChain = (data, error = null) => ({
  select: () => mockFromChain(data, error),
  eq: () => mockFromChain(data, error),
  insert: () => mockFromChain(data, error),
  single: jest.fn().mockResolvedValue({ data, error })
});

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
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'admin', id: 'user-1' };
    return fn(req, res);
  }
}));

jest.mock('../lib/logger', () => jest.fn());

const handler = require('../pages/api/whatsapp/send-message').default;

describe('POST /api/whatsapp/send-message', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('envia mensagem de texto com sucesso', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ id: 'c1', client_phone: '5511999999999', assigned_user_id: 'u1' }))
      .mockImplementationOnce(() => mockFromChain({ id: 'm1' }));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        to: 'conversation',
        type: 'text',
        content: 'Olá',
        clientId: 'c1'
      },
      __testUser: { id: 'u1', role: 'admin' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.success).toBe(true);
    expect(json.waMessageId).toBe('wa-msg-1');
  });

  test('rejeita payload inválido', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        to: 'conversation',
        type: 'unknown',
        content: ''
      },
      __testUser: { id: 'u1', role: 'admin' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('to, type e content');
  });

  test('estagiario sem vínculo recebe 403', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain({ id: 'c1', client_phone: '5511999999999', assigned_user_id: 'u2' }));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        to: 'conversation',
        type: 'text',
        content: 'Olá',
        clientId: 'c1'
      },
      __testUser: { id: 'u3', role: 'estagiario' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toBe('Acesso negado');
  });
});
