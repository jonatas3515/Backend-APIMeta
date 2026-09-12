const { incrementMetric, getMetricsSnapshot, resetMetrics } = require('../lib/metrics');

describe('metrics', () => {
  beforeEach(() => {
    resetMetrics();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('incrementa contador de acao valida', () => {
    incrementMetric('cases', 'link');
    incrementMetric('cases', 'link');
    const snapshot = getMetricsSnapshot();
    expect(snapshot['cases:link']).toBe(2);
  });

  test('ignora feature invalida', () => {
    incrementMetric('invalid', 'create');
    const snapshot = getMetricsSnapshot();
    expect(Object.keys(snapshot)).toHaveLength(0);
  });

  test('ignora acao invalida', () => {
    incrementMetric('cases', 'fly');
    const snapshot = getMetricsSnapshot();
    expect(Object.keys(snapshot)).toHaveLength(0);
  });

  test('snapshot contem multiplas chaves', () => {
    incrementMetric('document_requests', 'send');
    incrementMetric('case_routines', 'execute');
    incrementMetric('fee_simulator', 'save');
    const snapshot = getMetricsSnapshot();
    expect(snapshot['document_requests:send']).toBe(1);
    expect(snapshot['case_routines:execute']).toBe(1);
    expect(snapshot['fee_simulator:save']).toBe(1);
  });

  test('reseta contadores', () => {
    incrementMetric('cases', 'create');
    resetMetrics();
    expect(Object.keys(getMetricsSnapshot())).toHaveLength(0);
  });
});
