import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import ChatWindow from '../components/ChatWindow';

const mockApiCall = jest.fn();

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
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { role: 'admin' } }),
      single: jest.fn().mockResolvedValue({ data: null }),
      then: jest.fn((onFulfilled) => onFulfilled({ data: [], error: null }))
    }))
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

const setup = async () => {
  const view = render(<ChatWindow conversation={conversation} onConversationUpdate={jest.fn()} onBack={jest.fn()} />);
  await screen.findByText('Enviar');
  return view;
};

describe('ChatWindow media preview and send', () => {
  beforeEach(() => {
    mockApiCall.mockReset();
    mockApiCall.mockImplementation(defaultMockResponse);
    global.URL.createObjectURL.mockClear();
    global.URL.revokeObjectURL.mockClear();
  });

  test('selecionar imagem exibe prévia e não dispara envio', async () => {
    await setup();
    const file = new File(['imagecontent'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(file);
    expect(screen.getByAltText('Prévia')).toBeInTheDocument();
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/upload-file', expect.anything());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/send-message', expect.anything());
  });

  test('remover imagem cancela o anexo', async () => {
    await setup();
    const file = new File(['imagecontent'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const removeButton = screen.getByTitle('Remover');
    await act(async () => {
      fireEvent.click(removeButton);
    });

    expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    expect(screen.queryByAltText('Prévia')).not.toBeInTheDocument();
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/upload-file', expect.anything());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/send-message', expect.anything());
  });

  test('input de arquivo não força câmera (sem atributo capture)', async () => {
    await setup();
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    expect(input.hasAttribute('capture')).toBe(false);
  });

  test('imagem HEIC sem decodificação mostra fallback com nome e mantém remover/substituir', async () => {
    await setup();
    const file = new File(['heiccontent'], 'foto.heic', { type: 'image/heic' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    // browser tenta renderizar como imagem primeiro
    const img = screen.getByAltText('Prévia');
    expect(img).toBeInTheDocument();

    // se a decodificação falha (ex.: HEIC no Chrome), exibe fallback visível
    await act(async () => {
      fireEvent.error(img);
    });

    expect(screen.queryByAltText('Prévia')).not.toBeInTheDocument();
    expect(screen.getByText(/foto\.heic/)).toBeInTheDocument();
    expect(screen.getByTitle('Remover')).toBeInTheDocument();
    expect(screen.getByTitle('Substituir')).toBeInTheDocument();
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/send-message', expect.anything());
  });

  test('documento não é renderizado como imagem e não envia', async () => {
    await setup();
    const file = new File(['pdfcontent'], 'doc.pdf', { type: 'application/pdf' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(screen.queryByAltText('Prévia')).not.toBeInTheDocument();
    expect(screen.getByText(/doc\.pdf/)).toBeInTheDocument();
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/upload-file', expect.anything());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/send-message', expect.anything());
  });

  test('vídeo MP4 mostra prévia <video>, botão "Enviar vídeo" e não envia sozinho', async () => {
    await setup();
    const file = new File(['videocontent'], 'clip.mp4', { type: 'video/mp4' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(document.querySelector('video')).toBeTruthy();
    expect(screen.getByText(/Enviar vídeo/)).toBeInTheDocument();
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/upload-file', expect.anything());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/send-message', expect.anything());
  });

  test('vídeo .mov incompatível alerta antes do upload e mantém rascunho', async () => {
    await setup();
    const file = new File(['movcontent'], 'gravacao.mov', { type: 'video/quicktime' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const sendButton = screen.getByText(/Enviar vídeo/);
    await act(async () => {
      fireEvent.click(sendButton);
      await new Promise(r => setTimeout(r, 10));
    });

    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/formato compatível|MP4/i));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/upload-file', expect.anything());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/send-message', expect.anything());
    // rascunho permanece para correção/cancelamento
    expect(screen.getByTitle('Remover')).toBeInTheDocument();
  });

  test('vídeo acima do limite alerta antes do upload', async () => {
    await setup();
    const big = new Uint8Array(17 * 1024 * 1024);
    const file = new File([big], 'grande.mp4', { type: 'video/mp4' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const sendButton = screen.getByText(/Enviar vídeo/);
    await act(async () => {
      fireEvent.click(sendButton);
      await new Promise(r => setTimeout(r, 10));
    });

    expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/16 MB|limite/i));
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/upload-file', expect.anything());
    expect(mockApiCall).not.toHaveBeenCalledWith('/api/send-message', expect.anything());
  });

  test('falha da Meta no envio de vídeo mostra motivo e mantém rascunho', async () => {
    await setup();
    mockApiCall.mockImplementation((url) => {
      if (url === '/api/upload-file') {
        return Promise.resolve({ ok: true, json: async () => ({ filePath: 'chat-files/v.mp4', signedUrl: 'https://example.com/signed' }) });
      }
      if (url === '/api/send-message') {
        return Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'Erro ao enviar mídia', reason: 'provider_error' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const file = new File(['videocontent'], 'clip.mp4', { type: 'video/mp4' });
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Enviar vídeo/));
      await new Promise(r => setTimeout(r, 10));
    });

    await waitFor(() => {
      const sendCalls = mockApiCall.mock.calls.filter(([url]) => url === '/api/send-message');
      expect(sendCalls.length).toBe(1);
    });
    expect(window.alert).toHaveBeenCalled();
    // rascunho preservado após falha — nada é reenviado automaticamente
    expect(document.querySelector('video')).toBeTruthy();
  });

  test('resultado incerto (send_unconfirmed) mostra cautela e mantém rascunho sem retry', async () => {
    await setup();
    mockApiCall.mockImplementation((url) => {
      if (url === '/api/upload-file') {
        return Promise.resolve({ ok: true, json: async () => ({ filePath: 'chat-files/v.mp4', signedUrl: 'https://example.com/signed' }) });
      }
      if (url === '/api/send-message') {
        return Promise.resolve({ ok: false, status: 504, json: async () => ({ error: 'Não foi possível confirmar o envio', reason: 'send_unconfirmed' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const file = new File(['videocontent'], 'clip.mp4', { type: 'video/mp4' });
    const input = document.querySelector('input[type="file"]');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    await act(async () => {
      fireEvent.click(screen.getByText(/Enviar vídeo/));
      await new Promise(r => setTimeout(r, 10));
    });

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith(expect.stringMatching(/Não foi possível confirmar o envio/i));
    });
    // resultado desconhecido não é falha definitiva: rascunho preservado, sem retry automático
    expect(document.querySelector('video')).toBeTruthy();
    const sendCalls = mockApiCall.mock.calls.filter(([url]) => url === '/api/send-message');
    expect(sendCalls.length).toBe(1);
  });

  test('clicar em Enviar faz upload e manda a mensagem uma única vez', async () => {
    await setup();
    mockApiCall
      .mockImplementation((url) => {
        if (url.startsWith('/api/cases/active')) {
          return Promise.resolve({ ok: true, json: async () => ({}) });
        }
        if (url === '/api/upload-file') {
          return Promise.resolve({ ok: true, json: async () => ({ filePath: 'chat-files/test.jpg', signedUrl: 'https://example.com/signed' }) });
        }
        if (url === '/api/send-message') {
          return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });

    const file = new File(['imagecontent'], 'photo.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]');

    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    const sendButton = screen.getByText(/Enviar imagem/);
    await act(async () => {
      fireEvent.click(sendButton);
      await new Promise(r => setTimeout(r, 10));
    });

    await waitFor(() => {
      const sendCalls = mockApiCall.mock.calls.filter(([url]) => url === '/api/send-message');
      expect(sendCalls.length).toBe(1);
      const body = JSON.parse(sendCalls[0][1].body);
      expect(body.media_url).toBe('https://example.com/file.jpg');
      expect(body.filename).toBe('photo.jpg');
    });
  });
});
