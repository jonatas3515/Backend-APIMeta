import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triage actions', () => {
  beforeEach(() => { setupTriage(); });
  afterEach(() => { jest.clearAllMocks(); });

  test('Assumir triggers PATCH with current user', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card')).find((c) => c.getAttribute('data-movement-id') === 'm1');
    const assume = card.querySelector('[data-testid="action-assume"]');
    fireEvent.click(assume);
    const confirm = await screen.findByTestId('confirm-action');
    fireEvent.click(confirm);
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/triage?id=m1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"assigned_user_id":"u1"')
        })
      );
    });
  });

  test('Atribuir triggers PATCH with selected user', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card')).find((c) => c.getAttribute('data-movement-id') === 'm1');
    const assign = card.querySelector('[data-testid="action-assign"]');
    fireEvent.click(assign);
    const select = await screen.findByTestId('assign-select');
    fireEvent.change(select, { target: { value: 'u2' } });
    fireEvent.click(screen.getByTestId('confirm-action'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/triage?id=m1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"assigned_user_id":"u2"')
        })
      );
    });
  });

  test('Iniciar análise triggers PATCH to em_analise', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card')).find((c) => c.getAttribute('data-movement-id') === 'm1');
    fireEvent.click(card.querySelector('[data-testid="action-analyze"]'));
    fireEvent.click(await screen.findByTestId('confirm-action'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/triage?id=m1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"triage_status":"em_analise"')
        })
      );
    });
  });

  test('Marcar como revisada triggers PATCH to revisado', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card')).find((c) => c.getAttribute('data-movement-id') === 'm1');
    fireEvent.click(card.querySelector('[data-testid="action-review"]'));
    fireEvent.click(await screen.findByTestId('confirm-action'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/triage?id=m1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"triage_status":"revisado"')
        })
      );
    });
  });

  test('Ignorar triggers PATCH to ignorado', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card')).find((c) => c.getAttribute('data-movement-id') === 'm1');
    fireEvent.click(card.querySelector('[data-testid="action-ignore"]'));
    fireEvent.click(await screen.findByTestId('confirm-action'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/triage?id=m1',
        expect.objectContaining({
          method: 'PATCH',
          body: expect.stringContaining('"triage_status":"ignorado"')
        })
      );
    });
  });

  test('Criar nota triggers POST with text', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card')).find((c) => c.getAttribute('data-movement-id') === 'm1');
    fireEvent.click(card.querySelector('[data-testid="action-note"]'));
    const textarea = await screen.findByTestId('note-textarea');
    fireEvent.change(textarea, { target: { value: 'Nota de teste' } });
    fireEvent.click(screen.getByTestId('confirm-action'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/triage?action=create_note',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"text":"Nota de teste"')
        })
      );
    });
  });

  test('Criar evento triggers POST with date and type', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} />);
    const card = (await screen.findAllByTestId('triage-card')).find((c) => c.getAttribute('data-movement-id') === 'm1');
    fireEvent.click(card.querySelector('[data-testid="action-event"]'));
    const date = await screen.findByTestId('event-date');
    fireEvent.change(date, { target: { value: '2024-12-25' } });
    fireEvent.change(screen.getByTestId('event-type'), { target: { value: 'prazo_judicial' } });
    fireEvent.click(screen.getByTestId('confirm-action'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/triage?action=create_event',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"event_date":"2024-12-25"')
        })
      );
    });
  });
});
