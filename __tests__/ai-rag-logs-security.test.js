/**
 * Testes de segurança de logs e respostas de IA/RAG.
 * Garante que nenhum log ou resposta exponha PII, prompt, contexto, token, URL ou documento bruto.
 */

const { createMocks } = require('node-mocks-http');
const askHandler = require('../pages/api/ai/ask').default;

jest.mock('../lib/supabaseServer', () => ({
  supabaseServer: {
    auth: { getUser: jest.fn() },
    from: jest.fn(() => ({
      select: jest.fn(() => ({ eq: jest.fn(() => ({ single: jest.fn() })) })),
      insert: jest.fn(() => Promise.resolve({ error: null }))
    }))
  }
}));

jest.mock('../lib/knowledgeSearch', () => ({
  searchKnowledge: jest.fn()
}));

jest.mock('../lib/aiRag', () => ({
  askRag: jest.fn(() => Promise.resolve('Resposta segura'))
}));

const { supabaseServer } = require('../lib/supabaseServer');
const { searchKnowledge } = require('../lib/knowledgeSearch');

describe('/api/ai/ask - segurança de logs e respostas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockAuth(role = 'advogado') {
    supabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'auth-user-synthetic-001' } },
      error: null
    });
    supabaseServer.from.mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(() => Promise.resolve({ data: { role }, error: null }))
            }))
          }))
        };
      }
      return { insert: jest.fn(() => Promise.resolve({ error: null })) };
    });
  }

  test('resposta não contém conteúdo bruto de chunks ou documentos', async () => {
    mockAuth();
    const sensitiveContent = 'CONTEÚDO-SECRETO-CPF-123.456.789-00';
    searchKnowledge.mockResolvedValue({
      results: [{ content: sensitiveContent, title: 'Doc', doc_type: 'template' }],
      documents: [{ document_id: 'doc-001', title: 'Doc', type: 'template', area: 'trabalho', tribunal: 'TRT', tags: [] }]
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: 'Qual a lei?' }
    });

    await askHandler(req, res);
    const data = JSON.parse(res._getData());

    expect(res._getStatusCode()).toBe(200);
    expect(data.answer).toBe('Resposta segura');
    expect(data.sources).toBeDefined();
    expect(data.sources[0]).not.toHaveProperty('content');
    const json = JSON.stringify(data);
    expect(json).not.toContain('CONTEÚDO-SECRETO');
    expect(json).not.toContain('123.456.789-00');
  });

  test('resposta de erro não expõe stack, prompt, token ou erro bruto de fornecedor', async () => {
    mockAuth();
    searchKnowledge.mockRejectedValue(new Error('Gemini falhou com token SECRET-TOKEN-123'));

    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: 'Qual a lei?' }
    });

    await askHandler(req, res);
    const data = JSON.parse(res._getData());
    const text = res._getData();

    expect(res._getStatusCode()).toBe(500);
    expect(data.error).toBe('Erro ao processar a consulta');
    expect(text).not.toContain('SECRET-TOKEN-123');
    expect(text).not.toContain('stack');
    expect(text).not.toContain('Gemini');
  });

  test('safeLog de busca não registra query, conteúdo, título ou PII', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockAuth();
    const piiQuery = 'Cliente com CPF 123.456.789-00';
    const sensitiveContent = 'CONTEÚDO DO DOCUMENTO COM TELEFONE 11999999999';
    searchKnowledge.mockResolvedValue({
      results: [{ content: sensitiveContent, title: 'Doc Sensível', doc_type: 'template' }],
      documents: [{ document_id: 'doc-001', title: 'Doc Sensível', type: 'template', area: 'trabalho', tribunal: 'TRT', tags: [] }]
    });

    const { req, res } = createMocks({
      method: 'POST',
      headers: { authorization: 'Bearer valid-token' },
      body: { query: piiQuery }
    });

    await askHandler(req, res);

    const allLogs = logSpy.mock.calls.map(c => c.join(' ')).join(' ') + ' ' + errSpy.mock.calls.map(c => c.join(' ')).join(' ');

    expect(allLogs).not.toContain('123.456.789-00');
    expect(allLogs).not.toContain('11999999999');
    expect(allLogs).not.toContain('CONTEÚDO DO DOCUMENTO');
    expect(allLogs).not.toContain('Doc Sensível');
    expect(allLogs).not.toContain('Cliente com CPF');
    expect(allLogs).not.toContain('token');
    expect(allLogs).toContain('rag_search');

    logSpy.mockRestore();
    errSpy.mockRestore();
  });
});
