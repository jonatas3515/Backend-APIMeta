import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage, MOCK_HISTORY, MOCK_MOVEMENTS } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triage history and details', () => {
  beforeEach(() => { setupTriage({ history: MOCK_HISTORY, detailMovement: MOCK_MOVEMENTS[1] }); });
  afterEach(() => { jest.clearAllMocks(); });

  test('detail modal shows history entries', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card'))[1];
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('triage-detail-modal')).toBeInTheDocument());
    expect(await screen.findAllByTestId('history-item')).toHaveLength(2);
    expect((await screen.findAllByText('Dr. Ana')).length).toBeGreaterThanOrEqual(1);
  });

  test('history empty state is shown when no history', async () => {
    setupTriage({ history: [], detailMovement: MOCK_MOVEMENTS[1] });
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card'))[1];
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('history-empty')).toBeInTheDocument());
  });

  test('history shows status and priority transitions', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card'))[1];
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('triage-detail-modal')).toBeInTheDocument());
    expect(await screen.findByText(/Nova → Em análise/)).toBeInTheDocument();
    expect(await screen.findByText(/Média → Alta/)).toBeInTheDocument();
  });

  test('suggestion box appears after clicking Obter sugestão', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card'))[1];
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByTestId('triage-detail-modal')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('btn-suggestion'));
    await waitFor(() => expect(screen.getByTestId('suggestion-box')).toBeInTheDocument());
  });
});
