/**
 * Testes do NotificationBell - Badge de notificações
 * Cobre: contagem, polling, acessibilidade, cleanup
 */

import React from 'react';
import { renderWithNotifications, screen, waitFor, act, fireEvent } from './helpers/renderWithNotificationProvider';
import '@testing-library/jest-dom';
import NotificationBell from '../components/NotificationBell';

// Mock auth headers
jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({
    Authorization: 'Bearer test-token',
    'Content-Type': 'application/json'
  }))
}));

// Mock fetch global
global.fetch = jest.fn();

describe('NotificationBell - Badge', () => {
  let mockOnOpen;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockOnOpen = jest.fn();
    global.fetch.mockClear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('renderiza botão acessível com aria-label adequado', () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 0 }),
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-label');
    expect(button.getAttribute('aria-label')).toContain('Notificações');
  });

  test('não renderiza badge quando unreadCount = 0', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 0 }),
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications/count',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        })
      );
    });

    // Badge não deve estar visível
    const badge = screen.queryByText(/\d+/);
    expect(badge).not.toBeInTheDocument();
  });

  test('renderiza contagem de 1 a 99 normalmente', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 42 }),
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      const badge = screen.getByText('42');
      expect(badge).toBeInTheDocument();
    });
  });

  test('renderiza "99+" quando unreadCount > 99', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 150 }),
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      const badge = screen.getByText('99+');
      expect(badge).toBeInTheDocument();
    });
  });

  test('chama /api/notifications/count na montagem para usuário autenticado', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 5 }),
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/notifications/count',
        expect.objectContaining({
          headers: {
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          },
        })
      );
    });
  });

  test('não envia headers forjados x-user-id ou x-user-role', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 0 }),
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    const call = global.fetch.mock.calls[0];
    expect(call[1].headers).not.toHaveProperty('x-user-id');
    expect(call[1].headers).not.toHaveProperty('x-user-role');
    expect(call[1].headers).toHaveProperty('Authorization');
  });

  test('atualiza a contagem após 30 segundos com fake timers', async () => {
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unreadCount: 5 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ unreadCount: 10 }),
      });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    // Primeira chamada
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    // Avançar 30 segundos
    act(() => {
      jest.advanceTimersByTime(30000);
    });

    // Segunda chamada
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  test('limpa corretamente o setInterval ao desmontar', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ unreadCount: 5 }),
    });

    const { unmount } = renderWithNotifications(
      <NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Desmontar
    unmount();

    // Avançar tempo
    act(() => {
      jest.advanceTimersByTime(60000);
    });

    // Não deve ter chamado novamente
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('em falha de endpoint, não quebra o header e não mostra contagem enganosa', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Componente deve renderizar sem badge
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();

    // Não deve mostrar badge
    const badge = screen.queryByText(/\d+/);
    expect(badge).not.toBeInTheDocument();
  });

  test('trata erro 429 (rate limit) silenciosamente', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Componente deve renderizar sem badge
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();

    // Não deve mostrar badge
    const badge = screen.queryByText(/\d+/);
    expect(badge).not.toBeInTheDocument();
  });

  test('ao clicar no sino, chama onOpen exatamente uma vez', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 5 }),
    });

    renderWithNotifications(<NotificationBell userId="user-123" userRole="advogado" onOpen={mockOnOpen} />);

    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockOnOpen).toHaveBeenCalledTimes(1);
  });
});
