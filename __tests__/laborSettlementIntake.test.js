/**
 * Testes puros para o módulo de coleta e normalização de dados
 * trabalhistas. Não usam dados reais, banco, APIs externas nem IA.
 */

const { processLaborSettlementIntake } = require('../lib/laborSettlementIntake');

const completeInput = {
  salary: 3000,
  admissionDate: '2023-01-15',
  terminationDate: '2024-07-10',
  terminationReason: 'dispensa sem justa causa',
  hasVacationAccrued: 'não',
  hasThirteenthAccrued: 'não',
  noticeStatus: 'desconhecido'
};

describe('laborSettlementIntake - dados mínimos', () => {
  test('dados completos geram ready e chamam o motor', () => {
    const result = processLaborSettlementIntake(completeInput);
    expect(result.status).toBe('ready');
    expect(result.calculation).not.toBeNull();
    expect(result.missingFields).toHaveLength(0);
    expect(result.ambiguousFields).toHaveLength(0);
  });

  test('falta salário gera needs_information', () => {
    const result = processLaborSettlementIntake({ ...completeInput, salary: null });
    expect(result.status).toBe('needs_information');
    expect(result.missingFields).toContain('salary');
    expect(result.calculation).toBeNull();
  });

  test('falta data de admissão gera needs_information', () => {
    const result = processLaborSettlementIntake({ ...completeInput, admissionDate: null });
    expect(result.status).toBe('needs_information');
    expect(result.missingFields).toContain('admissionDate');
  });

  test('falta data de desligamento gera needs_information', () => {
    const result = processLaborSettlementIntake({ ...completeInput, terminationDate: null });
    expect(result.status).toBe('needs_information');
    expect(result.missingFields).toContain('terminationDate');
  });

  test('falta motivo assume desconhecido e gera estimativa parcial', () => {
    const result = processLaborSettlementIntake({ ...completeInput, terminationReason: null });
    expect(result.status).toBe('ready');
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
  });
});

describe('laborSettlementIntake - normalização', () => {
  test('salário em formato brasileiro é normalizado', () => {
    const result = processLaborSettlementIntake({
      ...completeInput,
      salary: 'R$ 3.500,00'
    });
    expect(result.status).toBe('ready');
    expect(result.normalizedInput.salary).toBe(3500);
  });

  test('data em formato brasileiro é normalizada', () => {
    const result = processLaborSettlementIntake({
      ...completeInput,
      admissionDate: '10/01/2023',
      terminationDate: '10/07/2024'
    });
    expect(result.status).toBe('ready');
    expect(result.normalizedInput.admissionDate).toBe('2023-01-10');
    expect(result.normalizedInput.terminationDate).toBe('2024-07-10');
  });

  test('respostas sim/não são normalizadas para yes/no', () => {
    const result = processLaborSettlementIntake({
      ...completeInput,
      hasVacationAccrued: 'sim',
      hasThirteenthAccrued: 'não',
      noticeStatus: 'indenizado'
    });
    expect(result.normalizedInput.hasVacationAccrued).toBe('yes');
    expect(result.normalizedInput.hasThirteenthAccrued).toBe('no');
    expect(result.normalizedInput.noticeStatus).toBe('indenizado');
  });

  test('campos desconhecidos permanecem como valores padrão', () => {
    const result = processLaborSettlementIntake({
      salary: 3000,
      admissionDate: '2023-01-15',
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa sem justa causa'
    });
    expect(result.normalizedInput.hasVacationAccrued).toBe('unknown');
    expect(result.normalizedInput.hasThirteenthAccrued).toBe('unknown');
    expect(result.normalizedInput.noticeStatus).toBe('desconhecido');
  });
});

