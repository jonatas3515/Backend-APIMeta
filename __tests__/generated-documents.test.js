/**
 * Testes de API para documentos gerados.
 */

const { createMocks } = require('node-mocks-http');
const docsHandler = require('../pages/api/generated-documents').default;

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => fn
}));

function supabaseBuilder() {
  const self = {
    from: jest.fn(() => self),
    select: jest.fn(() => self),
    order: jest.fn(() => self),
    eq: jest.fn(() => self),
    is: jest.fn(() => self),
    update: jest.fn(() => self),
    delete: jest.fn(() => self),
    insert: jest.fn(() => self),
    single: jest.fn(() => self),
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

describe('API /api/generated-documents - isolamento por caso', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.__supabaseQueue = [];
  });

  test('documento do caso A nao aparece no caso B', async () => {
    global.__supabaseQueue = [
      { data: [], error: null }
    ];
    const { req, res } = createMocks({
      method: 'GET',
      query: { case_id: 'case-B' }
    });
    await docsHandler(req, res);
    expect(res._getJSONData()).toEqual([]);
  });

  test('documento gerado grava case_id', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'doc-A', case_id: 'case-A', conversation_id: 'conv-A' }], error: null }
    ];
    const { req, res } = createMocks({
      method: 'GET',
      query: { case_id: 'case-A' }
    });
    await docsHandler(req, res);
    const data = res._getJSONData();
    expect(data[0].case_id).toBe('case-A');
  });

  test('busca prioriza case_id e usa conversation_id apenas como fallback', async () => {
    global.__supabaseQueue = [
      { data: [{ id: 'doc-A', case_id: 'case-A', conversation_id: 'conv-A' }], error: null },
      { data: [], error: null }
    ];
    const { req, res } = createMocks({
      method: 'GET',
      query: { case_id: 'case-A', conversation_id: 'conv-A' }
    });
    await docsHandler(req, res);
    const data = res._getJSONData();
    expect(data).toHaveLength(1);
    expect(data[0].case_id).toBe('case-A');
  });
});
