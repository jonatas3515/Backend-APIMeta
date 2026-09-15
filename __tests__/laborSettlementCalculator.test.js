/**
 * Testes puros para o motor de estimativa de verbas trabalhistas.
 * Não usam dados reais, banco, APIs externas nem IA.
 */

const { calculateLaborSettlement } = require('../lib/laborSettlementCalculator');

const baseInput = {
  salary: 3000,
  admissionDate: '2023-01-15',
  terminationDate: '2024-07-10',
  terminationReason: 'dispensa_sem_justa_causa',
  hasVacationAccrued: 'no',
  hasThirteenthAccrued: 'no',
  noticeStatus: 'desconhecido'
};

function itemByCode(result, code) {
  return result.items.find(i => i.code === code);
}

describe('laborSettlementCalculator - validação', () => {
  test('salário ausente retorna insufficient_data', () => {
    const result = calculateLaborSettlement({ ...baseInput, salary: null });
    expect(result.status).toBe('insufficient_data');
    expect(result.missingFields).toContain('salary');
    expect(result.confidence).toBe('low');
  });

  test('data de desligamento anterior à admissão é rejeitada', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      admissionDate: '2024-07-10',
      terminationDate: '2023-01-15'
    });
    expect(result.status).toBe('insufficient_data');
    expect(result.validationErrors).toContain('Data de desligamento não pode ser anterior à data de admissão.');
  });

  test('salário inválido é rejeitado', () => {
    const result = calculateLaborSettlement({ ...baseInput, salary: -100 });
    expect(result.status).toBe('insufficient_data');
    expect(result.validationErrors).toContain('Salário deve ser um número positivo.');
  });

  test('motivo desconhecido gera resultado parcial de baixa confiança', () => {
    const result = calculateLaborSettlement({ ...baseInput, terminationReason: 'desconhecido' });
    expect(result.status).toBe('partial');
    expect(result.confidence).toBe('low');
  });

  test('duração inferior a um mês mantém cálculo possível com baixa confiança', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      admissionDate: '2024-07-01',
      terminationDate: '2024-07-10'
    });
    expect(result.status).toBe('partial');
    expect(result.confidence).toBe('low');
    expect(itemByCode(result, 'salary_balance').amount).toBeGreaterThan(0);
  });
});

describe('laborSettlementCalculator - verbas básicas', () => {
  test('dispensa sem justa causa calcula saldo, 13º e férias proporcionais', () => {
    const result = calculateLaborSettlement(baseInput);
    expect(result.status).toBe('partial');
    expect(itemByCode(result, 'salary_balance').status).toBe('calculated');
    expect(itemByCode(result, 'thirteenth_proportional').status).toBe('calculated');
    expect(itemByCode(result, 'vacation_proportional').status).toBe('calculated');
  });

  test('pedido de demissão não inclui aviso-prévio indenizado', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      terminationReason: 'pedido_demissao',
      noticeStatus: 'indenizado'
    });
    expect(itemByCode(result, 'notice_indemnity')).toBeUndefined();
    expect(itemByCode(result, 'notice_not_fulfilled') || itemByCode(result, 'notice_unknown')).toBeTruthy();
  });

  test('justa causa mantém saldo e 13º, mas férias proporcionais ficam condicionais', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      terminationReason: 'justa_causa'
    });
    expect(itemByCode(result, 'salary_balance').status).toBe('calculated');
    expect(itemByCode(result, 'thirteenth_proportional').status).toBe('calculated');
    expect(itemByCode(result, 'vacation_proportional').status).toBe('conditional');
  });

  test('acordo não assume dispensa sem justa causa automática', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      terminationReason: 'acordo'
    });
    expect(result.inputSummary.terminationReason).toBe('acordo');
    expect(result.items.some(i => i.status === 'calculated')).toBe(true);
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
  });

  test('rescisão indireta em discussão marca parcelas como condicionais', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      terminationReason: 'rescisao_indireta_em_discussao'
    });
    const calculated = result.items.filter(i => i.status === 'calculated');
    expect(calculated.length).toBe(0);
    expect(result.confidence).toBe('medium');
  });

  test('contrato temporário dispensa sem justa causa é calculado', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      terminationReason: 'contrato_temporario'
    });
    expect(itemByCode(result, 'salary_balance').status).toBe('calculated');
  });
});

describe('laborSettlementCalculator - férias e 13º', () => {
  test('férias vencidas incluem um período de férias acrescido de 1/3 quando informado', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      hasVacationAccrued: 'yes'
    });
    expect(itemByCode(result, 'vacation_accrued').amount).toBeCloseTo(4000, 2);
    expect(itemByCode(result, 'vacation_accrued').status).toBe('conditional');
  });

  test('13º vencido não altera cálculo do 13º proporcional', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      hasThirteenthAccrued: 'yes'
    });
    expect(itemByCode(result, 'thirteenth_proportional').status).toBe('calculated');
    expect(itemByCode(result, 'thirteenth_proportional').amount).toBeGreaterThan(0);
  });

  test('período de aproximadamente 18 meses calcula 13º proporcional e férias proporcionais', () => {
    const result = calculateLaborSettlement({
      salary: 2000,
      admissionDate: '2023-01-10',
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa_sem_justa_causa',
      hasVacationAccrued: 'no',
      hasThirteenthAccrued: 'no',
      noticeStatus: 'desconhecido'
    });
    expect(result.status).toBe('partial');
    expect(itemByCode(result, 'thirteenth_proportional').amount).toBeGreaterThan(0);
    expect(itemByCode(result, 'vacation_proportional').amount).toBeGreaterThan(0);
  });
});

