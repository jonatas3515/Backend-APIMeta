/**
 * Testes puros para cálculo de sugestão regional de honorários.
 * Não usam dados reais nem chamadas de rede.
 */

const { calculateRegionalSuggestion, calculateSuggestionRange, calculateOabDiscount } = require('../lib/feeSuggestion');

describe('feeSuggestion - sugestão regional OAB', () => {
  test('valor 1000 com fator padrão 0.75 retorna 750.00', () => {
    const result = calculateRegionalSuggestion(1000);
    expect(result).toBe(750.00);
  });

  test('valor 1000 com fator 0.70 retorna mínimo regional', () => {
    const result = calculateRegionalSuggestion(1000, 0.70);
    expect(result).toBe(700.00);
  });

  test('valor 1000 com fator 0.80 retorna máximo regional', () => {
    const result = calculateRegionalSuggestion(1000, 0.80);
    expect(result).toBe(800.00);
  });

  test('fator abaixo de 0.70 é limitado a 0.70', () => {
    const result = calculateRegionalSuggestion(1000, 0.50);
    expect(result).toBe(700.00);
  });

  test('fator acima de 0.80 é limitado a 0.80', () => {
    const result = calculateRegionalSuggestion(1000, 1.0);
    expect(result).toBe(800.00);
  });

  test('retorna 0 para entrada inválida', () => {
    expect(calculateRegionalSuggestion(null)).toBe(0);
    expect(calculateRegionalSuggestion('abc')).toBe(0);
    expect(calculateRegionalSuggestion(-10)).toBe(0);
  });

  test('calculateSuggestionRange retorna min, suggested, max e factor', () => {
    const result = calculateSuggestionRange({
      min_amount: 500,
      suggested_amount: 1000,
      max_amount: 1500
    }, 0.75);
    expect(result.min).toBe(500);
    expect(result.suggested).toBe(750);
    expect(result.max).toBe(1500);
    expect(result.factor).toBe(0.75);
  });

  test('calculateOabDiscount retorna percentual de desconto', () => {
    expect(calculateOabDiscount(1000, 750)).toBe(25);
    expect(calculateOabDiscount(1000, 800)).toBe(20);
    expect(calculateOabDiscount(0, 750)).toBeNull();
  });
});
