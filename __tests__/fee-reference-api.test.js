/**
 * Testes sintéticos de segurança para o módulo de honorários.
 * Não expõe PII em logs.
 */

const { calculateRegionalSuggestion, calculateOabDiscount } = require('../lib/feeSuggestion');

describe('fee-reference - segurança e PII', () => {
  test('cálculo de sugestão não loga valores sensíveis', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    calculateRegionalSuggestion(1000);
    calculateOabDiscount(1000, 750);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  test('cálculo não expõe PII mesmo com nome/CPF', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const piiInput = 'João da Silva, CPF 123.456.789-00';
    calculateRegionalSuggestion(piiInput);
    calculateOabDiscount(piiInput, 750);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