describe('laborSettlementCalculator - aviso-prévio', () => {
  test('aviso indenizado é incluído na dispensa sem justa causa', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      noticeStatus: 'indenizado'
    });
    expect(itemByCode(result, 'notice_indemnity').amount).toBe(3000);
    expect(itemByCode(result, 'notice_indemnity').status).toBe('calculated');
  });

  test('aviso trabalhado não gera indenização extra', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      noticeStatus: 'trabalhado'
    });
    expect(itemByCode(result, 'notice_indemnity')).toBeUndefined();
    expect(itemByCode(result, 'notice_worked')).toBeTruthy();
  });

  test('aviso não cumprido é condicionado sem adicionar valor', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      terminationReason: 'pedido_demissao',
      noticeStatus: 'nao_cumprido'
    });
    expect(itemByCode(result, 'notice_not_fulfilled')).toBeTruthy();
    expect(itemByCode(result, 'notice_not_fulfilled').amount).toBe(0);
  });
});

describe('laborSettlementCalculator - controle de inclusões indevidas', () => {
  test('horas extras não entram no total', () => {
    const result = calculateLaborSettlement(baseInput);
    expect(itemByCode(result, 'overtime').status).toBe('not_calculated');
    expect(itemByCode(result, 'overtime').amount).toBe(0);
    expect(result.warnings.some(w => w.includes('horas extras'))).toBe(true);
  });

  test('FGTS/multa 40% não entra no total sem premissa suficiente', () => {
    const result = calculateLaborSettlement(baseInput);
    expect(itemByCode(result, 'fgts').status).toBe('conditional');
    expect(itemByCode(result, 'fgts').amount).toBe(0);
    expect(result.warnings.some(w => w.includes('FGTS'))).toBe(true);
  });

  test('convenção coletiva não é aplicada automaticamente', () => {
    const result = calculateLaborSettlement(baseInput);
    expect(itemByCode(result, 'collective_agreement').status).toBe('not_calculated');
  });

  test('contrato sem registro é tratado como hipótese condicionada sem afirmar vínculo', () => {
    const result = calculateLaborSettlement({
      ...baseInput,
      terminationReason: 'rescisao_indireta_em_discussao'
    });
    expect(result.assumptions.some(a => a.includes('vínculo') || a.includes('reconhecimento'))).toBe(true);
    expect(result.warnings.some(w => w.includes('profissional'))).toBe(true);
  });
});

describe('laborSettlementCalculator - datas e arredondamento', () => {
  test('arredondamento monetário consistente com duas casas decimais', () => {
    const result = calculateLaborSettlement({
      salary: 1234.56,
      admissionDate: '2023-01-20',
      terminationDate: '2024-03-15',
      terminationReason: 'dispensa_sem_justa_causa',
      hasVacationAccrued: 'no',
      hasThirteenthAccrued: 'no',
      noticeStatus: 'desconhecido'
    });
    const values = result.items.map(i => i.amount);
    values.forEach(amount => {
      expect(String(amount)).toMatch(/^\d+(\.\d{1,2})?$/);
    });
    expect(result.totalEstimated).toBeCloseTo(result.items.filter(i => i.status === 'calculated').reduce((s, i) => s + i.amount, 0), 2);
  });

  test('data de desligamento no mesmo mês e ano da admissão calcula saldo corretamente', () => {
    const result = calculateLaborSettlement({
      salary: 3000,
      admissionDate: '2024-07-01',
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa_sem_justa_causa'
    });
    expect(itemByCode(result, 'salary_balance').amount).toBe(1000);
    expect(itemByCode(result, 'salary_balance').assumptions[0]).toContain('10/30');
  });
});

describe('laborSettlementCalculator - mensagens obrigatórias', () => {
  test('resultado sempre contém avisos de estimativa', () => {
    const result = calculateLaborSettlement(baseInput);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('estimativa preliminar'),
        expect.stringContaining('depende da confirmação'),
        expect.stringContaining('profissional')
      ])
    );
  });

  test('entrada incompleta retorna campos faltantes', () => {
    const result = calculateLaborSettlement({
      salary: 3000,
      admissionDate: '2023-01-15'
    });
    expect(result.missingFields).toContain('terminationDate');
    expect(result.missingFields).toContain('terminationReason');
    expect(result.confidence).toBe('low');
  });
});
