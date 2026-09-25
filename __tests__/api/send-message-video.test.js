/**
 * Testes do handler real /api/send-message para envio de vídeo.
 * Sem rede, sem Supabase real, sem Meta real — apenas mocks.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'MOCK-service-role';
process.env.WHATSAPP_TOKEN = 'synthetic-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'synthetic-phone-id';

const mockUploadMedia = jest.fn().mockResolvedValue('media-id-1');
const mockSendMedia = jest.fn().mockResolvedValue('wamid-1');
const mockAxiosGet = jest.fn();
const mockConvertAudio = jest.fn().mockResolvedValue(null);
const mockInsert = jest.fn().mockResolvedValue({ data: {}, error: null });

jest.mock('@/lib/auth', () => ({
  withAuth: (handler) => async (req, res) => {
    req.user = { id: 'u1', role: 'admin' };
    return handler(req, res);
  }
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { client_phone: '5511000000000', assigned_user_id: 'u1' },
        error: null
      }),
      insert: (...args) => mockInsert(...args)
    }))
  }))
}));

jest.mock('axios', () => ({
  get: (...args) => mockAxiosGet(...args)
}));

jest.mock('@/lib/whatsapp', () => ({
  uploadMediaToWhatsApp: (...args) => mockUploadMedia(...args),
  sendWhatsAppMediaMessage: (...args) => mockSendMedia(...args),
  sendWhatsAppMessage: jest.fn().mockResolvedValue('wamid-text')
}));

jest.mock('@/lib/audio', () => ({
  convertAudioToOgg: (...args) => mockConvertAudio(...args)
}));

const { createMocks } = require('node-mocks-http');
const handler = require('../../pages/api/send-message').default;

const videoBody = (overrides = {}) => ({
  conversation_id: 'conv-1',
  text: '',
  media_url: 'https://example.com/chat-files/v.mp4',
  media_type: 'video/mp4',
  filename: 'v.mp4',
  ...overrides
});

const call = async (body) => {
  const { req, res } = createMocks({ method: 'POST', body });
  await handler(req, res);
  return { status: res._getStatusCode(), data: JSON.parse(res._getData()) };
};

describe('/api/send-message — vídeo', () => {
  beforeEach(() => {
    mockUploadMedia.mockClear();
    mockSendMedia.mockClear();
    mockAxiosGet.mockReset();
    mockAxiosGet.mockResolvedValue({ data: Buffer.from('fake-video').buffer });
    mockInsert.mockReset();
    mockInsert.mockResolvedValue({ data: {}, error: null });
  });

  test('MP4 válido sobe como video/mp4 e envia tipo video', async () => {
    const r = await call(videoBody());
    expect(r.status).toBe(200);
    expect(mockUploadMedia).toHaveBeenCalledWith(expect.any(Buffer), 'video/mp4');
    expect(mockSendMedia).toHaveBeenCalledWith(
      expect.any(String), 'media-id-1', 'video', expect.anything(), undefined
    );
  });

  test('MIME vazio usa extensão .mp4 com segurança', async () => {
    const r = await call(videoBody({ media_type: '' }));
    expect(r.status).toBe(200);
    expect(mockUploadMedia).toHaveBeenCalledWith(expect.any(Buffer), 'video/mp4');
  });

  test('.mov / video-quicktime é rejeitado com reason claro, sem chamar a Meta', async () => {
    const r = await call(videoBody({
      media_url: 'https://example.com/chat-files/v.mov',
      media_type: 'video/quicktime',
      filename: 'v.mov'
    }));
    expect(r.status).toBe(400);
    expect(r.data.reason).toBe('unsupported_video_format');
    expect(mockUploadMedia).not.toHaveBeenCalled();
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  test('MIME vazio + extensão .mov também é rejeitado', async () => {
    const r = await call(videoBody({
      media_url: 'https://example.com/chat-files/v.mov',
      media_type: '',
      filename: 'v.mov'
    }));
    expect(r.status).toBe(400);
    expect(r.data.reason).toBe('unsupported_video_format');
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  test('vídeo acima de 16MB retorna media_too_large sem chamar a Meta', async () => {
    mockAxiosGet.mockResolvedValue({ data: new Uint8Array(17 * 1024 * 1024).buffer });
    const r = await call(videoBody());
    expect(r.status).toBe(400);
    expect(r.data.reason).toBe('media_too_large');
    expect(mockUploadMedia).not.toHaveBeenCalled();
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  test('upload rejeitado pela Meta retorna upload_rejected e sem PII', async () => {
    mockUploadMedia.mockRejectedValueOnce(new Error('Erro ao fazer upload de mídia: 400 Bad Request'));
    const r = await call(videoBody());
    expect(r.status).toBe(500);
    expect(r.data.reason).toBe('upload_rejected');
    expect(mockSendMedia).not.toHaveBeenCalled();
    expect(JSON.stringify(r.data)).not.toContain('5511000000000');
    expect(JSON.stringify(r.data)).not.toContain('Bad Request');
  });

  test('falha de rede no upload à Meta retorna upload_failed', async () => {
    mockUploadMedia.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await call(videoBody());
    expect(r.status).toBe(500);
    expect(r.data.reason).toBe('upload_failed');
    expect(mockSendMedia).not.toHaveBeenCalled();
  });

  test('envio rejeitado com resposta da Meta retorna send_rejected', async () => {
    mockSendMedia.mockRejectedValueOnce(new Error('Erro ao enviar mídia WhatsApp: 400 Bad Request'));
    const r = await call(videoBody());
    expect(r.status).toBe(500);
    expect(r.data.reason).toBe('send_rejected');
  });

  test('timeout/perda de resposta após envio retorna 504 send_unconfirmed', async () => {
    mockSendMedia.mockRejectedValueOnce(new TypeError('fetch failed'));
    const r = await call(videoBody());
    expect(r.status).toBe(504);
    expect(r.data.reason).toBe('send_unconfirmed');
    expect(r.data.error).toContain('Não foi possível confirmar o envio');
    // não grava mensagem nem afirma falha definitiva
    expect(mockInsert).not.toHaveBeenCalled();
  });

  test('persistência falha após envio confirmado: success + warning persist_failed', async () => {
    mockInsert.mockResolvedValueOnce({ data: null, error: { message: 'db down' } });
    const r = await call(videoBody());
    expect(r.status).toBe(200);
    expect(r.data.success).toBe(true);
    expect(r.data.persisted).toBe(false);
    expect(r.data.warning).toBe('persist_failed');
  });

  test('3GP é aceito como video/3gpp', async () => {
    const r = await call(videoBody({
      media_url: 'https://example.com/chat-files/v.3gp',
      media_type: '',
      filename: 'v.3gp'
    }));
    expect(r.status).toBe(200);
    expect(mockUploadMedia).toHaveBeenCalledWith(expect.any(Buffer), 'video/3gpp');
  });
});
