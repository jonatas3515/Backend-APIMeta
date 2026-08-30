/**
 * Testes de retry manual, concorrência, 429 e ciclo de vida.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationBell from '../components/NotificationBell';
import NotificationPanel from '../components/NotificationPanel';
import { NotificationProvider } from '../components/NotificationProvider';

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

function mockResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data
  };
}

describe('NotificationPanel - retry e concorrência', () => {
  let mockOnClose;
  let resolveFetch;
  let fetchCalls;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnClose = jest.fn();
    fetchCalls = [];

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920
    });

    global.fetch = jest.fn((url) => {
      let resolve;
      const promise = new Promise((res) => {
        resolve = res;
      });
      fetchCalls.push({ url, resolve });
      return promise;
    });

    resolveFetch = (callIndex, data) => {
      if (fetchCalls[callIndex]) {
        fetchCalls[callIndex].resolve(mockResponse(data));
      }
    };
  });

  it('botão "Atualizar agora" chama /api/notifications?refresh=1 uma única vez por clique', async () => {
    render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={mockOnClose}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(fetchCalls.length).toBe(1);
    });
    resolveFetch(0, { notifications: [], unreadCount: 0, countReliable: false, errors: [{ source: 'cases' }] });

    await waitFor(() => {
      expect(screen.getByText('Atualizar agora')).toBeInTheDocument();
    });

    const retryButton = screen.getByText('Atualizar agora');
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(fetchCalls.length).toBe(2);
    });

    expect(fetchCalls[1].url).toBe('/api/notifications?refresh=1');
  });

  it('429 mantém itens e exibe mensagem segura', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          notifications: [
            {
              id: 'notif-1',
              type: 'message',
              title: 'Mensagem',
              link: '/?tab=chat&conversationId=conv-123',
              priority: 'normal',
              createdAt: new Date().toISOString()
            }
          ],
          unreadCount: 1,
          countReliable: false,
          errors: [{ source: 'cases' }]
        })
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({})
      });

    render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={mockOnClose}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Mensagem')).toBeInTheDocument();
    });

    const retryButton = await waitFor(() => screen.getByText('Atualizar agora'));
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Aguarde um instante antes de atualizar novamente.')).toBeInTheDocument();
    });

    expect(screen.getByText('Mensagem')).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível carregar/i)).not.toBeInTheDocument();
  });

  it('resposta antiga não sobrescreve a mais nova', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('?refresh=1')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            notifications: [
              {
                id: 'notif-2',
                type: 'message',
                title: 'Nova atualização',
                link: '/?tab=chat&conversationId=conv-2',
                priority: 'normal',
                createdAt: new Date().toISOString()
              }
            ],
            unreadCount: 1,
            countReliable: true,
            errors: []
          })
        });
      }
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 200,
            json: async () => ({
              notifications: [
                {
                  id: 'notif-1',
                  type: 'message',
                  title: 'Dados antigos',
                  link: '/?tab=chat&conversationId=conv-1',
                  priority: 'normal',
                  createdAt: new Date().toISOString()
                }
              ],
              unreadCount: 1,
              countReliable: false,
              errors: [{ source: 'cases' }]
            })
          });
        }, 100);
      });
    });

    render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={mockOnClose}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    const retryButton = await waitFor(() => screen.getByText('Atualizar agora'));
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Nova atualização')).toBeInTheDocument();
    });

    jest.advanceTimersByTime(200);

    await waitFor(() => {
      expect(screen.queryByText('Dados antigos')).not.toBeInTheDocument();
    });
  });

  it('desmontar cancela fetch pendente sem estourar', async () => {
    let resolvePromise;
    global.fetch = jest.fn(() => new Promise((resolve) => {
      resolvePromise = resolve;
    }));

    const { unmount } = render(
      <NotificationProvider>
        <NotificationPanel
          isOpen={true}
          onClose={mockOnClose}
          userId="u1"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    unmount();

    // Resolução tardia não deve causar erro na componente desmontada
    resolvePromise({ ok: true, status: 200, json: async () => ({ notifications: [], unreadCount: 0, countReliable: true, errors: [] }) });
  });
});

describe('NotificationBell - polling não concorre com refresh manual', () => {
  let fetchCount;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    fetchCount = 0;

    global.fetch = jest.fn(() => {
      fetchCount += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ unreadCount: fetchCount, countReliable: true, errors: [] })
      });
    });

    Object.defineProperty(document, 'hidden', {
      writable: true,
      configurable: true,
      value: false
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('pausa polling quando aba fica oculta', async () => {
    render(
      <NotificationProvider>
        <NotificationBell userId="u1" userRole="advogado" onOpen={jest.fn()} />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    act(() => {
      document.hidden = true;
      document.dispatchEvent(new Event('visibilitychange'));
    });

    act(() => {
      jest.advanceTimersByTime(60000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    act(() => {
      document.hidden = false;
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
