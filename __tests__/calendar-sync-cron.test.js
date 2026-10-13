/**
 * Testes do cron /api/cron/calendar-sync (Etapa 2).
 * Cobre: autorização via CRON_SECRET, sincronização por usuário com
 * integração ativa e tolerância a falha individual. Sem dados reais/PII.
 */

process.env.CRON_SECRET = 'test-cron-secret';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.GOOGLE_CLIENT_ID = 'gid';
process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
process.env.GOOGLE_REDIRECT_URI = 'https://app.test/callback';

const { createMocks } = require('node-mocks-http');

const tableData = {
  user_calendar_integrations: [],
  cases: [],
  case_events: [],
  chat_reminders: [],
  calendar_synced_events: []
};

function makeChain(table) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    upsert: () => Promise.resolve({ data: null, error: null }),
    eq: () => chain,
    neq: () => chain,
    not: () => chain,
    gte: () => chain,
    lte: () => chain,
    lt: () => chain,
    or: () => chain,
    is: () => chain,
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: (tableData[table] || [])[0] || null, error: null }),
    then: (resolve) => resolve({ data: tableData[table] || [], error: null })
  };
  return chain;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: (table) => makeChain(table) }))
}));

jest.mock('../lib/googleCalendar', () => ({
  getValidAccessToken: jest.fn(),
  createGoogleEvent: jest.fn(),
  updateGoogleEvent: jest.fn(),
  deleteGoogleEvent: jest.fn()
}));

const { getValidAccessToken, createGoogleEvent } = require('../lib/googleCalendar');
const handler = require('../pages/api/cron/calendar-sync').default;

describe('CRON /api/cron/calendar-sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tableData.user_calendar_integrations = [];
    tableData.cases = [];
    tableData.case_events = [];
    tableData.chat_reminders = [];
    tableData.calendar_synced_events = [];

    getValidAccessToken.mockResolvedValue({ accessToken: 'tok', integration: { id: 'int' } });
    createGoogleEvent.mockResolvedValue({ id: 'g-1', htmlLink: 'https://cal.test/e' });
  });

  function callHandler(method = 'GET', auth = 'Bearer test-cron-secret') {
    const { req, res } = createMocks({
      method,
      headers: auth ? { authorization: auth } : {}
    });
    return handler(req, res).then(() => res);
  }

  test('rejeita sem CRON_SECRET com 401', async () => {
    const res = await callHandler('GET', null);
    expect(res._getStatusCode()).toBe(401);
    expect(createGoogleEvent).not.toHaveBeenCalled();
  });

  test('rejeita secret incorreto com 401', async () => {
    const res = await callHandler('GET', 'Bearer wrong');
    expect(res._getStatusCode()).toBe(401);
  });

  test('sincroniza todos os usuários com integração ativa', async () => {
    tableData.user_calendar_integrations = [
      { user_id: 'u-1' },
      { user_id: 'u-2' }
    ];
    tableData.cases = [
      { id: 'case-1', title: 'Prazo A', deadline_date: '2099-01-10', status: 'em_analise' }
    ];

    const res = await callHandler();
    const json = res._getJSONData();

    expect(res._getStatusCode()).toBe(200);
    expect(json.success).toBe(true);
    expect(json.usersProcessed).toBe(2);
    expect(json.totalSynced).toBe(2); // 1 caso por usuário
    expect(json.totalFailed).toBe(0);
    expect(getValidAccessToken).toHaveBeenCalledTimes(2);
    expect(createGoogleEvent).toHaveBeenCalledTimes(2);
  });

  test('falha de um usuário não aborta os demais', async () => {
    tableData.user_calendar_integrations = [
      { user_id: 'u-bad' },
      { user_id: 'u-good' }
    ];
    tableData.cases = [
      { id: 'case-1', title: 'Prazo A', deadline_date: '2099-01-10', status: 'em_analise' }
    ];

    getValidAccessToken.mockImplementation(async (sb, userId) => {
      if (userId === 'u-bad') throw new Error('Integração desativada');
      return { accessToken: 'tok', integration: { id: 'int' } };
    });

    const res = await callHandler();
    const json = res._getJSONData();

    expect(res._getStatusCode()).toBe(200);
    expect(json.usersProcessed).toBe(2);
    expect(json.usersFailed).toBe(1);
    expect(json.totalSynced).toBe(1);
    expect(createGoogleEvent).toHaveBeenCalledTimes(1);
  });

  test('exceção inesperada de um usuário não derruba a rotina', async () => {
    tableData.user_calendar_integrations = [
      { user_id: 'u-crash' },
      { user_id: 'u-good' }
    ];

    getValidAccessToken.mockImplementation(async (sb, userId) => {
      if (userId === 'u-crash') throw new Error('db timeout');
      return { accessToken: 'tok', integration: { id: 'int' } };
    });

    const res = await callHandler();
    const json = res._getJSONData();

    expect(res._getStatusCode()).toBe(200);
    expect(json.usersFailed).toBe(1);
    expect(json.success).toBe(true);
  });

  test('sem integrações retorna resumo zerado', async () => {
    const res = await callHandler();
    const json = res._getJSONData();

    expect(res._getStatusCode()).toBe(200);
    expect(json.usersProcessed).toBe(0);
    expect(json.totalSynced).toBe(0);
  });

  test('retorna 405 para método não suportado', async () => {
    const res = await callHandler('DELETE');
    expect(res._getStatusCode()).toBe(405);
  });
});
