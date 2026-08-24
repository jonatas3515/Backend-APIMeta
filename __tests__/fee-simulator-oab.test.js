/**
 * @jest-environment jsdom
 */

const React = require('react');
require('@testing-library/jest-dom');
const { render, fireEvent, waitFor } = require('@testing-library/react');

const axios = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn()
};

jest.mock('axios', () => ({
  __esModule: true,
  default: axios
}));

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer mock' }))
}));

const FeeSimulator = require('../components/FeeSimulator').default;

describe('FeeSimulator - OAB e simulacao', () => {
  const oabRef = {
    id: 'oab-1',
    service: 'Peticao Inicial',
    min_amount: 1000,
    suggested_amount: 2000,
    max_amount: 3000,
    regional_suggestion: 1500,
    unit: ''
  };

  const internalService = {
    id: 'svc-1',
    name: 'Peticao Inicial',
    base_amount: 2500,
    billing_model: 'fixo',
    default_installments: 2,
    legal_area: 'Civel',
    case_type: 'Geral'
  };

  const calcResult = {
    base_amount: 2500,
    suggested_amount: 2800,
    min_amount: 2000,
    max_amount: 3200,
    applied_rules: [],
    billing_model: 'fixo',
    down_payment: 840,
    installments_count: 2,
    installment_amount: 980
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.get.mockImplementation((url) => {
      if (url.startsWith('/api/fee-services')) return Promise.resolve({ data: [internalService] });
      if (url.startsWith('/api/fee-simulations')) return Promise.resolve({ data: [] });
      if (url.startsWith('/api/fee-reference')) return Promise.resolve({ data: [oabRef] });
      return Promise.resolve({ data: [] });
    });
    axios.post.mockImplementation((_url, payload) => {
      if (payload && payload.action === 'calculate') return Promise.resolve({ data: calcResult });
      return Promise.resolve({ data: { id: 'sim-1' } });
    });
  });

  test('renderiza formulario de simulacao', async () => {
    const { container } = render(React.createElement(FeeSimulator, { caseId: 'case-1', caseData: { legal_area: 'Civel' }, userRole: 'admin' }));
    await waitFor(() => expect(container.textContent).toContain('💰 Simular Honorários'));
    expect(container.querySelector('select')).toBeInTheDocument();
  });

  test('carrega referencia OAB apos selecionar servico', async () => {
    const { container } = render(React.createElement(FeeSimulator, { caseId: 'case-1', caseData: { legal_area: 'Civel' }, userRole: 'admin' }));
    await waitFor(() => expect(container.querySelector('select option[value="svc-1"]')).toBeInTheDocument());

    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'svc-1' } });

    await waitFor(() => {
      expect(axios.get).toHaveBeenCalledWith(expect.stringContaining('/api/fee-reference?'), expect.any(Object));
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Referência OAB');
      expect(container.textContent).toContain('mín. R$ 1.000,00');
      expect(container.textContent).toContain('sugerido R$ 2.000,00');
      expect(container.textContent).toContain('máx. R$ 3.000,00');
      expect(container.textContent).toContain('Sugestão regional (70-80%): R$ 1.500,00');
    });
  });

  test('toggle inativo chama calculo da API', async () => {
    const { container } = render(React.createElement(FeeSimulator, { caseId: 'case-1', caseData: { legal_area: 'Civel' }, userRole: 'admin' }));
    await waitFor(() => expect(container.querySelector('select option[value="svc-1"]')).toBeInTheDocument());

    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'svc-1' } });

    await waitFor(() => {
      const calcButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Calcular sugestão'));
      expect(calcButton).toBeInTheDocument();
      expect(calcButton.disabled).toBe(false);
    });

    const calcButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Calcular sugestão'));
    fireEvent.click(calcButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith(
        '/api/fee-simulations',
        expect.objectContaining({
          action: 'calculate',
          service_id: 'svc-1'
        }),
        expect.any(Object)
      );
    });
  });
});
