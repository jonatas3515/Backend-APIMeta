/**
 * Testes de Roteamento de Notificações
 * Cobre: navegação segura, validação de links, tipos de notificação
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationPanel from '../components/NotificationPanel';
import { useRouter } from 'next/router';

// Mock fetch global
global.fetch = jest.fn();

// Mock Next router
jest.mock('next/router');

describe('NotificationPanel - Roteamento', () => {
  let mockPush;
  let mockOnClose;
  let mockTriggerRef;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPush = jest.fn();
    mockOnClose = jest.fn();

    useRouter.mockReturnValue({
      push: mockPush,
      pathname: '/',
      query: {},
      asPath: '/',
    });

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

  const notificationTypes = [
    {
      type: 'message',
      notification: {
        id: 'notif-1',
        type: 'message',
        title: 'Nova mensagem',
        link: '/?tab=chat&conversationId=conv-uuid-123',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=chat&conversationId=conv-uuid-123',
    },
    {
      type: 'reminder',
      notification: {
        id: 'notif-2',
        type: 'reminder',
        title: 'Lembrete',
        link: '/?tab=chat&conversationId=conv-uuid-456&reminderId=conv-uuid-456',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=chat&conversationId=conv-uuid-456&reminderId=conv-uuid-456',
    },
    {
      type: 'deadline',
      notification: {
        id: 'notif-3',
        type: 'deadline',
        title: 'Prazo próximo',
        link: '/?tab=cases&caseId=case-uuid-789',
        priority: 'high',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=cases&caseId=case-uuid-789',
    },
    {
      type: 'deadline_overdue',
      notification: {
        id: 'notif-4',
        type: 'deadline_overdue',
        title: 'Prazo vencido',
        link: '/?tab=cases&caseId=case-uuid-abc',
        priority: 'critical',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=cases&caseId=case-uuid-abc',
    },
    {
      type: 'deadline_today',
      notification: {
        id: 'notif-5',
        type: 'deadline_today',
        title: 'Prazo hoje',
        link: '/?tab=cases&caseId=case-uuid-def',
        priority: 'high',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=cases&caseId=case-uuid-def',
    },
    {
      type: 'case_critical',
      notification: {
        id: 'notif-6',
        type: 'case_critical',
        title: 'Caso crítico',
        link: '/?tab=cases&caseId=case-uuid-ghi',
        priority: 'critical',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=cases&caseId=case-uuid-ghi',
    },
    {
      type: 'event_today',
      notification: {
        id: 'notif-7',
        type: 'event_today',
        title: 'Evento hoje',
        link: '/?tab=agenda&eventId=event-uuid-jkl',
        priority: 'high',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=agenda&eventId=event-uuid-jkl',
    },
    {
      type: 'process_movement',
      notification: {
        id: 'notif-8',
        type: 'process_movement',
        title: 'Movimentação processual',
        link: '/?tab=triage&movementId=process-uuid-mno',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=triage&movementId=process-uuid-mno',
    },
    {
      type: 'signature',
      notification: {
        id: 'notif-9',
        type: 'signature',
        title: 'Assinatura pendente',
        link: '/?tab=users&view=signatures&signatureId=sig-uuid-pqr',
        priority: 'normal',
        createdAt: new Date().toISOString(),
      },
      expectedRoute: '/?tab=users&view=signatures&signatureId=sig-uuid-pqr',
    },
  ];

  notificationTypes.forEach(({ type, notification, expectedRoute }) => {
    test(`${type} → navega para ${expectedRoute}`, async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notifications: [notification] }),
      });

      render(
        <NotificationPanel
          isOpen={true}
          onClose={mockOnClose}
          userId="user-123"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(notification.title)).toBeInTheDocument();
      });

      const verButtons = screen.getAllByText('Ver');
      fireEvent.click(verButtons[0]);

      expect(mockPush).toHaveBeenCalledWith(expectedRoute);
      expect(mockPush).toHaveBeenCalledTimes(1);
    });
  });

  test('painel fecha após a navegação', async () => {
    const notification = {
      id: 'notif-1',
      type: 'message',
      title: 'Nova mensagem',
      link: '/?tab=chat&conversationId=conv-123',
      priority: 'normal',
      createdAt: new Date().toISOString(),
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    const verButtons = screen.getAllByText('Ver');
    fireEvent.click(verButtons[0]);

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  test('não é feita navegação externa', async () => {
    const maliciousNotifications = [
      {
        id: 'mal-1',
        type: 'message',
        title: 'Link externo HTTP',
        link: 'http://evil.com/steal',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'mal-2',
        type: 'message',
        title: 'Link externo HTTPS',
        link: 'https://evil.com/phishing',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'mal-3',
        type: 'message',
        title: 'JavaScript injection',
        link: 'javascript:alert("xss")',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'mal-4',
        type: 'message',
        title: 'Data URI',
        link: 'data:text/html,<script>alert("xss")</script>',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'mal-5',
        type: 'message',
        title: 'Protocol-relative',
        link: '//evil.com/redirect',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
    ];

    for (const notification of maliciousNotifications) {
      mockPush.mockClear();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notifications: [notification] }),
      });

      const { unmount } = render(
        <NotificationPanel
          isOpen={true}
          onClose={mockOnClose}
          userId="user-123"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(notification.title)).toBeInTheDocument();
      });

      // Link malicioso não deve ativar roteamento
      const verButtons = screen.getAllByText('Ver');
      expect(verButtons[0]).toBeDisabled();
      fireEvent.click(verButtons[0]);

      expect(mockPush).not.toHaveBeenCalled();

      unmount();
    }
  });

  test('link não pode carregar token, assinatura, storage_path ou URL externa', async () => {
    const sensitiveNotifications = [
      {
        id: 'sens-1',
        type: 'message',
        title: 'Com token',
        link: '/?conversation=123&token=secret-token-abc',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'sens-2',
        type: 'signature',
        title: 'Com assinatura',
        link: '/?signatures=true&signature=base64-signature',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
      {
        id: 'sens-3',
        type: 'message',
        title: 'Com storage path',
        link: '/?conversation=123&storage_path=/private/files/doc.pdf',
        priority: 'normal',
        created_at: new Date().toISOString(),
      },
    ];

    for (const notification of sensitiveNotifications) {
      mockPush.mockClear();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ notifications: [notification] }),
      });

      const { unmount } = render(
        <NotificationPanel
          isOpen={true}
          onClose={mockOnClose}
          userId="user-123"
          userRole="advogado"
          triggerRef={mockTriggerRef}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(notification.title)).toBeInTheDocument();
      });

      const verButtons = screen.getAllByText('Ver');
      expect(verButtons[0]).toBeDisabled();
      fireEvent.click(verButtons[0]);

      // Links com dados sensíveis devem ser bloqueados
      expect(mockPush).not.toHaveBeenCalled();

      unmount();
    }
  });

  test('um item sem link válido não chama router.push', async () => {
    const notification = {
      id: 'notif-no-link',
      type: 'message',
      title: 'Sem link',
      link: null,
      priority: 'normal',
      created_at: new Date().toISOString(),
    };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ notifications: [notification] }),
    });

    render(
      <NotificationPanel
        isOpen={true}
        onClose={mockOnClose}
        userId="user-123"
        userRole="advogado"
        triggerRef={mockTriggerRef}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(notification.title)).toBeInTheDocument();
    });

    const verButtons = screen.getAllByText('Ver');
    fireEvent.click(verButtons[0]);

    // Não deve ter chamado router.push
    expect(mockPush).not.toHaveBeenCalled();
  });
});
