/**
 * Testes de sessão expirada (401/403) nas notificações.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

function createAuthResponse(status) {
  return {
    ok: false,
    status,
    headers: { get: jest.fn() }
  };
}

describe('Notificações - sessão expirada', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920
    });
  });

  test('401 exibe mensagem de sessão expirada e limpa badge', async () => {
    global.fetch.mockResolvedValue(createAuthResponse(401));

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
      expect(screen.getByTestId('auth-expired-message')).toBeInTheDocument();
    });

    expect(screen.getByTestId('auth-expired-message')).toHaveTextContent(
      'Sua sessão expirou. Entre novamente.'
    );
    expect(screen.queryByTestId('all-caught-up')).not.toBeInTheDocument();
    expect(screen.queryByText('Você está em dia!')).not.toBeInTheDocument();
  });

  test('403 também exibe sessão expirada', async () => {
    global.fetch.mockResolvedValue(createAuthResponse(403));

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
      expect(screen.getByTestId('auth-expired-message')).toHaveTextContent(
        'Sua sessão expirou. Entre novamente.'
      );
    });
  });

  test('Bell fica vazio/sem contagem confiável quando sessão expira', async () => {
    global.fetch.mockResolvedValue(createAuthResponse(401));

    render(
      <NotificationProvider>
        <NotificationBell onOpen={jest.fn()} />
      </NotificationProvider>
    );

    await waitFor(() => {
      const badge = document.querySelector('[data-testid="notification-badge"]');
      expect(badge).not.toBeInTheDocument();
    });

    const button = screen.getByTestId('notification-bell');
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-label', expect.stringContaining('atualização parcial'));
    });
  });
});
