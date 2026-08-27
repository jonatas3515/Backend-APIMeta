/**
 * Notification Cache
 * Cache LRU para notificações com TTL de 60s
 */

class NotificationCache {
  constructor(maxSize = 500, ttl = 60000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl; // 60 segundos
    this.rateLimiter = new Map();
  }

  /**
   * Gera chave de cache
   * @param {String} userId - ID do usuário
   * @param {String} type - Tipo de cache ('notifications' | 'count')
   * @returns {String}
   */
  _getKey(userId, type = 'notifications') {
    return `${userId}:${type}`;
  }

  /**
   * Obtém item do cache
   * @param {String} userId - ID do usuário
   * @param {String} type - Tipo de cache
   * @returns {Any|null}
   */
  get(userId, type = 'notifications') {
    const key = this._getKey(userId, type);
    const item = this.cache.get(key);

    if (!item) return null;

    // Verifica TTL
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    // Move para o final (LRU)
    this.cache.delete(key);
    this.cache.set(key, item);

    return item.data;
  }

  /**
   * Define item no cache
   * @param {String} userId - ID do usuário
   * @param {Any} data - Dados a cachear
   * @param {String} type - Tipo de cache
   */
  set(userId, data, type = 'notifications') {
    const key = this._getKey(userId, type);

    // Remove item mais antigo se atingir limite
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Invalida cache de um usuário
   * @param {String} userId - ID do usuário
   */
  invalidate(userId) {
    this.cache.delete(this._getKey(userId, 'notifications'));
    this.cache.delete(this._getKey(userId, 'count'));
  }

  /**
   * Invalida todo o cache
   */
  invalidateAll() {
    this.cache.clear();
    this.rateLimiter.clear();
  }

  /**
   * Verifica rate limit (1 request a cada 3 segundos por usuário)
   * @param {String} userId - ID do usuário
   * @returns {Boolean} true se permitido
   */
  checkRateLimit(userId) {
    const lastRequest = this.rateLimiter.get(userId);
    const now = Date.now();

    if (lastRequest && now - lastRequest < 3000) {
      return false; // Rate limited
    }

    this.rateLimiter.set(userId, now);

    // Limpa rate limiter antigos (> 5 minutos)
    if (this.rateLimiter.size > 1000) {
      const cutoff = now - 300000; // 5 minutos
      for (const [uid, timestamp] of this.rateLimiter.entries()) {
        if (timestamp < cutoff) {
          this.rateLimiter.delete(uid);
        }
      }
    }

    return true;
  }

  /**
   * Obtém estatísticas do cache
   * @returns {Object}
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttl: this.ttl,
      rateLimiterSize: this.rateLimiter.size
    };
  }
}

// Singleton
const notificationCache = new NotificationCache();

export default notificationCache;
