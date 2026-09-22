/**
 * Testes de concorrência, idempotência, LGPD e identidade no /api/webhook.
 * Não envia mensagens reais, não usa PII.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'your_supabase_service_role_key';
process.env.WEBHOOK_VERIFY_TOKEN = 'your_verify_token';
process.env.WHATSAPP_TOKEN = 'your_whatsapp_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'your_phone_number_id';

const CONV_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

// eslint-disable-next-line no-underscore-dangle
global.__testMessages = [];
global.__testConversation = null;
global.__testUpdates = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const SYNTHETIC_CONVERSATION = {
      id: CONV_ID,
      client_phone: '5573999998888',
      client_phone_normalized: '7399998888',
      client_name: 'Cliente',
      status: null,
      mode: null,
      archived: false,
      intake_data: {}
    };
    const SYNTHETIC_MESSAGE = { id: 1 };

    const context = {
      table: null,
      operation: null,
      writeOperation: null,
      resultType: 'array',
      gte: null,
      eqFilters: []
    };

    function resolveData() {
      if (context.table === 'conversations' && context.resultType === 'object') {
        return { ...SYNTHETIC_CONVERSATION, ...(global.__testConversation || {}) };
      }
      if (context.table === 'conversations' && context.resultType === 'array') return [];
      if (context.table === 'conversations' && context.operation === 'insert') return SYNTHETIC_CONVERSATION;
      if (context.table === 'messages' && context.resultType === 'object') return SYNTHETIC_MESSAGE;
      if (context.table === 'messages' && context.resultType === 'array') {
        let messages = global.__testMessages || [];
        if (context.eqFilters.length > 0) {
          messages = messages.filter(m => context.eqFilters.every(({ field, value }) => String(m[field]) === String(value)));
        }
        if (context.gte) {
          const threshold = new Date(context.gte).getTime();
          messages = messages.filter(m => new Date(m.created_at).getTime() >= threshold);
        }
        return messages;
      }
      if (context.table === 'messages' && context.operation === 'insert') {
        const raw = Array.isArray(context.insertArgs) ? context.insertArgs[0] : context.insertArgs;
        const inserted = { ...SYNTHETIC_MESSAGE, ...raw };
        global.__testMessages.push(inserted);
        return inserted;
      }
      return null;
    }

    const chain = new Proxy({}, {
      get(target, prop) {
        if (prop === 'then') {
          return (onFulfilled) => {
            const shouldFail = global.__testUpdateShouldFail && context.writeOperation === 'update' && context.table === 'conversations';
            const error = shouldFail ? { message: 'forced update error' } : null;
            return onFulfilled({ data: error ? null : resolveData(), error });
          };
        }
        return (...args) => {
          if (prop === 'from') {
            context.table = args[0];
            context.operation = null;
            context.writeOperation = null;
            context.resultType = 'array';
            context.gte = null;
            context.eqFilters = [];
          }
          if (['select', 'insert', 'update', 'delete'].includes(prop)) {
            context.operation = prop;
            context.insertArgs = prop === 'insert' ? args[0] : null;
            if (prop !== 'select') context.writeOperation = prop;
            if (prop === 'update' && context.table === 'conversations') {
              global.__testUpdates.push(args[0]);
            }
          }
          if (prop === 'single') context.resultType = 'object';
          if (prop === 'limit') context.resultType = 'array';
          if (prop === 'gte') context.gte = args[1];
          if (prop === 'eq') context.eqFilters.push({ field: args[0], value: args[1] });
          return chain;
        };
      }
    });

    return chain;
  })
}));

const { createMocks } = require('node-mocks-http');
const webhookHandler = require('../../pages/api/webhook').default;

function buildPayload(text, id) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-concurrency',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { display_phone_number: '5511999999999', phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING' },
          contacts: [{ profile: { name: 'Cliente' }, wa_id: '5573999998888' }],
          messages: [{
            from: '5573999998888',
            id,
            timestamp: '1234567890',
            type: 'text',
            text: { body: text }
          }]
        },
        field: 'messages'
      }]
    }]
  };
}

describe('Concorrência, idempotência, LGPD e identidade', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const u = String(url);
      if (u.includes('generativelanguage')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            candidates: [{
              content: { parts: [{ text: 'Entendo. Pode me contar mais sobre o caso trabalhista?' }] }
            }]
          })
        });
      }
      if (u.includes('/media')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: 'media-id-001' })
        });
      }
      if (u.includes('Aviso.jpg') || u.endsWith('.jpg')) {
        return Promise.resolve({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(1)
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ messages: [{ id: 'wa-outbound-001' }] })
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('primeira mensagem "Oi" envia aviso LGPD junto com resposta', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Oi', 'msg-oi-001')
    });

    await webhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    expect(whatsappCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(whatsappCalls[0][1].body);
    expect(body.text.body).toMatch(/politica-de-privacidade/);
    expect(body.text.body).toMatch(/Como posso ajudar/);
  });

  test('"Bom dia" em seguida não repete o aviso LGPD', async () => {
    const now = new Date().toISOString();
    global.__testConversation = {
      client_name: 'Cliente',
      intake_data: { consent_request_sent_at: now, consent_request_status: 'pending' }
    };
    global.__testMessages = [
      { conversation_id: CONV_ID, sender_type: 'client', text: 'Oi', direction: 'inbound', wa_message_id: 'msg-oi-001', created_at: new Date(Date.now() - 60 * 1000).toISOString() },
      { conversation_id: CONV_ID, sender_type: 'ai', text: 'Olá! Em conformidade com a LGPD... https://chatnevesecosta.vercel.app/politica-de-privacidade Como posso ajudar?', direction: 'outbound', created_at: new Date(Date.now() - 50 * 1000).toISOString() }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Bom dia', 'msg-bom-dia-002')
    });

    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = whatsappCalls.length ? JSON.parse(whatsappCalls[0][1].body) : { text: { body: '' } };
    expect(body.text.body).not.toMatch(/politica-de-privacidade/);
    expect(body.text.body.length).toBeGreaterThan(0);
  });

  test('"Sim" repetido rapidamente é processado uma única vez', async () => {
    const now = new Date().toISOString();
    global.__testConversation = {
      client_name: 'Cliente',
      intake_data: { consent_request_status: 'pending' }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Sim', 'msg-sim-003')
    });
    await webhookHandler(req, res);

    expect(res._getJSONData().success).toBe(true);
    expect(res._getJSONData().consent).toBe(true);

    const historyAfterFirst = global.__testMessages.slice();

    const secondPayload = buildPayload('Sim', 'msg-sim-004');
    global.__testMessages = [
      ...historyAfterFirst,
      { conversation_id: CONV_ID, sender_type: 'ai', text: 'Obrigado! Seu consentimento foi registrado...', direction: 'outbound', created_at: now }
    ];
    global.__testConversation.intake_data = { consent_request_status: 'granted', consent: true };

    const { req: req2, res: res2 } = createMocks({
      method: 'POST',
      body: secondPayload
    });
    await webhookHandler(req2, res2);

    const bodies = fetchSpy.mock.calls
      .filter(([url]) => String(url).includes('/messages'))
      .map(([_, opts]) => JSON.parse(opts.body).text.body);
    const consentAcks = bodies.filter(b => b && b.includes('Obrigado! Seu consentimento'));
    expect(consentAcks.length).toBe(1);
  });

  test('reentrega do mesmo message_id retorna duplicate sem duplicar resposta', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };
    global.__testMessages = [
      { conversation_id: CONV_ID, direction: 'inbound', wa_message_id: 'msg-dup-005', text: 'Oi', created_at: new Date().toISOString() }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Oi', 'msg-dup-005')
    });

    await webhookHandler(req, res);

    expect(res._getJSONData().success).toBe(true);
    expect(res._getJSONData().duplicate).toBe(true);
    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    expect(whatsappCalls.length).toBe(0);
  });

  test('duas requisições concorrentes para o mesmo telefone são serializadas', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const [res1, res2] = await Promise.all([
      (async () => {
        const { req, res } = createMocks({ method: 'POST', body: buildPayload('Oi', 'msg-conc-006') });
        await webhookHandler(req, res);
        return res;
      })(),
      (async () => {
        const { req, res } = createMocks({ method: 'POST', body: buildPayload('Bom dia', 'msg-conc-007') });
        await webhookHandler(req, res);
        return res;
      })()
    ]);

    expect(res1._getStatusCode()).toBe(200);
    expect(res2._getStatusCode()).toBe(200);
    expect(res1._getJSONData().success).toBe(true);
    expect(res2._getJSONData().success).toBe(true);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    expect(whatsappCalls.length).toBeGreaterThanOrEqual(2);
  });

  test('primeira mensagem com assunto não pergunta a volta', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero falar de rescisão trabalhista', 'msg-assunto-008')
    });

    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[0][1].body);
    expect(body.text.body).toMatch(/politica-de-privacidade/);
    expect(body.text.body).toMatch(/trabalh|direit|demiss/i);
    expect(body.text.body).not.toMatch(/e-mail/);
    expect(body.text.body).not.toMatch(/parte contrária/);
  });

  test('"Onde consigo falar com a Neves Costa" não repete aviso institucional indevidamente', async () => {
    const now = new Date().toISOString();
    global.__testConversation = {
      client_name: 'Cliente',
      intake_data: { identity_notice_sent_at: now }
    };
    global.__testMessages = [
      { conversation_id: CONV_ID, sender_type: 'ai', text: 'Aviso importante: o escritório Neves & Costa não possui relação...', direction: 'outbound', created_at: new Date(Date.now() - 60 * 1000).toISOString() }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Onde consigo falar com a Neves Costa', 'msg-neves-009')
    });

    await webhookHandler(req, res);

    expect(res._getJSONData().success).toBe(true);
    expect(res._getJSONData().neves_costa).toBeUndefined();
    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(whatsappCalls.length).toBe(0);
  });

  test('handoff explícito não gera resposta concorrente', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero falar com um advogado', 'msg-handoff-010')
    });

    await webhookHandler(req, res);

    expect(res._getJSONData().success).toBe(true);
    expect(res._getJSONData().handoff).toBe(true);
    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const bodies = whatsappCalls.map(([_, opts]) => JSON.parse(opts.body).text.body);
    expect(bodies.length).toBe(1);
    expect(bodies[0]).toMatch(/Vou encaminhar/);
  });

});
