import { render, screen } from '@testing-library/react';

jest.mock('../lib/supabaseClient', () => ({
  supabase: { from: jest.fn(), auth: {} }
}));
jest.mock('../hooks/useAreaFilter', () => ({
  __esModule: true,
  default: () => ({ selectedArea: null })
}));
jest.mock('../components/ExportButtons', () => ({
  __esModule: true,
  default: () => <div data-testid="export-buttons" />
}));
jest.mock('../lib/export', () => ({
  exportMetricsPdf: jest.fn(),
  exportMetricsExcel: jest.fn()
}));

const MetricsDashboard = require('../components/MetricsDashboard').default;

describe('MetricsDashboard - etapas oficiais do funil', () => {
  test('renderiza labels oficiais para etapas do funil', () => {
    render(<MetricsDashboard conversations={[
      { id: '1', funnel_stage: 'proposta_enviada', legal_area: 'trabalhista' },
      { id: '2', funnel_stage: 'contrato_assinado', legal_area: 'civel' }
    ]} />);

    expect(screen.getByText('💰 Proposta Enviada')).toBeInTheDocument();
    expect(screen.getByText('📝 Contrato Assinado')).toBeInTheDocument();
  });

  test('normaliza etapas legadas para as 8 oficiais', () => {
    render(<MetricsDashboard conversations={[
      { id: '1', funnel_stage: 'proposta' },
      { id: '2', funnel_stage: 'intake' },
      { id: '3', funnel_stage: 'andamento' }
    ]} />);

    expect(screen.getByText('💰 Proposta Enviada')).toBeInTheDocument();
    expect(screen.getByText('📥 Intake em Andamento')).toBeInTheDocument();
    expect(screen.getByText('⚖️ Ação Protocolada')).toBeInTheDocument();
    expect(screen.queryByText('proposta')).not.toBeInTheDocument();
  });

  test('conversa sem etapa cai em Lead Novo', () => {
    render(<MetricsDashboard conversations={[{ id: '1', funnel_stage: null }]} />);
    expect(screen.getByText('🆕 Lead Novo')).toBeInTheDocument();
  });

  test('mantem fallbacks de area e municipio', () => {
    render(<MetricsDashboard conversations={[{ id: '1', funnel_stage: 'lead_novo' }]} />);
    expect(screen.getByText('Não classificado')).toBeInTheDocument();
    expect(screen.getByText('Não informado')).toBeInTheDocument();
  });
});

describe('GET /api/dashboard', () => {
  function makeQuery(result = { data: [], error: null, count: 0 }) {
    const q = {};
    ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'not',
      'gte', 'lte', 'gt', 'lt', 'ilike', 'or', 'order', 'limit', 'filter',
      'single', 'maybeSingle'].forEach((m) => { q[m] = jest.fn(() => q); });
    q.then = (resolve) => Promise.resolve(result).then(resolve);
    return q;
  }

  const mockFrom = jest.fn(() => makeQuery());
  const mockCreateClient = jest.fn(() => ({ from: mockFrom, auth: {} }));

  function mockRes() {
    const res = {};
    res.status = jest.fn(() => res);
    res.json = jest.fn(() => res);
    return res;
  }

  let handler;
  beforeAll(() => {
    jest.isolateModules(() => {
      jest.doMock('@supabase/supabase-js', () => ({
        createClient: (...args) => mockCreateClient(...args)
      }));
      jest.doMock('../lib/auth', () => ({
        withAuth: (fn) => async (req, res) => {
          req.user = { id: 'u1', role: 'advogado' };
          return fn(req, res);
        }
      }));
      handler = require('../pages/api/dashboard').default;
    });
  });

  beforeEach(() => {
    mockFrom.mockClear();
  });

  test('rejeita metodo diferente de GET', async () => {
    const res = mockRes();
    await handler({ method: 'POST', query: {}, headers: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  test('retorna payload agregado do dashboard', async () => {
    const res = mockRes();
    await handler({ method: 'GET', query: {}, headers: {} }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toHaveProperty('next_deadlines');
    expect(payload).toHaveProperty('unread_messages');
    expect(payload).toHaveProperty('critical_cases');
    expect(payload).toHaveProperty('my_tasks');
    expect(payload).toHaveProperty('metrics');
    expect(payload.metrics).toHaveProperty('new_leads_today');
    expect(payload.metrics).toHaveProperty('active_cases');
  });

  test('usa fallbacks SUPABASE_URL e SUPABASE_SERVICE_KEY quando NEXT_PUBLIC ausente', () => {
    const saved = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
    };
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_URL = 'https://fallback.test';
      process.env.SUPABASE_SERVICE_KEY = 'fallback-key';

      mockCreateClient.mockClear();
      jest.isolateModules(() => {
        jest.doMock('@supabase/supabase-js', () => ({
          createClient: (...args) => mockCreateClient(...args)
        }));
        jest.doMock('../lib/auth', () => ({ withAuth: (fn) => fn }));
        require('../pages/api/dashboard');
      });

      expect(mockCreateClient).toHaveBeenCalledWith('https://fallback.test', 'fallback-key');
    } finally {
      Object.keys(saved).forEach((k) => {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      });
    }
  });
});
