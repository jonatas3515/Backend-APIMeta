/**
 * Testes do adaptador offline de cálculo trabalhista.
 */

const { adaptLaborSettlement } = require('../lib/laborSettlementAdapter');

describe('adaptLaborSettlement', () => {
  test('mensagem sem dados mínimos é liberada para o Gemini', () => {
    const result = adaptLaborSettlement({ message: 'Quero calcular minha rescisão' });
    expect(result.handled).toBe(false);
    expect(result.flow).toBe('other');
    expect(result.response.text).toBe('');
    expect(result.state.active).toBe(false);
  });

  test('pergunta conceitual trabalhista é liberada para o Gemini', () => {
    const result = adaptLaborSettlement({ message: 'Posso pedir rescisão indireta?' });
    expect(result.handled).toBe(false);
    expect(result.flow).toBe('other');
    expect(result.response.text).toBe('');
    expect(result.state.active).toBe(false);
    expect(result.calculation).toBeNull();
  });

  test('mensagem fora do domínio não é tratada', () => {
    const result = adaptLaborSettlement({ message: 'Bom dia' });
    expect(result.handled).toBe(false);
    expect(result.flow).toBe('other');
    expect(result.response.kind).toBe('ignored');
  });

  test('dados mínimos incompletos liberam para o Gemini sem perguntas', () => {
    const result = adaptLaborSettlement({
      message: 'Quanto vou receber? Ganhei R$ 2.500',
      state: { active: true, status: 'collecting', askedFields: [], collected: {} }
    });
    expect(result.handled).toBe(false);
    expect(result.flow).toBe('other');
    expect(result.response.text).toBe('');
    expect(result.state.collected.salary).toBe(2500);
  });

  test('cancelamento limpa o estado', () => {
    const first = adaptLaborSettlement({ message: 'Quero calcular minha rescisão' });
    const cancelled = adaptLaborSettlement({
      message: 'Quero cancelar',
      state: first.state
    });
    expect(cancelled.state.active).toBe(false);
    expect(cancelled.state.collected).toEqual({});
  });

  test('dados completos chegam ao cálculo correto', () => {
    const result = adaptLaborSettlement({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado'
    });
    expect(result.handled).toBe(true);
    expect(result.flow).toBe('labor_settlement_estimate');
    expect(result.response.kind).toBe('estimate');
    expect(result.calculation).not.toBeNull();
    expect(result.calculation.totalEstimated).toBeGreaterThan(0);
  });

  test('dados inválidos são liberados para o Gemini sem valor fictício', () => {
    const result = adaptLaborSettlement({
      message: 'Quanto vou receber? R$ abc, de 15/01/2023 a 10/07/2024, fui demitido'
    });
    expect(result.handled).toBe(false);
    expect(result.response.text).toBe('');
    expect(result.calculation).toBeNull();
  });

  test('adaptador não altera o estado recebido', () => {
    const original = { active: false, intent: null, collected: {}, askedFields: [], status: 'idle' };
    const result = adaptLaborSettlement({
      message: 'Bom dia',
      state: original
    });
    expect(original).toEqual({ active: false, intent: null, collected: {}, askedFields: [], status: 'idle' });
    expect(result.state).not.toBe(original);
  });

  test('adaptador não persiste dados', () => {
    const result = adaptLaborSettlement({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado'
    });
    expect(result).not.toHaveProperty('persisted');
    expect(result).not.toHaveProperty('savedAt');
  });

  test('adaptador não recalcula valores', () => {
    const result = adaptLaborSettlement({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado'
    });
    const motorTotal = result.calculation.items
      .filter(i => i.status === 'calculated')
      .reduce((sum, i) => sum + i.amount, 0);
    expect(result.calculation.totalEstimated).toBeCloseTo(motorTotal, 2);
  });

  test('resultado preserva warnings e itens condicionais', () => {
    const result = adaptLaborSettlement({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado'
    });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.calculation.items.some(i => i.status === 'conditional')).toBe(true);
  });

  test('falhas são sanitizadas', () => {
    const result = adaptLaborSettlement({
      message: null,
      state: null
    });
    expect(result.handled).toBe(false);
    expect(result.flow).toBe('other');
    expect(result.response).toBeTruthy();
    expect(result.state.active).toBe(false);
  });

  test('execução é determinística', () => {
    const input = {
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado'
    };
    const r1 = adaptLaborSettlement(input);
    const r2 = adaptLaborSettlement(input);
    expect(r1).toEqual(r2);
  });

  test('nenhum log contém PII', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    adaptLaborSettlement({
      message: 'Quanto vou receber? Ganhei R$ 5.000',
      state: { active: false }
    });
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
