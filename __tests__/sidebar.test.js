/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render } = require('@testing-library/react');

jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({
    canAccess: (minRole) => minRole !== 'admin',
    signOut: jest.fn()
  })
}));

const Sidebar = require('../components/Sidebar').default;

describe('Sidebar - navegacao mobile e desktop', () => {
  test('mobile deriva itens de NAV_ITEMS e respeita permissao', () => {
    const { container } = render(React.createElement(Sidebar, { activeTab: 'chat', widthClass: 'w-24' }));
    const buttons = container.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('💬Chat');
    expect(labels).toContain('⚖️Casos');
    expect(labels).not.toContain('💰Honorários');
  });
});
