import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triage filters', () => {
  beforeEach(() => { setupTriage(); });
  afterEach(() => { jest.clearAllMocks(); });

  test('status filter triggers fetch with status param', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    const select = screen.getByTestId('filter-status');
    fireEvent.change(select, { target: { value: 'em_analise' } });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('triage_status=em_analise'),
        expect.anything()
      );
    });
  });

  test('priority filter triggers fetch with priority param', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    fireEvent.change(screen.getByTestId('filter-priority'), { target: { value: 'urgente' } });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('priority=urgente'),
        expect.anything()
      );
    });
  });

  test('mine filter triggers fetch with mine=true', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    fireEvent.change(screen.getByTestId('filter-responsible'), { target: { value: 'mine' } });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('mine=true'),
        expect.anything()
      );
    });
  });

  test('unassigned filter triggers fetch with assigned_user_id=unassigned', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    fireEvent.change(screen.getByTestId('filter-responsible'), { target: { value: 'unassigned' } });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('assigned_user_id=unassigned'),
        expect.anything()
      );
    });
  });

  test('period 7 days filter adds start_date and end_date', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    fireEvent.change(screen.getByTestId('filter-period'), { target: { value: '7' } });
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/start_date=\d{4}-\d{2}-\d{2}/),
        expect.anything()
      );
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringMatching(/end_date=\d{4}-\d{2}-\d{2}/),
        expect.anything()
      );
    });
  });

  test('summary cards set filters when clicked', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await waitFor(() => expect(screen.getByTestId('summary-new')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('summary-new'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('triage_status=novo'),
        expect.anything()
      );
    });
  });

  test('sort select changes ordering', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    await screen.findAllByTestId('triage-card');
    fireEvent.change(screen.getByTestId('triage-sort'), { target: { value: 'movement_date' } });
    await waitFor(() => {
      const cards = screen.getAllByTestId('triage-card');
      expect(cards[0]).toHaveAttribute('data-movement-id', 'm1'); // m1 date is most recent
    });
  });
});
