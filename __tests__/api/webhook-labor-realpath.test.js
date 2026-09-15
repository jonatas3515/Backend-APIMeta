/**
 * Teste de integração do endpoint /api/webhook para mensagens trabalhistas.
 * Usa o handler real de pages/api/webhook.js com Supabase e a integração trabalhista mockados.
 * Não envia mensagens reais, não usa PII, não acessa Supabase real.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-service-role-key';
process.env.WEBHOOK_VERIFY_TOKEN = 'synthetic-verify-token';
process.env.WHATSAPP_TOKEN = 'synthetic-whatsapp-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'synthetic-phone-id';

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const SYNTHETIC_CONVERSATION = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      client_phone: '5573999998888',
      client_phone_normalized: '73999998888',
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

jest.mock('../../lib/laborWebhookIntegration', () => ({
  handleLaborSettlementWebhook: jest.fn()
}));

const { createMocks } = require('node-mocks-http');
const webhookHandler = require('../../pages/api/webhook').default;
const laborWebhookIntegration = require('../../lib/laborWebhookIntegration');

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

const SALARY_QUESTION = 'Qual era o salário mensal?';

describe('Webhook labor real path', () => {
  let fetchSpy;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-labor-001' }] }),
    });
    laborWebhookIntegration.handleLaborSettlementWebhook.mockReset();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('"Quero calcular minha rescisão" pergunta pelo salário e não chama Gemini', async () => {
    laborWebhookIntegration.handleLaborSettlementWebhook.mockResolvedValue({
      handled: true,
      reply: SALARY_QUESTION,
      flow: 'labor_settlement_estimate'
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quero calcular minha rescisão'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();

    expect(statusCode).toBe(200);
    expect(data).toMatchObject({ success: true, labor: true });

    // Verifica que a integração trabalhista foi chamada com os parâmetros corretos
    expect(laborWebhookIntegration.handleLaborSettlementWebhook).toHaveBeenCalled();
    const callArgs = laborWebhookIntegration.handleLaborSettlementWebhook.mock.calls[0][0];
    expect(callArgs.textBody).toBe('Quero calcular minha rescisão');
    expect(callArgs.messageType).toBe('text');
    expect(callArgs.conversation.client_phone_normalized).toBe('73999998888');

    // Verifica que o WhatsApp foi chamado com a pergunta do salário
    const fetchCalls = fetchSpy.mock.calls;
    const whatsappCalls = fetchCalls.filter(([url]) => String(url).includes('messages'));
    expect(whatsappCalls.length).toBeGreaterThan(0);
    const lastWhatsAppCall = whatsappCalls[whatsappCalls.length - 1];
    const body = JSON.parse(lastWhatsAppCall[1].body);
    expect(body.text.body).toBe(SALARY_QUESTION);

    // Verifica que o Gemini não foi chamado
    const geminiCalls = fetchCalls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBe(0);
  });

  test('mensagem comum cai no fluxo normal (labor=false)', async () => {
    laborWebhookIntegration.handleLaborSettlementWebhook.mockResolvedValue({ handled: false });

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quero falar com um advogado'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();

    expect(statusCode).toBe(200);
    expect(data).not.toMatchObject({ success: true, labor: true });
    expect(laborWebhookIntegration.handleLaborSettlementWebhook).toHaveBeenCalled();
  });

  test('integração handled sem reply não silencia e continua o fluxo', async () => {
    laborWebhookIntegration.handleLaborSettlementWebhook.mockResolvedValue({
      handled: true,
      flow: 'labor_settlement_estimate'
      // sem reply
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quero calcular minha rescisão'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();

    expect(statusCode).not.toBeLessThan(200);
    expect(data).not.toMatchObject({ success: true, labor: true });
  });
});
