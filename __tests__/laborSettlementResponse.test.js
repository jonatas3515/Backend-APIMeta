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
    expect(response.type).toBe('invalid');
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
    expect(response.text).toContain('Verbas estimadas');
    expect(response.text).toContain('Não incluídos');
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
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(response.totalEstimated);
    expect(response.text).toContain(formatted);
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
    expect(response.text).toContain('Estimativa preliminar');
    expect(response.disclaimers.some(d => d.includes('profissional'))).toBe(true);
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
    const formattedBalance = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(salaryBalance);
    expect(response.text).toContain(formattedBalance);
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

  test('horas extras e convenção aparecem como não calculados, sem duplicatas', () => {
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake,
      calculation: intake.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake.calculation.warnings,
      nextQuestions: []
    });
    expect(response.text).toContain('Não incluídos');
    expect(response.text).toContain('Horas extras');
    expect(response.text).toContain('Convenção coletiva');
    // Não deve repetir itens na lista de não incluídos
    const naoIncluidosSection = response.text.split('Não incluídos')[1] || '';
    const items = naoIncluidosSection.split('\n').filter(l => l.startsWith('•'));
    expect(items.length).toBe(new Set(items).size);
  });

  test('vínculo menor de 12 meses não menciona férias/13º vencidos', () => {
    const intake2 = processLaborSettlementIntake({
      salary: 2500,
      admissionDate: '2024-01-15',
      terminationDate: '2024-09-10',
      terminationReason: 'dispensa sem justa causa',
      noticeStatus: 'indenizado',
      hasCtps: 'no'
    });
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake2,
      calculation: intake2.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake2.calculation.warnings,
      nextQuestions: []
    });
    expect(response.text).not.toContain('Férias vencidas');
    expect(response.text).not.toContain('13º vencido');
    expect(response.text).toContain('Férias proporcionais');
    expect(response.text).toContain('13º proporcional');
  });

  test('sem carteira inclui FGTS e multa no total', () => {
    const intake2 = processLaborSettlementIntake({
      salary: 2500,
      admissionDate: '2024-01-15',
      terminationDate: '2024-09-10',
      terminationReason: 'dispensa sem justa causa',
      noticeStatus: 'indenizado',
      hasCtps: 'no'
    });
    const response = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult: intake2,
      calculation: intake2.calculation,
      intent: estimateIntent,
      missingFields: [],
      warnings: intake2.calculation.warnings,
      nextQuestions: []
    });
    expect(response.text).toContain('FGTS');
    expect(response.text).toContain('Multa de 40%');
    expect(response.text).toContain('registro em carteira');
  });
});

describe('laborSettlementResponse - segurança', () => {
  test('não expõe dados sensíveis no texto', () => {
    const intake = processLaborSettlementIntake({
      salary: 3000,
      admissionDate: '2023-01-15',
      terminationDate: '2024-07-10',
      terminationReason: 'dispensa sem justa causa',
      noticeStatus: 'desconhecido'
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
    expect(response.text).toContain('3.000,00');
    expect(response.text).not.toMatch(/\d{11}/);
  });
});
