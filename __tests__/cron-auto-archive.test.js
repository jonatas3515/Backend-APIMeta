/**
 * Testes do cron /api/cron/auto-archive.
 * Verifica autorização, filtros de segurança (nunca arquivar unread=true)
 * e o payload de arquivamento. Não usa PII nem dados reais.
 */

process.env.CRON_SECRET = 'test-cron-secret';
process.env.SUPABASE_URL = 'https://synthetic.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';

const { createMocks } = require('node-mocks-http');

const updateCalls = [];
const filterCalls = [];
let selectResult = { data: [{ id: 'c1' }, { id: 'c2' }], error: null };

const chain = {
  update: jest.fn((payload) => { updateCalls.push(payload); return chain; }),
  eq: jest.fn((...args) => { filterCalls.push(['eq', ...args]); return chain; }),
  lt: jest.fn((...args) => { filterCalls.push(['lt', ...args]); return chain; }),
  or: jest.fn((expr) => { filterCalls.push(['or', expr]); return chain; }),
  select: jest.fn(() => Promise.resolve(selectResult))
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ from: jest.fn(() => chain) }))
}));

const handler = require('../pages/api/cron/auto-archive').default;

describe('GET/POST /api/cron/auto-archive', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    updateCalls.length = 0;
    filterCalls.length = 0;
    selectResult = { data: [{ id: 'c1' }, { id: 'c2' }], error: null };
  });

  test('arquiva conversas inativas e retorna contagem', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: { authorization: 'Bearer test-cron-secret' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const json = res._getJSONData();
    expect(json.success).toBe(true);
    expect(json.archived).toBe(2);

    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].archived).toBe(true);
    expect(updateCalls[0].archived_at).toBeTruthy();
  });

  test('aplica filtros de segurança: só arquivadas=false, unread=false/null e >7 dias', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: { authorization: 'Bearer test-cron-secret' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(filterCalls).toContainEqual(['or', 'archived.is.null,archived.eq.false']);
    expect(filterCalls).toContainEqual(['or', 'unread.is.null,unread.eq.false']);

    const ltCall = filterCalls.find(([op, field]) => op === 'lt' && field === 'updated_at');
    expect(ltCall).toBeTruthy();
    const cutoff = new Date(ltCall[2]);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - sevenDaysAgo)).toBeLessThan(60 * 1000);
  });

  test('rejeita sem CRON_SECRET com 401', async () => {
    const { req, res } = createMocks({ method: 'GET' });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(401);
    expect(updateCalls).toHaveLength(0);
  });

  test('rejeita método não suportado com 405', async () => {
    const { req, res } = createMocks({
      method: 'PUT',
      headers: { authorization: 'Bearer test-cron-secret' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(updateCalls).toHaveLength(0);
  });

  test('retorna 500 quando a query falha', async () => {
    selectResult = { data: null, error: { message: 'db error' } };

    const { req, res } = createMocks({
      method: 'GET',
      headers: { authorization: 'Bearer test-cron-secret' }
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(500);
  });
});
