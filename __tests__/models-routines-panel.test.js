/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render, fireEvent } = require('@testing-library/react');

jest.mock('../components/DocumentTemplatesManager', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'DocumentTemplatesManager')
}));
jest.mock('../components/LegalRoutinesManager', () => ({
  __esModule: true,
  default: () => React.createElement('div', null, 'LegalRoutinesManager')
}));

describe('ModelsAndRoutinesPanel - permissoes e abas', () => {
  test('admin ve botoes de Modelos e Rotinas', () => {
    const ModelsAndRoutinesPanel = require('../components/ModelsAndRoutinesPanel').default;
    const { container } = render(React.createElement(ModelsAndRoutinesPanel, { userRole: 'admin' }));
    expect(container.textContent).toContain('📄 Modelos de Documento');
    expect(container.textContent).toContain('🔄 Rotinas Jurídicas');
  });

  test('estagiario ve mensagem de permissao negada', () => {
    const ModelsAndRoutinesPanel = require('../components/ModelsAndRoutinesPanel').default;
    const { container } = render(React.createElement(ModelsAndRoutinesPanel, { userRole: 'estagiario' }));
    expect(container.textContent).toContain('Você não tem permissão para acessar esta área.');
    expect(container.textContent).not.toContain('📄 Modelos de Documento');
  });

  test('alterna entre abas Modelos e Rotinas', () => {
    const ModelsAndRoutinesPanel = require('../components/ModelsAndRoutinesPanel').default;
    const { container } = render(React.createElement(ModelsAndRoutinesPanel, { userRole: 'admin' }));
    expect(container.textContent).toContain('DocumentTemplatesManager');

    const rotinasButton = Array.from(container.querySelectorAll('button')).find(b => b.textContent.includes('Rotinas'));
    if (rotinasButton) fireEvent.click(rotinasButton);
    expect(container.textContent).toContain('LegalRoutinesManager');
  });
});
