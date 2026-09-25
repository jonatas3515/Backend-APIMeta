import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatWindow from '../components/ChatWindow';

const mockApiCall = jest.fn();

function makeChannel(name) {
  const channel = {
    on: jest.fn((event, filter, handler) => {
      globalThis.__ncConvChannelHandlers = globalThis.__ncConvChannelHandlers || {};
      globalThis.__ncConvChannelHandlers[name] = handler;
      return channel;
    }),
    subscribe: jest.fn(() => ({ unsubscribe: jest.fn() }))
  };
  return channel;
}

global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
global.URL.revokeObjectURL = jest.fn();
global.scrollTo = jest.fn();
global.fetch = jest.fn().mockResolvedValue({ ok: true });

Element.prototype.scrollIntoView = jest.fn();
window.alert = jest.fn();

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } } })
    },
    channel: jest.fn((name) => makeChannel(name)),
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
          eq: jest.fn().mockImplementation(function (col, val) {
            if (col === 'conversation_id') {
              globalThis.__ncConvRequestedConversationId = val;
            }
            return this;
          }),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => {
            return new Promise((resolve) => {
              const delay = globalThis.__ncConvRequestDelay?.[globalThis.__ncConvRequestedConversationId] || 0;
              setTimeout(() => {
                resolve({ data: globalThis.__ncConvMockMessages || [], error: null });
              }, delay);
            });
          })
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
    })
  }
}));

jest.mock('../lib/apiClient', () => ({
  apiCall: (...args) => mockApiCall(...args)
}));

const conversationA = {
  id: 'cA',
  client_name: 'Cliente A',
  client_phone: '5511999999999',
  mode: 'bot',
  confidential: false,
  internal_notes: ''
};

const conversationB = {
  id: 'cB',
  client_name: 'Cliente B',
  client_phone: '5511999999999',
  mode: 'bot',
  confidential: false,
  internal_notes: ''
};

const defaultMockResponse = (url) => {
  if (url.startsWith('/api/cases/active')) {
    return Promise.resolve({ ok: true, json: async () => ({}) });
  }
  return Promise.resolve({ ok: true, json: async () => ({}) });
};

