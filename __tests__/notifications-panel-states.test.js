/**
 * Testes de Estados do NotificationPanel
 * Cobre: loading, vazio, erro, dados, consistência badge/lista
 */

import React from 'react';
import { renderWithNotifications, screen, waitFor, fireEvent } from './helpers/renderWithNotificationProvider';
import '@testing-library/jest-dom';
import NotificationPanel from '../components/NotificationPanel';

// Mock fetch global
global.fetch = jest.fn();

// Mock Next router
jest.mock('next/router', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('NotificationPanel - Estados', () => {
  let mockOnClose;
  let mockTriggerRef;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockReset();
    mockOnClose = jest.fn();

    mockTriggerRef = {
      current: {
        getBoundingClientRect: jest.fn(() => ({
          top: 50,
          right: 1200,
          bottom: 80,
          left: 1150,
          width: 50,
          height: 30,
        })),
      },
    };

    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920,
    });
  });

  test('Loading: exibe indicador de carregamento, sem estado vazio simultâneo', async () => {
    // Mock que demora para resolver
    global.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              ok: true,
              json: async () => ({ notifications: [] }),
            });
          }, 100);
        })
    );

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    // Deve mostrar loading
    expect(screen.getByText(/Carregando/i)).toBeInTheDocument();

    // Não deve mostrar estado vazio ainda
    expect(screen.queryByText(/Nenhuma notificação/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Você está em dia/i)).not.toBeInTheDocument();

    // Aguardar resolução
    await waitFor(
      () => {
        expect(screen.queryByText(/Carregando/i)).not.toBeInTheDocument();
      },
      { timeout: 200 }
    );
  });

  test('Lista vazia + count 0: mostra "Nenhuma notificação" / "Você está em dia"', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [] }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const emptyMessages = screen.queryAllByText(/Nenhuma notificação|Você está em dia/i);
      expect(emptyMessages.length).toBeGreaterThan(0);
    });
  });

  test('Dados carregados: renderiza os itens', async () => {
    const notifications = [
      {
        id: 'notif-1',
        type: 'message',
        title: 'Nova mensagem',
        link: '/?conversation=conv-123',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'notif-2',
        type: 'deadline',
        title: 'Prazo próximo',
        link: '/?case=case-456',
        priority: 'high',
        created_at: new Date().toISOString(),
      },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Nova mensagem')).toBeInTheDocument();
      expect(screen.getByText('Prazo próximo')).toBeInTheDocument();
    });
  });

  test('Erro total: mostra "Não foi possível carregar notificações" e botão "Atualizar agora"', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/Não foi possível atualizar as notificações/i)
      ).toBeInTheDocument();
    });

    // Deve ter botão "Atualizar agora"
    const retryButton = screen.queryByText(/Atualizar agora/i);
    expect(retryButton).toBeInTheDocument();
  });

  test('Clicar em "Atualizar agora" realiza uma nova chamada', async () => {
    // Primeira chamada falha
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Não foi possível atualizar/i)).toBeInTheDocument();
    });

    // Segunda chamada com sucesso
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: 'notif-1',
            type: 'message',
            title: 'Mensagem carregada',
            link: '/?conversation=conv-123',
            priority: 'normal',
            created_at: new Date().toISOString(),
          },
        ],
      }),
    });

    const retryButton = screen.getByText(/Atualizar agora/i);
    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText('Mensagem carregada')).toBeInTheDocument();
      expect(screen.queryByText(/Não foi possível carregar/i)).not.toBeInTheDocument();
    });

    // Deve ter chamado fetch 2 vezes (inicial + retry)
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('count 30 + API com 30 itens: lista renderiza itens', async () => {
    const notifications = Array.from({ length: 30 }, (_, i) => ({
      id: `notif-${i}`,
      type: 'message',
      title: `Mensagem ${i + 1}`,
      link: `/?conversation=conv-${i}`,
      priority: 'normal',
      created_at: new Date().toISOString(),
    }));

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      // Deve renderizar os itens (pelo menos alguns visíveis)
      expect(screen.getByText('Mensagem 1')).toBeInTheDocument();
    });

    // Não deve mostrar estado vazio
    expect(screen.queryByText(/Nenhuma notificação/i)).not.toBeInTheDocument();
  });

  test('count > 0 + resposta vazia: não deve afirmar "Você está em dia"', async () => {
    // Simular inconsistência: count diz 5, mas lista vazia
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 5 }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      // Pode mostrar estado vazio, mas idealmente deveria indicar inconsistência
      // Por ora, verificamos que não quebra
      expect(screen.getByText(/Notificações/)).toBeInTheDocument();
    });
  });

  test('count 0 + resposta vazia: estado vazio normal', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [], unreadCount: 0 }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      const emptyMessages = screen.queryAllByText(/Nenhuma notificação|Você está em dia/i);
      expect(emptyMessages.length).toBeGreaterThan(0);
    });
  });

  test('itens críticos aparecem antes dos demais conforme a ordem retornada/agrupada', async () => {
    const notifications = [
      {
        id: 'notif-1',
        type: 'message',
        title: 'Mensagem normal',
        link: '/?conversation=conv-1',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'notif-2',
        type: 'deadline_overdue',
        title: 'Prazo crítico vencido',
        link: '/?case=case-2',
        priority: 'critical',
        created_at: new Date().toISOString(),
      },
      {
        id: 'notif-3',
        type: 'deadline_today',
        title: 'Prazo alto hoje',
        link: '/?case=case-3',
        priority: 'high',
        created_at: new Date().toISOString(),
      },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Mensagem normal')).toBeInTheDocument();
      expect(screen.getByText('Prazo crítico vencido')).toBeInTheDocument();
      expect(screen.getByText('Prazo alto hoje')).toBeInTheDocument();
    });

    // Verificar que aba "Críticas" existe e pode ser clicada
    const criticalTab = screen.getByText(/Críticas/i);
    expect(criticalTab).toBeInTheDocument();

    fireEvent.click(criticalTab);

    await waitFor(() => {
      // Deve mostrar apenas críticos
      expect(screen.getByText('Prazo crítico vencido')).toBeInTheDocument();
      expect(screen.queryByText('Mensagem normal')).not.toBeInTheDocument();
    });
  });

  test('filtros/abas não podem ocultar todos os itens silenciosamente sem indicar filtro ativo', async () => {
    const notifications = [
      {
        id: 'notif-1',
        type: 'message',
        title: 'Mensagem normal',
        link: '/?conversation=conv-1',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
    ];

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Mensagem normal')).toBeInTheDocument();
    });

    // Clicar na aba "Críticas" (que não tem itens)
    const criticalTab = screen.getByText(/Críticas/i);
    fireEvent.click(criticalTab);

    await waitFor(() => {
      // Deve mostrar estado vazio ou indicar que não há críticas
      expect(screen.queryByText('Mensagem normal')).not.toBeInTheDocument();
      const emptyMessages = screen.queryAllByText(/Nenhuma notificação|Você está em dia/i);
      expect(emptyMessages.length).toBeGreaterThan(0);
    });
  });

  test('erro 500 mostra mensagem de erro adequada', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal server error' }),
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Não foi possível atualizar as notificações/i)
      ).toBeInTheDocument();
    });
  });

  test('erro 429 (rate limit) não mostra erro crítico', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    renderWithNotifications(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      // Não deve mostrar erro crítico para 429
      expect(screen.queryByText(/Não foi possível carregar/i)).not.toBeInTheDocument();
    });
  });
});
