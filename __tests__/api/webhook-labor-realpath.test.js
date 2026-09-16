/**
 * Teste de integração do endpoint /api/webhook para mensagens trabalhistas.
 * Usa o handler real de pages/api/webhook.js com Supabase mockado.
 * Não envia mensagens reais, não usa PII, não acessa Supabase real.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'your_supabase_service_role_key';
process.env.WEBHOOK_VERIFY_TOKEN = 'your_verify_token';
process.env.WHATSAPP_TOKEN = 'your_whatsapp_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'your_phone_number_id';

global.__testMessages = [];

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const SYNTHETIC_CONVERSATION = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      client_phone: '5573999998888',
      client_phone_normalized: '7399998888',
      status: null,
      mode: null,
      archived: false,
      intake_data: {}
    };
    const SYNTHETIC_MESSAGE = { id: 1 };

    const context = {
      table: null,
      operation: null,
      resultType: 'array',
      gte: null,
      eqFilters: []
    };

    function resolveData() {
      if (context.table === 'conversations' && context.resultType === 'object') return SYNTHETIC_CONVERSATION;
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
          return (onFulfilled) => onFulfilled({ data: resolveData(), error: null });
        }
        return (...args) => {
          if (prop === 'from') {
            context.table = args[0];
            context.operation = null;
            context.resultType = 'array';
            context.gte = null;
            context.eqFilters = [];
          }
          if (['select', 'insert', 'update', 'delete'].includes(prop)) context.operation = prop;
          if (prop === 'single') context.resultType = 'object';
          if (prop === 'limit') context.resultType = 'array';
          if (prop === 'gte') context.gte = args[0];
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

function buildLaborPayload(text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-synthetic-labor',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          messages: [{
            from: '5573999998888',
            id: 'msg-synthetic-labor-001',
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

describe('Webhook labor real path', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-labor-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('"Quero calcular minha rescisão" é liberada para o Gemini sem perguntas rígidas', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quero calcular minha rescisão'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();

    expect(statusCode).toBe(200);
    expect(data).toMatchObject({ success: true });
    expect(data).not.toHaveProperty('labor', true);

    const fetchCalls = fetchSpy.mock.calls;

    // Não deve sair a mensagem rígida de abertura
    const whatsappCalls = fetchCalls.filter(([url]) => String(url).includes('messages'));
    if (whatsappCalls.length > 0) {
      const lastWhatsAppCall = whatsappCalls[whatsappCalls.length - 1];
      const body = JSON.parse(lastWhatsAppCall[1].body);
      expect(body.text.body).not.toContain('Para estimar sua rescisão');
    }
  });

  test('mensagem comum cai no fluxo normal (labor=false)', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quero falar com um advogado'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();

    expect(statusCode).toBe(200);
    expect(data).not.toMatchObject({ success: true, labor: true });
  });

  test('histórico com inatividade superior a 4h não é injetado no prompt do Gemini', async () => {
    const staleText = 'MENSAGEM_MUITO_ANTIGA_NAO_DEVE_APARECER';
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: staleText,
      sender_type: 'client',
      created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString()
    }];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Bom dia, gostaria de tirar uma dúvida'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    expect(statusCode).toBe(200);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBeGreaterThan(0);

    const geminiBody = JSON.parse(geminiCalls[0][1].body);
    const prompt = geminiBody.contents?.[0]?.parts?.[0]?.text || '';
    expect(prompt).not.toContain(staleText);
    expect(prompt).not.toContain('HISTÓRICO DAS ÚLTIMAS 24H');
    expect(prompt).not.toContain('HISTÓRICO DAS ÚLTIMAS 4H');
  });
});
