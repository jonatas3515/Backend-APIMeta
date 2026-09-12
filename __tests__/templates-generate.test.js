/**
 * Testes de API para geracao de documentos a partir de templates.
 */

const { createMocks } = require('node-mocks-http');
const templatesHandler = require('../pages/api/templates').default;

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'advogado', id: 'user-1' };
    return fn(req, res);
  }
}));

function supabaseBuilder() {
  const self = {
    from: jest.fn(() => self),
    select: jest.fn(() => self),
    eq: jest.fn(() => self),
    single: jest.fn(() => self),
    insert: jest.fn(() => self),
    update: jest.fn(() => self),
    delete: jest.fn(() => self),
    then: (onFulfilled) => {
      const next = global.__supabaseQueue ? global.__supabaseQueue.shift() : { data: null, error: null };
      return onFulfilled ? onFulfilled(next) : Promise.resolve(next);
    }
  };
  return self;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseBuilder())
}));

describe('API /api/templates - geracao de documentos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('estagiario nao pode gerar documento via action=generate', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        action: 'generate',
        template_id: 'tpl-1',
        conversation_id: 'conv-1',
        case_id: 'case-1'
      },
      __testUser: { role: 'estagiario', id: 'user-2' }
    });
    await templatesHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toMatch(/advogados e administradores/i);
  });

  test('advogado pode gerar documento via action=generate', async () => {
    global.__supabaseQueue = [
      { data: { id: 'tpl-1', name: 'Template Teste', template_text: 'Texto {{client_name}}' }, error: null },
      { data: { id: 'conv-1', client_name: 'Cliente', client_phone: '5511999999999' }, error: null },
      { data: { id: 'doc-1', status: 'draft' }, error: null }
    ];
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        action: 'generate',
        template_id: 'tpl-1',
        conversation_id: 'conv-1',
        case_id: 'case-1'
      },
      __testUser: { role: 'advogado', id: 'user-1' }
    });
    await templatesHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().id).toBe('doc-1');
  });
});
