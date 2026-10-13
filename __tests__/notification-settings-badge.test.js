import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockMaybeNotify = jest.fn();
const mockGetPermission = jest.fn(() => 'granted');
const mockIsSupported = jest.fn(() => true);
const mockApiJson = jest.fn();

jest.mock('../lib/notifications', () => ({
  isSupported: () => mockIsSupported(),
  getPermission: () => mockGetPermission(),
  requestPermission: jest.fn(() => Promise.resolve('granted')),
  maybeNotify: (...args) => mockMaybeNotify(...args)
}));

jest.mock('../lib/apiClient', () => ({
  apiJson: (...args) => mockApiJson(...args),
  apiCall: jest.fn()
}));

const NotificationSettings = require('../components/NotificationSettings').default;

describe('NotificationSettings - status do navegador e teste', () => {
  beforeEach(() => {
    mockMaybeNotify.mockReset();
    mockApiJson.mockReset();
    mockGetPermission.mockReturnValue('granted');
    mockIsSupported.mockReturnValue(true);
  });

  test('badge verde e botao de teste quando permissao concedida', async () => {
    mockApiJson.mockResolvedValue({ enabled: true, notify_messages: true });
    render(<NotificationSettings />);

    const badge = await screen.findByTestId('browser-permission-badge');
    expect(badge).toHaveTextContent('Notificações permitidas');
    expect(badge.className).toContain('bg-green-50');
  });

  test('botao de teste chama maybeNotify com preferencias do usuario', async () => {
    mockApiJson.mockResolvedValue({ enabled: true, notify_messages: true });
    render(<NotificationSettings />);

    const btn = await screen.findByTestId('btn-test-notification');
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockMaybeNotify).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Teste de Notificação',
        preferences: { enabled: true, notify_messages: true }
      }));
    });
    expect(await screen.findByTestId('btn-test-notification')).toHaveTextContent('enviada');
  });

  test('badge vermelho e sem botao quando bloqueado', async () => {
    mockGetPermission.mockReturnValue('denied');
    mockApiJson.mockResolvedValue({});
    render(<NotificationSettings />);

    const badge = await screen.findByTestId('browser-permission-badge');
    expect(badge).toHaveTextContent('bloqueadas');
    expect(screen.queryByTestId('btn-test-notification')).not.toBeInTheDocument();
    expect(screen.getByText(/ícone do cadeado/)).toBeInTheDocument();
  });

  test('badge amarelo e botao de autorizar quando pendente', async () => {
    mockGetPermission.mockReturnValue('default');
    mockApiJson.mockResolvedValue({});
    render(<NotificationSettings />);

    const badge = await screen.findByTestId('browser-permission-badge');
    expect(badge).toHaveTextContent('Permissão pendente');
    expect(screen.getByText('Autorizar no Navegador')).toBeInTheDocument();
  });
});
