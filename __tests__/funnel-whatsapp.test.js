const { createMocks } = require('node-mocks-http');

const mockFromChain = (data, error = null) => {
  const chain = {
    select: (cols) => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    gte: () => chain,
    lte: () => chain,
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

jest.mock('@/lib/auth', () => ({
  withAuth: (fn, options) => (req, res) => {
    const user = req.__testUser || { role: 'admin', id: 'user-1' };
    if (options?.minRole === 'advogado' && user.role === 'estagiario') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    req.user = user;
    return fn(req, res);
  }
}));

const eventsHandler = require('../pages/api/funnel/whatsapp-events').default;
const metricsHandler = require('../pages/api/funnel/whatsapp-metrics').default;

describe('Funnel WhatsApp endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('POST /api/funnel/whatsapp-events registra evento válido', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ id: 'c1', funnel_stage: 'lead_novo' }))
      .mockImplementationOnce(() => mockFromChain({ id: 'h1' }))
      .mockImplementationOnce(() => mockFromChain({}));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        conversationId: 'c1',
        clientId: 'client-1',
        eventType: 'first_contact',
        metadata: { direction: 'inbound' }
      },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    expect(res._getJSONData().success).toBe(true);
    expect(res._getJSONData().eventType).toBe('first_contact');
  });

  test('POST rejeita eventType inválido', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        conversationId: 'c1',
        clientId: 'client-1',
        eventType: 'invalido'
      },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await eventsHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('eventType');
  });

  test('GET /api/funnel/whatsapp-metrics retorna agregados', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain([
        { created_at: '2026-01-15T10:00:00Z', direction: 'inbound', conversation_id: 'c1' },
        { created_at: '2026-01-15T10:05:00Z', direction: 'outbound', conversation_id: 'c1' }
      ]))
      .mockImplementationOnce(() => mockFromChain([
        { id: 'c1', funnel_stage: 'lead_novo', first_contact_at: '2026-01-15T10:00:00Z', first_response_at: '2026-01-15T10:10:00Z' }
      ]))
      .mockImplementationOnce(() => mockFromChain([
        { to_stage: 'first_contact', created_at: '2026-01-15T10:00:00Z', conversation_id: 'c1' },
        { to_stage: 'closed', created_at: '2026-01-16T10:00:00Z', conversation_id: 'c1' }
      ]));

    const { req, res } = createMocks({
      method: 'GET',
      query: { from: '2026-01-01', to: '2026-01-31' },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await metricsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.totalMessages).toBe(2);
    expect(json.totalConversations).toBe(1);
    expect(json.conversionRate).toBe(100);
    expect(json.avgResponseSeconds).toBeGreaterThan(0);
  });

  test('automação outbound detecta proposta', async () => {
    const { evaluateFunnelAutomation } = require('../lib/funnel-whatsapp');
    const result = evaluateFunnelAutomation({ direction: 'outbound', text: 'Segue a proposta', templateName: 'proposta_v2' });
    expect(result).toBe('proposal_sent');
  });

  test('automação inbound detecta fechamento por palavra-chave', async () => {
    const { evaluateFunnelAutomation } = require('../lib/funnel-whatsapp');
    const result = evaluateFunnelAutomation({ direction: 'inbound', text: 'Quero fechar o contrato', firstContactAt: '2026-01-01T10:00:00Z' });
    expect(result).toBe('closed');
  });
});
