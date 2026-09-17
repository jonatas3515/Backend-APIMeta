/**
 * Testes de troca de domínio após estimativa trabalhista.
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
            if (prop !== 'select') {
              context.writeOperation = prop;
            }
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

jest.mock('../../lib/knowledge-embeddings', () => ({
  semanticSearch: jest.fn(async () => ({
    chunks: [{ title: 'Exemplo', type: 'geral', content: 'CONTEUDO_NAO_DEVE_APARECER' }]
  }))
}));

const { createMocks } = require('node-mocks-http');
const webhookHandler = require('../../pages/api/webhook').default;

function buildPayload(text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-domain-switch',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          messages: [{
            from: '5573999998888',
            id: 'msg-domain-switch-001',
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

describe('Troca de domínio após estimativa trabalhista', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-domain-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockFetchWithText(text) {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('generativelanguage.googleapis.com')) {
        return {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text }] } }]
          })
        };
      }
      return { ok: true, json: async () => ({ messages: [{ id: 'wa-domain-001' }] }) };
    });
  }

  const activeLaborCalculation = {
    totalEstimated: 5000,
    items: [
      { code: 'salary_balance', name: 'Saldo de salário', amount: 1000 },
      { code: 'notice_pay', name: 'Aviso-prévio indenizado', amount: 800 },
      { code: 'thirteenth_proportional', name: '13º proporcional', amount: 600 },
      { code: 'vacation_proportional', name: 'Férias proporcionais', amount: 400 },
      { code: 'vacation_bonus', name: '1/3 férias', amount: 133 },
      { code: 'inss', name: 'INSS', amount: 263 },
      { code: 'fgts', name: 'FGTS', amount: 1200 },
      { code: 'fgts_fine', name: 'Multa 40% FGTS', amount: 480 }
    ],
    inputSummary: { hasCtps: 'no' }
  };

  test('estimativa -> "Entendi, e causas de divorcio, é com quem?" inicia triagem familiar', async () => {
    global.__testConversation = {
      client_name: null,
      intake_data: {
        laborContextActive: true,
        laborCalculation: activeLaborCalculation
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Entendi, e causas de divorcio, é com quem?'),
    });
    await webhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, intake: true });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/podemos avaliar questões de família/i);
    expect(body.text.body).not.toMatch(/🧾|Estimativa preliminar|FGTS|férias|salário|rescisão/i);

    const resetUpdate = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborContextActive === false);
    expect(resetUpdate).toBeDefined();

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBe(0);
  });

  test('estimativa -> "E guarda dos filhos?" inicia triagem familiar', async () => {
    global.__testConversation = {
      client_name: null,
      intake_data: {
        laborContextActive: true,
        laborCalculation: activeLaborCalculation
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('E guarda dos filhos?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, intake: true });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/podemos avaliar questões de família/i);
    expect(body.text.body).not.toMatch(/FGTS|férias|salário|rescisão/i);
  });

  test('estimativa -> "Tenho um financiamento atrasado" inicia triagem cível', async () => {
    global.__testConversation = {
      client_name: null,
      intake_data: {
        laborContextActive: true,
        laborCalculation: activeLaborCalculation
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Tenho um financiamento atrasado'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, intake: true });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/Podemos avaliar essa situação/i);
    expect(body.text.body).not.toMatch(/FGTS|férias|rescisão|não (se encaixa|posso auxiliar)/i);
  });

  test('estimativa -> "Quero falar de aposentadoria" inicia triagem previdenciária', async () => {
    global.__testConversation = {
      client_name: null,
      intake_data: {
        laborContextActive: true,
        laborCalculation: activeLaborCalculation
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero falar de aposentadoria'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, intake: true });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/Previdenciário|benefício|aposentadoria/i);
    expect(body.text.body).not.toMatch(/FGTS|férias|rescisão/i);
  });

  test('estimativa -> "Quanto dá só de FGTS?" continua respondendo pelo motor trabalhista', async () => {
    global.__testConversation = {
      client_name: null,
      intake_data: {
        laborContextActive: true,
        laborCalculation: activeLaborCalculation
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quanto dá só de FGTS?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, labor: true });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/FGTS/i);
    expect(body.text.body).not.toMatch(/🧾 Estimativa preliminar/i);

    const resetUpdate = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborContextActive === false);
    expect(resetUpdate).toBeUndefined();
  });

  test('estimativa -> "E o aviso-prévio?" não repete a estimativa e mantém contexto trabalhista', async () => {
    global.__testConversation = {
      client_name: null,
      intake_data: {
        laborContextActive: true,
        laborCalculation: activeLaborCalculation
      }
    };
    mockFetchWithText('Com base na estimativa, o aviso-prévio indenizado está incluído nas verbas rescisórias. Avise se quiser saber algum valor específico.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('E o aviso-prévio?'),
    });
    await webhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/aviso|verbas/i);
    expect(body.text.body).not.toMatch(/🧾 Estimativa preliminar/i);

    const resetUpdate = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborContextActive === false);
    expect(resetUpdate).toBeUndefined();
  });

  test('mensagem trabalhista sem cálculo não é confundida com mudança de domínio', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };
    mockFetchWithText('Vamos registrar sua situação trabalhista.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('fui demitido'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true });
    expect(data.intake || data.labor).toBeTruthy();
  });
});
