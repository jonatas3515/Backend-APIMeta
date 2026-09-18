/**
 * Testes de fluxo de boleto/cobrança no endpoint /api/webhook.
 * Não envia mensagens reais, não usa PII.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'your_supabase_service_role_key';
process.env.WEBHOOK_VERIFY_TOKEN = 'your_verify_token';
process.env.WHATSAPP_TOKEN = 'your_whatsapp_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'your_phone_number_id';

global.__testMessages = [];
global.__testConversation = null;
global.__testUpdates = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const SYNTHETIC_CONVERSATION = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      client_phone: '5573999998888',
      client_phone_normalized: '7399998888',
      client_name: 'Andreza',
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
          messages = messages.filter(m => context.eqFilters.every(({ field, value }) => m[field] === value));
        }
        if (context.gte) {
          const threshold = new Date(context.gte).getTime();
          messages = messages.filter(m => new Date(m.created_at).getTime() >= threshold);
        }
        return messages;
      }
      if (context.table === 'messages' && context.operation === 'insert') return SYNTHETIC_MESSAGE;
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

function buildPayload(text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-boleto',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          contacts: [{ profile: { name: 'Andreza' }, wa_id: '5573999998888' }],
          messages: [{
            from: '5573999998888',
            id: 'msg-boleto-001',
            timestamp: '1234567890',
            type: 'text',
            text: { body: text },
          }],
        },
        field: 'messages',
      }],
    }],
  };
}

describe('Fluxo de boleto/cobrança no webhook', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-boleto-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('primeira mensagem gera esclarecimento sem telefone', async () => {
    global.__testConversation = { client_name: 'Andreza', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Queria saber de um boleto que foi emitido no meu nome'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/não emitimos boletos/i);
    expect(body.text.body).toMatch(/não possu[ií]r?mos CNPJ/i);
    expect(body.text.body).toMatch(/não temos relação/i);
    expect(body.text.body).not.toMatch(/\d{10,}/);
  });

  test('segunda insistência gera resposta contextual, não duplicada', async () => {
    global.__testConversation = { client_name: 'Andreza', intake_data: {} };
    const now = new Date().toISOString();
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    global.__testMessages = [
      { conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', sender_type: 'client', text: 'Queria saber de um boleto', created_at: twoMinutesAgo },
      { conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', sender_type: 'ai', text: 'Andreza, somos a Neves & Costa Advocacia (com &). Informamos que não emitimos boletos, e nem fazemos cobranças, além de não possuirmos CNPJ. Não temos relação nenhuma com a "Advocacia Neves Costa".', created_at: oneMinuteAgo },
      { conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', sender_type: 'client', text: 'Mais tem um boleto que tá o nome de vcs', created_at: now }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Mais tem um boleto que tá o nome de vcs'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/grafia|CNPJ|não faça o pagamento|não pagar/i);
    expect(body.text.body).toMatch(/neves & costa|não emitimos boletos/i);
    expect(body.text.body).not.toMatch(/não temos relação nenhuma com a/i);
    expect(body.text.body).not.toMatch(/\d{10,}/);
    expect(body.text.body).not.toMatch(/se houver outra dúvida/i);
  });
});
