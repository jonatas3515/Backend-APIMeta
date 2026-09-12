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

  test('admin acessa contadores agregados em JSON', async () => {
    incrementMetric('cases', 'link');
    incrementMetric('cases', 'unlink');

    const { req, res } = createMocks({
      method: 'GET',
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await metricsHandler(req, res);
    const data = res._getJSONData();
    expect(res._getStatusCode()).toBe(200);
    expect(data.collectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(data.source).toBe('backend-api-meta');
    expect(data.metrics['cases:link']).toBe(1);
    expect(data.metrics['cases:unlink']).toBe(1);
  });

  test('admin exporta metricas em CSV', async () => {
    incrementMetric('cases', 'link');
    incrementMetric('cases', 'unlink');

    const { req, res } = createMocks({
      method: 'GET',
      query: { format: 'csv' },
      __testUser: { role: 'admin', id: 'user-1' }
    });

    await metricsHandler(req, res);
    const csv = res._getData();
    expect(res._getStatusCode()).toBe(200);
    expect(res.getHeader('Content-Type')).toContain('text/csv');
    expect(csv).toContain('collectedAt,source,metric,value');
    expect(csv).toContain('backend-api-meta,cases:link,1');
    expect(csv).toContain('backend-api-meta,cases:unlink,1');
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
