/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render } = require('@testing-library/react');

let mockRole = 'advogado';
jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({
    canAccess: (minRole) => {
      const order = { estagiario: 1, advogado: 2, admin: 3 };
      return order[mockRole] >= (order[minRole] || 1);
    },
    signOut: jest.fn()
  })
}));

const Sidebar = require('../components/Sidebar').default;

describe('Sidebar - navegacao mobile e desktop', () => {
  test('advogado ve itens de NAV_ITEMS incluindo Honorarios', () => {
    mockRole = 'advogado';
    const { container } = render(React.createElement(Sidebar, { activeTab: 'chat', widthClass: 'w-24' }));
    const buttons = container.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('💬Chat');
    expect(labels).toContain('⚖️Casos');
    expect(labels).toContain('💰Honorários');
  });

  test('estagiario nao ve Honorarios (minRole advogado)', () => {
    mockRole = 'estagiario';
    const { container } = render(React.createElement(Sidebar, { activeTab: 'chat', widthClass: 'w-24' }));
    const buttons = container.querySelectorAll('button');
    const labels = Array.from(buttons).map((b) => b.textContent);
    expect(labels).toContain('💬Chat');
    expect(labels).toContain('⚖️Casos');
    expect(labels).not.toContain('💰Honorários');
  });
});
