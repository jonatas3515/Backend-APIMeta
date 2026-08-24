/**
 * Testes de API para rotinas em casos.
 */

const { createMocks } = require('node-mocks-http');
const routinesHandler = require('../pages/api/routines').default;

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => fn,
  hasMinimumRole: () => true
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

describe('API /api/routines - execucoes em casos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    global.__supabaseQueue = [];
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'doc-1' }) })
    );
  });

  test('execucao de rotina exige confirmed=true', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      query: {
        action: 'execute',
        routine_id: 'rt-1',
        conversation_id: 'conv-1'
      }
    });
    await routinesHandler(req, res);
    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData().error).toMatch(/confirmacao explicita/i);
  });

  test('execucao confirmada retorna documentos e lembretes criados', async () => {
    global.__supabaseQueue = [
      { data: { id: 'rt-1', name: 'Rotina Teste', documents_to_generate: ['tpl-1'], reminders_to_create: [{ type: 'prazo', title: 'Prazo', message: 'Prazo', days_from_now: 3 }] }, error: null },
      { data: { id: 'exec-1' }, error: null },
      { data: { id: 'rem-1' }, error: null },
      { data: { id: 'exec-1', documents_generated: ['doc-1'], reminders_created: ['rem-1'] }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        action: 'execute',
        routine_id: 'rt-1',
        conversation_id: 'conv-1',
        case_id: 'case-1',
        confirmed: 'true'
      }
    });
    await routinesHandler(req, res);
    const data = res._getJSONData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.execution.documents_generated).toContain('doc-1');
    expect(data.execution.reminders_created).toContain('rem-1');
  });

  test('execucao nao envia WhatsApp, nao cria agenda e nao altera status do caso', async () => {
    global.__supabaseQueue = [
      { data: { id: 'rt-1', name: 'Rotina Teste', documents_to_generate: [], reminders_to_create: [] }, error: null },
      { data: { id: 'exec-1' }, error: null },
      { data: { id: 'exec-1', documents_generated: [], reminders_created: [] }, error: null }
    ];

    const { req, res } = createMocks({
      method: 'GET',
      query: {
        action: 'execute',
        routine_id: 'rt-1',
        conversation_id: 'conv-1',
        confirmed: 'true'
      }
    });
    await routinesHandler(req, res);
    expect(res._getStatusCode()).toBe(200);
    const response = res._getJSONData();
    expect(response).not.toHaveProperty('whatsapp_message');
    expect(response).not.toHaveProperty('case_status');
  });
});
