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
          if (['select', 'insert', 'update', 'delete'].includes(prop)) {
            context.operation = prop;
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
    chunks: [{ title: 'Repetição de Indébito', type: 'consumidor', content: 'TRECHO_CONSUMIDOR_NAO_DEVE_APARECER' }]
  }))
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
    global.__testConversation = null;
    global.__testUpdates = [];
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
      expect(laborCalculation.items.some(i => i.code === 'fgts_deposits' && i.amount > 0)).toBe(true);
      expect(laborCalculation.items.some(i => i.code === 'fgts_penalty_40' && i.amount > 0)).toBe(true);

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

      const fgtsDeposits = laborCalculation.items.find(i => i.code === 'fgts_deposits');
      const fgtsPenalty = laborCalculation.items.find(i => i.code === 'fgts_penalty_40');
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
    expect(prompt).not.toContain('TRECHO_CONSUMIDOR_NAO_DEVE_APARECER');
    expect(prompt).not.toContain('Repetição de Indébito');
  });

  test('mensagem não trabalhista continua injetando a base de conhecimento', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildLaborPayload('Bom dia, tenho uma dúvida sobre um contrato'),
    });

    await webhookHandler(req, res);
    expect(res._getStatusCode()).toBe(200);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) =>
      String(url).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBeGreaterThan(0);

    const geminiBody = JSON.parse(geminiCalls[0][1].body);
    const prompt = geminiBody.contents?.[0]?.parts?.[0]?.text || '';
    expect(prompt).toContain('TRECHO_CONSUMIDOR_NAO_DEVE_APARECER');
  });
});
