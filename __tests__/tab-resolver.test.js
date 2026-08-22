/**
 * Testes puros para o resolvedor de abas.
 * Não usam dados reais nem chamadas de rede.
 */

const { resolveTab, NAV_ITEMS } = require('../lib/tabResolver');

describe('tabResolver - mapeamento de abas', () => {
  test('fee-services resolve para Honorários', () => {
    const result = resolveTab('fee-services');
    expect(result).not.toBeNull();
    expect(result.label).toBe('Honorários');
    expect(result.minRole).toBe('admin');
  });

  test('users resolve para Config.', () => {
    const result = resolveTab('users');
    expect(result).not.toBeNull();
    expect(result.label).toBe('Config.');
  });

  test('insights NÃO é uma aba top-level válida', () => {
    expect(resolveTab('insights')).toBeNull();
  });

  test('collaboration NÃO é uma aba top-level válida', () => {
    expect(resolveTab('collaboration')).toBeNull();
  });

  test('cases resolve para Casos', () => {
    const result = resolveTab('cases');
    expect(result).not.toBeNull();
    expect(result.label).toBe('Casos');
  });

  test('todas as chaves são únicas', () => {
    const keys = NAV_ITEMS.map((item) => item.key);
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  test('não expõe PII - resolveTab não faz console', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    resolveTab('fee-services');
    resolveTab('users');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
