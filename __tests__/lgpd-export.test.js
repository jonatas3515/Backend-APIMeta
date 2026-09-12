const { createMocks } = require('node-mocks-http');

const mockFromChain = (data, error = null, isSingle = false) => {
  const result = isSingle ? { data, error } : { data, error };
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    or: () => chain,
    single: isSingle
      ? jest.fn().mockResolvedValue(result)
      : () => chain,
    then: (resolve) => resolve(result)
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

const exportHandler = require('../pages/api/lgpd/export').default;

describe('API /api/lgpd/export', () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockRpc.mockReset().mockResolvedValue({ data: 'log-id', error: null });

    const conversation = {
      id: 'conv-1',
      client_phone: '5511999999999',
      assigned_user_id: 'user-2'
    };

    const cases = [
      { id: 'case-1', title: 'Caso Teste', legal_area: 'Civil', status: 'prospect', created_at: '2026-09-13T12:00:00.000Z', updated_at: '2026-09-13T12:00:00.000Z' }
    ];

    const messages = [
      { id: 'msg-1', direction: 'inbound', sender_type: 'client', content_type: 'text', text: 'Oi', created_at: '2026-09-13T12:00:00.000Z' }
    ];

    const documentRequests = [
      { id: 'dr-1', case_id: 'case-1', status: 'pending', requested_at: '2026-09-13T12:00:00.000Z', items: [] }
    ];

    const generatedDocuments = [];
    const consents = [
      { id: 'consent-1', consent_type: 'data_processing', value: true, created_at: '2026-09-13T12:00:00.000Z' }
    ];

    const feeSimulations = [];
    const audit = [];

    const fullProfile = {
      id: 'conv-1',
      client_name: 'Cliente Teste',
      client_phone: '5511999999999',
      client_email: null,
      client_cpf_cnpj: null,
      municipality: null,
      state: null,
      agency: null,
      client_role: null,
      legal_area: null,
      case_type: null,
      case_summary: null,
      status: 'open',
      client_status: null,
      funnel_stage: null,
      is_client: false,
      is_sensitive: false,
      confidential: false,
      created_at: '2026-09-13T12:00:00.000Z',
      updated_at: '2026-09-13T12:00:00.000Z',
      first_contact_at: '2026-09-13T12:00:00.000Z',
      lead_created_at: null,
      lead_last_contact_at: null,
      intake_data: {}
    };

    mockFrom.mockImplementation((table) => {
      if (table === 'conversations') return mockFromChain(fullProfile, null, true);
      if (table === 'cases') return mockFromChain(cases);
      if (table === 'messages') return mockFromChain(messages);
      if (table === 'document_checklist_requests') return mockFromChain(documentRequests);
      if (table === 'generated_documents') return mockFromChain(generatedDocuments);
      if (table === 'consent_logs') return mockFromChain(consents);
      if (table === 'fee_simulations') return mockFromChain(feeSimulations);
      if (table === 'audit_logs') return mockFromChain(audit);
      return mockFromChain([]);
    });
  });

  test('retorna JSON com estrutura esperada para admin', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { clientId: 'conv-1', format: 'json' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await exportHandler(req, res);
    const data = res._getJSONData();

    expect(res._getStatusCode()).toBe(200);
    expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.subject).toEqual({ id: 'conv-1', type: 'conversation' });
    expect(data.profile.client_name).toBe('Cliente Teste');
    expect(data.cases.length).toBe(1);
    expect(data.messages.length).toBe(1);
    expect(data.consents.length).toBe(1);
  });

  test('retorna CSV com cabeçalho e linhas', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { clientId: 'conv-1', format: 'csv' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await exportHandler(req, res);
    const csv = res._getData();

    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toContain('text/csv');
    expect(csv).toContain('entity,id,field,value');
    expect(csv).toContain('client,conv-1,client_name,Cliente Teste');
    expect(csv).toContain('case,case-1,title,Caso Teste');
  });

  test('estagiario sem permissao recebe 403', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: { clientId: 'conv-1', format: 'json' },
      __testUser: { role: 'estagiario', id: 'user-3' }
    });

    await exportHandler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toBe('Acesso negado');
  });

  test('cliente inexistente retorna 404', async () => {
    mockFrom.mockImplementation((table) => {
      if (table === 'conversations') return mockFromChain(null, null, true);
      return mockFromChain([]);
    });

    const { req, res } = createMocks({
      method: 'GET',
      query: { clientId: 'conv-missing', format: 'json' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await exportHandler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error).toBe('Titular não encontrado');
  });
});
