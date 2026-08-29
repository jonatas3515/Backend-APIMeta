/**
 * Testes - Notification Aggregator
 * Verifica consistencia da agregacao unificada, deduplicacao e contagem
 */

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

import {
  aggregateNotifications,
  buildNotificationKey,
  deduplicateNotifications,
  getNotificationCountFromVisibleItems,
  getVisibleNotificationsForUser,
} from '../../lib/notificationAggregator';

describe('Notification Aggregator', () => {
  describe('buildNotificationKey', () => {
    test('builds key from type, reference_type and reference_id', () => {
      const n = { type: 'message', reference_type: 'conversation', reference_id: 'conv-123' };
      expect(buildNotificationKey(n)).toBe('message:conversation:conv-123');
    });

    test('returns null for invalid data', () => {
      expect(buildNotificationKey(null)).toBeNull();
      expect(buildNotificationKey({ type: 'message' })).toBeNull();
      expect(buildNotificationKey({})).toBeNull();
    });
  });

  describe('deduplicateNotifications', () => {
    test('removes duplicate by key keeping first occurrence', () => {
      const notifications = [
        { id: 'a', type: 'message', reference_type: 'conversation', reference_id: 'conv-1', createdAt: '2024-01-01T10:00:00Z' },
        { id: 'b', type: 'message', reference_type: 'conversation', reference_id: 'conv-1', createdAt: '2024-01-02T10:00:00Z' },
        { id: 'c', type: 'deadline', reference_type: 'case', reference_id: 'case-1', createdAt: '2024-01-01T10:00:00Z' },
      ];

      const deduped = deduplicateNotifications(notifications);
      expect(deduped).toHaveLength(2);
      expect(deduped[0].id).toBe('a');
      expect(deduped[1].id).toBe('c');
    });

    test('ignores items without a valid key', () => {
      const notifications = [
        { id: 'a', type: 'message', reference_type: 'conversation', reference_id: 'conv-1' },
        { id: 'b', type: 'message' },
      ];

      expect(deduplicateNotifications(notifications)).toHaveLength(1);
    });
  });

  describe('getNotificationCountFromVisibleItems', () => {
    test('returns count of visible items', () => {
      expect(getNotificationCountFromVisibleItems([{}, {}, {}])).toBe(3);
      expect(getNotificationCountFromVisibleItems([])).toBe(0);
      expect(getNotificationCountFromVisibleItems(null)).toBe(0);
    });

    test('count matches list length', () => {
      const notifications = [
        { id: '1', type: 'message', reference_type: 'conversation', reference_id: 'conv-1' },
        { id: '2', type: 'deadline', reference_type: 'case', reference_id: 'case-1' },
      ];
      expect(getNotificationCountFromVisibleItems(notifications)).toBe(notifications.length);
    });
  });

  describe('aggregateNotifications', () => {
    test('throws when userId is missing', async () => {
      await expect(aggregateNotifications({ userId: null })).rejects.toThrow('missing_user_id');
    });

    test('returns empty list and unreliable count when supabase is not configured', async () => {
      const result = await aggregateNotifications({ userId: 'user-1', userRole: 'advogado' });

      expect(result.notifications).toEqual([]);
      expect(result.countReliable).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ source: 'messages', code: 'supabase_not_configured' }),
        ])
      );
    });

    test('count from visible items is zero when all sources fail', async () => {
      const result = await aggregateNotifications({ userId: 'user-1', userRole: 'advogado' });
      expect(getNotificationCountFromVisibleItems(result.notifications)).toBe(0);
    });
  });

  describe('getVisibleNotificationsForUser', () => {
    test('is alias for aggregateNotifications', async () => {
      const result = await getVisibleNotificationsForUser({ userId: 'user-1', userRole: 'advogado' });
      expect(result).toHaveProperty('notifications');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('countReliable');
    });
  });
});
