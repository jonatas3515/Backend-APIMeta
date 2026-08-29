import { render, screen, waitFor } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triage permissions and security', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('estagiário cannot access the triage panel', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u0', name: 'Estagiário', role: 'estagiario' }} />);
    await waitFor(() => {
      expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
      expect(screen.getByText(/Central de Triagem Processual não está disponível/)).toBeInTheDocument();
    });
    expect(screen.queryByTestId('triage-card')).not.toBeInTheDocument();
  });

  test('advogado sees action buttons on each card', async () => {
    setupTriage();
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    expect(screen.getAllByTestId('action-assume').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('action-analyze').length).toBeGreaterThan(0);
  });

  test('admin sees action buttons on each card', async () => {
    setupTriage();
    render(<ProcessTriagePanel profile={{ id: 'u3', name: 'Maria', role: 'admin' }} />);
    await screen.findAllByTestId('triage-card');
    expect(screen.getAllByTestId('action-assume').length).toBeGreaterThan(0);
  });

  test('safe display does not expose raw movement text as safe summary', async () => {
    setupTriage();
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    const summaries = screen.getAllByTestId('triage-safe-summary');
    summaries.forEach((el) => {
      expect(el.textContent).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    });
  });
});
