/**
 * Testes de roteamento específicos para notificações do tipo reminder.
 * Garante que lembretes ambíguos nunca façam fallback para Chat genérico.
 */

import { getNotificationRoute, normalizeNotification } from '../lib/notificationHelpers';

describe('getNotificationRoute - lembretes', () => {
  test('reminder de conversa abre Chat com conversationId e reminderId', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'conversation',
      reference_id: 'conv-synthetic-001',
      reminderId: 'conv-synthetic-001'
    });
    expect(route).toBe('/?tab=chat&conversationId=conv-synthetic-001&reminderId=conv-synthetic-001');
  });

  test('reminder de conversa usa conversationId alternativo quando reference_id não for conversa', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'conversation',
      reference_id: 'reminder-synthetic-001',
      conversationId: 'conv-synthetic-002',
      reminderId: 'reminder-synthetic-001'
    });
    expect(route).toBe('/?tab=chat&conversationId=conv-synthetic-002&reminderId=reminder-synthetic-001');
  });

  test('reminder de caso abre Casos com caseId e reminderId', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'case',
      reference_id: 'case-synthetic-001',
      reminderId: 'case-synthetic-001'
    });
    expect(route).toBe('/?tab=cases&caseId=case-synthetic-001&reminderId=case-synthetic-001');
  });

  test('reminder de caso usa caseId alternativo quando reference_type for reminder genérico', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'reminder',
      reference_id: 'reminder-synthetic-002',
      caseId: 'case-synthetic-002',
      reminderId: 'reminder-synthetic-002'
    });
    expect(route).toBe('/?tab=cases&caseId=case-synthetic-002&reminderId=reminder-synthetic-002');
  });

  test('reminder de evento abre Agenda com eventId e reminderId', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'event',
      reference_id: 'event-synthetic-001',
      reminderId: 'event-synthetic-001'
    });
    expect(route).toBe('/?tab=agenda&eventId=event-synthetic-001&reminderId=event-synthetic-001');
  });

  test('reminder de agenda usa eventId alternativo', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'reminder',
      reference_id: 'reminder-synthetic-003',
      eventId: 'event-synthetic-002',
      reminderId: 'reminder-synthetic-003'
    });
    expect(route).toBe('/?tab=agenda&eventId=event-synthetic-002&reminderId=reminder-synthetic-003');
  });

  test('reminder sem referência inequívoca retorna null', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'reminder',
      reference_id: 'reminder-synthetic-004',
      reminderId: 'reminder-synthetic-004'
    });
    expect(route).toBeNull();
  });

  test('reminder malicioso com URL não gera rota', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'conversation',
      reference_id: 'javascript:alert(1)',
      reminderId: 'javascript:alert(1)'
    });
    expect(route).toBeNull();
  });

  test('reminder com PII simples no id não gera rota', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'conversation',
      reference_id: '123.456.789-00',
      reminderId: '123.456.789-00'
    });
    expect(route).toBeNull();
  });

  test('reminder não faz fallback genérico para Chat', () => {
    const route = getNotificationRoute({
      type: 'reminder',
      reference_type: 'unknown',
      reference_id: 'some-id',
      reminderId: 'some-id'
    });
    expect(route).toBeNull();
  });

  test('normalização rejeita lembrete ambíguo e retorna null', () => {
    const raw = {
      type: 'reminder',
      reference_type: 'reminder',
      reference_id: 'reminder-synthetic-005',
      title: 'Lembrete sem referência'
    };
    expect(normalizeNotification(raw)).toBeNull();
  });
});
