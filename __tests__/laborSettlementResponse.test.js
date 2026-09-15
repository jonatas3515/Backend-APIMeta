/**
 * Testes puros para o formatador de resposta da calculadora trabalhista.
 */

const { formatLaborSettlementResponse } = require('../lib/laborSettlementResponse');
const { processLaborSettlementIntake } = require('../lib/laborSettlementIntake');

const estimateIntent = { intent: 'labor_settlement_estimate', confidence: 'high', requiresIntake: true };
const questionIntent = { intent: 'labor_question', confidence: 'medium', requiresIntake: false };

describe('laborSettlementResponse - needs_information', () => {
  test('needs_information retorna apenas perguntas faltantes', () => {
    const intake = processLaborSettlementIntake({
      salary: 3000,
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa sem justa causa'
    });
    const response = formatLaborSettlementResponse({
      status: 'needs_information',
      intakeResult: intake,
      calculation: null,
      intent: estimateIntent,
      missingFields: ['admissionDate'],
      nextQuestions: [intake.nextQuestions[0]]
    });
    expect(response.type).toBe('needs_information');
    expect(response.nextQuestions.length).toBeGreaterThan(0);
    expect(response.text).toContain('admissão');
    expect(response.text).not.toContain('valor');
  });

  test('invalid solicita apenas correção', () => {
    const response = formatLaborSettlementResponse({
      status: 'invalid',
      calculation: null,
      intent: estimateIntent,
      missingFields: [],
      warnings: ['Data de desligamento não pode ser anterior à data de admissão.'],
      nextQuestions: ['Qual a data correta de desligamento?']
    });
    expect(response.type).toBe('needs_information');
    expect(response.text).toContain('inconsistentes');
    expect(response.text).toContain('anterior');
  });
});

describe('laborSettlementResponse - ready', () => {
  const intake = processLaborSettlementIntake({
    salary: 3000,
    admissionDate: '2023-01-15',
    terminationDate: '2024-07-10',
    terminationReason: 'dispensa sem justa causa',
    hasVacationAccrued: 'no',
    hasThirteenthAccrued: 'no',
    noticeStatus: 'indenizado'
  });

  test('ready separa calculados, condicionais e não calculados', () => {
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake,
      calculation: intake.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake.calculation.warnings,
      nextQuestions: []
    });
    expect(response.type).toBe('labor_settlement_estimate');
    expect(response.text).toContain('Verbas calculadas');
    expect(response.text).toContain('Verbas condicionais');
    expect(response.text).toContain('Verbas não incluídas');
    expect(response.text).toContain('Total estimado');
  });

  test('total é exatamente o recebido do motor', () => {
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake,
      calculation: intake.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake.calculation.warnings,
      nextQuestions: []
    });
    expect(response.totalEstimated).toBe(intake.calculation.totalEstimated);
    expect(response.text).toContain(response.totalEstimated.toFixed(2).replace('.', ','));
  });

  test('warnings obrigatórios permanecem', () => {
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake,
      calculation: intake.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake.calculation.warnings,
      nextQuestions: []
    });
    expect(response.text).toContain('estimativa preliminar');
    expect(response.text).toContain('profissional');
    expect(response.disclaimers.length).toBeGreaterThan(0);
  });

  test('nenhum valor é recalculado', () => {
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake,
      calculation: intake.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake.calculation.warnings,
      nextQuestions: []
    });
    const salaryBalance = intake.calculation.items.find(i => i.code === 'salary_balance').amount;
    expect(response.text).toContain(salaryBalance.toFixed(2).replace('.', ','));
  });
});

describe('laborSettlementResponse - labor_question', () => {
  test('labor_question não chama o motor', () => {
    const response = formatLaborSettlementResponse({
      status: 'ready',
      calculation: null,
      intent: questionIntent,
      missingFields: [],
      warnings: [],
      nextQuestions: []
    });
    expect(response.type).toBe('labor_question');
    expect(response.text).not.toContain('Total estimado');
    expect(response.text).toContain('dúvida trabalhista');
  });
});

describe('laborSettlementResponse - itens condicionais e não calculados', () => {
  const intake = processLaborSettlementIntake({
    salary: 3000,
    admissionDate: '2023-01-15',
    terminationDate: '2024-07-10',
    terminationReason: 'dispensa sem justa causa',
    hasVacationAccrued: 'no',
    hasThirteenthAccrued: 'no',
    noticeStatus: 'desconhecido'
  });

  test('FGTS e horas extras aparecem como condicionais/não calculados', () => {
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake,
      calculation: intake.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake.calculation.warnings,
      nextQuestions: []
    });
    expect(response.text).toContain('FGTS');
    expect(response.text).toContain('não incluído');
    expect(response.text).toContain('Horas extras');
  });
});

describe('laborSettlementResponse - segurança', () => {
  test('não expõe salário literal no texto', () => {
    const intake = processLaborSettlementIntake({
      salary: 3000,
      admissionDate: '2023-01-15',
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa sem justa causa'
    });
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake,
      calculation: intake.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake.calculation.warnings,
      nextQuestions: []
    });
    expect(response.text).not.toContain('3.000,00');
    expect(response.text).not.toMatch(/\d{11}/);
  });
});
