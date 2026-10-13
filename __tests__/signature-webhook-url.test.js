import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SignatureSettings from '../components/SignatureSettings';

const mockApiJson = jest.fn();
jest.mock('../lib/apiClient', () => ({
  apiJson: (...args) => mockApiJson(...args),
  apiCall: jest.fn()
}));

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

describe('SignatureSettings - URL do webhook ZapSign', () => {
  beforeEach(() => {
    mockApiJson.mockReset();
    mockApiJson.mockResolvedValue({ integrations: [] });
  });

  test('exibe a URL do webhook derivada do dominio atual', async () => {
    render(<SignatureSettings />);
    const card = await screen.findByTestId('webhook-url-card');
    expect(card).toBeInTheDocument();
    expect(screen.getByTestId('webhook-url').textContent).toBe(`${window.location.origin}/api/signatures/webhook`);
    expect(card.textContent).toMatch(/ZapSign/);
  });

  test('botao copia a URL e mostra feedback visual', async () => {
    const writeText = jest.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    render(<SignatureSettings />);
    await screen.findByTestId('webhook-url-card');

    fireEvent.click(screen.getByTestId('btn-copy-webhook'));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/api/signatures/webhook`);
      expect(screen.getByTestId('btn-copy-webhook')).toHaveTextContent('Copiado');
    });

    delete navigator.clipboard;
  });
});
