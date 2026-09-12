import { setCache, getCache, deleteCache, clearCacheByPrefix, clearAllCache } from '../lib/cache';

describe('lib/cache', () => {
  beforeEach(() => {
    clearAllCache();
  });

  test('setCache e getCache retornam o valor armazenado', () => {
    setCache('cases:list:abc', [{ id: '1' }, { id: '2' }], 1000);
    expect(getCache('cases:list:abc')).toEqual([{ id: '1' }, { id: '2' }]);
  });

  test('getCache retorna undefined se a chave expirou', (done) => {
    setCache('expiring', 'value', 20);
    expect(getCache('expiring')).toBe('value');
    setTimeout(() => {
      expect(getCache('expiring')).toBeUndefined();
      done();
    }, 50);
  });

  test('getCache retorna undefined se a chave nao existe', () => {
    expect(getCache('nonexistent')).toBeUndefined();
  });

  test('deleteCache remove uma chave', () => {
    setCache('to-delete', 'value', 1000);
    expect(getCache('to-delete')).toBe('value');
    deleteCache('to-delete');
    expect(getCache('to-delete')).toBeUndefined();
  });

  test('clearCacheByPrefix remove chaves pelo prefixo', () => {
    setCache('cases:list:abc', [1], 1000);
    setCache('cases:list:def', [2], 1000);
    setCache('cases:detail:abc', { id: 'abc' }, 1000);
    setCache('other:item', 'ok', 1000);

    const removed = clearCacheByPrefix('cases:list:');
    expect(removed).toBe(2);
    expect(getCache('cases:list:abc')).toBeUndefined();
    expect(getCache('cases:list:def')).toBeUndefined();
    expect(getCache('cases:detail:abc')).toEqual({ id: 'abc' });
    expect(getCache('other:item')).toBe('ok');
  });

  test('nao armazena PII no cache', () => {
    const payload = {
      id: '123',
      client_name: 'Maria Silva',
      client_phone: '11999990000',
      client_email: 'maria@example.com',
      token: 'abc123'
    };
    setCache('pii-test', payload, 1000);
    const cached = getCache('pii-test');
    expect(cached.client_name).toBe('[REDACTED]');
    expect(cached.client_phone).toBe('[REDACTED]');
    expect(cached.client_email).toBe('[REDACTED]');
    expect(cached.token).toBe('[REDACTED]');
    expect(cached.id).toBe('123');
  });

  test('rejeita valores com URLs e tokens em strings', () => {
    setCache('url-test', 'acesse https://exemplo.com/signed-url?token=abc', 1000);
    expect(getCache('url-test')).toBe('[REDACTED]');
  });
});
