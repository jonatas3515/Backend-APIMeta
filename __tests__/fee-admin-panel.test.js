/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render, screen, fireEvent } = require('@testing-library/react');

// Mock do useAuth para simular roles
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ profile: { role: 'admin' } })
}));

// Mocks dos componentes filhos para evitar dependências de rede
jest.mock('../components/FeeServiceAdmin', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'FeeServiceAdmin')
}));
jest.mock('../components/FeeTablesManager', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'FeeTablesManager')
}));
jest.mock('../components/FeeSimulator', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'FeeSimulator')
}));

const FeeAdminPanel = require('../components/FeeAdminPanel').default;

describe('FeeAdminPanel - navegação de abas', () => {
  test('renderiza todas as abas para admin', () => {
    render(React.createElement(FeeAdminPanel, { initialView: 'services' }));
    expect(screen.getByText('📋 Serviços')).toBeInTheDocument();
    expect(screen.getByText('📊 Tabela da OAB')).toBeInTheDocument();
    expect(screen.getByText('💰 Simulações / Propostas')).toBeInTheDocument();
    expect(screen.getByText('📈 Acompanhamento')).toBeInTheDocument();
  });

  test('abre na view inicial passada por prop', () => {
    render(React.createElement(FeeAdminPanel, { initialView: 'reference-tables' }));
    const button = screen.getByText('📊 Tabela da OAB');
    expect(button).toHaveClass('border-blue-600');
    expect(button).toHaveClass('text-blue-600');
  });

  test('clicar em uma aba alterna a view', () => {
    render(React.createElement(FeeAdminPanel, { initialView: 'services' }));
    const simTab = screen.getByText('💰 Simulações / Propostas');
    fireEvent.click(simTab);
    expect(simTab).toHaveClass('border-blue-600');
  });
});
