const cache = new Map();

const SENSITIVE_KEYS = new Set([
  'client_name',
  'client_phone',
  'client_email',
  'email',
  'phone',
  'cpf',
  'cnpj',
  'name',
  'content',
  'message',
  'token',
  'password',
  'secret',
  'signed_url',
  'url',
  'address'
]);

function containsPii(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') {
    const patterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
      /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
      /\b\d{2}\.\d{3}\.\d{3}\/?\d{4}-?\d{2}\b/,
      /\b\(?\d{2}\)?[\s-]?\d{4,5}[-.]?\d{4}\b/,
      /https?:\/\/[^\s]+/gi,
      /\bBearer\s+[A-Za-z0-9-_]+\b/
    ];
    return patterns.some((p) => p.test(value));
  }
  return false;
}

function sanitizeForCache(value, path = '') {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    if (containsPii(value)) return '[REDACTED]';
    return value.length > 1000 ? `${value.slice(0, 1000)}...[TRUNCATED]` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return value.map((item, index) => sanitizeForCache(item, `${path}[${index}]`));
    }

    const result = {};
    for (const key of Object.keys(value)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = sanitizeForCache(value[key], `${path}.${key}`);
      }
    }
    return result;
  }

  return value;
}

export function setCache(key, value, ttlMs) {
  if (!key || typeof key !== 'string') return;
  if (typeof ttlMs !== 'number' || ttlMs <= 0) return;

  const safeValue = sanitizeForCache(value);
  const expiry = Date.now() + ttlMs;
  cache.set(key, { value: safeValue, expiry });
}

export function getCache(key) {
  if (!key || typeof key !== 'string') return undefined;

  const entry = cache.get(key);
  if (!entry) return undefined;

  if (Date.now() > entry.expiry) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

export function deleteCache(key) {
  if (!key || typeof key !== 'string') return false;
  return cache.delete(key);
}

export function clearCacheByPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') return 0;

  let removed = 0;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
      removed += 1;
    }
  }
  return removed;
}

export function clearAllCache() {
  const size = cache.size;
  cache.clear();
  return size;
}

export function getCacheKeys() {
  return Array.from(cache.keys());
}
