/**
 * Testes - Notification Cache
 * Testa sistema de cache LRU e rate limiting
 */

import notificationCache from '../lib/notificationCache';

describe('Notification Cache', () => {
  beforeEach(() => {
    notificationCache.invalidateAll();
  });

  describe('Basic Cache Operations', () => {
    test('stores and retrieves data', () => {
      const userId = 'user-123';
      const data = { notifications: [], errors: [] };

      notificationCache.set(userId, data);
      const retrieved = notificationCache.get(userId);

      expect(retrieved).toEqual(data);
    });

    test('returns null for non-existent key', () => {
      const retrieved = notificationCache.get('non-existent');
      expect(retrieved).toBeNull();
    });

    test('supports different cache types', () => {
      const userId = 'user-123';
      const notifications = { notifications: [] };
      const count = 5;

      notificationCache.set(userId, notifications, 'notifications');
      notificationCache.set(userId, count, 'count');

      expect(notificationCache.get(userId, 'notifications')).toEqual(notifications);
      expect(notificationCache.get(userId, 'count')).toBe(5);
    });
  });

  describe('TTL (Time To Live)', () => {
    test('expires after TTL', async () => {
      const userId = 'user-123';
      const data = { test: true };

      // Criar cache com TTL curto para teste
      const shortCache = new (notificationCache.constructor)(500, 100); // 100ms TTL
      shortCache.set(userId, data);

      // Imediatamente deve estar disponível
      expect(shortCache.get(userId)).toEqual(data);

      // Após TTL deve expirar
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(shortCache.get(userId)).toBeNull();
    });

    test('does not expire before TTL', async () => {
      const userId = 'user-123';
      const data = { test: true };

      notificationCache.set(userId, data);

      // Após 50ms ainda deve estar disponível (TTL padrão é 60s)
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(notificationCache.get(userId)).toEqual(data);
    });
  });

  describe('LRU Eviction', () => {
    test('evicts oldest item when max size reached', () => {
      const smallCache = new (notificationCache.constructor)(3, 60000); // Max 3 items

      smallCache.set('user-1', { id: 1 });
      smallCache.set('user-2', { id: 2 });
      smallCache.set('user-3', { id: 3 });

      // Todos devem estar presentes
      expect(smallCache.get('user-1')).toEqual({ id: 1 });
      expect(smallCache.get('user-2')).toEqual({ id: 2 });
      expect(smallCache.get('user-3')).toEqual({ id: 3 });

      // Adicionar 4º item deve remover o mais antigo (user-1)
      smallCache.set('user-4', { id: 4 });

      expect(smallCache.get('user-1')).toBeNull();
      expect(smallCache.get('user-2')).toEqual({ id: 2 });
      expect(smallCache.get('user-3')).toEqual({ id: 3 });
      expect(smallCache.get('user-4')).toEqual({ id: 4 });
    });

    test('accessing item moves it to end (LRU)', () => {
      const smallCache = new (notificationCache.constructor)(3, 60000);

      smallCache.set('user-1', { id: 1 });
      smallCache.set('user-2', { id: 2 });
      smallCache.set('user-3', { id: 3 });

      // Acessar user-1 move para o final
      smallCache.get('user-1');

      // Adicionar user-4 deve remover user-2 (agora o mais antigo)
      smallCache.set('user-4', { id: 4 });

      expect(smallCache.get('user-1')).toEqual({ id: 1 }); // Ainda presente
      expect(smallCache.get('user-2')).toBeNull(); // Removido
      expect(smallCache.get('user-3')).toEqual({ id: 3 });
      expect(smallCache.get('user-4')).toEqual({ id: 4 });
    });
  });

  describe('Invalidation', () => {
    test('invalidates specific user', () => {
      notificationCache.set('user-1', { id: 1 });
      notificationCache.set('user-2', { id: 2 });

      notificationCache.invalidate('user-1');

      expect(notificationCache.get('user-1')).toBeNull();
      expect(notificationCache.get('user-2')).toEqual({ id: 2 });
    });

    test('invalidates all cache types for user', () => {
      const userId = 'user-123';

      notificationCache.set(userId, { notifications: [] }, 'notifications');
      notificationCache.set(userId, 5, 'count');

      notificationCache.invalidate(userId);

      expect(notificationCache.get(userId, 'notifications')).toBeNull();
      expect(notificationCache.get(userId, 'count')).toBeNull();
    });

    test('invalidates all users', () => {
      notificationCache.set('user-1', { id: 1 });
      notificationCache.set('user-2', { id: 2 });
      notificationCache.set('user-3', { id: 3 });

      notificationCache.invalidateAll();

      expect(notificationCache.get('user-1')).toBeNull();
      expect(notificationCache.get('user-2')).toBeNull();
      expect(notificationCache.get('user-3')).toBeNull();
    });
  });

  describe('Rate Limiting', () => {
    test('allows first request', () => {
      const allowed = notificationCache.checkRateLimit('user-123');
      expect(allowed).toBe(true);
    });

    test('blocks rapid successive requests', () => {
      const userId = 'user-123';

      const first = notificationCache.checkRateLimit(userId);
      expect(first).toBe(true);

      const second = notificationCache.checkRateLimit(userId);
      expect(second).toBe(false); // Bloqueado (< 1 segundo)
    });

    test('allows request after 3 seconds', async () => {
      const userId = 'user-123';

      notificationCache.checkRateLimit(userId);

      // Esperar 3.1 segundos (rate limit é 3s)
      await new Promise(resolve => setTimeout(resolve, 3100));

      const allowed = notificationCache.checkRateLimit(userId);
      expect(allowed).toBe(true);
    });

    test('rate limits are per-user', () => {
      const allowed1 = notificationCache.checkRateLimit('user-1');
      const allowed2 = notificationCache.checkRateLimit('user-2');

      expect(allowed1).toBe(true);
      expect(allowed2).toBe(true); // Não afeta outro usuário
    });
  });

  describe('Stats', () => {
    test('returns cache statistics', () => {
      notificationCache.set('user-1', { id: 1 });
      notificationCache.set('user-2', { id: 2 });

      const stats = notificationCache.getStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('maxSize');
      expect(stats).toHaveProperty('ttl');
      expect(stats).toHaveProperty('rateLimiterSize');
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});
