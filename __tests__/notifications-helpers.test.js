/**
 * Testes - Notification Helpers
 * Testa funções auxiliares de notificações
 */

import {
  sanitizeNotificationTitle,
  prioritizeNotification,
  getNotificationRoute,
  formatRelativeDate,
  isToday,
  isOverdue,
  groupNotifications,
  formatBadgeCount
} from '../lib/notificationHelpers';

describe('Notification Helpers', () => {
  describe('prioritizeNotification', () => {
    test('overdue items are critical', () => {
      expect(prioritizeNotification({}, 'deadline_overdue')).toBe('critical');
      expect(prioritizeNotification({}, 'reminder_overdue')).toBe('critical');
    });

    test('today items are critical', () => {
      expect(prioritizeNotification({}, 'deadline_today')).toBe('critical');
      expect(prioritizeNotification({}, 'event_today')).toBe('critical');
    });

    test('critical cases are high priority', () => {
      expect(prioritizeNotification({}, 'case_critical')).toBe('high');
      expect(prioritizeNotification({ priority: 'alta' }, 'deadline')).toBe('high');
    });

    test('process movements are high priority', () => {
      expect(prioritizeNotification({}, 'process_movement')).toBe('high');
    });

    test('signatures are high priority', () => {
      expect(prioritizeNotification({}, 'signature')).toBe('high');
    });

    test('messages are normal priority', () => {
      expect(prioritizeNotification({}, 'message')).toBe('normal');
    });

    test('reminders are normal priority', () => {
      expect(prioritizeNotification({}, 'reminder')).toBe('normal');
    });
  });

  describe('getNotificationRoute', () => {
    test('message routes to conversation', () => {
      const notif = { type: 'message', reference_id: 'conv-123' };
      expect(getNotificationRoute(notif)).toBe('/?conversation=conv-123');
    });

    test('deadline routes to case', () => {
      const notif = { type: 'deadline', reference_id: 'case-456' };
      expect(getNotificationRoute(notif)).toBe('/?case=case-456');
    });

    test('deadline_overdue routes to case', () => {
      const notif = { type: 'deadline_overdue', reference_id: 'case-789' };
      expect(getNotificationRoute(notif)).toBe('/?case=case-789');
    });

    test('event routes to agenda', () => {
      const notif = { type: 'event_today', reference_id: 'event-111' };
      expect(getNotificationRoute(notif)).toBe('/?agenda=true&event=event-111');
    });

    test('process_movement routes to process', () => {
      const notif = { type: 'process_movement', reference_id: 'mov-222' };
      expect(getNotificationRoute(notif)).toBe('/?process=mov-222');
    });

    test('signature routes to signatures panel', () => {
      const notif = { type: 'signature', reference_id: 'sig-333' };
      expect(getNotificationRoute(notif)).toBe('/?signatures=true&id=sig-333');
    });

    test('unknown type routes to home', () => {
      const notif = { type: 'unknown', reference_id: 'xxx' };
      expect(getNotificationRoute(notif)).toBe('/');
    });
  });

  describe('formatRelativeDate', () => {
    test('formats past dates correctly', () => {
      const now = new Date();
      
      const oneMinAgo = new Date(now.getTime() - 60 * 1000);
      expect(formatRelativeDate(oneMinAgo, 'past')).toMatch(/há \d+ min/);

      const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      expect(formatRelativeDate(twoHoursAgo, 'past')).toMatch(/há \d+h/);

      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(threeDaysAgo, 'past')).toMatch(/há \d+ dias/);
    });

    test('formats future dates correctly', () => {
      const now = new Date();
      
      const today = new Date(now);
      expect(formatRelativeDate(today, 'future')).toBe('hoje');

      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(tomorrow, 'future')).toBe('amanhã');

      const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      expect(formatRelativeDate(threeDaysLater, 'future')).toMatch(/em \d+ dias/);
    });

    test('handles "agora" for very recent', () => {
      const now = new Date();
      const justNow = new Date(now.getTime() - 30 * 1000); // 30 segundos
      expect(formatRelativeDate(justNow, 'past')).toBe('agora');
    });
  });

  describe('isToday', () => {
    test('returns true for today', () => {
      const today = new Date();
      expect(isToday(today)).toBe(true);
    });

    test('returns false for yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isToday(yesterday)).toBe(false);
    });

    test('returns false for tomorrow', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isToday(tomorrow)).toBe(false);
    });

    test('handles string dates', () => {
      const todayStr = new Date().toISOString();
      expect(isToday(todayStr)).toBe(true);
    });
  });

  describe('isOverdue', () => {
    test('returns true for past dates', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      expect(isOverdue(yesterday)).toBe(true);
    });

    test('returns false for future dates', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(isOverdue(tomorrow)).toBe(false);
    });

    test('returns false for today', () => {
      const today = new Date();
      expect(isOverdue(today)).toBe(false);
    });
  });

  describe('groupNotifications', () => {
    test('groups by priority and type', () => {
      const notifications = [
        { id: '1', priority: 'critical', isToday: false, type: 'deadline_overdue' },
        { id: '2', priority: 'normal', isToday: true, type: 'message' },
        { id: '3', priority: 'high', isToday: false, type: 'process_movement' },
        { id: '4', priority: 'normal', isToday: false, type: 'reminder' }
      ];

      const grouped = groupNotifications(notifications);

      expect(grouped.critical).toHaveLength(1);
      expect(grouped.critical[0].id).toBe('1');

      expect(grouped.today).toHaveLength(1);
      expect(grouped.today[0].id).toBe('2');

      expect(grouped.updates).toHaveLength(1);
      expect(grouped.updates[0].id).toBe('3');

      expect(grouped.upcoming).toHaveLength(1);
      expect(grouped.upcoming[0].id).toBe('4');
    });

    test('handles empty array', () => {
      const grouped = groupNotifications([]);
      expect(grouped.critical).toHaveLength(0);
      expect(grouped.today).toHaveLength(0);
      expect(grouped.updates).toHaveLength(0);
      expect(grouped.upcoming).toHaveLength(0);
    });
  });

  describe('formatBadgeCount', () => {
    test('returns empty string for zero', () => {
      expect(formatBadgeCount(0)).toBe('');
    });

    test('returns number as string for 1-99', () => {
      expect(formatBadgeCount(1)).toBe('1');
      expect(formatBadgeCount(50)).toBe('50');
      expect(formatBadgeCount(99)).toBe('99');
    });

    test('caps at 99+', () => {
      expect(formatBadgeCount(100)).toBe('99+');
      expect(formatBadgeCount(500)).toBe('99+');
      expect(formatBadgeCount(9999)).toBe('99+');
    });
  });
});
