/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render, fireEvent, waitFor } = require('@testing-library/react');

const apiJson = jest.fn();

jest.mock('../lib/apiClient', () => ({
  __esModule: true,
  apiJson: (...args) => apiJson(...args),
  apiCall: jest.fn()
}));

jest.mock('../lib/useAuth', () => ({
  useAuth: () => ({ profile: { id: 'user-1', role: 'advogado' } })
}));

const DocumentRequestModal = require('../components/DocumentRequestModal').default;

const mockCase = (overrides = {}) => ({
  id: 'case-1',
  title: 'Caso Teste',
  ...overrides
});

const mockItems = [
  { id: 'item-1', title: 'RG', status: 'pendente', is_sensitive: false },
  { id: 'item-2', title: 'Comprovante', status: 'pendente', is_sensitive: false }
];

describe('DocumentRequestModal - validacao de conversa e telefone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    apiJson.mockImplementation((url) => {
      if (url.startsWith('/api/document-checklists')) return Promise.resolve(mockItems);
      return Promise.resolve({});
    });
  });

  test('sem conversa vinculada exibe aviso e desabilita botao', async () => {
    const { container } = render(React.createElement(DocumentRequestModal, {
      caseItem: mockCase({ conversation_id: null }),
      conversation: null,
      onClose: jest.fn()
    }));

    await waitFor(() => expect(container.textContent).toContain('Vincule uma conversa ao caso antes de solicitar documentos.'));

    const button = container.querySelector('button#doc-request-create');
    expect(button).toBeDisabled();
    expect(apiJson).not.toHaveBeenCalledWith(
      '/api/document-checklist-requests',
      expect.anything()
    );
  });

  test('com conversa sem telefone exibe aviso e desabilita botao', async () => {
    const { container } = render(React.createElement(DocumentRequestModal, {
      caseItem: mockCase({ conversation_id: 'conv-1' }),
      conversation: { id: 'conv-1', client_phone: '   ' },
      onClose: jest.fn()
    }));

    await waitFor(() => expect(container.textContent).toContain('A conversa vinculada não possui telefone do cliente. Atualize o telefone antes de solicitar documentos.'));

    const button = container.querySelector('button#doc-request-create');
    expect(button).toBeDisabled();
    expect(apiJson).not.toHaveBeenCalledWith(
      '/api/document-checklist-requests',
      expect.anything()
    );
  });

  test('com conversa e telefone permite gerar rascunho e chama API corretamente', async () => {
    const { container } = render(React.createElement(DocumentRequestModal, {
      caseItem: mockCase({ conversation_id: 'conv-1' }),
      conversation: { id: 'conv-1', client_phone: '5511999999999' },
      onClose: jest.fn()
    }));

    await waitFor(() => expect(container.querySelector('input[type="checkbox"]')).toBeInTheDocument());

    const checkbox = container.querySelector('input[type="checkbox"]');
    fireEvent.click(checkbox);

    const button = container.querySelector('button#doc-request-create');
    expect(button).toBeEnabled();
    fireEvent.click(button);

    await waitFor(() => expect(apiJson).toHaveBeenCalledWith(
      '/api/document-checklist-requests',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"conversation_id":"conv-1"')
      })
    ));
  });
});
