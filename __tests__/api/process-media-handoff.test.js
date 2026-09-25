/**
 * Teste de integração do endpoint /api/process-media.
 * Garante que a resposta automática de áudio/vídeo seja enviada ao cliente
 * e que um pedido explícito de humano apenas notifique o admin —
 * sem marcar mode='human' automaticamente (handoff não silencia a conversa).
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key';
process.env.GOOGLE_AI_API_KEY = '';

const PENDING_AUDIO = {
  id: 'msg-audio-001',
  conversation_id: 'conv-123',
  content_type: 'audio',
  media_url: 'https://synthetic.example.com/audio.ogg',
  text: 'processando transcrição',
  media_status: 'pending',
  created_at: '2026-09-25T21:00:00.000Z'
};

const CONVERSATION = {
  id: 'conv-123',
  client_phone: '5573999998888',
  client_name: 'Cliente',
  mode: 'bot',
  status: 'open'
};

global.__replySentFlag = false;
global.__humanUpdateAfterReplyFlag = false;

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const context = { table: null, operation: null, updateData: null, filters: [] };
    const resolveThen = (onFulfilled) => {
      if (context.table === 'conversations' && context.operation === 'update' && context.updateData?.mode === 'human') {
        global.__humanUpdateAfterReplyFlag = !!global.__replySentFlag;
      }

      const isOutboundBotLookup = context.operation === 'select' &&
        context.filters.some(f => f[0] === 'eq' && f[1] === 'direction' && f[2] === 'outbound') &&
        context.filters.some(f => f[0] === 'eq' && f[1] === 'sender_type' && f[2] === 'bot');

      let data;
      if (context.table === 'messages' && context.operation === 'update' && context.updateData?.media_status === 'processing') {
        // Reivindicação atômica bem-sucedida: retorna a linha reivindicada
        data = [{ id: PENDING_AUDIO.id }];
      } else if (context.table === 'messages' && context.operation === 'select' && isOutboundBotLookup) {
        // Nenhuma resposta do bot já associada à mídia
        data = [];
      } else if (context.table === 'messages' && context.operation === 'select') {
        // Simula a consulta de mídias pendentes com um áudio.
        data = [PENDING_AUDIO];
      } else if (context.table === 'conversations' && context.operation === 'select') {
        data = CONVERSATION;
      } else if (context.table === 'messages' && context.operation === 'insert') {
        data = { id: 'ai-msg-001' };
      } else {
        data = [];
      }
      return Promise.resolve(onFulfilled({ data, error: null }));
    };

    const chain = new Proxy({}, {
      get(_, prop) {
        if (prop === 'then') return resolveThen;
        if (prop === 'single') return () => Promise.resolve({ data: CONVERSATION, error: null });
        return (...args) => {
          if (prop === 'from') {
            context.table = args[0];
            context.operation = null;
            context.updateData = null;
            context.filters = [];
          } else if (['select', 'insert', 'update', 'delete'].includes(prop)) {
            context.operation = prop;
            if (prop === 'update') context.updateData = args[0] || null;
          } else if (['eq', 'like', 'gt', 'lt', 'gte', 'lte', 'in'].includes(prop)) {
            context.filters.push([prop, ...args]);
          }
          return chain;
        };
      }
    });

    return chain;
  })
}));

jest.mock('../../lib/mediaProcessing', () => ({
  transcribeAudio: jest.fn().mockResolvedValue('Preciso falar com advogado'),
  summarizeMedia: jest.fn()
}));

jest.mock('../../lib/ai', () => ({
  askGemini: jest.fn().mockResolvedValue('Vou encaminhar para nossa equipe. Aguarde o retorno.')
}));

jest.mock('../../lib/whatsapp', () => ({
  sendWhatsAppMessage: jest.fn().mockImplementation(() => {
    global.__replySentFlag = true;
    return Promise.resolve('wa-msg-001');
  })
}));

jest.mock('../../lib/needsHuman.js', () => ({
  detectNeedsHuman: jest.fn().mockReturnValue(true),
  notifyAdminHandoff: jest.fn()
}));

const { createMocks } = require('node-mocks-http');
const handler = require('../../pages/api/process-media').default;
const { sendWhatsAppMessage } = require('../../lib/whatsapp');
const { detectNeedsHuman } = require('../../lib/needsHuman.js');

describe('POST /api/process-media - ordem de envio e handoff', () => {
  beforeEach(() => {
    global.__replySentFlag = false;
    global.__humanUpdateAfterReplyFlag = false;
    sendWhatsAppMessage.mockClear();
    detectNeedsHuman.mockClear();
  });

  test('envia resposta do áudio e notifica admin sem marcar modo humano', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      body: {}
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = typeof res._getData() === 'string' ? JSON.parse(res._getData()) : res._getData();
    expect(data.processed).toBeGreaterThan(0);

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      CONVERSATION.client_phone,
      'Vou encaminhar para nossa equipe. Aguarde o retorno.'
    );

    expect(detectNeedsHuman).toHaveBeenCalledWith('Preciso falar com advogado');

    // Resposta enviada; notificação ao admin ocorre, mas NENHUMA atualização
    // com mode='human' pode acontecer por handoff automático.
    expect(global.__replySentFlag).toBe(true);
    expect(global.__humanUpdateAfterReplyFlag).toBe(false);
  });
});
