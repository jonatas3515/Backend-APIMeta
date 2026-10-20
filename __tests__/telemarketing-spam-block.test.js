/**
 * Testes do Bloqueio Definitivo de Telemarketing / Spam.
 * Cobre: ações block_spam/unblock_spam em automation-control, silenciamento
 * definitivo no webhook (sem Gemini, sem reativação, sem unread) e a UI do
 * ChatWindow (banner, ocultação de ações e banner de caso).
 * Não envia mensagens reais, não usa PII.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMocks } from 'node-mocks-http';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'your_supabase_service_role_key';
process.env.WEBHOOK_VERIFY_TOKEN = 'your_verify_token';
process.env.WHATSAPP_TOKEN = 'your_whatsapp_token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'your_phone_number_id';

global.__testMessages = [];
global.__testConversation = null;
global.__testUpdates = [];

global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();
global.scrollTo = jest.fn();
Element.prototype.scrollIntoView = jest.fn();
window.alert = jest.fn();

// Mock único de supabase: serve o webhook (getOrCreateConversation, saveMessage,
// updates de conversa) e o automation-control (update -> eq -> select -> single),
// registrando todos os payloads de update em conversations em __testUpdates.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => {
    const SYNTHETIC_CONVERSATION = {
      id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      client_phone: '5573999998888',
      client_phone_normalized: '7399998888',
      client_name: 'Spam Contact',
      status: null,
      mode: 'bot',
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
          return (onFulfilled) => onFulfilled({ data: resolveData(), error: null });
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

const mockApiCall = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } })
    },
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(() => ({ unsubscribe: jest.fn() }))
    })),
    removeChannel: jest.fn(),
    storage: {
      from: jest.fn(() => ({
        getPublicUrl: jest.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.jpg' } })
      }))
    },
    from: jest.fn().mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn().mockResolvedValue({ data: { role: 'admin' } })
        };
      }
      if (table === 'messages') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockResolvedValue({ data: [], error: null })
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
    })
  }
}));

jest.mock('../lib/apiClient', () => ({
  apiCall: (...args) => mockApiCall(...args)
}));

const automationHandler = require('../pages/api/automation-control').default;
const webhookHandler = require('../pages/api/webhook').default;
const ChatWindow = require('../components/ChatWindow').default;

function buildWebhookPayload(text) {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'entry-spam',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5511999999999',
            phone_number_id: 'MOCK-PHONE-ID-FOR-TESTING',
          },
          contacts: [{ profile: { name: 'Spam' }, wa_id: '5573999998888' }],
          messages: [{
            from: '5573999998888',
            id: `msg-spam-${Date.now()}`,
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

describe('Bloqueio definitivo de Telemarketing / Spam', () => {
  let fetchSpy;

  beforeEach(() => {
    global.__testMessages = [];
    global.__testConversation = null;
    global.__testUpdates = [];
    mockApiCall.mockReset();
    mockApiCall.mockResolvedValue({ ok: true, json: async () => ({}) });
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: 'wa-001' }] }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('automation-control', () => {
    test('block_spam persiste mode human, client_status spam e unread false', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: { conversationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', action: 'block_spam' },
      });
      await automationHandler(req, res);

      const data = res._getJSONData();
      expect(data).toMatchObject({ success: true, mode: 'human', client_status: 'spam' });

      const update = global.__testUpdates.find(u => u && u.client_status === 'spam');
      expect(update).toBeTruthy();
      expect(update.mode).toBe('human');
      expect(update.unread).toBe(false);
    });

    test('unblock_spam restaura mode bot e client_status lead', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: { conversationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', action: 'unblock_spam' },
      });
      await automationHandler(req, res);

      const data = res._getJSONData();
      expect(data).toMatchObject({ success: true, mode: 'bot', client_status: 'lead' });

      const update = global.__testUpdates.find(u => u && u.client_status === 'lead');
      expect(update).toBeTruthy();
      expect(update.mode).toBe('bot');
      expect(update).not.toHaveProperty('unread');
    });

    test('pause e resume continuam funcionando sem client_status', async () => {
      const { req, res } = createMocks({
        method: 'POST',
        body: { conversationId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', action: 'pause', duration: '30' },
      });
      await automationHandler(req, res);
      expect(res._getJSONData()).toMatchObject({ success: true, mode: 'human' });

      const update = global.__testUpdates.find(u => u && u.mode === 'human');
      expect(update).toBeTruthy();
      expect(update).not.toHaveProperty('client_status');
    });
  });

  describe('webhook', () => {
    test('contato spam é silenciado: sem Gemini, sem envio, sem reativação, sem unread', async () => {
      global.__testConversation = {
        client_name: 'Spam',
        client_status: 'spam',
        mode: 'human',
        intake_data: {}
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: buildWebhookPayload('Oferta imperdível!'),
      });
      await webhookHandler(req, res);

      const data = res._getJSONData();
      expect(data).toMatchObject({ status: 'ignored_spam' });

      const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
      expect(geminiCalls.length).toBe(0);

      const whatsappCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('/messages'));
      expect(whatsappCalls.length).toBe(0);

      const botReactivation = global.__testUpdates.find(u => u && u.mode === 'bot');
      expect(botReactivation).toBeUndefined();

      const unreadUpdate = global.__testUpdates.find(u => u && u.unread === true);
      expect(unreadUpdate).toBeUndefined();
    });

    test('contato spam em mode bot também é silenciado (status manda)', async () => {
      global.__testConversation = {
        client_name: 'Spam',
        client_status: 'spam',
        mode: 'bot',
        intake_data: {}
      };

      const { req, res } = createMocks({
        method: 'POST',
        body: buildWebhookPayload('Promoção de empréstimo'),
      });
      await webhookHandler(req, res);

      expect(res._getJSONData()).toMatchObject({ status: 'ignored_spam' });
      const geminiCalls = fetchSpy.mock.calls.filter(([url]) => String(url).includes('generativelanguage.googleapis.com'));
      expect(geminiCalls.length).toBe(0);
    });
  });

  describe('ChatWindow', () => {
    const spamConversation = {
      id: 'cSpam',
      client_name: 'Telemarketing',
      client_phone: '5511888887777',
      mode: 'human',
      client_status: 'spam',
      confidential: false,
      internal_notes: ''
    };

    const normalConversation = {
      id: 'cNormal',
      client_name: 'Cliente',
      client_phone: '5511999999999',
      mode: 'bot',
      client_status: 'lead',
      confidential: false,
      internal_notes: ''
    };

    test('exibe banner de spam e oculta funil, ações e banner de caso', async () => {
      render(<ChatWindow conversation={spamConversation} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
      await screen.findByText('Enviar');

      expect(screen.getByTestId('spam-banner')).toBeInTheDocument();
      expect(screen.getByText(/silenciada permanentemente/i)).toBeInTheDocument();
      expect(screen.getByTestId('unblock-spam-btn')).toBeInTheDocument();

      expect(screen.queryByTestId('funnel-stage-select')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Ver no Funil')).not.toBeInTheDocument();
      expect(screen.queryByTestId('mobile-actions-btn')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Classificação Jurídica')).not.toBeInTheDocument();
      expect(screen.queryByText(/Criar Caso/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Vincular Caso/i)).not.toBeInTheDocument();
    });

    test('desbloquear chama automation-control com unblock_spam', async () => {
      const onUpdate = jest.fn();
      render(<ChatWindow conversation={spamConversation} onConversationUpdate={onUpdate} onBack={jest.fn()} />);
      await screen.findByText('Enviar');

      fireEvent.click(screen.getByTestId('unblock-spam-btn'));

      await waitFor(() => {
        const call = mockApiCall.mock.calls.find(([url]) => url === '/api/automation-control');
        expect(call).toBeTruthy();
        const body = JSON.parse(call[1].body);
        expect(body.action).toBe('unblock_spam');
        expect(body.conversationId).toBe('cSpam');
      });
      await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    });

    test('conversa normal mostra ações e expõe botão Bloquear Telemarketing no menu de pausa', async () => {
      render(<ChatWindow conversation={normalConversation} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
      await screen.findByText('Enviar');

      expect(screen.getByTestId('funnel-stage-select')).toBeInTheDocument();
      expect(screen.queryByTestId('spam-banner')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTitle('Pausar Bot'));
      const blockBtn = screen.getByTestId('block-spam-btn');
      expect(blockBtn).toBeInTheDocument();

      fireEvent.click(blockBtn);

      await waitFor(() => {
        const call = mockApiCall.mock.calls.find(([url]) => url === '/api/automation-control');
        expect(call).toBeTruthy();
        const body = JSON.parse(call[1].body);
        expect(body.action).toBe('block_spam');
        expect(body.conversationId).toBe('cNormal');
      });
    });
  });
});
