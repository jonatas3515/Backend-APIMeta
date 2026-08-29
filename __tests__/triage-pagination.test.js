import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage, MOCK_MOVEMENTS } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triage pagination', () => {
  afterEach(() => { jest.clearAllMocks(); });

  test('load more button fetches second page and appends', async () => {
    const secondPage = [{
      id: 'm5',
      triage_status: 'novo',
      priority: 'media',
      legal_classification: 'despacho',
      movement_date: '2024-09-10',
      detected_at: '2024-09-10T10:00:00Z',
      movement_summary: 'Movimentação da página 2',
      case_process: {
        id: 'cp5',
        process_number: '0000005-00.2024.8.00.0000',
        court_name: 'Tribunal de Justiça RS',
        court_code: 'TJRS',
        case: { id: 'c5', title: 'Ação Cível nº 0000005', legal_area: 'Cível' }
      },
      assigned_user_id: null,
      assigned_user: null
    }];

    setupTriage({
      movements: [...MOCK_MOVEMENTS, ...secondPage],
      total: 5,
      totalPages: 2,
      pageSize: 4
    });

    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await waitFor(() => expect(screen.getAllByTestId('triage-card')).toHaveLength(4));
    const loadMore = screen.getByTestId('load-more');
    expect(loadMore).toBeInTheDocument();
    fireEvent.click(loadMore);
    await waitFor(() => expect(screen.getAllByTestId('triage-card')).toHaveLength(5));
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      expect.anything()
    );
  });

  test('no load more on single page', async () => {
    setupTriage({ movements: MOCK_MOVEMENTS, total: 4, totalPages: 1 });
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    expect(screen.queryByTestId('load-more')).not.toBeInTheDocument();
  });
});
