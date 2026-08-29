import { render, screen, waitFor } from '@testing-library/react';
import ProcessTriagePanel from '../components/ProcessTriagePanel';
import { setupTriage, MOCK_MOVEMENTS } from './triage-test-utils';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

jest.mock('next/router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() }))
}));

describe('Triage deep link', () => {
  beforeEach(() => { setupTriage(); });
  afterEach(() => { jest.clearAllMocks(); });

  test('valid movementId highlights and scrolls to card', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} movementId="m1" />);
    const card = await waitFor(() => {
      const cards = screen.getAllByTestId('triage-card');
      const c = cards.find((x) => x.getAttribute('data-movement-id') === 'm1');
      expect(c).toBeInTheDocument();
      return c;
    });
    expect(card).toHaveClass('ring-2');
    await waitFor(() => {
      expect(window.HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    });
  });

  test('invalid movementId shows warning message', async () => {
    render(<ProcessTriagePanel profile={{ id: 'u1', name: 'Dr. Ana', role: 'advogado' }} movementId="missing" />);
    await waitFor(() => {
      expect(screen.getByTestId('triage-message')).toHaveTextContent(/não encontrada/);
    });
  });
});
