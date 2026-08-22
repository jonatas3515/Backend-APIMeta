/**
 * Testes puros para validacao de tabelas OAB.
 * Nao expoem PII.
 */

const { validatePreview } = require('../lib/feeTableValidation');

describe('feeTableValidation - validacao de upload OAB', () => {
  test('tabela completa e reconhecida', () => {
    const data = [
      { 'Área Jurídica': 'Cível', 'Tipo do Caso': 'Divórcio', 'Serviço': 'Petição', 'Mínimo (R$)': 100, 'Sugerido (R$)': 200, 'Máximo (R$)': 300 }
    ];
    const result = validatePreview(data);
    expect(result.valid).toBe(true);
    expect(result.rowCount).toBe(1);
    expect(result.recognized.area).toBe('Área Jurídica');
    expect(result.recognized.servico).toBe('Serviço');
    expect(result.recognized.sugerido).toBe('Sugerido (R$)');
    expect(result.missing).toEqual([]);
  });

  test('tabela sem coluna de servico e invalida', () => {
    const data = [
      { 'Área': 'Cível', 'Valor': 200 }
    ];
    const result = validatePreview(data);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('Serviço');
  });

  test('tabela sem nenhum valor e invalida', () => {
    const data = [
      { 'Área Jurídica': 'Cível', 'Serviço': 'Petição' }
    ];
    const result = validatePreview(data);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('Pelo menos um valor (mínimo, sugerido ou máximo)');
  });

  test('tabela vazia e invalida', () => {
    const result = validatePreview([]);
    expect(result.valid).toBe(false);
    expect(result.rowCount).toBe(0);
  });

  test('tabela com apenas minimo e maximo e valida', () => {
    const data = [
      { 'Area': 'Trabalhista', 'Servico': 'Reclamação', 'Minimo': 100, 'Maximo': 300 }
    ];
    const result = validatePreview(data);
    expect(result.valid).toBe(true);
    expect(result.recognized.minimo).toBe('Minimo');
    expect(result.recognized.maximo).toBe('Maximo');
    expect(result.recognized.sugerido).toBeNull();
  });

  test('nao loga dados sensiveis', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const data = [
      { 'Área Jurídica': 'Cível', 'Serviço': 'Divórcio de João da Silva', 'Sugerido (R$)': 5000 }
    ];
    validatePreview(data);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
