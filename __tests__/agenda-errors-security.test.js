/**
 * Testes de segurança: /api/agenda nunca expõe detalhes internos de erro.
 */

const { createMocks } = require('node-mocks-http');

jest.mock('@/lib/auth', () => ({
  withAuth: (handler) => (req, res) => handler(req, res)
}));

jest.mock('@/lib/ai', () => ({
  askGemini: jest.fn(() => Promise.resolve('Resumo seguro'))
}));

jest.mock('@supabase/supabase-js', () => {
  const __chain = {
    select: jest.fn(() => __chain.gte),
    gte: jest.fn(() => __chain.lte),
    lte: jest.fn().mockResolvedValue({ data: [], error: null })
  };
  const mockSupabase = {
    rpc: jest.fn(),
    from: jest.fn(() => ({ select: __chain.select })),
    __chain
  };
  return {
    createClient: jest.fn(() => mockSupabase),
    __mockSupabase: mockSupabase
  };
});

const { __mockSupabase: supabase } = require('@supabase/supabase-js');
const agendaHandler = require('../pages/api/agenda').default;

describe('/api/agenda - sanitização de erros', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'your_key_here';
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  test('falha no fallback retorna mensagem segura e sem detalhes de Supabase', async () => {
    supabase.rpc.mockRejectedValue(new Error('rpc error'));
    supabase.__chain.lte.mockRejectedValue(new Error('relation agenda_consolidada does not exist'));

    const { req, res } = createMocks({
      method: 'GET',
      query: { range: 'today' },
      headers: { 'x-request-id': 'req-synthetic-002' }
    });

    await agendaHandler(req, res);
    const data = JSON.parse(res._getData());
    const text = res._getData();

    expect(res._getStatusCode()).toBe(500);
    expect(data.error).toBe('Não foi possível carregar a agenda. Tente novamente.');
    expect(text).not.toContain('agenda_consolidada');
    expect(text).not.toContain('relation');
    expect(text).not.toContain('does not exist');
    expect(text).not.toContain('rpc error');
  });

  test('erro ao gerar resumo retorna mensagem genérica', async () => {
    const { askGemini } = require('@/lib/ai');
    askGemini.mockRejectedValue(new Error('Gemini falhou'));

    supabase.rpc.mockResolvedValue({
      data: [{ event_date: '2026-08-29', title: 'Teste', item_type: 'evento', priority: 'alta', legal_area: 'trabalho', municipality: 'São Paulo' }],
      error: null
    });

    const { req, res } = createMocks({
      method: 'POST',
      body: { action: 'summary', range: 'today' },
      headers: { 'x-request-id': 'req-synthetic-003' }
    });

    await agendaHandler(req, res);
    const data = JSON.parse(res._getData());

    expect(res._getStatusCode()).toBe(500);
    expect(data.error).toBe('Não foi possível gerar o resumo. Tente novamente.');
  });

  test('logs não contêm payload, SQL, IDs, PII ou stack', async () => {
    supabase.rpc.mockRejectedValue(new Error('secret-signature-TOKEN-123'));
    supabase.__chain.lte.mockRejectedValue(new Error('stack trace at /pages/api/agenda.js:99'));

    const { req, res } = createMocks({
      method: 'GET',
      query: { range: 'today' },
      headers: { 'x-request-id': 'req-synthetic-004' }
    });

    await agendaHandler(req, res);

    const allLogs = consoleLogSpy.mock.calls.map(c => c.join(' ')).join(' ');
    const allErrors = consoleErrorSpy.mock.calls.map(c => c.join(' ')).join(' ');
    const combined = allLogs + ' ' + allErrors;

    expect(combined).not.toContain('secret-signature-TOKEN-123');
    expect(combined).not.toContain('stack trace at');
    expect(combined).not.toContain('/pages/api/agenda.js');
    expect(combined).not.toContain('agenda_consolidada');
  });
});
