/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render } = require('@testing-library/react');

jest.mock('../lib/useAuth', () => ({
  useAuth: jest.fn(() => ({ profile: { role: 'admin' } }))
}));

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
const { useAuth } = require('../lib/useAuth');

describe('FeeAdminPanel - permissoes', () => {
  beforeEach(() => {
    useAuth.mockClear();
  });

  test('admin ve todas as abas e pode editar', () => {
    useAuth.mockReturnValue({ profile: { role: 'admin' } });
    const { container } = render(React.createElement(FeeAdminPanel, { initialView: 'services' }));
    expect(container.textContent).toContain('📋 Serviços');
    expect(container.textContent).toContain('📊 Tabela da OAB');
    expect(container.textContent).toContain('💰 Simulações / Propostas');
    expect(container.textContent).toContain('📈 Acompanhamento');
  });

  test('advogado ve todas as abas e pode simular', () => {
    useAuth.mockReturnValue({ profile: { role: 'advogado' } });
    const { container } = render(React.createElement(FeeAdminPanel, { initialView: 'services' }));
    expect(container.textContent).toContain('📋 Serviços');
    expect(container.textContent).toContain('💰 Simulações / Propostas');
  });

  test('estagiario nao acessa Honorarios', () => {
    useAuth.mockReturnValue({ profile: { role: 'estagiario' } });
    const { container } = render(React.createElement(FeeAdminPanel, { initialView: 'services' }));
    expect(container.textContent).toContain('Você não tem permissão para acessar esta área.');
  });
});
