/**
 * Testes - ExecutiveDashboard e protecao da rota /dashboard
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../lib/apiClient', () => ({
  apiJson: jest.fn((url) => {
    if (url === '/api/office/current') {
      return Promise.resolve({ id: 'o1', name: 'Neves & Costa Advogados', plan: 'pro' });
    }
    if (url === '/api/cases/metrics') {
      return Promise.resolve({
        total: 12,
        by_court: { TRT: 5, TJ: 4 },
        by_procedural_step: { instrucao: 6, execucao: 3 },
        case_value: { count: 8, total: 250000, average: 31250 }
      });
    }
    if (url === '/api/cases') {
      return Promise.resolve([
        { id: 'c1', title: 'Caso Urgente', deadline_date: new Date(Date.now() + 86400000).toISOString(), status: 'em_analise', created_at: new Date().toISOString() },
        { id: 'c2', title: 'Caso Antigo', deadline_date: null, status: 'prospect', created_at: '2020-01-01' }
      ]);
    }
    if (url === '/api/conversations') {
      return Promise.resolve([{ id: 'conv-1', updated_at: new Date().toISOString() }]);
    }
    return Promise.resolve({});
  })
}));

jest.mock('../lib/supabaseClient', () => ({
  supabase: {
    from: jest.fn(() => ({ select: jest.fn(() => ({ order: jest.fn(() => Promise.resolve({ data: [], error: null })) })) })),
    auth: { getUser: jest.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
    channel: jest.fn(() => ({ on: jest.fn().mockReturnThis(), subscribe: jest.fn() }))
  }
}));

jest.mock('../lib/useAuth', () => ({
  useAuth: jest.fn()
}));

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), query: {}, pathname: '/dashboard', isReady: true, replace: jest.fn() })
}));

jest.mock('../components/ProcessAnalyticsPanel', () => () => <div data-testid="analytics-mock" />);
jest.mock('../components/Sidebar', () => () => <div data-testid="sidebar-mock" />);
jest.mock('../components/MetricsDashboard', () => () => <div data-testid="metrics-mock" />);
jest.mock('../components/GlobalSearch', () => () => null);
jest.mock('../components/KeyboardShortcuts', () => () => null);
jest.mock('../components/NotificationPermissionPrompt', () => () => null);
jest.mock('../components/AreaFilterSelector', () => () => null);
jest.mock('../components/ActiveFilterBanner', () => () => null);
jest.mock('../components/Login', () => () => <div data-testid="login-mock">Tela de Login</div>);
jest.mock('../hooks/useAreaFilter', () => () => ({ selectedArea: '', setSelectedArea: jest.fn() }));
jest.mock('../lib/router', () => ({ buildInternalUrl: jest.fn(() => '/'), resolveLegacyQuery: jest.fn(() => ({})) }));
jest.mock('../lib/notifications', () => ({ isSupported: () => false, getPermission: () => 'denied', maybeNotify: jest.fn() }));

const { useAuth } = require('../lib/useAuth');
const { apiJson } = require('../lib/apiClient');
const ExecutiveDashboard = require('../components/ExecutiveDashboard').default;

describe('ExecutiveDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuth.mockReturnValue({ authUser: { id: 'u1' }, profile: { name: 'Jonatas Costa' }, loading: false });
  });

  test('renderiza KPIs com dados mockados', async () => {
    render(<ExecutiveDashboard />);

    await waitFor(() => expect(screen.getByTestId('kpi-cases')).toHaveTextContent('12'));
    expect(screen.getByTestId('kpi-patrimony')).toHaveTextContent('250.000');
    expect(screen.getByTestId('kpi-urgent')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-conversations')).toHaveTextContent('1');
    expect(screen.getByTestId('dashboard-greeting')).toHaveTextContent('Jonatas');
    expect(screen.getByText('Caso Urgente')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-new-month')).toBeInTheDocument();
    expect(screen.getByTestId('action-new-case')).toBeInTheDocument();
  });
});

describe('Rota /dashboard (app/dashboard/page.js)', () => {
  let DashboardPage;

  beforeAll(() => {
    DashboardPage = require('../app/dashboard/page').default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('usuario nao autenticado ve prompt de login e nao dispara dados', async () => {
    useAuth.mockReturnValue({ authUser: null, profile: null, loading: false });
    render(<DashboardPage />);
    await waitFor(() => expect(screen.getByText(/Ir para o login/i)).toBeInTheDocument());
    expect(apiJson).not.toHaveBeenCalledWith('/api/dashboard');
  });
});
