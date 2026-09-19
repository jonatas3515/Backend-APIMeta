/**
 * Testes de continuidade de fluxos rígidos (cível/consumidor/família/administrativo)
 * quando a mensagem atual contém palavras como "cnpj" ou "boleto" que, sem este
 * teste, disparariam indevidamente o esclarecimento de identidade Neves & Costa
 * e reiniciariam o intake em andamento.
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
      id: 'entry-intake-continuity',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          contacts: [{ profile: { name: 'Cliente' }, wa_id: '5573999998888' }],
          messages: [{
            from: '5573999998888',
            id: 'msg-intake-continuity-001',
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

describe('Continuidade de fluxos rígidos diante de palavras de boleto/CNPJ', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-intake-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('mensagem cível mencionando CNPJ da parte contrária não reinicia o intake', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'civel',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 2, // parte_contraria
        answers: { area_especifica: 'Contratos' }
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('A empresa é a Fulano LTDA, CNPJ 12.345.678/0001-99'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, intake: true });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/não emitimos boletos|não possu[ií]mos cnpj/i);

    // legal_area deve permanecer cível; intake não deve ter sido resetado para -1
    const resetUpdate = (global.__testUpdates || []).find(u => u && u.legal_area === null);
    expect(resetUpdate).toBeUndefined();
  });

  test('mensagem de consumidor mencionando boleto da própria cobrança não reinicia o intake', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'consumidor',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 3, // problema
        answers: { empresa_fornecedor: 'Loja X', produto_servico: 'Celular' }
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Recebi um boleto de cobrança indevida da loja, mesmo já tendo pago'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/não emitimos boletos|não possu[ií]mos cnpj|neves & costa/i);

    const resetUpdate = (global.__testUpdates || []).find(u => u && u.legal_area === null);
    expect(resetUpdate).toBeUndefined();
  });

  test('mensagem cível mencionando outro tema (banco/financiamento) não reinicia o intake em andamento', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'civel',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 4, // fatos_relevantes
        answers: { area_especifica: 'Contratos', contract_type: 'Financiamento' }
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Contratei o financiamento no banco em março e paguei todas as parcelas em dia'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    // Narrativa rica vai ao Gemini (não é consumida como resposta da pergunta pendente)
    expect(data.success).toBe(true);
    expect(data.intake).not.toBe(true);

    const domainSwitchUpdate = (global.__testUpdates || []).find(u => u && u.legal_area && u.legal_area !== 'civel');
    expect(domainSwitchUpdate).toBeUndefined();
  });

  test('boleto na primeira mensagem (sem fluxo ativo) continua gerando esclarecimento', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Queria saber de um boleto que foi emitido no meu nome'),
    });
    await webhookHandler(req, res);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/não emitimos boletos|não possu[ií]mos cnpj/i);
  });
});

describe('Estágio A: gatilhos de identidade, sinal forte de troca de área e narrativa rica', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-intake-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const lastWhatsappBody = () => {
    const calls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    return JSON.parse(calls[calls.length - 1][1].body);
  };
  const geminiCalls = () => fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage'));

  test('"CNPJ informado no contrato" (1ª mensagem) não gera resposta institucional', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero processar a empresa pelo CNPJ informado no contrato'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).not.toMatch(/não emitimos boletos|não possu[ií]mos cnpj|neves & costa/i);
  });

  test('"boleto da compra" (1ª mensagem) não gera resposta institucional', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('O boleto da compra veio com cobrança indevida'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).not.toMatch(/não emitimos boletos|não possu[ií]mos cnpj|neves & costa/i);
  });

  test('"boleto em nome de vocês" gera resposta institucional', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Mas tem um boleto em nome de vocês'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/não emitimos boletos|não possu[ií]mos cnpj|grafia/i);
  });

  test('"vocês emitiram esse boleto?" gera resposta institucional', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Vocês emitiram esse boleto?'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/não emitimos boletos|não possu[ií]mos cnpj|grafia/i);
  });

  test('nenhum gatilho isolado de "cnpj" ou "boleto" dispara identidade', async () => {
    for (const text of [
      'Preciso do CNPJ da empresa para o processo',
      'O boleto venceu e quero negociar a dívida',
    ]) {
      global.__testMessages = [];
      global.__testConversation = { client_name: 'Cliente', intake_data: {} };
      global.__testUpdates = [];
      fetchSpy.mockClear();

      const { req, res } = createMocks({ method: 'POST', body: buildPayload(text) });
      await webhookHandler(req, res);

      const body = lastWhatsappBody();
      expect(body.text.body).not.toMatch(/não emitimos boletos|não possu[ií]mos cnpj/i);
    }
  });

  test('mudança clara de área durante fluxo ativo troca a área sem apagar respostas', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'civel',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 2,
        answers: { area_especifica: 'Contratos', contract_type: 'Financiamento' }
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero falar de divórcio, podem me ajudar?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, intake: true });

    // Troca para familia preservando respostas já coletadas
    const switchUpdate = (global.__testUpdates || []).find(u => u && u.legal_area === 'familia');
    expect(switchUpdate).toBeDefined();
    expect(switchUpdate.intake_data.answers).toMatchObject({ area_especifica: 'Contratos' });
  });

  test('menção isolada a outra área dentro de resposta não troca de domínio', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'civel',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 2,
        answers: { area_especifica: 'Contratos' }
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('A empresa é uma corretora ligada ao INSS e ao banco'),
    });
    await webhookHandler(req, res);

    const switchUpdate = (global.__testUpdates || []).find(u => u && u.legal_area && u.legal_area !== 'civel');
    expect(switchUpdate).toBeUndefined();
  });

  test('narrativa rica não fica presa ao questionário e vai ao Gemini', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'trabalhista',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 3,
        answers: { tempo_trabalho: 'mais de um ano' }
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Trabalhava de segunda a sábado sem carteira assinada, recebia em dinheiro e ainda fazia hora extra todo dia'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data.success).toBe(true);
    expect(data.intake).not.toBe(true);
    expect(geminiCalls().length).toBeGreaterThan(0);
  });

  test('logs de timing por estágio são emitidos sem PII', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      global.__testConversation = { client_name: 'Cliente', intake_data: {} };

      const { req, res } = createMocks({
        method: 'POST',
        body: buildPayload('Mas tem um boleto que está no nome de vocês'),
      });
      await webhookHandler(req, res);

      const timingEntries = logSpy.mock.calls
        .map(([arg]) => { try { return JSON.parse(arg); } catch { return null; } })
        .filter(e => e && e.event === 'pipeline_timing');
      expect(timingEntries.length).toBeGreaterThan(0);
      const entry = timingEntries[0];
      expect(entry.handler).toBeDefined();
      expect(typeof entry.total_ms).toBe('number');
      // Sem texto, telefone, nome ou valores — somente estágios e durações
      const allowed = new Set(['source', 'ts', 'correlationId', 'method', 'url', 'level', 'event', 'duration',
        'labor_ms', 'boleto_ms', 'intake_ms', 'gemini_ms', 'total_ms', 'handler']);
      for (const k of Object.keys(entry)) {
        expect(allowed.has(k)).toBe(true);
      }
    } finally {
      logSpy.mockRestore();
    }
  });
});
