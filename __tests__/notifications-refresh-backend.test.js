/**
 * Testes de backend para refresh seguro e rate limit de notificações.
 * @jest-environment node
 */

const { createMocks } = require('node-mocks-http');
const notificationCache = require('../lib/notificationCache').default;
const notificationsHandler = require('../pages/api/notifications').default;
const countHandler = require('../pages/api/notifications/count').default;
const { aggregateNotifications } = require('../lib/notificationAggregator');

jest.mock('../lib/auth', () => ({
  withAuth: (handler) => handler
}));

jest.mock('../lib/notificationAggregator', () => ({
  aggregateNotifications: jest.fn()
}));

function mockReq({ user, query = {} } = {}) {
  const { req, res } = createMocks({ method: 'GET', query });
  req.user = user || { id: 'u1', role: 'admin' };
  return { req, res };
}

async function callHandler(handler, { user, query } = {}) {
  const { req, res } = mockReq({ user, query });
  await handler(req, res);
  return res;
}

describe('/api/notifications - refresh e rate limit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    notificationCache.invalidateAll();
    aggregateNotifications.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('refresh=1 invalida cache apenas do usuário/papel autenticado', async () => {
    const user1 = { id: 'u1', role: 'admin' };
    const user2 = { id: 'u2', role: 'advogado' };

    aggregateNotifications
      .mockResolvedValueOnce({ notifications: [{ id: 'n1' }], errors: [], countReliable: true })
      .mockResolvedValueOnce({ notifications: [{ id: 'n2' }], errors: [], countReliable: true })
      .mockResolvedValueOnce({ notifications: [{ id: 'n3' }], errors: [], countReliable: true })
      .mockResolvedValueOnce({ notifications: [{ id: 'n4' }], errors: [], countReliable: true });

    await callHandler(notificationsHandler, { user: user1 });
    jest.advanceTimersByTime(4000);
    const res2 = await callHandler(notificationsHandler, { user: user1, query: { refresh: '1' } });

    expect(aggregateNotifications).toHaveBeenCalledTimes(2);
    expect(res2._getJSONData().notifications).toEqual([{ id: 'n2' }]);

    const res3 = await callHandler(notificationsHandler, { user: user2 });
    jest.advanceTimersByTime(4000);
    const res4 = await callHandler(notificationsHandler, { user: user2, query: { refresh: '1' } });

    expect(aggregateNotifications).toHaveBeenCalledTimes(4);
    expect(res4._getJSONData().notifications).toEqual([{ id: 'n4' }]);
  });

  it('apenas refresh="1" é aceito; valores arbitrários não alteram cache', async () => {
    aggregateNotifications
      .mockResolvedValueOnce({ notifications: [{ id: 'cached' }], errors: [], countReliable: true });

    const res1 = await callHandler(notificationsHandler, { query: { refresh: 'true' } });
    expect(aggregateNotifications).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(4000);
    const res2 = await callHandler(notificationsHandler, { query: { refresh: 'yes' } });
    expect(aggregateNotifications).toHaveBeenCalledTimes(1);
    expect(res1._getJSONData().notifications).toEqual(res2._getJSONData().notifications);
  });

  it('retorna 429 com resposta segura sem expor detalhes', async () => {
    aggregateNotifications.mockResolvedValue({ notifications: [], errors: [], countReliable: true });

    const res1 = await callHandler(notificationsHandler);
    expect(res1._getStatusCode()).toBe(200);

    const res2 = await callHandler(notificationsHandler);
    expect(res2._getStatusCode()).toBe(429);
    const data = res2._getJSONData();
    expect(data.countReliable).toBe(false);
    expect(data.unreadCount).toBe(0);
    expect(data.notifications).toEqual([]);
    expect(data.error).toBe('Too many requests');
    expect(data.errors).toBeUndefined();
    expect(data.stack).toBeUndefined();
  });

  it('não cacheia resultado parcial', async () => {
    aggregateNotifications
      .mockResolvedValueOnce({ notifications: [{ id: 'p1' }], errors: [{ source: 'cases' }], countReliable: false })
      .mockResolvedValueOnce({ notifications: [{ id: 'p2' }], errors: [], countReliable: true });

    const res1 = await callHandler(notificationsHandler);
    expect(res1._getJSONData().countReliable).toBe(false);

    jest.advanceTimersByTime(4000);
    const res2 = await callHandler(notificationsHandler);
    expect(aggregateNotifications).toHaveBeenCalledTimes(2);
    expect(res2._getJSONData().countReliable).toBe(true);
  });

  it('ignora userId/role do cliente e usa req.user', async () => {
    aggregateNotifications.mockResolvedValue({ notifications: [], errors: [], countReliable: true });
    const { req, res } = mockReq({
      user: { id: 'real-user', role: 'estagiario' },
      query: { refresh: '1' }
    });
    req.headers['x-user-id'] = 'attacker';
    req.headers['x-user-role'] = 'admin';

    await notificationsHandler(req, res);
    expect(aggregateNotifications).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'real-user',
      userRole: 'estagiario'
    }));
  });
});

describe('/api/notifications/count - rate limit', () => {
  beforeEach(() => {
    notificationCache.invalidateAll();
    aggregateNotifications.mockReset();
  });

  it('aplica checkRateLimit e retorna 429 seguro', async () => {
    aggregateNotifications.mockResolvedValue({ notifications: [], errors: [], countReliable: true });

    const res1 = await callHandler(countHandler);
    expect(res1._getStatusCode()).toBe(200);

    const res2 = await callHandler(countHandler);
    expect(res2._getStatusCode()).toBe(429);
    const data = res2._getJSONData();
    expect(data.countReliable).toBe(false);
    expect(data.unreadCount).toBe(0);
    expect(data.error).toBe('Too many requests');
  });
});
