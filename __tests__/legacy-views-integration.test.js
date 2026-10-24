/**
 * Testes - Integracao das abas do sistema legado
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NAV_ITEMS, resolveTab } from '../lib/tabResolver';

function supabaseChain(result = { data: [], error: null }) {
  const promise = Promise.resolve(result);
  const chain = {
    select: jest.fn(() => chain),
    eq: jest.fn(() => chain),
    neq: jest.fn(() => chain),
    not: jest.fn(() => chain),
    in: jest.fn(() => chain),
    order: jest.fn(() => chain),
    limit: jest.fn(() => chain),
    single: jest.fn(() => chain),
    update: jest.fn(() => chain),
    insert: jest.fn(() => chain),
    then: promise.then.bind(promise)
  };
  return chain;
}

jest.mock('../lib/supabaseClient', () => ({
  supabase: { from: jest.fn(() => supabaseChain({ data: [], error: null })) }
}));

jest.mock('../lib/apiClient', () => ({
  apiJson: jest.fn((url) => {
    if (url === '/api/cases') {
      return Promise.resolve([
        { id: 'c-over', title: 'Caso Atrasado', deadline_date: '2020-01-10', status: 'em_analise' },
        { id: 'c-today', title: 'Caso de Hoje', deadline_date: new Date().toISOString(), status: 'em_analise' },
        { id: 'c-week', title: 'Caso Semana', deadline_date: new Date(Date.now() + 3 * 86400000).toISOString(), status: 'prospect' }
      ]);
    }
    return Promise.resolve({});
  })
}));

const PrioridadesPanel = require('../components/PrioridadesPanel').default;
const MonthlyCalendarPanel = require('../components/MonthlyCalendarPanel').default;

describe('tabResolver - novas abas do legado', () => {
  test('registra priorities, tasks e monthly-calendar; saas-admin removida', () => {
    const keys = NAV_ITEMS.map((i) => i.key);
    ['priorities', 'tasks', 'monthly-calendar'].forEach((k) => {
      expect(keys).toContain(k);
    });
    expect(keys).not.toContain('saas-admin');
    expect(resolveTab('saas-admin')).toBeNull();
  });

  test('novas abas acessiveis a estagiario', () => {
    expect(resolveTab('priorities').minRole).toBe('estagiario');
    expect(resolveTab('tasks').minRole).toBe('estagiario');
    expect(resolveTab('monthly-calendar').minRole).toBe('estagiario');
  });
});

describe('PrioridadesPanel', () => {
  test('agrupa itens em Atrasados, Hoje e Próximos 7 dias', async () => {
    render(<PrioridadesPanel />);
    await waitFor(() => expect(screen.getAllByText('Caso Atrasado').length).toBeGreaterThan(0));
    expect(screen.getByTestId('group-overdue')).toHaveTextContent('Caso Atrasado');
    expect(screen.getByTestId('group-today')).toHaveTextContent('Caso de Hoje');
    expect(screen.getByTestId('group-week')).toHaveTextContent('Caso Semana');
  });
});

describe('MonthlyCalendarPanel', () => {
  test('renderiza grade do mês atual com dia de hoje destacado', async () => {
    render(<MonthlyCalendarPanel />);
    const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const now = new Date();
    await waitFor(() => expect(screen.getByTestId('calendar-today')).toBeInTheDocument());
    expect(screen.getByTestId('monthly-calendar-panel')).toHaveTextContent(`${monthNames[now.getMonth()]} ${now.getFullYear()}`);
    expect(screen.getByText(/Aniversariantes -/)).toBeInTheDocument();
  });
});