const setup = async ({ messages = [], conversation = conversationA, delay = {} } = {}) => {
  globalThis.__ncConvMockMessages = messages;
  globalThis.__ncConvChannelHandlers = {};
  globalThis.__ncConvRequestedConversationId = null;
  globalThis.__ncConvRequestDelay = delay;
  const view = render(<ChatWindow conversation={conversation} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
  await screen.findByText('Enviar');
  return view;
};

describe('ChatWindow conversation isolation', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
    mockApiCall.mockImplementation(defaultMockResponse);
    jest.clearAllMocks();
  });

  test('carrega somente mensagens da conversa A', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: 'Mensagem A', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' },
      { id: 'mB1', conversation_id: 'cB', text: 'Mensagem B', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:01:00.000Z' }
    ];
    await setup({ messages, conversation: conversationA });
    await waitFor(() => expect(screen.getByText('Mensagem A')).toBeInTheDocument());
    expect(screen.queryByText('Mensagem B')).not.toBeInTheDocument();
  });

  test('trocar para conversa B mostra somente mensagens de B', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: 'Mensagem A', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' },
      { id: 'mB1', conversation_id: 'cB', text: 'Mensagem B', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:01:00.000Z' }
    ];
    const view = await setup({ messages, conversation: conversationA });
    await waitFor(() => expect(screen.getByText('Mensagem A')).toBeInTheDocument());

    view.rerender(<ChatWindow conversation={conversationB} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);

    await waitFor(() => expect(screen.getByText('Mensagem B')).toBeInTheDocument());
    expect(screen.queryByText('Mensagem A')).not.toBeInTheDocument();
  });

  test('resposta tardia da conversa A não aparece em B', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: 'Mensagem A', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' },
      { id: 'mB1', conversation_id: 'cB', text: 'Mensagem B', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:01:00.000Z' }
    ];
    const view = await setup({ messages, conversation: conversationA, delay: { cA: 300 } });

    view.rerender(<ChatWindow conversation={conversationB} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Mensagem B')).toBeInTheDocument());

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    expect(screen.queryByText('Mensagem A')).not.toBeInTheDocument();
  });

  test('realtime da conversa A não aparece em B', async () => {
    const messages = [];
    const view = await setup({ messages, conversation: conversationA });
    await screen.findByText('Enviar');

    view.rerender(<ChatWindow conversation={conversationB} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
    await screen.findByText('Enviar');

    const aHandler = globalThis.__ncConvChannelHandlers['chat-messages-cA'];
    expect(aHandler).toBeTruthy();

    await act(async () => {
      aHandler({ new: { id: 'mA2', conversation_id: 'cA', text: 'A realtime', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:02:00.000Z' } });
    });

    expect(screen.queryByText('A realtime')).not.toBeInTheDocument();
  });

  test('realtime da conversa B aparece ao trocar para B', async () => {
    const messages = [
      { id: 'mB1', conversation_id: 'cB', text: 'Mensagem B', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' }
    ];
    const view = await setup({ messages, conversation: conversationB });
    await waitFor(() => expect(screen.getByText('Mensagem B')).toBeInTheDocument());

    const bHandler = globalThis.__ncConvChannelHandlers['chat-messages-cB'];
    expect(bHandler).toBeTruthy();

    await act(async () => {
      bHandler({ new: { id: 'mB2', conversation_id: 'cB', text: 'B realtime', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:03:00.000Z' } });
    });

    await waitFor(() => expect(screen.getByText('B realtime')).toBeInTheDocument());
  });

  test('duas conversas do mesmo telefone não se misturam', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: 'A do mesmo telefone', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' },
      { id: 'mB1', conversation_id: 'cB', text: 'B do mesmo telefone', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:01:00.000Z' }
    ];
    const view = await setup({ messages, conversation: conversationA });
    await waitFor(() => expect(screen.getByText('A do mesmo telefone')).toBeInTheDocument());

    view.rerender(<ChatWindow conversation={conversationB} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('B do mesmo telefone')).toBeInTheDocument());
    expect(screen.queryByText('A do mesmo telefone')).not.toBeInTheDocument();
  });

  test('imagem da conversa A não aparece em B', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: '', direction: 'inbound', sender_type: 'client', content_type: 'image', media_url: 'https://example.com/a.jpg', media_type: 'image/jpeg', created_at: '2026-09-24T10:00:00.000Z' },
      { id: 'mB1', conversation_id: 'cB', text: 'B texto', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:01:00.000Z' }
    ];
    const view = await setup({ messages, conversation: conversationA });
    await waitFor(() => expect(screen.getByAltText('Imagem')).toBeInTheDocument());

    view.rerender(<ChatWindow conversation={conversationB} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('B texto')).toBeInTheDocument());
    expect(screen.queryByAltText('Imagem')).not.toBeInTheDocument();
  });

  test('handoff de uma conversa não aparece em outra', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: 'Quero falar com um advogado', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' },
      { id: 'mB1', conversation_id: 'cB', text: 'Conversa B', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:01:00.000Z' }
    ];
    const view = await setup({ messages, conversation: conversationA });
    await waitFor(() => expect(screen.getByText('Quero falar com um advogado')).toBeInTheDocument());

    view.rerender(<ChatWindow conversation={conversationB} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
    await waitFor(() => expect(screen.getByText('Conversa B')).toBeInTheDocument());
    expect(screen.queryByText('Quero falar com um advogado')).not.toBeInTheDocument();
  });

  test('mensagens duplicadas são removidas por id', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: 'Original', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' }
    ];
    await setup({ messages, conversation: conversationA });
    await waitFor(() => expect(screen.getByText('Original')).toBeInTheDocument());

    const aHandler = globalThis.__ncConvChannelHandlers['chat-messages-cA'];
    await act(async () => {
      aHandler({ new: { id: 'mA1', conversation_id: 'cA', text: 'Original', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' } });
    });

    expect(screen.getAllByText('Original').length).toBe(1);
  });

  test('realtime sem conversation_id é descartado com segurança', async () => {
    const messages = [
      { id: 'mA1', conversation_id: 'cA', text: 'A', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:00:00.000Z' }
    ];
    await setup({ messages, conversation: conversationA });
    await waitFor(() => expect(screen.getByText('A')).toBeInTheDocument());

    const aHandler = globalThis.__ncConvChannelHandlers['chat-messages-cA'];
    await act(async () => {
      aHandler({ new: { id: 'mX1', text: 'sem conversation_id', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T10:05:00.000Z' } });
    });

    expect(screen.queryByText('sem conversation_id')).not.toBeInTheDocument();
  });
});
