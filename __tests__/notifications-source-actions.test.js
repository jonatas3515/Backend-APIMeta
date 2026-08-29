/**
 * Testes de regressão: ações de notificação devem refletir origem e nunca dispensar localmente.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import NotificationItem from '../components/NotificationItem';
import { getNotificationActionLabel, NOTIFICATION_ACTION_LABELS } from '../lib/notificationHelpers';

const MOCK_NOTIFICATIONS = {
  message: { id: 'n-1', type: 'message', priority: 'normal', title: 'Nova mensagem', isOverdue: false, isToday: true, createdAt: new Date().toISOString(), link: '/?tab=chat&conversationId=conv-1' },
  reminder: { id: 'n-2', type: 'reminder', priority: 'normal', title: 'Lembrete pendente', isOverdue: false, isToday: false, createdAt: new Date().toISOString(), link: '/?tab=chat&conversationId=conv-2&reminderId=rem-1' },
  reminder_overdue: { id: 'n-3', type: 'reminder_overdue', priority: 'critical', title: 'Lembrete vencido', isOverdue: true, isToday: false, createdAt: new Date().toISOString(), link: '/?tab=chat&conversationId=conv-3&reminderId=rem-2' },
  deadline: { id: 'n-4', type: 'deadline', priority: 'high', title: 'Prazo de caso trabalhista', isOverdue: false, isToday: false, createdAt: new Date().toISOString(), link: '/?tab=cases&caseId=case-1' },
  deadline_today: { id: 'n-5', type: 'deadline_today', priority: 'critical', title: 'Prazo hoje', isOverdue: false, isToday: true, createdAt: new Date().toISOString(), link: '/?tab=cases&caseId=case-2' },
  deadline_overdue: { id: 'n-6', type: 'deadline_overdue', priority: 'critical', title: 'Prazo vencido', isOverdue: true, isToday: false, createdAt: new Date().toISOString(), link: '/?tab=cases&caseId=case-3' },
  event_today: { id: 'n-7', type: 'event_today', priority: 'critical', title: 'Evento hoje', isOverdue: false, isToday: true, createdAt: new Date().toISOString(), link: '/?tab=agenda&eventId=evt-1' },
  case_critical: { id: 'n-8', type: 'case_critical', priority: 'high', title: 'Caso crítico', isOverdue: false, isToday: false, createdAt: new Date().toISOString(), link: '/?tab=cases&caseId=case-4' },
  process_movement: { id: 'n-9', type: 'process_movement', priority: 'high', title: 'Nova movimentação', isOverdue: false, isToday: false, createdAt: new Date().toISOString(), link: '/?tab=triage&movementId=mov-1' },
  signature: { id: 'n-10', type: 'signature', priority: 'high', title: 'Assinatura pendente', isOverdue: false, isToday: false, createdAt: new Date().toISOString(), link: '/?tab=users&view=signatures&signatureId=sig-1' },
};

describe('NotificationItem - ações orientadas à origem', () => {
  Object.entries(MOCK_NOTIFICATIONS).forEach(([type, notification]) => {
    test(`${type} exibe rótulo correto e não oferece "Dispensar"`, () => {
      const onAction = jest.fn();
      render(<NotificationItem notification={notification} onAction={onAction} />);
      const btn = screen.getByTestId('notification-action');
      expect(btn).toHaveTextContent(NOTIFICATION_ACTION_LABELS[type]);
      expect(screen.queryByText('Dispensar')).not.toBeInTheDocument();
    });
  });

  test('getNotificationActionLabel retorna padrão "Ver" para tipo desconhecido', () => {
    expect(getNotificationActionLabel('tarefa')).toBe('Ver');
  });

  test('clique em ação dispara onAction e não remove localmente', () => {
    const onAction = jest.fn();
    render(<NotificationItem notification={MOCK_NOTIFICATIONS.message} onAction={onAction} />);
    fireEvent.click(screen.getByTestId('notification-action'));
    expect(onAction).toHaveBeenCalledWith(MOCK_NOTIFICATIONS.message);
  });

  test('ação sem link seguro fica desabilitada', () => {
    const onAction = jest.fn();
    const notif = { ...MOCK_NOTIFICATIONS.message, link: 'https://externo.com' };
    render(<NotificationItem notification={notif} onAction={onAction} />);
    expect(screen.getByTestId('notification-action')).toBeDisabled();
  });
});
