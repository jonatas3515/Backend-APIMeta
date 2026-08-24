/**
 * Testes para upload e busca de referencias OAB.
 */

const { validatePreview } = require('../lib/feeTableValidation');
const { extractReferences } = require('../pages/api/fee-reference');

describe('fee-reference - upload e busca', () => {
  test('upload com colunas ausentes gera erro claro', () => {
    const data = [
      ['Indicativo', 'Atividade'],
      ['1.1', 'Peticao Inicial']
    ];
    const result = validatePreview(data);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('Pelo menos um valor (mínimo, sugerido ou máximo)');
  });

  test('preview indica colunas reconhecidas', () => {
    const data = [
      ['Indicativo', 'Atividade', 'R$', 'URH'],
      ['1.1', 'Peticao Inicial', 'R$ 1.000,00', '2,5']
    ];
    const result = validatePreview(data);
    expect(result.valid).toBe(true);
    expect(result.recognized.area).toBeDefined();
    expect(result.recognized.servico).toBeDefined();
  });

  test('extrai areas e servicos de tabela no formato array de arrays', () => {
    const data = [
      ['1.', 'ATIVIDADES CIVEIS'],
      ['1.1', 'Peticao Inicial', 'R$ 1.000,00'],
      ['1.2', 'Contestacao', 'R$ 2.000,00']
    ];
    const refs = extractReferences(data);
    expect(refs.length).toBe(2);
    expect(refs[0].legal_area).toBe('ATIVIDADES CIVEIS');
    expect(refs[0].service).toBe('Peticao Inicial');
    expect(refs[1].service).toBe('Contestacao');
  });
});
