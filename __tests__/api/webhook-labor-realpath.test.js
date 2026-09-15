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

    const context = { table: null, operation: null, resultType: 'array' };

    function resolveData() {
      if (context.table === 'conversations' && context.resultType === 'object') return SYNTHETIC_CONVERSATION;
      if (context.table === 'conversations' && context.resultType === 'array') return [];
      if (context.table === 'conversations' && context.operation === 'insert') return SYNTHETIC_CONVERSATION;
      if (context.table === 'messages' && context.resultType === 'object') return SYNTHETIC_MESSAGE;
      if (context.table === 'messages' && context.resultType === 'array') return [];
      if (context.table === 'messages' && context.operation === 'insert') return SYNTHETIC_MESSAGE;
      return null;
    }

    const chain = new Proxy({}, {
      get(target, prop) {
        if (prop === 'then') {
          return (onFulfilled) => onFulfilled({ data: resolveData(), error: null });
        }
        return (...args) => {
          if (prop === 'from') { context.table = args[0]; context.operation = null; context.resultType = 'array'; }
          if (['select', 'insert', 'update', 'delete'].includes(prop)) context.operation = prop;
          if (prop === 'single') context.resultType = 'object';
          if (prop === 'limit') context.resultType = 'array';
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
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-labor-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('"Quero calcular minha rescisão" inicia coleta e não chama Gemini', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quero calcular minha rescisão'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();

    expect(statusCode).toBe(200);
    expect(data).toMatchObject({ success: true, labor: true });

    // Verifica que o WhatsApp foi chamado com o texto de abertura
    const fetchCalls = fetchSpy.mock.calls;
    const whatsappCalls = fetchCalls.filter(([url]) => String(url).includes('messages'));
    expect(whatsappCalls.length).toBeGreaterThan(0);
    const lastWhatsAppCall = whatsappCalls[whatsappCalls.length - 1];
    const body = JSON.parse(lastWhatsAppCall[1].body);
    expect(body.text.body).toContain('Para estimar sua rescisão');

    // Verifica que o Gemini não foi chamado
    const geminiCalls = fetchCalls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBe(0);
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
});
