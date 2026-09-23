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
    chunks: [{ title: 'Prazo para recorrer de decisão judicial', type: 'civel', content: 'TRECHO_PRAZO_RECURSO' }]
  }))
}));

const { semanticSearch } = require('../../lib/knowledge-embeddings');
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
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
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

  test('estimativa calculada é persistida em intake_data da conversa', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Fui mandado embora hoje, ganhava 2500 por mês, entrei em janeiro e não assinaram minha carteira'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    expect(statusCode).toBe(200);

    const persisted = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborCalculation);
    expect(persisted).toBeDefined();

    const calc = persisted.intake_data.laborCalculation;
    expect(calc.totalEstimated).not.toBeNull();
    expect(calc.items.some(i => /FGTS/.test(i.name) && i.amount > 0)).toBe(true);
    expect(calc.items.some(i => /Aviso/.test(i.name) && i.amount > 0)).toBe(true);
  });

  test('pergunta posterior sobre FGTS é respondida de forma determinística, sem chamar o Gemini', async () => {
    global.__testConversation = {
      intake_data: {
        laborCalculation: {
          totalEstimated: 5573.33,
          currency: 'BRL',
          calculatedAt: new Date().toISOString(),
          items: [
            { code: 'salary_balance', name: 'Saldo de salário', amount: 1333.33, status: 'calculated' },
            { code: 'notice_indemnity', name: 'Aviso-prévio indenizado', amount: 2500, status: 'calculated' },
            { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' },
            { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 640, status: 'calculated' }
          ]
        }
      }
    };
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: '🧾 Estimativa preliminar da rescisão\nTotal estimado: R$ 5.573,33',
      sender_type: 'ai',
      created_at: new Date().toISOString()
    }];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quanto dá só de FGTS com essa multa?'),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(statusCode).toBe(200);
    expect(data).toMatchObject({ success: true, labor: true });

    // Gemini NÃO pode ser chamado para responder valores
    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBe(0);

    // Resposta enviada ao WhatsApp mostra FGTS, multa e soma — todos do JS
    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    expect(whatsappCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toContain('1.600,00');
    expect(body.text.body).toContain('640,00');
    expect(body.text.body).toContain('2.240,00');
    expect(body.text.body).toContain('estimativa');
  });

  test('valores alucinados do histórico não contaminam a resposta determinística', async () => {
    global.__testConversation = {
      intake_data: {
        laborCalculation: {
          totalEstimated: 5573.33,
          currency: 'BRL',
          calculatedAt: new Date().toISOString(),
          items: [
            { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' },
            { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 640, status: 'calculated' }
          ]
        }
      }
    };
    global.__testMessages = [
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: '🧾 Estimativa preliminar da rescisão',
        sender_type: 'ai',
        created_at: new Date(Date.now() - 3 * 60 * 1000).toISOString()
      },
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: 'O FGTS totalizaria aproximadamente R$ 2.800,00 e o total R$ 5.500,00 com 13º de R$ 1.100,00 e saldo de R$ 500,00.',
        sender_type: 'ai',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quanto dá só de FGTS com essa multa aí?'),
    });

    await webhookHandler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toContain('1.600,00');
    expect(body.text.body).toContain('640,00');
    expect(body.text.body).toContain('2.240,00');
    expect(body.text.body).not.toContain('2.800');
    expect(body.text.body).not.toContain('5.500');
    expect(body.text.body).not.toContain('1.100');
    expect(body.text.body).not.toContain('500,00');
  });

  test('sem estimativa persistida nem dados suficientes, pergunta de valor recebe resposta segura e não chama o Gemini', async () => {
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: 'Para estimar sua rescisão, preciso das seguintes informações: Qual era o salário mensal? Qual foi a data de admissão? Qual foi a data de desligamento?',
      sender_type: 'ai',
      created_at: new Date().toISOString()
    }];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Quanto dá só de FGTS?'),
    });

    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, labor: true });

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBe(0);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toBe('Ainda não tenho uma estimativa calculada para informar esse valor. Vou confirmar os dados de salário e período antes de calcular.');
  });

  test('pergunta de horas extras recebe aviso determinístico sem valor inventado', async () => {
    global.__testConversation = {
      intake_data: {
        laborCalculation: {
          totalEstimated: 5573.33,
          currency: 'BRL',
          calculatedAt: new Date().toISOString(),
          items: [
            { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' },
            { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 640, status: 'calculated' }
          ]
        }
      }
    };
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: '🧾 Estimativa preliminar da rescisão',
      sender_type: 'ai',
      created_at: new Date().toISOString()
    }];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('E as horas extras, quanto dá?'),
    });

    await webhookHandler(req, res);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBe(0);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toContain('equipe jurídica');
    expect(body.text.body).not.toMatch(/R\$\s*\d/);
  });

  test('endpoint completo: turno 1 com dados gera estimativa e turno 2 responde FGTS sem Gemini', async () => {
    process.env.LABOR_TODAY_DATE = '2025-09-16';
    try {
      // Turno 1: relato completo (com erro de digitação)
      const turn1 = createMocks({
        method: 'POST',
        body: buildLaborPayload('anhava 2500 por mês, entrei em janeiro e hoje o patrão me mandou embora e disse que não era pra voltar. Eles nunca assinaram minha carteira.'),
      });
      await webhookHandler(turn1.req, turn1.res);

      const data1 = typeof turn1.res._getData() === 'string' ? JSON.parse(turn1.res._getData()) : turn1.res._getData();
      expect(data1).toMatchObject({ success: true, labor: true });

      const persisted = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborCalculation);
      expect(persisted).toBeDefined();
      const laborCalculation = persisted.intake_data.laborCalculation;
      expect(laborCalculation.items.some(i => i.code === 'fgts' && i.amount > 0)).toBe(true);
      expect(laborCalculation.items.some(i => i.code === 'fgts_fine' && i.amount > 0)).toBe(true);

      // Turno 2: nova requisição — conversa vem do banco com intake_data persistido
      global.__testConversation = { intake_data: { laborCalculation } };
      global.__testMessages = [
        {
          conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          text: 'anhava 2500 por mês, entrei em janeiro e hoje o patrão me mandou embora e disse que não era pra voltar. Eles nunca assinaram minha carteira.',
          sender_type: 'client',
          created_at: new Date().toISOString()
        },
        {
          conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          text: '🧾 Estimativa preliminar da rescisão\n➡️ Total estimado: R$ 5.573,33',
          sender_type: 'ai',
          created_at: new Date().toISOString()
        }
      ];
      fetchSpy.mockClear();

      const turn2 = createMocks({
        method: 'POST',
        body: buildLaborPayload('Quanto dá só de FGTS com essa multa aí?'),
      });
      await webhookHandler(turn2.req, turn2.res);

      const data2 = typeof turn2.res._getData() === 'string' ? JSON.parse(turn2.res._getData()) : turn2.res._getData();
      expect(data2).toMatchObject({ success: true, labor: true });

      const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
        String(url).includes('generativelanguage.googleapis.com')
      );
      expect(geminiCalls.length).toBe(0);

      const fgtsDeposits = laborCalculation.items.find(i => i.code === 'fgts');
      const fgtsPenalty = laborCalculation.items.find(i => i.code === 'fgts_fine');
      const expectedTotal = fgtsDeposits.amount + fgtsPenalty.amount;
      const fmt = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
      const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
      expect(body.text.body).toContain(fmt(fgtsDeposits.amount));
      expect(body.text.body).toContain(fmt(fgtsPenalty.amount));
      expect(body.text.body).toContain(fmt(expectedTotal));
    } finally {
      delete process.env.LABOR_TODAY_DATE;
    }
  });

  test('mensagem trabalhista não injeta trechos de outras áreas do RAG', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Fui demitido hoje, quais são meus direitos trabalhistas?'),
    });

    await webhookHandler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBeGreaterThan(0);

    const geminiBody = JSON.parse(geminiCalls[0][1].body);
    const prompt = geminiBody.contents?.[0]?.parts?.[0]?.text || '';
    expect(prompt).not.toContain('TRECHO_PRAZO_RECURSO');
    expect(prompt).not.toContain('Prazo para recorrer');
  });

  test('mensagem não trabalhista injeta trechos relevantes da base de conhecimento', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Bom dia, gostaria de saber o prazo para recorrer de uma decisão judicial'),
    });

    await webhookHandler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBeGreaterThan(0);

    const geminiBody = JSON.parse(geminiCalls[0][1].body);
    const prompt = geminiBody.contents?.[0]?.parts?.[0]?.text || '';
    expect(prompt).toContain('TRECHO_PRAZO_RECURSO');
  });

  test('comando "É outro assunto" invalida contexto trabalhista e responde sem Gemini', async () => {
    global.__testConversation = {
      intake_data: {
        laborContextActive: true,
        laborCalculation: {
          totalEstimated: 5573.33,
          currency: 'BRL',
          calculatedAt: new Date().toISOString(),
          items: [
            { code: 'salary_balance', name: 'Saldo de salário', amount: 1333.33, status: 'calculated' },
            { code: 'fgts', name: 'FGTS estimado', amount: 1600, status: 'calculated' }
          ]
        }
      }
    };
    global.__testMessages = [{
      conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      text: '🧾 Estimativa preliminar da rescisão\n➡️ Total estimado: R$ 5.573,33',
      sender_type: 'ai',
      created_at: new Date().toISOString()
    }];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('É outro assunto'),
    });

    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(res._getStatusCode()).toBe(200);
    expect(data).toMatchObject({ success: true, topicReset: true });

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBe(0);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toBe('Claro. Qual assunto você gostaria de tratar?');
    expect(body.text.body).not.toContain('Estimativa');

    const persistedReset = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborContextActive === false);
    expect(persistedReset).toBeDefined();
    expect(persistedReset.intake_data.laborContextResetAt).toBeTruthy();
    expect(persistedReset.intake_data.laborCalculation).toBeUndefined();
  });

  test('após reset, nova mensagem cível não carrega estimativa trabalhista no prompt', async () => {
    const resetAt = new Date().toISOString();
    global.__testConversation = {
      intake_data: {
        laborContextActive: false,
        laborContextResetAt: resetAt
      }
    };
    global.__testMessages = [
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: '🧾 Estimativa preliminar da rescisão\n➡️ Total estimado: R$ 5.573,33',
        sender_type: 'ai',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      },
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: 'Claro. Qual assunto você gostaria de tratar?',
        sender_type: 'ai',
        created_at: resetAt
      }
    ];
    fetchSpy.mockClear();

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Bom dia, gostaria de falar sobre um assunto'),
    });

    await webhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBeGreaterThan(0);

    const geminiBody = JSON.parse(geminiCalls[0][1].body);
    const prompt = geminiBody.contents?.[0]?.parts?.[0]?.text || '';
    expect(prompt).not.toContain('ESTIMATIVA TRABALHISTA JÁ CALCULADA');
    expect(prompt).not.toContain('R$ 5.573,33');
    expect(prompt).toContain('Bom dia, gostaria de falar sobre um assunto');
  });

  test('após reset, novo cálculo trabalhista pode ser iniciado', async () => {
    process.env.LABOR_TODAY_DATE = '2025-09-16';
    try {
      const resetAt = new Date().toISOString();
      global.__testConversation = {
        intake_data: {
          laborContextActive: false,
          laborContextResetAt: resetAt
        }
      };
      global.__testMessages = [
        {
          conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          text: 'Claro. Qual assunto você gostaria de tratar?',
          sender_type: 'ai',
          created_at: resetAt
        }
      ];
      fetchSpy.mockClear();

      const { req, res } = createMocks({
        method: 'POST',
        body: buildLaborPayload('Quero calcular outra rescisão, ganhava 2500, entrei em janeiro e hoje me mandaram embora. Não assinaram carteira.'),
      });

      await webhookHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
      expect(data).toMatchObject({ success: true, labor: true });

      const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
        String(url).includes('generativelanguage.googleapis.com')
      );
      expect(geminiCalls.length).toBe(0);

      const persisted = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborCalculation);
      expect(persisted).toBeDefined();
      expect(persisted.intake_data.laborContextActive).not.toBe(false);
    } finally {
      delete process.env.LABOR_TODAY_DATE;
    }
  });

  test('falha na persistência do reset não envia confirmação nem permite reuso do cálculo antigo', async () => {
    global.__testUpdateShouldFail = true;
    global.__testConversation = {
      intake_data: {
        laborContextActive: true,
        laborCalculation: {
          totalEstimated: 5573.33,
          currency: 'BRL',
          items: [{ code: 'fgts', name: 'FGTS', amount: 1600, status: 'calculated' }]
        }
      }
    };
    global.__testMessages = [];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('É outro assunto'),
    });

    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(res._getStatusCode()).toBe(200);
    expect(data).toMatchObject({ success: false, topicReset: false });

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const resetCalls = whatsappCalls.filter(c => {
      try {
        const b = JSON.parse(c[1].body);
        return b.text && b.text.body === 'Claro. Qual assunto você gostaria de tratar?';
      } catch { return false; }
    });
    expect(resetCalls.length).toBe(0);

    global.__testUpdateShouldFail = false;
  });

  describe('Webhook triagem de área e acolhimento', () => {
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
      return { ok: true, json: async () => ({ messages: [{ id: 'wa-area-001' }] }) };
    });
  }

  test('"Financiamento atrasado" rotula cível e responde via Gemini sem recusa', async () => {
    global.__testConversation = {
      client_name: 'Jonatas Silva',
      intake_data: {}
    };
    global.__testMessages = [];
    mockFetchWithText('Podemos avaliar essa situação. Que tipo de contrato é — financiamento ou prestação de serviços?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Financiamento atrasado'),
    });

    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.success).toBe(true);
    expect(data.intake).not.toBe(true);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBeGreaterThan(0);

    const labelUpdate = (global.__testUpdates || []).find(u => u && u.legal_area === 'civel');
    expect(labelUpdate).toBeDefined();

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/não (se encaixa|atendo|posso auxiliar|atendemos)/i);
    expect(body.text.body).not.toMatch(/fora (do perfil|do escopo)/i);
    expect(body.text.body).toContain('Podemos avaliar');
    expect(body.text.body).toMatch(/Que tipo de contrato/i);
    expect(body.text.body).not.toMatch(/^Olá,\s*Jonatas/i);
  });

  test('"Financiamento de veículo" vai ao Gemini com etiqueta cível', async () => {
    global.__testConversation = { intake_data: {} };
    global.__testMessages = [];
    mockFetchWithText('Vamos analisar o contrato de financiamento do veículo. Quantas parcelas estão em atraso?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Financiamento de veículo'),
    });

    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.success).toBe(true);
    expect(data.intake).not.toBe(true);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/não (se encaixa|atendo|posso auxiliar|atendemos)/i);
    expect(body.text.body).toMatch(/contrato|financiamento/i);
  });

  test('"Cobrança indevida" vai ao Gemini sem recusa', async () => {
    global.__testConversation = { intake_data: {} };
    global.__testMessages = [];
    mockFetchWithText('Entendi, cobrança indevida. De qual empresa é essa cobrança?');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Cobrança indevida'),
    });

    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.success).toBe(true);
    expect(data.intake).not.toBe(true);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/não (se encaixa|atendo|posso auxiliar|atendemos)/i);
  });

  test('tema não mapeado não gera recusa e o prompt não repete cumprimento', async () => {
    global.__testConversation = {
      client_name: 'Jonatas Silva',
      intake_data: {}
    };
    global.__testMessages = [
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: 'Olá',
        sender_type: 'client',
        created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString()
      },
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: 'Olá! Seja bem-vindo(a)',
        sender_type: 'ai',
        created_at: new Date(Date.now() - 1 * 60 * 1000).toISOString()
      }
    ];
    mockFetchWithText('Entendi. Conte mais sobre o que aconteceu para eu organizar as informações.');

    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Questão sobre patente desconhecida'),
    });

    await webhookHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBeGreaterThan(0);

    const prompt = JSON.parse(geminiCalls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain('MENSAGEM ATUAL');
    expect(prompt).not.toContain('REGRA DE ACOLHIMENTO E ÁREA');
    expect(prompt).not.toContain('REGRA DE NOME');
    expect(prompt).not.toContain('DIRETRIZES PARA ESTA RESPOSTA');
    expect(prompt).not.toContain('Olá, Jonatas');
    expect(prompt).not.toMatch(/Olá,\s*Jonatas/i);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const replyBody = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(replyBody.text.body).not.toMatch(/não (se encaixa|atendo|posso auxiliar|atendemos)/i);
    expect(replyBody.text.body).not.toMatch(/fora (do perfil|do escopo)/i);
    expect(replyBody.text.body).not.toMatch(/^Olá,\s*Jonatas/i);
  });

  test('reset de assunto continua funcionando e não gera recusa no próximo tema', async () => {
    global.__testConversation = {
      client_name: 'Jonatas Silva',
      intake_data: {
        laborContextActive: true,
        laborCalculation: {
          totalEstimated: 5000,
          items: [{ code: 'salary_balance', name: 'Saldo de salário', amount: 1000, status: 'calculated' }]
        }
      }
    };
    global.__testMessages = [];

    const turn1 = createMocks({
      method: 'POST',
      body: buildLaborPayload('É outro assunto'),
    });
    await webhookHandler(turn1.req, turn1.res);
    const data1 = typeof turn1.res._getData() === 'string' ? JSON.parse(turn1.res._getData()) : turn1.res._getData();
    expect(data1).toMatchObject({ success: true, topicReset: true });

    const resetUpdate = (global.__testUpdates || []).find(u => u && u.intake_data && u.intake_data.laborContextActive === false);
    expect(resetUpdate).toBeDefined();

    global.__testConversation = { client_name: 'Jonatas Silva', intake_data: resetUpdate.intake_data };
    global.__testMessages = [
      {
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: 'Claro. Qual assunto você gostaria de tratar?',
        sender_type: 'ai',
        created_at: new Date().toISOString()
      }
    ];
    fetchSpy.mockClear();
    mockFetchWithText('Claro, vamos falar do financiamento do veículo. O que aconteceu?');

    const turn2 = createMocks({
      method: 'POST',
      body: buildLaborPayload('Financiamento de veículo'),
    });
    await webhookHandler(turn2.req, turn2.res);

    const data2 = typeof turn2.res._getData() === 'string' ? JSON.parse(turn2.res._getData()) : turn2.res._getData();
    expect(turn2.res._getStatusCode()).toBe(200);
    expect(data2.success).toBe(true);
    expect(data2.intake).not.toBe(true);

    const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).not.toMatch(/não (se encaixa|atendo|posso auxiliar|atendemos)/i);
    expect(body.text.body).not.toMatch(/^Olá,\s*Jonatas/i);
  });

  describe('Acordo de processo e motor trabalhista', () => {
    function mockFetchWithText(text) {
      fetchSpy.mockImplementation(async (url) => {
        const u = String(url);
        if (u.includes('generativelanguage.googleapis.com')) {
          return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
        }
        return { ok: true, json: async () => ({ messages: [{ id: 'wa-area-001' }] }) };
      });
    }

    const T1 = 'Olá boa tarde, tudo bem? Me chamo Gabriella sou estagiária do escritório Wilson Augusto sociedade individual de advocacia, representamos a empresa ADN comércio e transporte Ltda, processo sob o número 5885805-07.2026.8.09.0051 e gostaria de saber quais são as possibilidades de fazermos um acordo de forma parcelada.';
    const T2 = 'ADN comércio e transporte Ltda, processo sob o número 5885805-07.2026.8.09.0051';

    beforeEach(() => {
      semanticSearch.mockClear();
    });

    test('primeira mensagem completa do escritório não gera estimativa nem repete dados', async () => {
      global.__testConversation = { client_name: 'Gabriella', intake_data: {} };
      global.__testMessages = [];
      mockFetchWithText('Entendido. Existe alguma proposta de entrada e quantas parcelas pretendem?');

      const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload(T1) });
      await webhookHandler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
      expect(data).not.toMatchObject({ labor: true });

      const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
      const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
      expect(body.text.body).toMatch(/Entendido/);
      expect(body.text.body).not.toMatch(/Estimativa preliminar|🧾|rescisão/i);

      const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage'));
      expect(geminiCalls.length).toBeGreaterThan(0);
      const prompt = JSON.parse(geminiCalls[0][1].body).contents[0].parts[0].text;
      expect(prompt).not.toContain('ESTIMATIVA TRABALHISTA');
      expect(prompt).not.toContain('TRECHO_PRAZO_RECURSO');
      expect(semanticSearch).not.toHaveBeenCalled();
    });

    test('repetir empresa e processo não gera estimativa trabalhista', async () => {
      global.__testConversation = { client_name: 'Gabriella', intake_data: {} };
      global.__testMessages = [{
        conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        text: T1,
        sender_type: 'client',
        created_at: new Date(Date.now() - 60000).toISOString()
      }];
      mockFetchWithText('Anotado. Sobre o acordo, qual o valor de entrada e o número de parcelas?');

      const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload(T2) });
      await webhookHandler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
      expect(data).not.toMatchObject({ labor: true });

      const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
      const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
      expect(body.text.body).not.toMatch(/Estimativa preliminar|🧾|rescisão/i);
      expect(body.text.body).toMatch(/acordo/);
    });

    test('mensagem "Quanto é minha rescisão?" ainda dispara resposta trabalhista', async () => {
      global.__testConversation = { client_name: 'Cliente', intake_data: {} };
      global.__testMessages = [];

      const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload('Quanto é minha rescisão?') });
      await webhookHandler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
      expect(data).toMatchObject({ success: true, labor: true });

      const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
      const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
      expect(body.text.body).toMatch(/Ainda não tenho uma estimativa/i);
    });

    test('"acordo" sozinho não gera estimativa trabalhista', async () => {
      global.__testConversation = { client_name: 'Cliente', intake_data: {} };
      global.__testMessages = [];
      mockFetchWithText('Sobre qual acordo você gostaria de falar?');

      const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload('acordo') });
      await webhookHandler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
      expect(data).not.toMatchObject({ labor: true });

      const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
      const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
      expect(body.text.body).toMatch(/acordo/);
      expect(body.text.body).not.toMatch(/Estimativa|rescisão/i);
    });

    test('estado trabalhista antigo com mensagem cível reseta e não gera estimativa', async () => {
      global.__testConversation = {
        client_name: 'Cliente',
        intake_data: {
          laborContextActive: true,
          laborCalculation: {
            totalEstimated: 5000,
            currency: 'BRL',
            calculatedAt: new Date().toISOString(),
            items: [{ code: 'salary_balance', name: 'Saldo de salário', amount: 1000, status: 'calculated' }]
          }
        }
      };
      global.__testMessages = [];
      mockFetchWithText('Recebido. Quais os termos desejados para o acordo parcelado?');

      const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload(T1) });
      await webhookHandler(req, res);
      expect(res._getStatusCode()).toBe(200);

      const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
      expect(data).not.toMatchObject({ labor: true });

      const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
        String(url).includes('generativelanguage.googleapis.com')
      );
      const prompt = JSON.parse(geminiCalls[0][1].body).contents[0].parts[0].text;
      expect(prompt).not.toContain('ESTIMATIVA TRABALHISTA');
    });

    describe('Continuidade e fatos confirmados', () => {
      test('primeira mensagem da Gabriella preenche FATOS CONFIRMADOS e OBJETIVO ATUAL', async () => {
        global.__testConversation = { client_name: 'Gabriella', intake_data: {} };
        global.__testMessages = [];
        mockFetchWithText('Entendi. Você já tem uma proposta ou número de parcelas em mente?');

        const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload(T1) });
        await webhookHandler(req, res);
        expect(res._getStatusCode()).toBe(200);

        const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
        const prompt = JSON.parse(geminiCalls[0][1].body).contents[0].parts[0].text;
        expect(prompt).toContain('FATOS CONFIRMADOS');
        expect(prompt).toContain('Representante: Gabriella');
        expect(prompt).toContain('Empresa/Credor: ADN');
        expect(prompt).toContain('OBJETIVO ATUAL: acordo parcelado');
        expect(prompt).toContain('MENSAGEM ATUAL:');
        expect(prompt).not.toContain('DIRETRIZES PARA ESTA RESPOSTA');
        expect(prompt).not.toContain('REGRA DE NOME');
      });

      test('repetir empresa e processo reconhece os dados e não repete pergunta', async () => {
        global.__testConversation = {
          client_name: 'Gabriella',
          intake_data: {
            confirmedFacts: {
              representative: 'Gabriella',
              office: 'Wilson Augusto',
              company: 'ADN comércio e transporte Ltda',
              processNumber: '5885805-07.2026.8.09.0051',
              objective: 'acordo parcelado'
            },
            lastQuestion: { text: 'Você já tem uma proposta ou número de parcelas em mente?', fingerprint: 'abc123' }
          }
        };
        global.__testMessages = [{
          conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          text: T1,
          sender_type: 'client',
          created_at: new Date(Date.now() - 60000).toISOString()
        }];
        mockFetchWithText('Esses dados já estão registrados. Você já tem uma entrada ou quantidade de parcelas?');

        const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload(T2) });
        await webhookHandler(req, res);
        expect(res._getStatusCode()).toBe(200);

        const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
        const prompt = JSON.parse(geminiCalls[0][1].body).contents[0].parts[0].text;
        expect(prompt).toContain('FATOS CONFIRMADOS');
        expect(prompt).toContain('ÚLTIMA PERGUNTA DO ASSISTENTE');
        expect(prompt).toContain('MENSAGEM ATUAL: ADN comércio');
        expect(prompt).not.toContain('HISTÓRICO DAS ÚLTIMAS');
      });

      test('resposta "R$ 5.000 de entrada" avança sem repetir pergunta anterior', async () => {
        global.__testConversation = {
          client_name: 'Gabriella',
          intake_data: {
            confirmedFacts: { company: 'ADN comércio e transporte Ltda', objective: 'acordo parcelado' },
            lastQuestion: { text: 'Você já tem uma proposta ou número de parcelas?', fingerprint: 'def456' }
          }
        };
        global.__testMessages = [];
        mockFetchWithText('Entendido. Quantas parcelas seriam?');

        const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload('R$ 5.000 de entrada') });
        await webhookHandler(req, res);
        expect(res._getStatusCode()).toBe(200);

        const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
        const prompt = JSON.parse(geminiCalls[0][1].body).contents[0].parts[0].text;
        expect(prompt).toContain('ÚLTIMA PERGUNTA DO ASSISTENTE');
      });

      test('"Acordo" sozinho não repete a pergunta e pede esclarecimento', async () => {
        global.__testConversation = {
          client_name: 'Gabriella',
          intake_data: {
            confirmedFacts: { company: 'ADN comércio e transporte Ltda', objective: 'acordo parcelado' },
            lastQuestion: { text: 'Você já tem uma proposta ou número de parcelas?', fingerprint: 'ghi789' }
          }
        };
        global.__testMessages = [];
        mockFetchWithText('Você quer propor um acordo nesse processo ou está respondendo à mensagem anterior?');

        const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload('Acordo') });
        await webhookHandler(req, res);
        expect(res._getStatusCode()).toBe(200);

        const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
        const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
        expect(body.text.body).toMatch(/Você quer propor|respondendo/);
      });

      test('não envia regras de comportamento no prompt', async () => {
        global.__testConversation = { client_name: 'Cliente', intake_data: {} };
        global.__testMessages = [];
        mockFetchWithText('Certo. Me conte um pouco mais.');

        const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload('Questão sobre patente desconhecida') });
        await webhookHandler(req, res);
        expect(res._getStatusCode()).toBe(200);

        const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
        const prompt = JSON.parse(geminiCalls[0][1].body).contents[0].parts[0].text;
        expect(prompt).toContain('MENSAGEM ATUAL:');
        expect(prompt).not.toContain('REGRA DE NOME');
        expect(prompt).not.toContain('DIRETRIZES PARA ESTA RESPOSTA');
        expect(prompt).not.toContain('REGRA DE ACOLHIMENTO E ÁREA');
      });

      test('não chama RAG para mensagem de acordo sem consulta normativa', async () => {
        global.__testConversation = { client_name: 'Gabriella', intake_data: {} };
        global.__testMessages = [];
        mockFetchWithText('Ok, vamos falar do acordo.');

        const { req, res } = createMocks({ method: 'POST', body: buildLaborPayload('Quero fazer um acordo parcelado no processo') });
        await webhookHandler(req, res);
        expect(res._getStatusCode()).toBe(200);

        expect(semanticSearch).not.toHaveBeenCalled();
      });
    });

  });
});
});
