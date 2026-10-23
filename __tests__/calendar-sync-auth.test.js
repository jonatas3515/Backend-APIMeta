/**
 * Testes - /api/calendar-integrations/sync-event
 * Garante que falhas de token/integracao Google retornam 401 com reconnect: true
 */

const { createMocks } = require('node-mocks-http');

jest.mock('@/lib/auth', () => ({
  withAuth: (handler) => async (req, res) => {
    req.user = { id: 'u1', role: 'advogado' };
    return handler(req, res);
  }
}));

jest.mock('../lib/encryption', () => ({
  encrypt: jest.fn(() => 'encrypted-value'),
  decrypt: jest.fn(() => 'plain-token')
}));

function supabaseBuilder() {
  const chain = {
    from: jest.fn(() => chain),
    select: jest.fn(() => chain),
    order: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    is: jest.fn(() => chain),
    in: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    upsert: jest.fn(() => chain),
    update: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    delete: jest.fn(() => chain),
    maybeSingle: jest.fn(() => chain),
    single: jest.fn(() => chain),
    then: (onFulfilled) => {
      const next = global.__supabaseQueue ? global.__supabaseQueue.shift() : { data: null, error: null };
      return onFulfilled ? onFulfilled(next) : Promise.resolve(next);
    }
  };
  return chain;
}

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseBuilder())
}));

const INTERNAL_EVENT = {
  id: 'case-1',
  title: 'Caso Trabalhista',
  deadline_date: '2026-11-10'
};

function makeReqRes() {
  return createMocks({
    method: 'POST',
    body: {
      event_id: 'case-1',
      internal_table: 'cases',
      provider: 'google',
      action: 'sync'
    }
  });
}

describe('POST /api/calendar-integrations/sync-event - erros de autenticacao Google', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    global.__supabaseQueue = [];
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.GOOGLE_CLIENT_ID = 'gid';
    process.env.GOOGLE_CLIENT_SECRET = 'gsecret';
    process.env.GOOGLE_REDIRECT_URI = 'https://app.test/callback';
    global.fetch = jest.fn();
  });

  const getHandler = () => {
    let handler;
    jest.isolateModules(() => {
      handler = require('../pages/api/calendar-integrations/sync-event').default;
    });
    return handler;
  };

  test('integracao nao encontrada retorna 401 com reconnect', async () => {
    const handler = getHandler();
    global.__supabaseQueue = [
      { data: INTERNAL_EVENT, error: null },          // evento interno
      { data: null, error: null },                    // calendar_synced_events
      { data: null, error: { message: 'not found' } } // user_calendar_integrations
    ];

    const { req, res } = makeReqRes();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData()).toEqual({
      error: 'Conexão com o Google Calendar expirou ou não encontrada. Conecte novamente.',
      reconnect: true
    });
  });

  test('integracao desativada retorna 401 com reconnect', async () => {
    const handler = getHandler();
    global.__supabaseQueue = [
      { data: INTERNAL_EVENT, error: null },
      { data: null, error: null },
      { data: { id: 'int-1', is_active: false }, error: null }
    ];

    const { req, res } = makeReqRes();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(res._getJSONData().reconnect).toBe(true);
  });

  test('refresh token invalid_grant do Google retorna 401 com reconnect', async () => {
    const handler = getHandler();
    global.__supabaseQueue = [
      { data: INTERNAL_EVENT, error: null },
      { data: null, error: null },
      {
        data: {
          id: 'int-1',
          is_active: true,
          expires_at: '2020-01-01T00:00:00Z',
          refresh_token_encrypted: 'enc-refresh'
        },
        error: null
      }
    ];

    global.fetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' })
    });

    const { req, res } = makeReqRes();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    const body = res._getJSONData();
    expect(body.reconnect).toBe(true);
    expect(body.error).toBe('Conexão com o Google Calendar expirou ou não encontrada. Conecte novamente.');
  });

  test('erro generico da API do Google continua retornando 500', async () => {
    const handler = getHandler();
    global.__supabaseQueue = [
      { data: INTERNAL_EVENT, error: null },
      { data: null, error: null },
      {
        data: {
          id: 'int-1',
          is_active: true,
          expires_at: '2999-01-01T00:00:00Z',
          access_token_encrypted: 'enc-access'
        },
        error: null
      }
    ];

    global.fetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'backend exploded' } })
    });

    const { req, res } = makeReqRes();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    expect(res._getJSONData().reconnect).toBeUndefined();
  });

  test('token valido cria evento e retorna 200', async () => {
    const handler = getHandler();
    global.__supabaseQueue = [
      { data: INTERNAL_EVENT, error: null },
      { data: null, error: null },
      {
        data: {
          id: 'int-1',
          is_active: true,
          expires_at: '2999-01-01T00:00:00Z',
          access_token_encrypted: 'enc-access'
        },
        error: null
      },
      { data: { id: 'sync-1' }, error: null } // upsert calendar_synced_events
    ];

    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'gcal-evt-1', htmlLink: 'https://calendar.google.com/event/1' })
    });

    const { req, res } = makeReqRes();
    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body.success).toBe(true);
    expect(body.external_event_id).toBe('gcal-evt-1');
  });
});
