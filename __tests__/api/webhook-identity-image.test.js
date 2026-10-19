/**
 * Testes do aviso institucional em imagem (Neves Costa/CNPJ) no endpoint /api/webhook.
 * Cobre: disparo por CNPJ solto ou pergunta de CNPJ, envio único por conversa,
 * persistência da flag, resposta textual de repetição e fallback quando a imagem falha.
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

// jsdom não expõe AbortSignal.timeout (usado por lib/whatsapp.js no envio de mídia).
if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms) => new AbortController().signal;
}

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
      id: 'entry-identity',
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
            id: 'msg-identity-001',
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

function lastPayloadOfType(calls, needle) {
  const matches = calls.filter(([url]) => String(url).includes(needle));
  return matches.length ? JSON.parse(matches[matches.length - 1][1].body) : null;
}

describe('Aviso institucional em imagem (CNPJ / Neves Costa)', () => {
  let fetchSpy;

  function mockFetch({ imageDownloadFails = false } = {}) {
    return jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/media')) {
        return { ok: true, json: async () => ({ id: 'media-synthetic-001' }), text: async () => '' };
      }
      if (u.includes('/messages')) {
        return { ok: true, json: async () => ({ messages: [{ id: 'wa-identity-001' }] }), text: async () => '' };
      }
      if (imageDownloadFails) {
        return { ok: false, status: 404 };
      }
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        json: async () => ({})
      };
    });
  }

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = mockFetch();
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('CNPJ solto envia a imagem de aviso uma única vez', async () => {
    global.__testConversation = { client_name: 'Andreza', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('05.474.236/0001-83'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, neves_costa: true });

    const mediaCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(mediaCalls.length).toBe(1);

    const imageMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(imageMsg.type).toBe('image');
    expect(imageMsg.image.id).toBe('media-synthetic-001');

    const flagUpdates = global.__testUpdates.filter(u => u?.intake_data?.identity_image_sent_at);
    expect(flagUpdates.length).toBeGreaterThan(0);

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBe(0);
  });

  test('pergunta "cnpj de vcs é esse?" também dispara a imagem', async () => {
    global.__testConversation = { client_name: 'Andreza', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('CNPJ de vcs é esse ?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, neves_costa: true });

    const imageMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(imageMsg.type).toBe('image');
  });

  test('insistência após imagem enviada responde em texto referenciando a imagem', async () => {
    const sentAt = new Date().toISOString();
    global.__testConversation = {
      client_name: 'Andreza',
      intake_data: { identity_image_sent_at: sentAt, identity_notice_sent_at: sentAt }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('mas qual é o cnpj de vocês então?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, special: true });

    const mediaCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(mediaCalls.length).toBe(0);

    const textMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(textMsg.type).toBe('text');
    expect(textMsg.text.body).toMatch(/imagem que enviei anteriormente/i);
    expect(textMsg.text.body).toMatch(/não possui CNPJ/i);
    expect(textMsg.text.body).not.toMatch(/\d{10,}/);
  });

  test('falha no envio da imagem cai no texto institucional sem alegar envio anterior', async () => {
    fetchSpy.mockRestore();
    fetchSpy = mockFetch({ imageDownloadFails: true });
    global.__testConversation = { client_name: 'Andreza', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('05.474.236/0001-83'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, special: true });

    const textMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(textMsg.type).toBe('text');
    expect(textMsg.text.body).toMatch(/não possu[ií]mos CNPJ|não possui CNPJ/i);
    expect(textMsg.text.body).not.toMatch(/como informei|como já informei|anteriormente/i);
  });

  test('aviso textual legado sem imagem ainda permite o envio da imagem uma vez', async () => {
    global.__testConversation = {
      client_name: 'Andreza',
      intake_data: { identity_notice_sent_at: new Date().toISOString() }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('e o cnpj?'),
    });
    await webhookHandler(req, res);

    // Texto de aviso já foi dado, mas a imagem nunca saiu → envia agora, uma vez
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, neves_costa: true });
    const imageMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(imageMsg.type).toBe('image');
  });

  test('imagem de aviso enviada manualmente por humano conta como enviada', async () => {
    global.__testConversation = {
      client_name: 'Andreza',
      intake_data: {}
    };
    global.__testMessages = [
      { conversation_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', sender_type: 'human', text: '', content_type: 'image', media_url: 'https://example.supabase.co/storage/v1/object/public/chat-files/x/1792446463079-Aviso.jpg', created_at: new Date().toISOString() }
    ];

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('mas qual é o cnpj de vocês?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, special: true });

    const mediaCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(mediaCalls.length).toBe(0);

    const textMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(textMsg.type).toBe('text');
    expect(textMsg.text.body).toMatch(/imagem que enviei anteriormente/i);
  });

  test('representante de banco com "cliente nosso com vcs" dispara a imagem', async () => {
    global.__testConversation = { client_name: 'Jennyffer', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Eu me chamo Jennyffer, gerente do banco Santander, tô com um cliente nosso com vcs'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, neves_costa: true });

    const imageMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(imageMsg.type).toBe('image');

    const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
    expect(geminiCalls.length).toBe(0);
  });

  test('cliente reclamando de banco (sem se identificar como representante) não dispara aviso', async () => {
    global.__testConversation = { client_name: 'Cliente', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Quero processar o banco por uma cobrança indevida no meu contrato'),
    });
    await webhookHandler(req, res);

    const mediaCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(mediaCalls.length).toBe(0);

    const imageMsgs = fetchSpy.mock.calls
      .filter(([url]) => String(url).includes('/messages'))
      .map(([, init]) => JSON.parse(init.body))
      .filter(b => b.type === 'image');
    expect(imageMsgs.length).toBe(0);
  });

  test('mensagem sem CNPJ nem confusão de nome não dispara o aviso', async () => {
    global.__testConversation = { client_name: 'Andreza', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Olá, bom dia'),
    });
    await webhookHandler(req, res);

    const mediaCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(mediaCalls.length).toBe(0);
  });
});
