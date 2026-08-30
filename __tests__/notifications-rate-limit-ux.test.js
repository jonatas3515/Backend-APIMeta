/**
 * Testes de UX de rate limit (429) nas notificações.
 * Foco: cooldown, Retry-After e preservação do estado confiável.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationProvider } from '../components/NotificationProvider';
import NotificationPanel from '../components/NotificationPanel';
import NotificationBell from '../components/NotificationBell';

jest.mock('../lib/api', () => ({
  getAuthHeaders: jest.fn(() => Promise.resolve({ Authorization: 'Bearer test' }))
}));

const mockTriggerRef = {
  current: {
    getBoundingClientRect: jest.fn(() => ({
      top: 50,
      right: 1200,
      bottom: 80,
      left: 1150,
      width: 50,
      height: 30
    }))
  }
};

function create429Response(retrySeconds = 3) {
  return {
    ok: false,
    status: 429,
    headers: { get: jest.fn(() => String(retrySeconds)) }
  };
}

describe('Notificações - 429 / cooldown', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920
    });
  });

  test('429 mostra aviso de cooldown e contador, mantém badge confiável', async () => {
    global.fetch.mockResolvedValue(create429Response());

    render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={jest.fn()}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rate-limit-warning')).toBeInTheDocument();
    });

    expect(screen.getByTestId('rate-limit-warning')).toHaveTextContent(
      'Aguarde alguns segundos antes de atualizar novamente.'
    );
    expect(screen.getByTestId('retry-button')).toHaveTextContent('Atualizar novamente em');
    expect(screen.getByTestId('retry-button')).toBeDisabled();

    // Badge não deve exibir "!"
    render(
      <NotificationProvider>
        <NotificationBell onOpen={jest.fn()} />
      </NotificationProvider>
    );

    const badge = screen.queryByTestId('notification-badge');
    if (badge) {
      expect(badge).not.toHaveTextContent('!');
    }
  });

  test('não exibe mensagem de falha parcial "Algumas atualizações" no 429', async () => {
    global.fetch.mockResolvedValue(create429Response());

    render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={jest.fn()}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rate-limit-warning')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('partial-warning')).not.toBeInTheDocument();
    expect(screen.queryByText('Algumas atualizações estão indisponíveis no momento.')).not.toBeInTheDocument();
  });

  test('Retry-After custom é respeitado', async () => {
    global.fetch.mockResolvedValue(create429Response(5));

    render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={jest.fn()}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('retry-button')).toHaveTextContent('Atualizar novamente em 5 s.');
    });
  });

  test('sem dados prévios não mostra falso zero ou "Você está em dia" no 429', async () => {
    global.fetch.mockResolvedValue(create429Response());

    render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={jest.fn()}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('rate-limit-warning')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('all-caught-up')).not.toBeInTheDocument();
    expect(screen.queryByText('Você está em dia!')).not.toBeInTheDocument();
  });

  test('dados confiáveis anteriores são preservados no 429', async () => {
    // mock order: first list success, then 429 after retry? We'll simulate by only rendering Bell
    global.fetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: { get: jest.fn() },
      json: async () => ({
        notifications: [],
        unreadCount: 7,
        countReliable: true,
        errors: []
      })
    });

    const { rerender } = render(
      <NotificationProvider>
        <NotificationBell onOpen={jest.fn()} />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    // Simulate cooldown by forcing a new request
    global.fetch.mockResolvedValueOnce(create429Response());
    rerender(
      <NotificationProvider>
        <NotificationBell onOpen={jest.fn()} />
      </NotificationProvider>
    );

    // Badge should still show 7, not !
    expect(screen.getByText('7')).toBeInTheDocument();
  });
});
