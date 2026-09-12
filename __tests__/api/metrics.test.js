const { createMocks } = require('node-mocks-http');
const metricsHandler = require('../../pages/api/metrics').default;
const { incrementMetric, resetMetrics } = require('../../lib/metrics');

jest.mock('../../lib/auth', () => ({
  withAuth: (fn) => (req, res) => {
    req.user = req.__testUser || { role: 'admin', id: 'user-1' };
    return fn(req, res);
  }
}));

describe('API /api/metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  test('admin acessa contadores agregados', async () => {
    incrementMetric('cases', 'link');
    incrementMetric('cases', 'unlink');

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await metricsHandler(req, res);
    const data = res._getJSONData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.metrics['cases:link']).toBe(1);
    expect(data.metrics['cases:unlink']).toBe(1);
  });

  test('nao-admin recebe 403', async () => {
    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'advogado', id: 'user-2' }
    });

    await metricsHandler(req, res);
    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData().error).toMatch(/Acesso negado/i);
  });

  test('metodo nao-permitido retorna 405', async () => {
    const { req, res } = createMocks({
      method: 'POST',
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await metricsHandler(req, res);
    expect(res._getStatusCode()).toBe(405);
  });
});
