/**
 * RAG /api/ai/ask authorization and response tests
 * Deterministic, offline, no real external calls.
 */

const { createMocks } = require('node-mocks-http');
const askHandler = require('../../pages/api/ai/ask').default;
const { supabaseServer } = require('../../lib/supabaseServer');
const { createMockSupabaseClient } = require('../mocks/supabase');

jest.mock('../../lib/supabaseServer', () => ({
  supabaseServer: require('../mocks/supabase').createMockSupabaseClient()
}));

const geminiResponse = () => Promise.resolve({
  ok: true,
  json: () => Promise.resolve({
    candidates: [{
      content: {
        parts: [{ text: 'A base de conhecimento não contém informações suficientes para essa solicitação.' }]
      }
    }]
  })
});

const findLogEvent = (logSpy, eventName) => {
  for (const call of logSpy.mock.calls) {
    try {
      const entry = JSON.parse(call[0]);
      if (entry.event === eventName) return entry;
    } catch { /* ignore non-json logs */ }
  }
  return null;
};

describe('/api/ai/ask authorization and safety', () => {
  let logSpy;
  let errorSpy;
  let currentRole;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn().mockImplementation(geminiResponse);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    currentRole = 'advogado';

    supabaseServer.rpc.mockImplementation((name) => {
      if (name === 'search_knowledge') {
        return Promise.resolve({
          data: [
            {
              document_id: 'doc-approved-synthetic-001',
              title: 'Documento Aprovado Sintético',
              doc_type: 'tese',
              area: 'direito_do_trabalho',
              tribunal: null,
              chunk_index: 0,
              content: 'Conteúdo aprovado que pode aparecer na busca RAG'
            }
          ],
          error: null
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    supabaseServer.from.mockImplementation((table) => {
      const base = createMockSupabaseClient().from(table);
      if (table === 'users') {
        base.single.mockResolvedValue({ data: { role: currentRole }, error: null });
      }
      return base;
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('rejeita requisições GET', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });

  test('rejeita requisições sem autenticação', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: {},
      body: { query: 'Qual o prazo?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  test('rejeita cabeçalhos x-user-id ou x-user-role forjados', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { 'x-user-id': 'forged-id', authorization: 'Bearer advogado' },
      body: { query: 'Qual o prazo?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  test('rejeita perfil sem permissão de usar o assistente', async () => {
    currentRole = 'cliente';

    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer advogado' },
      body: { query: 'Qual o prazo?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
  });

  test('estagiário pode consultar o assistente', async () => {
    currentRole = 'estagiario';

    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer estagiario' },
      body: { query: 'Qual o prazo?' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
  });

  test('rejeita pergunta muito curta', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer advogado' },
      body: { query: 'Oi' }
    });
    await askHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
  });

  test('responde com answer e sources sem expor conteúdo integral', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer advogado' },
      body: { query: 'Qual o prazo?' }
    });
    await askHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = JSON.parse(res._getData());
    expect(data).toHaveProperty('answer');
    expect(data).toHaveProperty('sources');
    expect(data.sources).toEqual([expect.objectContaining({
      title: 'Documento Aprovado Sintético',
      type: 'tese'
    })]);
    expect(data.answer).not.toContain('Conteúdo aprovado que pode aparecer na busca RAG');
  });

  test('registra métricas RAG não sensíveis', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer advogado' },
      body: { query: 'Qual o prazo?' }
    });
    await askHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const metrics = findLogEvent(logSpy, 'RAG_METRICS');
    expect(metrics).toBeTruthy();
    expect(metrics.retrievalCount).toBe(1);
    expect(metrics.approvedResultCount).toBe(1);
    expect(metrics.emptyRetrieval).toBe(false);
    expect(metrics.abstentionUsed).toBe(true);
    expect(metrics.latencyMs).toBeGreaterThanOrEqual(0);
    expect(metrics.latencyMs).toBeLessThan(1000);
    expect(metrics.queryLength).toBeLessThanOrEqual(1000);
  });
});
