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
    apiJson.mockImplementation((url, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      if (method === 'GET') {
        if (url.startsWith('/api/fee-services')) return Promise.resolve([internalService]);
        if (url.startsWith('/api/fee-simulations')) return Promise.resolve([]);
        if (url.startsWith('/api/fee-reference')) return Promise.resolve([{ ...oabRef, match_score: 80 }]);
        return Promise.resolve([]);
      }
      if (method === 'POST') {
        const payload = options.body ? JSON.parse(options.body) : {};
        if (payload.action === 'calculate') return Promise.resolve(calcResult);
        return Promise.resolve({ id: 'sim-1' });
      }
      return Promise.resolve(null);
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
      expect(apiJson).toHaveBeenCalledWith(expect.stringContaining('/api/fee-reference?'));
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Referência OAB');
      expect(container.textContent).toContain('Mínimo (OAB):');
      expect(container.textContent).toContain('Sugerido (OAB):');
      expect(container.textContent).toContain('Máximo (OAB):');
      expect(container.textContent).toContain('Sugestão regional (70-80% OAB): R$ 1.500,00');
    });
  });

  test('toggle inativo chama calculo da API e mostra badge de catalogo', async () => {
    const { container } = render(React.createElement(FeeSimulator, { caseId: 'case-1', caseData: { legal_area: 'Civel' }, userRole: 'admin' }));
    await waitFor(() => expect(container.querySelector('select option[value="svc-1"]')).toBeInTheDocument());

    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'svc-1' } });

    const checkbox = container.querySelector('input[type="checkbox"]');
    await waitFor(() => expect(checkbox.checked).toBe(true));
    fireEvent.click(checkbox);
    await waitFor(() => expect(checkbox.checked).toBe(false));

    await waitFor(() => {
      const calcButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Calcular sugestão'));
      expect(calcButton).toBeInTheDocument();
      expect(calcButton.disabled).toBe(false);
    });

    const calcButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Calcular sugestão'));
    fireEvent.click(calcButton);

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith(
        '/api/fee-simulations',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"action":"calculate"')
        })
      );
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Cálculo baseado no catálogo interno');
    });
  });

  test('exibe mensagem e usa catálogo interno quando nao ha referencia OAB', async () => {
    apiJson.mockImplementation((url, options = {}) => {
      const method = (options.method || 'GET').toUpperCase();
      if (method === 'GET') {
        if (url.startsWith('/api/fee-services')) return Promise.resolve([internalService]);
        if (url.startsWith('/api/fee-simulations')) return Promise.resolve([]);
        return Promise.resolve([]);
      }
      if (method === 'POST') {
        const payload = options.body ? JSON.parse(options.body) : {};
        if (payload.action === 'calculate') return Promise.resolve(calcResult);
        return Promise.resolve({ id: 'sim-1' });
      }
      return Promise.resolve(null);
    });

    const { container } = render(React.createElement(FeeSimulator, { caseId: 'case-1', caseData: { legal_area: 'Civel' }, userRole: 'admin' }));
    await waitFor(() => expect(container.querySelector('select option[value="svc-1"]')).toBeInTheDocument());

    const select = container.querySelector('select');
    fireEvent.change(select, { target: { value: 'svc-1' } });

    await waitFor(() => {
      expect(container.textContent).toContain('Nenhuma referência OAB foi encontrada para este serviço');
      expect(container.textContent).toContain('O cálculo está usando o catálogo interno');
    });

    const calcButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Calcular sugestão'));
    fireEvent.click(calcButton);

    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith(
        '/api/fee-simulations',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"action":"calculate"')
        })
      );
      expect(container.textContent).toContain('Cálculo baseado no catálogo interno');
    });
  });

  describe('ambiguidade de referencias OAB', () => {
    const tiedA = {
      id: 'oab-10', table_id: 'tab-1', service: 'Divorcio consensual', legal_area: 'Familia',
      min_amount: 3000, suggested_amount: 3000, max_amount: null, regional_suggestion: 2250, match_score: 80
    };
    const tiedB = {
      id: 'oab-11', table_id: 'tab-1', service: 'Divorcio litigioso', legal_area: 'Familia',
      min_amount: 5000, suggested_amount: 5000, max_amount: null, regional_suggestion: 3750, match_score: 80
    };

    const mockAmbiguous = () => {
      apiJson.mockImplementation((url, options = {}) => {
        const method = (options.method || 'GET').toUpperCase();
        if (method === 'GET') {
          if (url.startsWith('/api/fee-services')) return Promise.resolve([internalService]);
          if (url.startsWith('/api/fee-simulations')) return Promise.resolve([]);
          if (url.startsWith('/api/fee-reference')) return Promise.resolve([tiedA, tiedB]);
          return Promise.resolve([]);
        }
        if (method === 'POST') {
          const payload = options.body ? JSON.parse(options.body) : {};
          if (payload.action === 'calculate') return Promise.resolve(calcResult);
          return Promise.resolve({ id: 'sim-1' });
        }
        return Promise.resolve(null);
      });
    };

    const renderAndSelect = async () => {
      const { container } = render(React.createElement(FeeSimulator, { caseId: 'case-1', caseData: { legal_area: 'Civel' }, userRole: 'admin' }));
      await waitFor(() => expect(container.querySelector('select option[value="svc-1"]')).toBeInTheDocument());
      fireEvent.change(container.querySelector('select'), { target: { value: 'svc-1' } });
      await waitFor(() => {
        expect(container.textContent).toContain('Foram encontradas várias referências OAB. Selecione a que corresponde ao caso:');
      });
      return container;
    };

    const calcButton = (container) => Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes('Calcular sugestão'));

    test('dois candidatos empatados exibem seletor e botao desabilitado', async () => {
      mockAmbiguous();
      const container = await renderAndSelect();

      const radios = container.querySelectorAll('input[name="oab-candidate"]');
      expect(radios.length).toBe(2);
      expect(container.textContent).toContain('Divorcio consensual');
      expect(container.textContent).toContain('Divorcio litigioso');
      expect(container.textContent).toContain('Código: oab-10');
      expect(calcButton(container).disabled).toBe(true);
    });

    test('selecionar segundo candidato habilita calculo e usa a referencia escolhida', async () => {
      mockAmbiguous();
      const container = await renderAndSelect();

      const radios = container.querySelectorAll('input[name="oab-candidate"]');
      fireEvent.click(radios[1]);

      await waitFor(() => {
        expect(calcButton(container).disabled).toBe(false);
        expect(container.textContent).toContain('Referência OAB');
        expect(container.textContent).toContain('Divorcio litigioso');
      });

      fireEvent.click(calcButton(container));

      await waitFor(() => {
        expect(container.textContent).toContain('Cálculo baseado na tabela OAB');
        // suggested = 5000 (min=max=suggested na ref) -> faixa 5000
        expect(container.textContent).toContain('R$ 5.000,00');
      });
      // calculo OAB nao chama POST /api/fee-simulations
      expect(apiJson).not.toHaveBeenCalledWith('/api/fee-simulations', expect.objectContaining({ method: 'POST' }));
    });

    test('desmarcar OAB em ambiguidade calcula pelo catalogo interno', async () => {
      mockAmbiguous();
      const container = await renderAndSelect();

      const checkbox = container.querySelector('input[type="checkbox"]');
      await waitFor(() => expect(checkbox.checked).toBe(true));
      fireEvent.click(checkbox);
      await waitFor(() => expect(checkbox.checked).toBe(false));
      expect(calcButton(container).disabled).toBe(false);

      fireEvent.click(calcButton(container));

      await waitFor(() => {
        expect(apiJson).toHaveBeenCalledWith(
          '/api/fee-simulations',
          expect.objectContaining({ method: 'POST', body: expect.stringContaining('"action":"calculate"') })
        );
        expect(container.textContent).toContain('Cálculo baseado no catálogo interno');
      });
    });
  });
});
