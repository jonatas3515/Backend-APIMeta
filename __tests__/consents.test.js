const { createMocks } = require('node-mocks-http');

const mockFromChain = (data, error = null) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    is: () => chain,
    insert: () => chain,
    update: () => chain,
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

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'admin', id: 'user-1' };
    return fn(req, res);
  }
}));

jest.mock('../lib/logger', () => jest.fn());

const consentsHandler = require('../pages/api/consents/index').default;
const consentDetailHandler = require('../pages/api/consents/[id]').default;

const adminUser = { id: 'u1', role: 'admin' };
const estagiarioUser = { id: 'u3', role: 'estagiario' };

const mockConversation = {
  id: 'c1',
  client_phone: '5511999999999',
  assigned_user_id: 'u2'
};

const mockConsent = {
  id: 'cons-1',
  conversation_id: 'c1',
  consent_type: 'whatsapp_contact',
  legal_basis: 'consent',
  channel: 'whatsapp',
  term_version: '1.0',
  value: true,
  notes: null,
  created_at: '2026-01-15T10:00:00Z',
  revoked_at: null
};

const insertedConsent = {
  ...mockConsent,
  conversation_id: 'c1',
  consent_type: 'data_processing',
  legal_basis: 'contract',
  channel: 'web',
  term_version: '1.1',
  notes: 'Teste'
};

const revokedConsent = {
  ...mockConsent,
  revoked_at: new Date().toISOString()
};

function setupMocks(responses) {
  mockFrom.mockImplementation((table) => {
    const response = responses[table];
    if (!response) return mockFromChain([]);
    if (response === 'single') return mockFromChain(mockConversation, null, true);
    if (Array.isArray(response)) return mockFromChain(response);
    return mockFromChain(response, null, typeof response === 'object' && !Array.isArray(response) && response.id !== undefined);
  });
}

function setupInsert(result) {
  mockFrom.mockImplementation((table) => {
    if (table === 'consent_logs') {
      return {
        select: () => ({
          single: jest.fn().mockResolvedValue({ data: result, error: null })
        }),
        insert: jest.fn().mockResolvedValue({ data: result, error: null })
      };
    }
    return mockFromChain([]);
  });
}

function setupUpdate(result) {
  mockFrom.mockImplementation((table) => {
    if (table === 'consent_logs') {
      return {
        eq: () => ({
          select: () => ({
            single: jest.fn().mockResolvedValue({ data: result, error: null })
          })
        }),
        update: jest.fn().mockResolvedValue({ data: result, error: null })
      };
    }
    return mockFromChain([]);
  });
}

describe('API /api/consents', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('GET retorna lista de consentimentos para admin', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain(mockConversation, null, true))
      .mockImplementationOnce(() => mockFromChain([mockConsent]));

    const { req, res } = createMocks({
      method: 'GET',
      query: { clientId: 'c1' },
      __testUser: adminUser
    });

    await consentsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBe(1);
    expect(json[0].purpose).toBe('whatsapp_contact');
  });

  test('POST cria consentimento válido para advogado', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ ...mockConversation, assigned_user_id: 'u1' }, null, true))
      .mockImplementationOnce(() => mockFromChain([]))
      .mockImplementationOnce(() => mockFromChain(insertedConsent, null));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        clientId: 'c1',
        purpose: 'data_processing',
        legalBasis: 'contract',
        channel: 'web',
        version: '1.1',
        notes: 'Teste'
      },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await consentsHandler(req, res);

    expect(res._getStatusCode()).toBe(201);
    const json = res._getJSONData();
    expect(json.clientId).toBe('c1');
    expect(json.legalBasis).toBe('contract');
  });

  test('POST rejeita duplicata exata não revogada', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ ...mockConversation, assigned_user_id: 'u1' }, null, true))
      .mockImplementationOnce(() => mockFromChain([{ id: 'cons-2' }]));

    const { req, res } = createMocks({
      method: 'POST',
      body: {
        clientId: 'c1',
        purpose: 'whatsapp_contact',
        legalBasis: 'consent',
        channel: 'whatsapp',
        version: '1.0'
      },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await consentsHandler(req, res);

    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toBe('Consentimento idêntico já existe e não está revogado');
  });

  test('estagiario sem permissão recebe 403', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain({ ...mockConversation, assigned_user_id: 'u2' }, null, true));

    const { req, res } = createMocks({
      method: 'GET',
      query: { clientId: 'c1' },
      __testUser: estagiarioUser
    });

    await consentsHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toBe('Acesso negado');
  });

  test('cliente inexistente retorna 404', async () => {
    mockFrom.mockImplementationOnce(() => mockFromChain(null, { message: 'not found' }, true));

    const { req, res } = createMocks({
      method: 'GET',
      query: { clientId: 'c9' },
      __testUser: adminUser
    });

    await consentsHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error).toBe('Titular não encontrado');
  });

  test('POST valida campos obrigatórios', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {
        clientId: 'c1',
        purpose: 'invalid_purpose',
        legalBasis: 'consent',
        channel: 'web'
      },
      __testUser: adminUser
    });

    await consentsHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toContain('purpose');
  });
});

describe('API /api/consents/[id]', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRpc.mockResolvedValue({ data: 'log-id', error: null });
  });

  test('GET retorna consentimento específico', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain(mockConsent, null, true))
      .mockImplementationOnce(() => mockFromChain(mockConversation, null, true));

    const { req, res } = createMocks({
      method: 'GET',
      query: { id: 'cons-1' },
      __testUser: adminUser
    });

    await consentDetailHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().id).toBe('cons-1');
  });

  test('POST revoke revoga consentimento', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain(mockConsent, null, true))
      .mockImplementationOnce(() => mockFromChain({ ...mockConversation, assigned_user_id: 'u1' }, null, true))
      .mockImplementationOnce(() => mockFromChain(revokedConsent, null));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: 'cons-1', action: 'revoke' },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await consentDetailHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().active).toBe(false);
  });

  test('revogação de consentimento já revogado retorna 409', async () => {
    mockFrom
      .mockImplementationOnce(() => mockFromChain({ ...mockConsent, revoked_at: '2026-01-20T12:00:00Z' }, null, true))
      .mockImplementationOnce(() => mockFromChain({ ...mockConversation, assigned_user_id: 'u1' }, null, true));

    const { req, res } = createMocks({
      method: 'POST',
      query: { id: 'cons-1', action: 'revoke' },
      __testUser: { id: 'u1', role: 'advogado' }
    });

    await consentDetailHandler(req, res);

    expect(res._getStatusCode()).toBe(409);
    expect(res._getJSONData().error).toBe('Consentimento já revogado');
  });
});
