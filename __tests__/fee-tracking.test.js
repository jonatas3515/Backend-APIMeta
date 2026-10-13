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

jest.mock('../lib/useToast', () => ({
  useToast: () => ({ addToast: jest.fn() })
}));

const FeeSimulator = require('../components/FeeSimulator').default;

describe('FeeSimulator - acompanhamento geral (sem caseId)', () => {
  const sim = {
    id: 'sim-1',
    status: 'aprovada',
    suggested_amount: 2500,
    final_amount: 2500,
    fee_service_catalog: { name: 'Peticao Inicial' },
    cases: { id: 'case-9', title: 'Ação Trabalhista - Silva' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    apiJson.mockImplementation((url) => {
      if (url === '/api/fee-simulations') return Promise.resolve([sim]);
      if (url.startsWith('/api/fee-simulations?case_id=')) return Promise.resolve([]);
      if (url.startsWith('/api/fee-services')) return Promise.resolve([]);
      if (url === '/api/cases') return Promise.resolve([
        { id: 'case-9', title: 'Ação Trabalhista - Silva', status: 'em_andamento' },
        { id: 'case-10', title: 'Caso Encerrado', status: 'encerrado' }
      ]);
      return Promise.resolve([]);
    });
  });

  test('sem caseId busca historico global em /api/fee-simulations', async () => {
    render(React.createElement(FeeSimulator, { isAdminOrLawyer: true }));
    await waitFor(() => {
      expect(apiJson).toHaveBeenCalledWith('/api/fee-simulations');
    });
  });

  test('card de simulacao exibe o titulo do caso vinculado', async () => {
    const { container } = render(React.createElement(FeeSimulator, { isAdminOrLawyer: true }));
    await waitFor(() => {
      expect(container.textContent).toContain('Caso: Ação Trabalhista - Silva');
    });
  });

  test('seletor de casos lista apenas casos nao encerrados', async () => {
    render(React.createElement(FeeSimulator, { isAdminOrLawyer: true }));
    const select = await waitFor(() => {
      const el = document.querySelector('[data-testid="select-case"]');
      expect(el).toBeInTheDocument();
      return el;
    });
    await waitFor(() => {
      expect(select.querySelector('option[value="case-9"]')).toBeInTheDocument();
      expect(select.querySelector('option[value="case-10"]')).not.toBeInTheDocument();
    });
  });

  test('hideForm=true esconde formulario mas mantem historico', async () => {
    const { container } = render(React.createElement(FeeSimulator, { isAdminOrLawyer: true, hideForm: true, showTracking: true }));
    await waitFor(() => {
      expect(container.textContent).toContain('Caso: Ação Trabalhista - Silva');
    });
    expect(container.querySelector('[data-testid="select-case"]')).not.toBeInTheDocument();
    expect(container.textContent).not.toContain('Calcular sugestão');
  });
});

describe('APIs de fee - fallback de variaveis de ambiente', () => {
  const mockCreateClient = jest.fn(() => ({ from: jest.fn(), auth: {} }));

  test('fee-services usa SUPABASE_URL/SUPABASE_SERVICE_KEY quando NEXT_PUBLIC ausente', () => {
    const saved = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
    };
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_URL = 'https://fee-fallback.test';
      process.env.SUPABASE_SERVICE_KEY = 'fee-fallback-key';

      mockCreateClient.mockClear();
      jest.isolateModules(() => {
        jest.doMock('@supabase/supabase-js', () => ({
          createClient: (...args) => mockCreateClient(...args)
        }));
        jest.doMock('../lib/auth', () => ({ withAuth: (fn) => fn, requireRole: jest.fn() }));
        require('../pages/api/fee-services');
      });

      expect(mockCreateClient).toHaveBeenCalledWith('https://fee-fallback.test', 'fee-fallback-key');
    } finally {
      Object.keys(saved).forEach((k) => {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      });
    }
  });

  test('fee-simulations tambem resolve via fallbacks', () => {
    const saved = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      SUPABASE_URL: process.env.SUPABASE_URL,
      SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY
    };
    try {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      process.env.SUPABASE_URL = 'https://sims-fallback.test';
      process.env.SUPABASE_SERVICE_KEY = 'sims-fallback-key';

      mockCreateClient.mockClear();
      jest.isolateModules(() => {
        jest.doMock('@supabase/supabase-js', () => ({
          createClient: (...args) => mockCreateClient(...args)
        }));
        jest.doMock('../lib/auth', () => ({ withAuth: (fn) => fn, requireRole: jest.fn(), hasMinimumRole: jest.fn(() => true) }));
        require('../pages/api/fee-simulations');
      });

      expect(mockCreateClient).toHaveBeenCalledWith('https://sims-fallback.test', 'sims-fallback-key');
    } finally {
      Object.keys(saved).forEach((k) => {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      });
    }
  });
});
