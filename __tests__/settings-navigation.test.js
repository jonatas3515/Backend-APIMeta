/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render, fireEvent } = require('@testing-library/react');

jest.mock('../lib/useAuth', () => ({
  useAuth: jest.fn(() => ({ profile: { role: 'admin' } }))
}));

jest.mock('../components/UserManagement', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'UserManagement')
}));
jest.mock('../components/SignatureSettings', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'SignatureSettings')
}));
jest.mock('../components/ProfilePanel', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'ProfilePanel')
}));

const SettingsPanel = require('../components/SettingsPanel').default;
const { useAuth } = require('../lib/useAuth');

describe('SettingsPanel - navegacao de perfil', () => {
  beforeEach(() => {
    useAuth.mockClear();
  });

  test('estagiario ve apenas subaba Perfil', () => {
    useAuth.mockReturnValue({ profile: { role: 'estagiario' } });
    const { container } = render(React.createElement(SettingsPanel, { initialView: 'profile' }));
    expect(container.textContent).toContain('👤 Perfil');
    expect(container.textContent).not.toContain('👥 Usuários');
    expect(container.textContent).not.toContain('✍️ Assinatura Eletrônica');
  });

  test('advogado/admin ve Usuarios, Assinatura Eletronica e Perfil', () => {
    useAuth.mockReturnValue({ profile: { role: 'advogado' } });
    const { container } = render(React.createElement(SettingsPanel, { initialView: 'users' }));
    expect(container.textContent).toContain('👥 Usuários');
    expect(container.textContent).toContain('✍️ Assinatura Eletrônica');
    expect(container.textContent).toContain('👤 Perfil');
  });

  test('alternancia entre subabas funciona', () => {
    useAuth.mockReturnValue({ profile: { role: 'admin' } });
    const { container } = render(React.createElement(SettingsPanel, { initialView: 'users' }));

    expect(container.textContent).toContain('UserManagement');

    fireEvent.click(container.querySelector('button:nth-child(2)'));
    expect(container.textContent).toContain('SignatureSettings');

    fireEvent.click(container.querySelector('button:nth-child(3)'));
    expect(container.textContent).toContain('ProfilePanel');
  });
});
