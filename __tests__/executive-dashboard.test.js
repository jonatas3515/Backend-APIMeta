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
    return Promise.resolve(null);
  })
}));

jest.mock('../lib/useAuth', () => ({
  useAuth: jest.fn()
}));

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), query: {}, pathname: '/dashboard', isReady: true, replace: jest.fn() })
}));

jest.mock('../components/ProcessAnalyticsPanel', () => () => <div data-testid="analytics-mock" />);
jest.mock('../components/Sidebar', () => () => <div data-testid="sidebar-mock" />);
jest.mock('../components/Login', () => () => <div data-testid="login-mock">Tela de Login</div>);

const { useAuth } = require('../lib/useAuth');
const ExecutiveDashboard = require('../components/ExecutiveDashboard').default;
const DashboardPage = require('../pages/dashboard').default;

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

describe('Rota /dashboard - protecao', () => {
  test('exibe Login quando nao autenticado', () => {
    useAuth.mockReturnValue({ authUser: null, profile: null, loading: false });
    render(<DashboardPage />);
    expect(screen.getByTestId('login-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('executive-dashboard')).not.toBeInTheDocument();
  });

  test('exibe dashboard com Sidebar quando autenticado', async () => {
    useAuth.mockReturnValue({ authUser: { id: 'u1' }, profile: { name: 'Ana' }, loading: false });
    render(<DashboardPage />);
    expect(screen.getByTestId('sidebar-mock')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('executive-dashboard')).toBeInTheDocument());
  });

  test('exibe loading enquanto autentica', () => {
    useAuth.mockReturnValue({ authUser: null, profile: null, loading: true });
    render(<DashboardPage />);
    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();
  });
});
