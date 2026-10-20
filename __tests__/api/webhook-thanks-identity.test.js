/**
 * Testes da separação entre agradecimentos e o fluxo institucional de
 * identidade (Neves Costa/CNPJ/boleto) no endpoint /api/webhook.
 * Regressão: um "ok obrigado" após a imagem de aviso NÃO pode repetir o texto
 * institucional, e um "obrigado" em conversa nova NÃO pode disparar a imagem.
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

if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms) => new AbortController().signal;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const SYNTHETIC_CONVERSATION = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      client_phone: '5573999998888',
      client_phone_normalized: '7399998888',
      client_name: 'Cassia',
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
      id: 'entry-thanks',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          contacts: [{ profile: { name: 'Cassia' }, wa_id: '5573999998888' }],
          messages: [{
            from: '5573999998888',
            id: 'msg-thanks-001',
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

describe('Agradecimentos vs fluxo institucional de identidade', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('/media')) {
        return { ok: true, json: async () => ({ id: 'media-synthetic-001' }), text: async () => '' };
      }
      if (u.includes('/messages')) {
        return { ok: true, json: async () => ({ messages: [{ id: 'wa-thanks-001' }] }), text: async () => '' };
      }
      return {
        ok: true,
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        json: async () => ({})
      };
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('"ok obrigado" após imagem enviada responde agradecimento sem repetir o aviso', async () => {
    global.__testConversation = {
      client_name: 'Cassia',
      intake_data: {
        identity_image_sent_at: new Date().toISOString(),
        identity_notice_sent_at: new Date().toISOString()
      }
    };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('Ok obrigada'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, thanks: true });

    // Nenhuma imagem reenviada
    const mediaCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(mediaCalls.length).toBe(0);

    // Resposta é um agradecimento caloroso, NÃO a repetição do aviso institucional
    const textMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(textMsg.type).toBe('text');
    expect(textMsg.text.body).toMatch(/nada|imagina|disposi|ajudar|conte conosco/i);
    expect(textMsg.text.body).not.toMatch(/imagem que enviei anteriormente/i);
    expect(textMsg.text.body).not.toMatch(/CNPJ/i);
  });

  test('"obrigado" em conversa nova NÃO dispara a imagem de aviso', async () => {
    global.__testConversation = { client_name: 'Cassia', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('obrigado'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, thanks: true });

    // Bug latente: antes, um agradecimento disparava sendNevesCostaImage
    const mediaCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/media'));
    expect(mediaCalls.length).toBe(0);

    const imageMsgs = fetchSpy.mock.calls
      .filter(([url]) => String(url).includes('/messages'))
      .map(([, init]) => JSON.parse(init.body))
      .filter(b => b.type === 'image');
    expect(imageMsgs.length).toBe(0);
  });

  test('agradecimento com reincidência de identidade ainda dispara o aviso', async () => {
    global.__testConversation = { client_name: 'Cassia', intake_data: {} };

    const { req, res } = createMocks({
      method: 'POST',
      body: buildPayload('valeu, e o cnpj?'),
    });
    await webhookHandler(req, res);

    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data).toMatchObject({ success: true, neves_costa: true });

    const imageMsg = lastPayloadOfType(fetchSpy.mock.calls, '/messages');
    expect(imageMsg.type).toBe('image');
  });
});
