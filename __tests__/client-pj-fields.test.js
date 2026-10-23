/**
 * Testes - Cadastro de clientes PF e PJ em /api/customer-profile
 * Cobre leitura, atualizacao, sanitizacao e retrocompatibilidade
 */

const { createMocks } = require('node-mocks-http');

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'advogado', id: 'user-1' };
    return fn(req, res);
  },
  hasMinimumRole: () => true
}));

jest.mock('../lib/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn(() => Promise.resolve('wa-msg-id'))
}));

function supabaseBuilder() {
  const chain = {
    from: jest.fn(() => chain),
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    in: jest.fn(() => chain),
    ilike: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    update: jest.fn((payload) => {
      global.__supabaseUpdate = payload;
      return chain;
    }),
    insert: jest.fn(() => chain),
    delete: jest.fn(() => chain),
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

const customerProfileHandler = require('../pages/api/customer-profile').default;

const PJ_CONVERSATION = {
  id: 'conv-pj',
  client_name: 'Empresa XYZ Ltda',
  client_phone: '82999990000',
  person_type: 'juridica',
  document_number: '12345678000190',
  company_contact_name: 'Maria Gerente',
  email: 'contato@xyz.com.br',
  birth_or_foundation_date: '2010-05-20',
  municipality: 'Maceio',
  state: 'AL',
  intake_data: {}
};

const LEGACY_CONVERSATION = {
  id: 'conv-legacy',
  client_name: 'Cliente Antigo',
  client_phone: '82988880000',
  person_type: null,
  document_number: null,
  company_contact_name: null,
  email: null,
  birth_or_foundation_date: null,
  municipality: 'Arapiraca',
  state: 'AL',
  intake_data: {}
};

describe('GET /api/customer-profile - campos PF/PJ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    global.__supabaseUpdate = null;
  });

  test('retorna campos PJ completos no customer', async () => {
    global.__supabaseQueue = [
      { data: PJ_CONVERSATION, error: null },   // conversations.single()
      { data: null, error: null },              // anonymized_data.maybeSingle()
      { data: [], error: null },                // cases
      { data: [], error: null },                // consent_logs
      { data: [], error: null }                 // messages
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: { conversation_id: 'conv-pj' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.customer).toMatchObject({
      person_type: 'juridica',
      document_number: '12345678000190',
      company_contact_name: 'Maria Gerente',
      email: 'contato@xyz.com.br',
      birth_or_foundation_date: '2010-05-20'
    });
  });

  test('cliente legado sem campos novos retorna defaults PF (retrocompatibilidade)', async () => {
    global.__supabaseQueue = [
      { data: LEGACY_CONVERSATION, error: null },
      { data: null, error: null },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: { conversation_id: 'conv-legacy' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.customer.person_type).toBe('fisica');
    expect(body.customer.document_number).toBeNull();
    expect(body.customer.company_contact_name).toBeNull();
    expect(body.customer.birth_or_foundation_date).toBeNull();
  });
});

describe('PATCH /api/customer-profile - atualizacao PF/PJ', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
    global.__supabaseUpdate = null;
  });

  test('atualiza cliente PJ sanitizando CNPJ e e-mail', async () => {
    global.__supabaseQueue = [
      { data: { id: 'conv-pj' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { conversation_id: 'conv-pj' },
      body: {
        person_type: 'juridica',
        client_name: 'Empresa XYZ Ltda',
        document_number: '12.345.678/0001-90',
        company_contact_name: '  Maria Gerente  ',
        email: ' CONTATO@XYZ.COM.BR ',
        birth_or_foundation_date: '2010-05-20'
      },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseUpdate).toMatchObject({
      person_type: 'juridica',
      client_name: 'Empresa XYZ Ltda',
      document_number: '12345678000190',
      company_contact_name: 'Maria Gerente',
      email: 'contato@xyz.com.br',
      birth_or_foundation_date: '2010-05-20'
    });
  });

  test('sanitiza strings vazias para null e CPF para digitos', async () => {
    global.__supabaseQueue = [
      { data: { id: 'conv-pf' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { conversation_id: 'conv-pf' },
      body: {
        person_type: 'fisica',
        document_number: '123.456.789-00',
        company_contact_name: '',
        municipality: '',
        email: 'cliente@email.com'
      },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseUpdate).toMatchObject({
      person_type: 'fisica',
      document_number: '12345678900',
      company_contact_name: null,
      municipality: null,
      email: 'cliente@email.com'
    });
  });

  test('rejeita e-mail invalido com 400', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { conversation_id: 'conv-1' },
      body: { email: 'nao-e-email' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/e-mail/i);
    expect(global.__supabaseUpdate).toBeNull();
  });

  test('rejeita person_type invalido com 400', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { conversation_id: 'conv-1' },
      body: { person_type: 'alien' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/tipo de pessoa/i);
    expect(global.__supabaseUpdate).toBeNull();
  });

  test('rejeita data invalida com 400', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { conversation_id: 'conv-1' },
      body: { birth_or_foundation_date: 'ontem' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(global.__supabaseUpdate).toBeNull();
  });

  test('atualizacao somente com campos legados continua funcionando', async () => {
    global.__supabaseQueue = [
      { data: { id: 'conv-1' }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'PATCH',
      query: { conversation_id: 'conv-1' },
      body: { client_name: 'Novo Nome', municipality: 'Maceio', state: 'AL' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(global.__supabaseUpdate).toEqual({
      client_name: 'Novo Nome',
      municipality: 'Maceio',
      state: 'AL'
    });
  });

  test('rejeita PATCH sem campos validos e sem conversation_id', async () => {
    const { req, res } = createMocks({
      method: 'PATCH',
      query: { conversation_id: 'conv-1' },
      body: { hacker_field: 'x' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(global.__supabaseUpdate).toBeNull();

    const { req: req2, res: res2 } = createMocks({
      method: 'PATCH',
      body: { client_name: 'X' },
      __testUser: { role: 'advogado', id: 'user-1' }
    });

    await customerProfileHandler(req2, res2);
    expect(res2._getStatusCode()).toBe(400);
  });
});
