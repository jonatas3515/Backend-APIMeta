import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage, MOCK_MOVEMENTS } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triagem - Análise com IA', () => {
  beforeEach(() => {
    setupTriage();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function openFirstDetail() {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const cards = await screen.findAllByTestId('triage-card');
    fireEvent.click(cards[0]);
    await screen.findByTestId('triage-detail-modal');
  }

  test('botao Analisar com IA exibe card com resumo, acao, urgencia e prazo', async () => {
    await openFirstDetail();

    fireEvent.click(screen.getByTestId('btn-ai-analyze'));

    const box = await screen.findByTestId('ai-analysis-box');
    expect(box).toBeInTheDocument();
    expect(screen.getByTestId('ai-analysis-summary')).toHaveTextContent('Intimação para manifestação sobre a contestação.');
    expect(screen.getByTestId('ai-analysis-action')).toHaveTextContent('Petição de Réplica');
    expect(screen.getByTestId('ai-analysis-urgency')).toHaveTextContent('Alta');
    expect(screen.getByTestId('ai-analysis-deadline')).toHaveTextContent('15 dia(s)');
  });

  test('atalho "Usar em Criar Agenda" preenche formulario com a data estimada', async () => {
    await openFirstDetail();
    fireEvent.click(screen.getByTestId('btn-ai-analyze'));
    await screen.findByTestId('ai-analysis-box');

    fireEvent.click(screen.getByTestId('ai-use-deadline'));

    const expected = new Date();
    expected.setDate(expected.getDate() + 15);
    const expectedDate = expected.toISOString().slice(0, 10);

    const dateInput = await screen.findByTestId('event-date');
    expect(dateInput.value).toBe(expectedDate);
    expect(screen.getByTestId('event-type').value).toBe('prazo_judicial');
  });

  test('estagiario nao ve o botao de analise', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u9', name: 'Est.', role: 'estagiario' }} />);
    expect(await screen.findByText(/Acesso restrito/)).toBeInTheDocument();
    expect(screen.queryByTestId('btn-ai-analyze')).not.toBeInTheDocument();
  });
});
