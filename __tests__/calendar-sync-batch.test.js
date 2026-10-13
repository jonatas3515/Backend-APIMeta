/**
 * Testes do endpoint /api/calendar-integrations/sync-batch (Etapa 1).
 * Cobre: validação de provider, integração inexistente, criação/update de
 * eventos Google e registro em calendar_synced_events. Sem dados reais/PII.
 */

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.GOOGLE_CLIENT_ID = 'gid';
process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
process.env.GOOGLE_REDIRECT_URI = 'https://app.test/callback';

const { createMocks } = require('node-mocks-http');

const tableData = {
  cases: [],
  case_events: [],
  chat_reminders: [],
  calendar_synced_events: [],
  user_calendar_integrations: []
};

const upsertCalls = [];
const deleteCalls = [];
const updateCalls = [];

function makeChain(table) {
  const chain = {
    select: () => chain,
    insert: () => chain,
    update: (payload) => { updateCalls.push({ table, payload }); return chain; },
    delete: () => { deleteCalls.push(table); return chain; },
    upsert: (payload) => { upsertCalls.push(payload); return Promise.resolve({ data: null, error: null }); },
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
    single: () => Promise.resolve({ data: Array.isArray(tableData[table]) ? tableData[table][0] || null : null, error: null }),
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

jest.mock('../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { id: 'user-1', role: 'advogado' };
    return fn(req, res);
  }
}));

const { getValidAccessToken, createGoogleEvent, updateGoogleEvent } = require('../lib/googleCalendar');
const handler = require('../pages/api/calendar-integrations/sync-batch').default;

describe('POST /api/calendar-integrations/sync-batch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    upsertCalls.length = 0;
    deleteCalls.length = 0;
    updateCalls.length = 0;
    tableData.cases = [];
    tableData.case_events = [];
    tableData.chat_reminders = [];
    tableData.calendar_synced_events = [];

    getValidAccessToken.mockResolvedValue({ accessToken: 'tok', integration: { id: 'int-1' } });
    createGoogleEvent.mockImplementation(async () => ({ id: `g-${Math.random().toString(36).slice(2)}`, htmlLink: 'https://cal.test/e' }));
    updateGoogleEvent.mockResolvedValue({ id: 'g-existing', htmlLink: 'https://cal.test/e' });
  });

  function callHandler(body = { provider: 'google', days: 30 }) {
    const { req, res } = createMocks({ method: 'POST', body });
    return handler(req, res).then(() => res);
  }

  test('cria eventos Google para itens não sincronizados', async () => {
    tableData.cases = [
      { id: 'case-1', title: 'Ação Trabalhista', deadline_date: '2099-01-10', status: 'em_analise' },
      { id: 'case-2', title: 'Recurso Previdenciário', deadline_date: '2099-01-15', status: 'acao_protocolada' }
    ];
    tableData.case_events = [
      { id: 'ev-1', event_date: '2099-01-12', event_time: '10:00:00', event_type: 'audiencia', description: 'Audiência' }
    ];
    tableData.chat_reminders = [
      { id: 'rem-1', title: 'Ligar para cliente', scheduled_for: '2099-01-14T13:00:00Z', status: 'pending' }
    ];

    const res = await callHandler();

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.success).toBe(true);
    expect(json.syncedCount).toBe(4);
    expect(json.failedCount).toBe(0);
    expect(createGoogleEvent).toHaveBeenCalledTimes(4);
    expect(updateGoogleEvent).not.toHaveBeenCalled();
    expect(upsertCalls).toHaveLength(4);
    expect(upsertCalls.every(u => u.provider === 'google' && u.user_id === 'user-1' && u.external_event_id)).toBe(true);
  });

  test('atualiza eventos já sincronizados em vez de duplicar', async () => {
    tableData.cases = [{ id: 'case-1', title: 'Prazo', deadline_date: '2099-01-10', status: 'em_analise' }];
    tableData.calendar_synced_events = [
      { internal_event_id: 'case-1', internal_table: 'cases', external_event_id: 'g-existing' }
    ];

    const res = await callHandler();

    expect(res._getStatusCode()).toBe(200);
    expect(updateGoogleEvent).toHaveBeenCalledTimes(1);
    expect(updateGoogleEvent.mock.calls[0][0].eventId).toBe('g-existing');
    expect(createGoogleEvent).not.toHaveBeenCalled();
    expect(res._getJSONData().syncedCount).toBe(1);
  });

  test('recria evento quando o Google retorna 404 (vinculo órfão)', async () => {
    tableData.cases = [{ id: 'case-1', title: 'Prazo', deadline_date: '2099-01-10', status: 'em_analise' }];
    tableData.calendar_synced_events = [
      { internal_event_id: 'case-1', internal_table: 'cases', external_event_id: 'g-deleted' }
    ];
    const notFound = new Error('not found');
    notFound.code = 'GOOGLE_EVENT_NOT_FOUND';
    updateGoogleEvent.mockRejectedValueOnce(notFound);

    const res = await callHandler();

    expect(res._getStatusCode()).toBe(200);
    expect(createGoogleEvent).toHaveBeenCalledTimes(1);
    expect(res._getJSONData().syncedCount).toBe(1);
  });

  test('coleta erros por item sem abortar o lote', async () => {
    tableData.cases = [
      { id: 'case-ok', title: 'A', deadline_date: '2099-01-10', status: 'em_analise' },
      { id: 'case-bad', title: 'B', deadline_date: '2099-01-11', status: 'em_analise' }
    ];
    createGoogleEvent
      .mockResolvedValueOnce({ id: 'g-ok' })
      .mockRejectedValueOnce(new Error('quota exceeded'));

    const res = await callHandler();
    const json = res._getJSONData();

    expect(res._getStatusCode()).toBe(200);
    expect(json.success).toBe(false);
    expect(json.syncedCount).toBe(1);
    expect(json.failedCount).toBe(1);
    expect(json.errors[0].internal_event_id).toBe('case-bad');
  });

  test('aborta com 401 quando o Google exige reconexão', async () => {
    tableData.cases = [{ id: 'case-1', title: 'Prazo', deadline_date: '2099-01-10', status: 'em_analise' }];
    const authErr = new Error('Sua conexão com o Google Calendar expirou.');
    authErr.code = 'GOOGLE_AUTH_REQUIRED';
    authErr.reconnect = true;
    createGoogleEvent.mockRejectedValueOnce(authErr);

    const res = await callHandler();

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().reconnect).toBe(true);
  });

  test('retorna 400 quando não há integração ativa', async () => {
    getValidAccessToken.mockRejectedValueOnce(new Error('Integração não encontrada'));

    const res = await callHandler();

    expect(res._getStatusCode()).toBe(400);
    expect(createGoogleEvent).not.toHaveBeenCalled();
  });

  test('rejeita provider inválido e outlook com 501', async () => {
    const resBad = await callHandler({ provider: 'yahoo' });
    expect(resBad._getStatusCode()).toBe(400);

    const resOutlook = await callHandler({ provider: 'outlook' });
    expect(resOutlook._getStatusCode()).toBe(501);
  });

  test('retorna 405 para métodos não-POST', async () => {
    const { req, res } = createMocks({ method: 'GET' });
    await handler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
