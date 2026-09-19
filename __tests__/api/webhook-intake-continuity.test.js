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

jest.mock('../../lib/knowledge-embeddings', () => ({
  semanticSearch: jest.fn(async () => ({ chunks: [] }))
}));

const { semanticSearch } = require('../../lib/knowledge-embeddings');
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
    expect(data.success).toBe(true);
    expect(data.intake).not.toBe(true);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage'));
    expect(geminiCalls.length).toBeGreaterThan(0);

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
    expect(body.text.body).not.toMatch(/não emite boletos|não emitimos boletos|não possu[ií]mos cnpj|"Advocacia Neves Costa"/i);

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
    semanticSearch.mockClear();
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
  const mockFetchWithText = (text) => {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('generativelanguage.googleapis.com')) {
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
      }
      return { ok: true, json: async () => ({ messages: [{ id: 'wa-intake-001' }] }) };
    });
  };

  test('"CNPJ informado no contrato" (1ª mensagem) não gera resposta institucional', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero processar a empresa pelo CNPJ informado no contrato'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).not.toMatch(/não emite boletos|não emitimos boletos|não possu[ií]mos cnpj|"Advocacia Neves Costa"/i);
  });

  test('"boleto da compra" (1ª mensagem) não gera resposta institucional', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('O boleto da compra veio com cobrança indevida'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).not.toMatch(/não emite boletos|não emitimos boletos|não possu[ií]mos cnpj|"Advocacia Neves Costa"/i);
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
    expect(data.success).toBe(true);
    expect(data.intake).not.toBe(true);

    // Troca para familia: apenas a etiqueta muda — respostas já coletadas
    // permanecem preservadas (nenhum update apaga nem sobrescreve answers).
    const switchUpdate = (global.__testUpdates || []).find(u => u && u.legal_area === 'familia');
    expect(switchUpdate).toBeDefined();
    expect(switchUpdate.intake_data).toBeUndefined();
    const answersWrites = (global.__testUpdates || []).filter(u => u && u.intake_data && u.intake_data.answers);
    for (const u of answersWrites) {
      expect(u.intake_data.answers).toMatchObject({ area_especifica: 'Contratos' });
    }
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

describe('Conversa livre conduzida pelo Gemini (sem formulário rígido)', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    semanticSearch.mockClear();
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
  const pipelineTiming = (logSpy) => logSpy.mock.calls
    .map(([arg]) => { try { return JSON.parse(arg); } catch { return null; } })
    .filter(e => e && e.event === 'pipeline_timing');
  const mockFetchWithText = (text) => {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('generativelanguage.googleapis.com')) {
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
      }
      return { ok: true, json: async () => ({ messages: [{ id: 'wa-intake-001' }] }) };
    });
  };

  test('"CNPJ informado no contrato" → Gemini, sem institucional e sem pergunta fixa de documentos', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      global.__testConversation = { client_name: 'Cliente', intake_data: {} };
      mockFetchWithText('Entendi. Me conta o que aconteceu com esse contrato?');

      const { req, res } = createMocks({
        method: 'POST',
        body: buildPayload('Quero processar a empresa pelo CNPJ informado no contrato'),
      });
      await webhookHandler(req, res);

      expect(geminiCalls().length).toBeGreaterThan(0);
      const body = lastWhatsappBody();
      expect(body.text.body).not.toMatch(/não emite boletos|não emitimos boletos|não possu[ií]mos cnpj|"Advocacia Neves Costa"/i);
      expect(body.text.body).not.toMatch(/Quais documentos|documentos\/comprovantes|parte contr[aá]ria|valor estimado|Resuma os fatos|melhor e-mail/i);
      expect(pipelineTiming(logSpy).some(e => e.handler === 'gemini')).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test('"boleto da compra" → Gemini, sem institucional e sem pergunta automática de prazo', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      global.__testConversation = { client_name: 'Cliente', intake_data: {} };
      mockFetchWithText('Entendi, cobrança indevida no boleto. A compra foi feita onde?');

      const { req, res } = createMocks({
        method: 'POST',
        body: buildPayload('O boleto da compra veio com cobrança indevida'),
      });
      await webhookHandler(req, res);

      expect(geminiCalls().length).toBeGreaterThan(0);
      const body = lastWhatsappBody();
      expect(body.text.body).not.toMatch(/não emitimos boletos|não possu[ií]mos cnpj/i);
      expect(body.text.body).not.toMatch(/prazo importante|prescri[cç][aã]o|decad[eê]ncia|Existe algum prazo/i);
      expect(pipelineTiming(logSpy).some(e => e.handler === 'gemini')).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  test('"Quero me divorciar" → resposta contextual do Gemini, sem pergunta fixa de e-mail', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };
    mockFetchWithText('Posso te ajudar com o divórcio. É consensual ou litigioso?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero me divorciar'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/div[oó]rcio/i);
    expect(body.text.body).not.toMatch(/melhor e-mail|e-mail para envio/i);

    const labelUpdate = (global.__testUpdates || []).find(u => u && u.legal_area === 'familia');
    expect(labelUpdate).toBeDefined();
  });

  test('narrativa trabalhista rica → Gemini, sem perguntas fixas de parte contrária/valor/resumo/documentos', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };
    mockFetchWithText('Entendi, você foi demitido e trabalhava de segunda a sábado. Sabe me dizer se tinha carteira assinada?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Fui demitido, recebia 1621 e trabalhava de segunda a sábado há mais de um ano'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).not.toMatch(/parte contr[aá]ria|valor estimado|Resuma os fatos|Quais documentos\/comprovantes|cronologicamente/i);
  });

  test('mudança de assunto na sequência: divórcio → rescisão → boleto sem misturar contextos', async () => {
    // Turno 1: divórcio — etiqueta familia + Gemini
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };
    mockFetchWithText('Posso te ajudar com o divórcio. Me conta a situação?');
    let mocks = createMocks({ method: 'POST', body: buildPayload('Quero me divorciar') });
    await webhookHandler(mocks.req, mocks.res);
    expect((global.__testUpdates || []).some(u => u && u.legal_area === 'familia')).toBe(true);
    expect(lastWhatsappBody().text.body).toMatch(/div[oó]rcio/i);

    // Turno 2: cliente muda para trabalhista — troca a etiqueta, responde o novo assunto
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'familia',
      updated_at: new Date().toISOString(),
      intake_data: {}
    };
    global.__testUpdates = [];
    fetchSpy.mockClear();
    mockFetchWithText('Claro, vamos falar da sua rescisão. Quando você foi desligado?');
    mocks = createMocks({ method: 'POST', body: buildPayload('Agora quero falar da minha rescisão trabalhista') });
    await webhookHandler(mocks.req, mocks.res);
    expect((global.__testUpdates || []).some(u => u && u.legal_area === 'trabalhista')).toBe(true);
    expect(lastWhatsappBody().text.body).toMatch(/rescis[aã]o/i);
    expect(lastWhatsappBody().text.body).not.toMatch(/div[oó]rcio|guarda|pens[aã]o/i);

    // Turno 3: atribuição de boleto ao escritório — resposta institucional
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'trabalhista',
      updated_at: new Date().toISOString(),
      intake_data: {}
    };
    fetchSpy.mockClear();
    mocks = createMocks({ method: 'POST', body: buildPayload('Mas tem um boleto em nome de vocês') });
    await webhookHandler(mocks.req, mocks.res);
    expect(lastWhatsappBody().text.body).toMatch(/não emitimos boletos|não possu[ií]mos cnpj|grafia/i);
  });

  test('campo de formulário não é preenchido só porque existe pergunta pendente', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'civel',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 2, // pergunta pendente: parte_contraria
        answers: { area_especifica: 'Contratos' }
      }
    };
    mockFetchWithText('Anotado. O que mais aconteceu nesse contrato?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('A empresa é a Fulano LTDA e ainda devo três parcelas do contrato'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    // Nenhum update grava a mensagem em campo de formulário (parte_contraria etc.)
    const fieldWrite = (global.__testUpdates || []).find(u =>
      u && u.intake_data && u.intake_data.answers &&
      Object.values(u.intake_data.answers).some(v => typeof v === 'string' && v.includes('Fulano')));
    expect(fieldWrite).toBeUndefined();
  });

  test('última resposta do fluxo não gera resumo automático nem case_summary', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'civel',
      updated_at: new Date().toISOString(),
      intake_data: {
        triage_completed: true,
        current_step: 8, // última pergunta do fluxo cível
        answers: { area_especifica: 'Contratos', parte_contraria: 'Empresa X' }
      }
    };
    mockFetchWithText('Obrigado pelas informações. Vou analisar seu caso.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('meuemail@exemplo.com'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).not.toMatch(/Resumo do seu caso/i);
    const summaryUpdate = (global.__testUpdates || []).find(u => u && u.case_summary);
    expect(summaryUpdate).toBeUndefined();
    const completedUpdate = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.completed === true);
    expect(completedUpdate).toBeUndefined();
  });

  test('RAG não é chamado para narrativa livre e é chamado para pergunta normativa', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };
    mockFetchWithText('Entendi. Me conta mais sobre a cobrança.');

    let mocks = createMocks({
      method: 'POST',
      body: buildPayload('O boleto da compra veio com cobrança indevida e quero resolver isso com a loja'),
    });
    await webhookHandler(mocks.req, mocks.res);
    expect(geminiCalls().length).toBeGreaterThan(0);
    expect(semanticSearch).not.toHaveBeenCalled();

    mocks = createMocks({
      method: 'POST',
      body: buildPayload('Qual o prazo para recorrer de uma decisão judicial?'),
    });
    await webhookHandler(mocks.req, mocks.res);
    expect(semanticSearch).toHaveBeenCalled();
  });

  test('cancelamento explícito continua funcionando durante fluxo pendente', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'civel',
      updated_at: new Date().toISOString(),
      intake_data: { triage_completed: true, current_step: 2, answers: {} }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('cancelar'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, cancel: true });
    expect(lastWhatsappBody().text.body).toMatch(/cancelei/i);
    expect(geminiCalls().length).toBe(0);
  });

  test('pedido explícito de atendimento humano continua gerando handoff', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('quero falar com um atendente humano'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, handoff: true });
    expect(lastWhatsappBody().text.body).toBe('Vou encaminhar sua solicitação para nossa equipe. Aguarde o retorno.');
    expect(geminiCalls().length).toBe(0);
  });

  test('primeira mensagem com assunto recebe aviso LGPD + resposta ao assunto', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };
    mockFetchWithText('Posso te ajudar com o divórcio. É consensual ou litigioso?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero me divorciar'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/LGPD|politica-de-privacidade/i);
    expect(body.text.body).toMatch(/div[oó]rcio/i);
    const sentAt = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.consent_request_sent_at);
    expect(sentAt).toBeDefined();
  });

  test('aviso LGPD não é repetido quando já consta no histórico', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: { consent_request_sent_at: new Date().toISOString() } };
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: 'Olá! Seja bem-vindo(a). Política de Privacidade: https://chatnevesecosta.vercel.app/politica-de-privacidade',
      sender_type: 'ai',
      created_at: new Date().toISOString()
    }];
    mockFetchWithText('Sobre o divórcio: é consensual ou litigioso?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('É sobre o divórcio mesmo'),
    });
    await webhookHandler(req, res);

    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/div[oó]rcio/i);
    expect(body.text.body).not.toMatch(/politica-de-privacidade|LGPD/i);
  });

  test('continuação após o aviso segue o diálogo normalmente', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      intake_data: { consent_request_status: 'granted', consent_request_sent_at: new Date().toISOString() }
    };
    mockFetchWithText('Claro. Me conta o que aconteceu com o contrato?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero processar a empresa pelo contrato que assinei'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/contrato/i);
    expect(body.text.body).not.toMatch(/consentimento foi registrado|politica-de-privacidade/i);
  });

  test('recusa de tratamento de dados aciona o fluxo de privacidade', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: { consent_request_status: 'pending' } };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('não aceito'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, consent: true });
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/registramos sua decis[aã]o/i);
    expect(geminiCalls().length).toBe(0);
  });

  test('"Quero me divorciar" não gera handoff automático nem modo humano', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };
    mockFetchWithText('Posso te ajudar com o divórcio. É consensual ou litigioso?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero me divorciar'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data.handoff).not.toBe(true);
    const humanMode = (global.__testUpdates || []).find(u => u && u.mode === 'human');
    expect(humanMode).toBeUndefined();
  });

  test('mensagem posterior ao divórcio recebe resposta normal', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'familia',
      intake_data: { consent_request_sent_at: new Date().toISOString() }
    };
    mockFetchWithText('Certo. Há filhos menores ou bens a dividir?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Temos dois filhos pequenos e um apartamento'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/filhos|bens/i);
  });

  test('mensagem ambígua recebe pedido de esclarecimento do Gemini', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: { consent_request_sent_at: new Date().toISOString() } };
    mockFetchWithText('Você pode me contar um pouco mais sobre o que aconteceu?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Preciso de ajuda'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/contar|aconteceu/i);
  });

  test('mensagem seguinte ao esclarecimento recebe resposta normal', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'consumidor',
      intake_data: { consent_request_sent_at: new Date().toISOString() }
    };
    global.__testMessages = [
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: 'Preciso de ajuda',
        sender_type: 'client',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      },
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: 'Você pode me contar um pouco mais sobre o que aconteceu?',
        sender_type: 'ai',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString()
      }
    ];
    mockFetchWithText('Entendi, cobrança indevida na fatura do cartão. Qual é o banco?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Veio uma cobrança indevida na fatura do meu cartão'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/cobran[cç]a|cart[aã]o|banco/i);
  });

  test('assunto complexo não gera handoff automático', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: { consent_request_sent_at: new Date().toISOString() } };
    mockFetchWithText('Isso pode envolver uma ação de usucapião com discussão entre herdeiros. A equipe poderá avaliar os documentos do imóvel.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Estou numa disputa de usucapião complicada com vários herdeiros e o processo está parado'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data.handoff).not.toBe(true);
    const humanMode = (global.__testUpdates || []).find(u => u && u.mode === 'human');
    expect(humanMode).toBeUndefined();
  });

  test('handoff automático antigo não silencia mensagens posteriores sem humano assumido', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      mode: 'human',
      updated_at: new Date().toISOString(),
      intake_data: { consent_request_sent_at: new Date().toISOString() }
    };
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: 'Vou encaminhar sua solicitação para nossa equipe. Aguarde o retorno.',
      sender_type: 'ai',
      created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString()
    }];
    mockFetchWithText('Claro, posso te ajudar com o divórcio. É consensual ou litigioso?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero me divorciar'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data.bot_paused).not.toBe(true);
    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/div[oó]rcio/i);
    const reactivate = (global.__testUpdates || []).find(u => u && u.mode === 'bot');
    expect(reactivate).toBeDefined();
  });

  test('conversa em modo humano com humano ativo permanece pausada', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      mode: 'human',
      updated_at: new Date().toISOString(),
      intake_data: { consent_request_sent_at: new Date().toISOString() }
    };
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: 'Olá, aqui é o Dr. Silva. Assumi seu atendimento.',
      sender_type: 'human',
      created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
    }];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Obrigado, aguardo'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, bot_paused: true });
    expect(geminiCalls().length).toBe(0);
  });
});
describe('Contexto confiável ao Gemini e estimativa sem repetição', () => {
  let fetchSpy;

  const LABOR_CALC = {
    totalEstimated: 2240,
    currency: 'BRL',
    calculatedAt: new Date().toISOString(),
    items: [
      { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' },
      { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 640, status: 'calculated' }
    ]
  };

  const clientMsg = (text, minutesAgo = 5) => ({
    conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    text,
    sender_type: 'client',
    created_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString()
  });
  const botMsg = (text, minutesAgo = 3) => ({
    conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    text,
    sender_type: 'ai',
    created_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString()
  });
  const geminiPrompt = () => {
    const calls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage'));
    return JSON.parse(calls[0][1].body);
  };

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    semanticSearch.mockClear();
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
  const mockFetchWithText = (text) => {
    fetchSpy.mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('generativelanguage.googleapis.com')) {
        return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
      }
      return { ok: true, json: async () => ({ messages: [{ id: 'wa-intake-001' }] }) };
    });
  };

  test('contexto de formulário antigo contaminado não vai ao Gemini como fato', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'familia',
      case_summary: 'Cliente relatou boleto e pediu divórcio',
      intake_data: {
        consent_request_sent_at: new Date().toISOString(),
        answers: {
          provas: 'boleto em anexo',
          objetivo: 'quero me divorciar',
          contato_email: 'salario 1621',
          parte_contraria: 'empresa XYZ'
        }
      }
    };
    mockFetchWithText('Claro, posso te orientar sobre direitos trabalhistas.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero entender meus direitos trabalhistas'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const promptText = geminiPrompt().contents[0].parts[0].text;
    expect(promptText).not.toContain('RESUMO DO CASO');
    expect(promptText).not.toContain('INFORMAÇÕES COLETADAS');
    expect(promptText).not.toContain('MEMÓRIA DO CLIENTE');
    expect(promptText).not.toContain('boleto em anexo');
    expect(promptText).not.toContain('salario 1621');
    expect(promptText).not.toContain('empresa XYZ');
  });

  test('mensagem sobre direitos trabalhistas não recebe resumo antigo de Família', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'familia',
      case_summary: 'Resumo antigo: divórcio litigioso em andamento',
      intake_data: { consent_request_sent_at: new Date().toISOString() }
    };
    mockFetchWithText('Posso te ajudar com direitos trabalhistas.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero entender meus direitos trabalhistas'),
    });
    await webhookHandler(req, res);

    const promptText = geminiPrompt().contents[0].parts[0].text;
    expect(promptText).not.toContain('divórcio litigioso');
    expect(promptText).not.toContain('Resumo antigo');
  });

  test('boleto da compra com contexto de divórcio vai ao Gemini sem institucional nem contexto de divórcio', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'familia',
      intake_data: {
        consent_request_sent_at: new Date().toISOString(),
        answers: { objetivo: 'quero me divorciar', provas: 'fotos do casamento' }
      }
    };
    mockFetchWithText('Entendi, cobrança indevida no boleto da compra. Qual o valor cobrado?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('O boleto da compra veio com cobrança indevida'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).not.toMatch(/não emite boletos|não emitimos boletos|"Advocacia Neves Costa"/i);
    const promptText = geminiPrompt().contents[0].parts[0].text;
    expect(promptText).not.toContain('quero me divorciar');
    expect(promptText).not.toContain('fotos do casamento');
  });

  test('Quero me divorciar com estimativa trabalhista ativa não recebe contexto trabalhista', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'trabalhista',
      intake_data: {
        consent_request_sent_at: new Date().toISOString(),
        laborContextActive: true,
        laborCalculation: LABOR_CALC
      }
    };
    global.__testMessages = [
      clientMsg('ganhava 2500 por mes, entrei em janeiro e hoje me mandaram embora'),
      botMsg('Estimativa preliminar da rescisão')
    ];
    mockFetchWithText('Posso te ajudar com o divórcio. É consensual ou litigioso?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero me divorciar'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const promptText = geminiPrompt().contents[0].parts[0].text;
    expect(promptText).not.toContain('ESTIMATIVA TRABALHISTA');
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/div[oó]rcio/i);
    expect(body.text.body).not.toContain('Estimativa preliminar');
  });

  test('aff após estimativa enviada vai ao Gemini sem repetir a estimativa', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'trabalhista',
      intake_data: {
        consent_request_sent_at: new Date().toISOString(),
        laborContextActive: true,
        laborCalculation: LABOR_CALC
      }
    };
    global.__testMessages = [
      clientMsg('ganhava 2500 por mes, entrei em janeiro e hoje me mandaram embora'),
      botMsg('Estimativa preliminar da rescisão\n\nDados considerados')
    ];
    mockFetchWithText('Sem problema. Se ficou alguma dúvida sobre a estimativa, pode perguntar.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('aff'),
    });
    await webhookHandler(req, res);

    expect(geminiCalls().length).toBeGreaterThan(0);
    const body = lastWhatsappBody();
    expect(body.text.body).not.toContain('Estimativa preliminar');
  });

  test('pergunta sobre item específico (e o FGTS?) responde o item sem a tabela', async () => {
    global.__testConversation = {
      client_name: 'Cliente',
      legal_area: 'trabalhista',
      client_phone_normalized: '7399998888',
      intake_data: {
        consent_request_sent_at: new Date().toISOString(),
        laborContextActive: true,
        laborCalculation: LABOR_CALC
      }
    };
    global.__testMessages = [
      clientMsg('ganhava 2500 por mes, entrei em janeiro e hoje me mandaram embora'),
      botMsg('Estimativa preliminar da rescisão')
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('e o FGTS?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, labor: true });
    const body = lastWhatsappBody();
    expect(body.text.body).toMatch(/FGTS/i);
    expect(body.text.body).toMatch(/R\$\s*[\d.]+,\d{2}/);
    expect(body.text.body).not.toContain('Estimativa preliminar');
    expect(geminiCalls().length).toBe(0);
  });

  test('handoff explícito usa texto único sem telefone, URL ou dados internos', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero falar com um advogado'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, handoff: true });
    const body = lastWhatsappBody();
    expect(body.text.body).toBe('Vou encaminhar sua solicitação para nossa equipe. Aguarde o retorno.');
    expect(body.text.body).not.toMatch(/https?:\/\//);
    expect(body.text.body).not.toMatch(/\b\d{8,}\b/);
  });

  test('systemInstruction usa o prompt novo sem concatenação do antigo', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: { consent_request_sent_at: new Date().toISOString() } };
    mockFetchWithText('Posso te ajudar.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Preciso de ajuda com um contrato'),
    });
    await webhookHandler(req, res);

    const sys = geminiPrompt().system_instruction.parts[0].text;
    expect(sys).toContain('Você é Jhon, assistente virtual');
    expect(sys).toContain('Nunca substitua a conversa por um questionário');
    expect(sys).not.toContain('Você é o Jhon');
    expect(sys).not.toContain('IDENTIDADE E LIMITES');
    expect(sys).not.toContain('RACIOCÍNIO JURÍDICO-PRÁTICO');
    expect(sys).not.toContain('REGRAS DE OURO');
  });
});