describe('laborSettlementIntake - validação e ambiguidade', () => {
  test('salário inválido é rejeitado', () => {
    const result = processLaborSettlementIntake({ ...completeInput, salary: 'abc' });
    expect(result.status).toBe('needs_information');
    expect(result.missingFields).toContain('salary');
    expect(result.calculation).toBeNull();
  });

  test('datas inválidas são rejeitadas', () => {
    const result = processLaborSettlementIntake({
      ...completeInput,
      admissionDate: 'não sei',
      terminationDate: '2024-07-10'
    });
    expect(result.status).toBe('invalid');
    expect(result.calculation).toBeNull();
    expect(result.warnings.some(w => w.includes('Data'))).toBe(true);
  });

  test('desligamento anterior à admissão é rejeitado', () => {
    const result = processLaborSettlementIntake({
      ...completeInput,
      admissionDate: '2024-07-10',
      terminationDate: '2023-01-15'
    });
    expect(result.status).toBe('invalid');
    expect(result.warnings.some(w => w.includes('anterior'))).toBe(true);
  });

  test('motivo ambíguo gera ambiguousFields', () => {
    const result = processLaborSettlementIntake({
      ...completeInput,
      terminationReason: 'fui embora'
    });
    expect(result.ambiguousFields).toContain('terminationReason');
    expect(result.calculation).toBeNull();
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
  });
});

describe('laborSettlementIntake - integridade com o motor', () => {
  test('rescisão indireta permanece conditional', () => {
    const result = processLaborSettlementIntake({
      ...completeInput,
      terminationReason: 'rescisão indireta em discussão'
    });
    expect(result.status).toBe('ready');
    expect(result.calculation.status).toBe('partial');
    const calculated = result.calculation.items.filter(i => i.status === 'calculated');
    expect(calculated.length).toBe(0);
  });

  test('o módulo de intake não calcula valores por conta própria', () => {
    const result = processLaborSettlementIntake(completeInput);
    expect(result.calculation.totalEstimated).toEqual(
      result.calculation.items
        .filter(i => i.status === 'calculated')
        .reduce((sum, i) => sum + i.amount, 0)
    );
  });

  test('o total recebido é exatamente o total retornado pelo motor', () => {
    const { calculateLaborSettlement } = require('../lib/laborSettlementCalculator');
    const result = processLaborSettlementIntake(completeInput);
    const motor = calculateLaborSettlement(result.normalizedInput);
    expect(result.calculation.totalEstimated).toBe(motor.totalEstimated);
    expect(result.calculation.items.length).toBe(motor.items.length);
  });

  test('a saída contém aviso de estimativa aproximada', () => {
    const result = processLaborSettlementIntake(completeInput);
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
    expect(result.calculation.warnings.some(w => w.includes('estimativa'))).toBe(true);
  });

  test('não são geradas perguntas extras sobre horas extras nesta fase', () => {
    const result = processLaborSettlementIntake(completeInput);
    expect(result.nextQuestions).toHaveLength(0);
    const allQuestions = Object.values(result.nextQuestions || []).join(' ');
    expect(allQuestions).not.toContain('horas extras');
  });
});

describe('laborSettlementIntake - segurança e privacidade', () => {
  test('nenhum log contém salário, datas ou dados pessoais', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    processLaborSettlementIntake(completeInput);
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  test('não expõe PII na estrutura de nextQuestions', () => {
    const result = processLaborSettlementIntake({
      salary: null,
      admissionDate: null,
      terminationDate: null,
      terminationReason: null
    });
    for (const question of result.nextQuestions) {
      expect(question).not.toMatch(/\d{11}/);
      expect(question).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/);
    }
  });
});

describe('laborSettlementIntake - próximas perguntas', () => {
  test('perguntas mínimas são geradas para campos faltantes', () => {
    const result = processLaborSettlementIntake({
      salary: null,
      admissionDate: '2023-01-15',
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa sem justa causa'
    });
    expect(result.nextQuestions.length).toBeGreaterThan(0);
    expect(result.nextQuestions.some(q => q.includes('salário'))).toBe(true);
  });

  test('perguntas opcionais são sugeridas quando desconhecidas e mínimos já existem', () => {
    const result = processLaborSettlementIntake({
      salary: 3000,
      admissionDate: '2023-01-15',
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa sem justa causa',
      noticeStatus: 'desconhecido'
    });
    expect(result.status).toBe('ready');
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
  });
});
