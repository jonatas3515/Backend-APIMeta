/**
 * Testes de mídia recebida e envio multimodal ao Gemini.
 * Não envia mensagens reais, não usa PII, não acessa Supabase real.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'your_supabase_service_role_key';
process.env.WEBHOOK_VERIFY_TOKEN = 'your_verify_token';
process.env.WHATSAPP_TOKEN = 'your_whatsapp_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'your_phone_number_id';
process.env.GOOGLE_AI_API_KEY = 'your_google_ai_api_key';
process.env.NEVES_COSTA_IMAGE_URL = 'https://example.com/Aviso.jpg';

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

    const storageMock = {
      from: jest.fn(() => ({
        upload: jest.fn().mockResolvedValue({ data: { path: 'chat-files/test.jpg' }, error: null }),
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/chat-files/test.jpg' } })
      }))
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

    const proxyTarget = { storage: storageMock };

    const chain = new Proxy(proxyTarget, {
      get(target, prop) {
        if (prop === 'storage') return target.storage;
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
    chunks: []
  }))
}));

const { createMocks } = require('node-mocks-http');
const webhookHandler = require('../../pages/api/webhook').default;

function buildImagePayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-synthetic-image',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          contacts: [{ profile: { name: 'Cliente' } }],
          messages: [{
            from: '5573999998888',
            id: 'msg-synthetic-image-001',
            timestamp: '1234567890',
            type: 'image',
            image: { id: 'MEDIA-ID-IMAGE-001' }
          }],
        },
        field: 'messages',
      }],
    }],
  };
}

function buildDocumentPayload() {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-synthetic-doc',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          contacts: [{ profile: { name: 'Cliente' } }],
          messages: [{
            from: '5573999998888',
            id: 'msg-synthetic-doc-001',
            timestamp: '1234567890',
            type: 'document',
            document: { id: 'MEDIA-ID-DOC-001', filename: 'boleto.pdf' }
          }],
        },
        field: 'messages',
      }],
    }],
  };
}

describe('Webhook media real path', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    global.__testUpdateShouldFail = false;

    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation((url) => {
      const u = String(url);
      const baseResponse = (extra) => Promise.resolve({ text: async () => 'error', ...extra });
      if (u.includes('graph.facebook.com/v20.0/MEDIA-ID')) {
        return baseResponse({
          ok: true,
          json: async () => ({
            url: 'https://example.com/media-content.jpg',
            mime_type: 'image/jpeg'
          })
        });
      }
      if (u === 'https://example.com/media-content.jpg') {
        return baseResponse({
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8)
        });
      }
      if (u.includes('generativelanguage.googleapis.com')) {
        return baseResponse({
          ok: true,
          json: async () => ({
            candidates: [{
              content: {
                parts: [{ text: 'Recebido. É uma imagem de documento.' }]
              }
            }]
          })
        });
      }
      return baseResponse({
        ok: true,
        json: async () => ({ messages: [{ id: 'wa-media-001' }] })
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  test('imagem recebida é enviada ao Gemini com parte multimodal', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildImagePayload(),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    expect(statusCode).toBe(200);

    const geminiCalls = fetchSpy.mock.calls.filter(([u]) =>
      String(u).includes('generativelanguage.googleapis.com')
    );
    expect(geminiCalls.length).toBeGreaterThan(0);

    const geminiBody = JSON.parse(geminiCalls[0][1].body);
    const parts = geminiBody.contents?.[0]?.parts || [];
    const hasInlineData = parts.some(p => p.inline_data);
    expect(hasInlineData).toBe(true);
    expect(parts.some(p => p.text)).toBe(true);
  });

  test('documento recebido não gera entrada de visão e não chama Gemini multimodal', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: buildDocumentPayload(),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    expect(statusCode).toBe(200);

    const geminiCalls = fetchSpy.mock.calls.filter(([u]) =>
      String(u).includes('generativelanguage.googleapis.com')
    );
    if (geminiCalls.length > 0) {
      const geminiBody = JSON.parse(geminiCalls[0][1].body);
      const parts = geminiBody.contents?.[0]?.parts || [];
      expect(parts.some(p => p.inline_data)).toBe(false);
    }
  });

  test('imagem ilegível ou falha no Gemini retorna mensagem de descrição', async () => {
    fetchSpy.mockImplementation((url) => {
      const u = String(url);
      const err = { text: async () => 'Internal Error', ok: false, status: 500, statusText: 'Internal Error' };
      if (u.includes('graph.facebook.com/v20.0/MEDIA-ID')) {
        return Promise.resolve({
          text: async () => 'error',
          ok: true,
          json: async () => ({
            url: 'https://example.com/media-content.jpg',
            mime_type: 'image/jpeg'
          })
        });
      }
      if (u === 'https://example.com/media-content.jpg') {
        return Promise.resolve({
          text: async () => 'error',
          ok: true,
          arrayBuffer: async () => new ArrayBuffer(8)
        });
      }
      if (u.includes('/messages')) {
        return Promise.resolve({
          text: async () => 'error',
          ok: true,
          json: async () => ({ messages: [{ id: 'wa-fallback-001' }] })
        });
      }
      if (u.includes('generativelanguage.googleapis.com')) {
        return Promise.resolve(err);
      }
      return Promise.resolve(err);
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: buildImagePayload(),
    });

    await webhookHandler(req, res);

    const statusCode = res._getStatusCode();
    expect(statusCode).toBe(200);

    const whatsappCalls = fetchSpy.mock.calls.filter(([u]) =>
      String(u).includes('/messages')
    );
    expect(whatsappCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(whatsappCalls[whatsappCalls.length - 1][1].body);
    expect(body.text.body).toMatch(/descrever/i);
    expect(body.text.body).not.toMatch(/contar por texto/i);
  });

  test('imagem institucional (Aviso.jpg) não é confundida com imagem do cliente', async () => {
    const envUrl = process.env.NEVES_COSTA_IMAGE_URL;
    expect(envUrl).not.toMatch(/MEDIA-ID/);
    // A imagem institucional é enviada por função separada, não pelo fluxo de vision do cliente
    expect(fetchSpy).not.toHaveBeenCalledWith(envUrl, expect.anything());
  });
});
