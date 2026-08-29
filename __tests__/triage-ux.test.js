import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage, MOCK_STATS, MOCK_MOVEMENTS } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triage UX', () => {
  beforeEach(() => {
    setupTriage();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('renders title and disclaimer', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    expect(await screen.findByText(/Central de Triagem Processual/)).toBeInTheDocument();
    expect(screen.getByTestId('triage-disclaimer')).toHaveTextContent(/revisão humana/);
  });

  test('renders summary cards with expected counts', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('summary-total')).toHaveTextContent('4');
      expect(screen.getByTestId('summary-new')).toHaveTextContent('2');
      expect(screen.getByTestId('summary-analyzing')).toHaveTextContent('1');
      expect(screen.getByTestId('summary-urgent')).toHaveTextContent('2');
      expect(screen.getByTestId('summary-mine')).toHaveTextContent('1');
    });
  });

  test('renders cards with status, priority and classification badges', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const cards = await screen.findAllByTestId('triage-card');
    expect(cards).toHaveLength(4);
    expect(screen.getAllByText('Urgente').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Nova').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Em análise').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Prazo Potencial').length).toBeGreaterThanOrEqual(1);
  });

  test('default ordering is by priority (urgent first)', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const cards = await screen.findAllByTestId('triage-card');
    expect(cards[0]).toHaveAttribute('data-movement-id', 'm1'); // urgent
    expect(cards[1]).toHaveAttribute('data-movement-id', 'm2'); // alta
    expect(cards[3]).toHaveAttribute('data-movement-id', 'm3'); // baixa
  });

  test('search filters by safe fields without exposing PII', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    const input = screen.getByTestId('triage-search');
    fireEvent.change(input, { target: { value: 'TRF4' } });
    await waitFor(() => {
      expect(screen.getAllByTestId('triage-card')).toHaveLength(1);
    });
  });

  test('clear filters resets state', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    fireEvent.change(screen.getByTestId('triage-search'), { target: { value: 'nenhum' } });
    await waitFor(() => expect(screen.getByTestId('triage-empty')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('clear-filters'));
    await waitFor(() => expect(screen.getAllByTestId('triage-card')).toHaveLength(4));
  });

  test('empty state when no authorized movements', async () => {
    setupTriage({ movements: [], total: 0, totalPages: 1 });
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    expect(await screen.findByTestId('triage-empty')).toBeInTheDocument();
  });

  test('error state renders retry button', async () => {
    global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({ error: 'Falha na API' }) }));
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    expect(await screen.findByTestId('triage-error')).toBeInTheDocument();
    expect(screen.getByText('Tentar novamente')).toBeInTheDocument();
  });
});
