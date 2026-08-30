/**
 * Testes de contrato do endpoint /api/calendar-integrations/sync-status.
 */

import { createMocks } from 'node-mocks-http';

var supabaseClient;

jest.mock('@/lib/auth', () => ({
  withAuth: (handler) => async (req, res) => {
    req.user = { id: 'u1', role: 'advogado' };
    return handler(req, res);
  }
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => supabaseClient)
}));

describe('Calendar sync-status - contrato', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    supabaseClient = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn()
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  const getHandler = () => {
    let handler;
    jest.isolateModules(() => {
      handler = require('../pages/api/calendar-integrations/sync-status').default;
    });
    return handler;
  };

  test('retorna synced, synced_at, last_sync_status sem external_event_id', async () => {
    const handler = getHandler();
    const { req, res } = createMocks({
      method: 'GET',
      query: { event_id: 'case-001' }
    });

    supabaseClient.single.mockResolvedValue({
      data: {
        provider: 'google',
        synced_at: '2026-09-10T10:00:00.000Z',
        last_sync_status: 'success'
      },
      error: null
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const body = res._getJSONData();
    expect(body).toEqual({
      synced: true,
      provider: 'google',
      synced_at: '2026-09-10T10:00:00.000Z',
      last_sync_status: 'success'
    });
    expect(body).not.toHaveProperty('external_event_id');
    expect(body).not.toHaveProperty('updated_at');
  });

  test('registro ausente retorna synced: false', async () => {
    const handler = getHandler();
    const { req, res } = createMocks({
      method: 'GET',
      query: { event_id: 'case-002' }
    });

    supabaseClient.single.mockResolvedValue({
      data: null,
      error: { code: 'PGRST116' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({
      synced: false,
      provider: null,
      synced_at: null,
      last_sync_status: null
    });
  });

  test('event_id ausente retorna 400', async () => {
    const handler = getHandler();
    const { req, res } = createMocks({
      method: 'GET',
      query: {}
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({ error: 'event_id obrigatório' });
  });

  test('erro do banco retorna mensagem genérica sem stack', async () => {
    const handler = getHandler();
    const { req, res } = createMocks({
      method: 'GET',
      query: { event_id: 'case-003' }
    });

    supabaseClient.single.mockResolvedValue({
      data: null,
      error: new Error('connection refused')
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
    const body = res._getJSONData();
    expect(body.error).toBe('Erro ao consultar status. Tente novamente.');
    expect(body).not.toHaveProperty('stack');
    expect(body).not.toHaveProperty('message');
  });
});
