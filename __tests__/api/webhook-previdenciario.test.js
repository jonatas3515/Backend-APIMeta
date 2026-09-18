/**
 * Testes de triagem contextual previdenciária no endpoint /api/webhook.
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
      id: 'entry-previdenciario',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          messages: [{
            from: '5573999998888',
            id: 'msg-previdenciario-001',
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

describe('Triagem contextual previdenciária no webhook', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-prev-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('aposentadoria → resposta curta com pergunta contextual', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero me aposentar.'),
    });
    await webhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, intake: true });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/h[aá] quanto tempo/i);
    expect(body.text.body).not.toMatch(/Vamos aos detalhes|formulário|1\.|2\./i);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBe(0);

    const update = (global.__testUpdates || []).find(u => u && u.legal_area === 'previdenciario');
    expect(update).toBeDefined();
    expect(update.intake_data.answers.previdenciario_facts.theme).toBe('aposentadoria');
  });

  test('indeferimento → pergunta sobre benefício e data', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Meu benefício foi negado.'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/qual benef[ií]cio.*negado.*quando/i);
    expect(body.text.body).not.toMatch(/não posso auxiliar|não atendemos/i);
  });

  test('urgência → handoff imediato sem chamar Gemini', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Tenho prazo para recorrer do meu benefício do INSS até sexta.'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/encaminhar.*equipe/i);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBe(0);
  });

  test('BPC → pergunta contextual', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero pedir BPC para minha mãe.'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/m[aã]e.*defici[eê]ncia.*pedido/i);
  });

  test('pensão por morte → sem conflito com família', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Pensão por morte.'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/c[oô]njuge|companheiro|filho|dependente/i);

    const update = (global.__testUpdates || []).find(u => u && u.legal_area === 'previdenciario');
    expect(update).toBeDefined();
    expect(update.intake_data.answers.previdenciario_facts.theme).toBe('pensao_morte');
  });

  test('mensagem sem área clara → pergunta aberta e sem recusa', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Preciso de ajuda com documentos.'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/não (se encaixa|posso auxiliar|atendo)|fora (do perfil|do escopo)/i);
  });

  test('não repete dados já informados', async () => {
    global.__testConversation = {
      client_name: null,
      legal_area: 'previdenciario',
      intake_data: {
        triage_completed: true,
        current_step: 0,
        answers: {
          previdenciario_facts: {
            theme: 'aposentadoria',
            client_age: 65,
            contrib_years: 30,
            already_requested: false
          }
        }
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Ainda não fiz o pedido.'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/h[aá] quanto tempo|qual sua idade/i);
    expect(body.text.body).not.toMatch(/Voc[eê] j[aá] fez o pedido/i);
  });

  test('fluxo trabalhista continua determinístico', async () => {
    global.__testConversation = { client_name: null, intake_data: {} };
    mockFetchWithText('Vamos registrar sua situação trabalhista.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero calcular minha rescisão'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true });
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
      return { ok: true, json: async () => ({ messages: [{ id: 'wa-prev-001' }] }) };
    });
  }
});
