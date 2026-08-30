/**
 * Testes de estados parciais e rótulos seguros de notificações.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { getSafeSourceLabels } from '../lib/notificationHelpers';
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

describe('getSafeSourceLabels', () => {
  it('retorna rótulos amigáveis e deduplica categorias', () => {
    const errors = [
      { source: 'deadlines' },
      { source: 'events' },
      { source: 'cases' }
    ];
    expect(getSafeSourceLabels(errors)).toBe('Prazos e eventos, Casos');
  });

  it('nunca vaza nome técnico ou source não mapeado', () => {
    const errors = [
      { source: 'process_movements' },
      { source: 'unknown_source' },
      { source: 'reminders' }
    ];
    const label = getSafeSourceLabels(errors);
    expect(label).not.toContain('process_movements');
    expect(label).not.toContain('unknown_source');
    expect(label).toContain('Atualizações processuais');
    expect(label).toContain('Lembretes');
  });

  it('usa mensagem genérica quando há mais de três fontes', () => {
    const errors = [
      { source: 'messages' },
      { source: 'reminders' },
      { source: 'cases' },
      { source: 'signatures' },
      { source: 'deadlines' }
    ];
    expect(getSafeSourceLabels(errors)).toBe(
      'Algumas fontes de atualização estão indisponíveis.'
    );
  });
});

describe('NotificationBell - estado parcial', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch.mockClear();
  });

  it('mostra "!" amarelo e aria-label quando countReliable é false', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unreadCount: 5, countReliable: false, errors: [{ source: 'cases' }] })
    });

    render(
      <NotificationProvider>
        <NotificationBell userId="u1" userRole="advogado" onOpen={jest.fn()} />
      </NotificationProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('!')).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('atualização parcial')
    );
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('contagem indisponível')
    );
  });
});

describe('NotificationPanel - estado parcial', () => {
  let mockOnClose;

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnClose = jest.fn();
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1920
    });
  });

  it('exibe aviso seguro e categorias, sem mostrar nomes técnicos', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [
          {
            id: 'notif-1',
            type: 'message',
            title: 'Nova mensagem',
            link: '/?tab=chat&conversationId=conv-123',
            priority: 'normal',
            createdAt: new Date().toISOString()
          }
        ],
        unreadCount: 1,
        countReliable: false,
        errors: [
          { source: 'deadlines' },
          { source: 'process_movements' }
        ]
      })
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
      expect(screen.getByTestId('partial-warning')).toBeInTheDocument();
    });

    const warning = screen.getByTestId('partial-warning');
    expect(warning).toHaveTextContent('Algumas atualizações estão indisponíveis no momento.');
    expect(screen.getByTestId('partial-categories')).toHaveTextContent('Prazos e eventos');
    expect(screen.getByTestId('partial-categories')).toHaveTextContent('Atualizações processuais');
    expect(screen.getByTestId('partial-categories')).not.toHaveTextContent('process_movements');
    expect(screen.getByText('Atualizar agora')).toBeInTheDocument();

    expect(screen.queryByText('Você está em dia!')).not.toBeInTheDocument();
    expect(screen.getByText('Nova mensagem')).toBeInTheDocument();
  });

  it('não exibe "Você está em dia" quando countReliable é false', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        notifications: [],
        unreadCount: 0,
        countReliable: false,
        errors: [{ source: 'reminders' }]
      })
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
      expect(screen.getByTestId('count-unavailable')).toBeInTheDocument();
    });

    expect(screen.queryByText('Você está em dia!')).not.toBeInTheDocument();
  });
});
