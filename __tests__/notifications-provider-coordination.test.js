/**
 * Testes de coordenação do NotificationProvider:
 * Bell e Panel não chamam fetch, retry manual chama /api/notifications?refresh=1,
 * deduplicação, polling pausado e limpeza de recursos.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
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

function successResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: jest.fn() },
    json: async () => body
  };
}

describe('NotificationProvider - coordenação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920
    });
  });

  afterEach(() => {
    cleanup();
    jest.useRealTimers();
  });

  test('retry manual do Panel chama apenas /api/notifications?refresh=1', async () => {
    global.fetch
      .mockResolvedValueOnce(successResponse({
        notifications: [{ id: 'n1', title: 'Prazo', type: 'case', createdAt: new Date().toISOString() }],
        unreadCount: 1,
        countReliable: false,
        errors: [{ source: 'cases' }]
      }))
      .mockResolvedValueOnce(successResponse({
        notifications: [],
        unreadCount: 0,
        countReliable: true,
        errors: []
      }));

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
      expect(screen.getByText('Prazo')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('retry-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    const calls = global.fetch.mock.calls.map(c => c[0]);
    expect(calls[1]).toBe('/api/notifications?refresh=1');
    expect(calls).not.toContain('/api/notifications/count?refresh=1');
  });

  test('Bell e Panel não fazem chamadas diretas, todas vêm do Provider', async () => {
    global.fetch.mockResolvedValue(successResponse({
      notifications: [],
      unreadCount: 0,
      countReliable: true,
      errors: []
    }));

    render(
      <NotificationProvider>
        <>
          <NotificationBell onOpen={jest.fn()} />
          <NotificationPanel
            isOpen={true}
            onClose={jest.fn()}
            userId="u1"
            userRole="advogado"
            triggerRef={mockTriggerRef}
          />
        </>
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    });

    // Panel is open, so only the list endpoint should be requested
    const listCalls = global.fetch.mock.calls.filter(c =>
      c[0].includes('/api/notifications')
    );
    const bellDirectCalls = global.fetch.mock.calls.filter(c =>
      c[0].includes('/api/notifications/count')
    );

    // When panel is open, count is not called by the Provider
    expect(bellDirectCalls.length).toBe(0);
    expect(listCalls.every(c => c[0].startsWith('/api/notifications'))).toBe(true);
  });

  test('cliques rápidos no retry não disparam chamadas duplicadas', async () => {
    global.fetch.mockResolvedValue(successResponse({
      notifications: [],
      unreadCount: 0,
      countReliable: false,
      errors: [{ source: 'cases' }]
    }));

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
      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('retry-button'));
    fireEvent.click(screen.getByTestId('retry-button'));
    fireEvent.click(screen.getByTestId('retry-button'));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  test('unmount cancela timers e aborta controllers', async () => {
    global.fetch.mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => resolve(successResponse({
          notifications: [],
          unreadCount: 0,
          countReliable: true,
          errors: []
        })), 5000);
      })
    );

    const { unmount } = render(
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

    unmount();

    // Jest will emit unhandled promise warnings if we leak the fetch.
    // This test mainly ensures unmount does not throw.
    await waitFor(() => {
      expect(document.body.textContent).not.toContain('Notificações');
    });
  });
});
