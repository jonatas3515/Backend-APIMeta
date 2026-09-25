import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatWindow from '../components/ChatWindow';

const mockApiCall = jest.fn();
let mockMessages = [];

function makeChannel(name) {
  const channel = {
    on: jest.fn((event, filter, handler) => {
      globalThis.__ncChannelHandlers = globalThis.__ncChannelHandlers || {};
      globalThis.__ncChannelHandlers[name] = handler;
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
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockImplementation(() => Promise.resolve({ data: globalThis.__ncMockMessages || [], error: null }))
        };
      }
      return { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), maybeSingle: jest.fn().mockResolvedValue({ data: null }) };
    })
  }
}));

jest.mock('../lib/apiClient', () => ({
  apiCall: (...args) => mockApiCall(...args)
}));

const conversation = {
  id: 'c1',
  client_name: 'Cliente',
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

const setup = async (messages = []) => {
  mockMessages = messages;
  globalThis.__ncMockMessages = messages;
  globalThis.__ncChannelHandlers = {};
  const view = render(<ChatWindow conversation={conversation} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
  await screen.findByText('Enviar');
  return view;
};

describe('ChatWindow recent messages and realtime', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
    mockApiCall.mockImplementation(defaultMockResponse);
    jest.clearAllMocks();
  });

  test('fetchMessages busca as mensagens mais recentes com limite', async () => {
    mockMessages = [
      { id: 'm1', conversation_id: 'c1', text: 'antiga', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-20T00:00:00.000Z' },
      { id: 'm2', conversation_id: 'c1', text: 'recente', direction: 'outbound', sender_type: 'bot', content_type: 'text', created_at: '2026-09-24T00:00:00.000Z' }
    ];
    globalThis.__ncMockMessages = mockMessages;
    await setup(mockMessages);
    await waitFor(() => expect(screen.getByText('recente')).toBeInTheDocument());
    const from = require('../lib/supabaseClient').supabase.from;
    const messagesIdx = from.mock.calls.findIndex(call => call[0] === 'messages');
    const chain = from.mock.results[messagesIdx].value;
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(200);
  });

  test('mensagem vazia com media_url é renderizada', async () => {
    mockMessages = [
      { id: 'm1', conversation_id: 'c1', text: '', direction: 'inbound', sender_type: 'client', content_type: 'image', media_url: 'https://example.com/image.jpg', media_type: 'image/jpeg', created_at: '2026-09-24T00:00:00.000Z' }
    ];
    globalThis.__ncMockMessages = mockMessages;
    await setup(mockMessages);
    await waitFor(() => expect(screen.getByAltText('Imagem')).toBeInTheDocument());
  });

  test('realtime adiciona mensagem sem duplicar', async () => {
    mockMessages = [
      { id: 'm1', conversation_id: 'c1', text: 'histórico', direction: 'inbound', sender_type: 'client', content_type: 'text', created_at: '2026-09-24T00:00:00.001Z' }
    ];
    globalThis.__ncMockMessages = mockMessages;
    await setup(mockMessages);
    await waitFor(() => expect(screen.getByText('histórico')).toBeInTheDocument());

    const handler = globalThis.__ncChannelHandlers['chat-messages-c1'];
    expect(handler).toBeTruthy();

    const newMsg = { id: 'm2', conversation_id: 'c1', text: 'nova resposta', direction: 'outbound', sender_type: 'bot', content_type: 'text', created_at: '2026-09-24T00:00:00.002Z' };

    await act(async () => {
      handler({ new: newMsg });
    });

    const botMessages = screen.getAllByText('nova resposta');
    expect(botMessages.length).toBe(1);

    await act(async () => {
      handler({ new: newMsg });
    });

    expect(screen.getAllByText('nova resposta').length).toBe(1);
  });

  test('resposta da IA após processamento de imagem aparece', async () => {
    mockMessages = [
      { id: 'm1', conversation_id: 'c1', text: '', direction: 'inbound', sender_type: 'client', content_type: 'image', media_url: 'https://example.com/image.jpg', media_type: 'image/jpeg', created_at: '2026-09-24T00:00:00.001Z' },
      { id: 'm2', conversation_id: 'c1', text: 'Analisei a imagem. Pode me contar mais?', direction: 'outbound', sender_type: 'bot', content_type: 'text', created_at: '2026-09-24T00:00:00.002Z' }
    ];
    globalThis.__ncMockMessages = mockMessages;
    await setup(mockMessages);
    await waitFor(() => {
      expect(screen.getByAltText('Imagem')).toBeInTheDocument();
      expect(screen.getByText('Analisei a imagem. Pode me contar mais?')).toBeInTheDocument();
    });
  });

  test('substituir imagem troca o preview', async () => {
    mockMessages = [];
    globalThis.__ncMockMessages = mockMessages;
    await setup(mockMessages);
    const first = new File(['a'], 'first.jpg', { type: 'image/jpeg' });
    const second = new File(['b'], 'second.png', { type: 'image/png' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [first] } });
    });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(first);
    expect(screen.getByAltText('Prévia')).toBeInTheDocument();

    const replaceButton = screen.getByTitle('Substituir');
    expect(replaceButton).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(input, { target: { files: [second] } });
    });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(second);
    expect(screen.getByAltText('Prévia')).toBeInTheDocument();
    expect(input.value).toBe('');
  });
});
