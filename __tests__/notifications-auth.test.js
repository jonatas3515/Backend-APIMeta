/**
 * Testes de autenticação das APIs de notificações
 * Garante que userId/role vêm do backend, não de headers forjados
 */

const { createMocks } = require('node-mocks-http');

// Mock auth para não chamar Supabase
jest.mock('../lib/auth', () => ({
  withAuth: (handler) => async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token não fornecido' });

    let user;
    if (token === 'admin-token') user = { id: 'user-admin-synthetic', role: 'admin' };
    else if (token === 'advogado-token') user = { id: 'user-advogado-synthetic', role: 'advogado' };
    else if (token === 'estagiario-token') user = { id: 'user-estagiario-synthetic', role: 'estagiario' };
    else return res.status(401).json({ error: 'Token inválido' });

    req.user = user;
    return handler(req, res);
  }
}));

jest.mock('../lib/notificationCache', () => ({
  checkRateLimit: jest.fn(() => true),
  get: jest.fn(() => null),
  set: jest.fn()
}));

jest.mock('../lib/notificationAggregator', () => ({
  aggregateNotifications: jest.fn(({ userId, userRole }) =>
    Promise.resolve({
      notifications: [{ id: `notif-${userId}`, type: 'message' }],
      countReliable: true,
      errors: []
    })
  )
}));

const notificationsHandler = require('../pages/api/notifications').default;
const countHandler = require('../pages/api/notifications/count').default;

describe('Notificações - Autenticação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('GET /api/notifications sem token retorna 401', async () => {
    const { req, res } = createMocks({ method: 'GET', headers: {} });
    await notificationsHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  test('GET /api/notifications/count sem token retorna 401', async () => {
    const { req, res } = createMocks({ method: 'GET', headers: {} });
    await countHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
  });

  test('Headers forjados x-user-id e x-user-role não alteram o usuário efetivo', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer advogado-token',
        'x-user-id': 'user-admin-synthetic',
        'x-user-role': 'admin'
      }
    });

    const { aggregateNotifications } = require('../lib/notificationAggregator');
    await notificationsHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(aggregateNotifications).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-advogado-synthetic',
      userRole: 'advogado'
    }));
  });

  test('Token de advogado recebe apenas notificações dele', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: { authorization: 'Bearer advogado-token' }
    });

    const { aggregateNotifications } = require('../lib/notificationAggregator');
    await notificationsHandler(req, res);

    const data = JSON.parse(res._getData());
    expect(data.notifications[0].id).toBe('notif-user-advogado-synthetic');
    expect(aggregateNotifications).toHaveBeenCalledWith({
      userId: 'user-advogado-synthetic',
      userRole: 'advogado'
    });
  });

  test('Token de admin não é escolhido por header externo', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: {
        authorization: 'Bearer estagiario-token',
        'x-user-role': 'admin'
      }
    });

    const { aggregateNotifications } = require('../lib/notificationAggregator');
    await countHandler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(aggregateNotifications).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-estagiario-synthetic',
      userRole: 'estagiario'
    }));
  });

  test('Token inválido retorna 401 sem detalhes internos', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      headers: { authorization: 'Bearer token-invalido' }
    });

    await notificationsHandler(req, res);
    expect(res._getStatusCode()).toBe(401);
    const data = JSON.parse(res._getData());
    expect(data).not.toHaveProperty('user');
    expect(data).not.toHaveProperty('token');
  });
});
