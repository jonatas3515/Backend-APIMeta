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

const mockFrom = jest.fn();
const mockRpc = jest.fn().mockResolvedValue({ data: null, error: null });

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: mockFrom,
    rpc: mockRpc
  }))
}));

jest.mock('../lib/auth', () => ({
  withAuth: (fn, options) => (req, res) => {
    const user = req.__testUser || { role: 'admin', id: 'user-1' };
    if (options?.allowedRoles && !options.allowedRoles.includes(user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    if (options?.minRole === 'admin' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    req.user = user;
    return fn(req, res);
  }
}));

jest.mock('@/lib/laborSettlementState', () => ({
  deleteLaborSettlementState: jest.fn().mockResolvedValue({})
}));

const { deleteLaborSettlementState } = jest.requireMock('@/lib/laborSettlementState');
const lgpdHandler = require('../pages/api/lgpd').default;

const adminUser = { id: 'u1', role: 'admin' };
const estagiarioUser = { id: 'u3', role: 'estagiario' };
const mockConversation = { id: 'c1' };

describe('API /api/lgpd - anonymize_lead', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: null, error: null });
    deleteLaborSettlementState.mockResolvedValue({});
  });

  test('remove estado trabalhista, anonimiza e registra auditoria', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain(mockConversation));

    const { req, res } = createMocks({
      method: 'POST',
      body: { action: 'anonymize_lead', conversation_id: 'c1', reason: 'LGPD' },
      __testUser: adminUser
    });

    await lgpdHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(deleteLaborSettlementState).toHaveBeenCalledWith({
      conversationId: 'c1',
      authorizationContext: {
        userId: 'u1',
        allowedConversationId: 'c1'
      }
    });
    expect(mockRpc).toHaveBeenCalledWith('log_audit', expect.objectContaining({
      p_action: 'labor_state_deleted_by_lgpd',
      p_entity_type: 'conversation_labor_states'
    }));
    expect(mockRpc).toHaveBeenCalledWith('log_audit', expect.objectContaining({
      p_action: 'anonymize_lead',
      p_entity_type: 'conversation'
    }));
  });

  test('falha na remoção do estado impede anonimização', async () => {
    deleteLaborSettlementState.mockRejectedValueOnce({ code: 'DELETE_FAILED' });
    mockFrom.mockImplementationOnce(() => mockFromChain(mockConversation));

    const { req, res } = createMocks({
      method: 'POST',
      body: { action: 'anonymize_lead', conversation_id: 'c1', reason: 'LGPD' },
      __testUser: adminUser
    });

    await lgpdHandler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(mockRpc).not.toHaveBeenCalledWith(expect.objectContaining({ p_action: 'anonymize_lead' }));
  });

  test('conversa não encontrada retorna 404', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain(null, { message: 'not found' }));

    const { req, res } = createMocks({
      method: 'POST',
      body: { action: 'anonymize_lead', conversation_id: 'c1', reason: 'LGPD' },
      __testUser: adminUser
    });

    await lgpdHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(deleteLaborSettlementState).not.toHaveBeenCalled();
  });

  test('não-admin recebe 403', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: { action: 'anonymize_lead', conversation_id: 'c1', reason: 'LGPD' },
      __testUser: estagiarioUser
    });

    await lgpdHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(deleteLaborSettlementState).not.toHaveBeenCalled();
  });

  test('não expõe protected_payload na auditoria', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain(mockConversation));

    const { req, res } = createMocks({
      method: 'POST',
      body: { action: 'anonymize_lead', conversation_id: 'c1', reason: 'LGPD' },
      __testUser: adminUser
    });

    await lgpdHandler(req, res);

    const detailsCalls = mockRpc.mock.calls.filter(call => call[0] === 'log_audit' && call[1]?.p_details);
    detailsCalls.forEach(call => {
      const details = call[1].p_details;
      expect(typeof details === 'string' ? details : JSON.stringify(details)).not.toContain('protected_payload');
    });
  });
});
