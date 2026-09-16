import {
  detectArea,
  getNextQuestion,
  isIntakeComplete,
  extractCivilTheme,
  isContractTheme,
  getFlow
} from '../lib/intakeFlows';

describe('intakeFlows', () => {
  test('quitação de contrato reconhece Cível', () => {
    expect(detectArea('Gostaria de verificar valores para quitação de um contrato')).toBe('civel');
  });

  test('fluxo Cível reconhece Contratos na mensagem e pula a pergunta de tema', () => {
    const msg = 'Gostaria de verificar valores para quitação de um contrato';
    const q = getNextQuestion('civel', 0, {}, msg);
    expect(q.field).toBe('contract_type');
    expect(q.step).toBe(1);
    expect(q.question).toMatch(/Que tipo de contrato é/);
    expect(q.question).toMatch(/Se puder, conte também o que aconteceu/);
    expect(q.question).not.toMatch(/qual é o tema/);
  });

  test('mensagem cível sem tema continua pedindo o tema', () => {
    const msg = 'Preciso de ajuda com uma ação';
    const q = getNextQuestion('civel', 0, {}, msg);
    expect(q.field).toBe('area_especifica');
    expect(q.question).toMatch(/qual é o tema/);
  });

  test('contrato de financiamento segue para parte contrária', () => {
    const answers = { area_especifica: 'Contratos', contract_type: 'contrato de financiamento' };
    const q = getNextQuestion('civel', 2, answers);
    expect(q.field).toBe('parte_contraria');
    expect(q.step).toBe(2);
  });

  test('contrato de prestação de serviços segue para parte contrária', () => {
    const answers = { area_especifica: 'Contratos', contract_type: 'contrato de prestação de serviços' };
    const q = getNextQuestion('civel', 2, answers);
    expect(q.field).toBe('parte_contraria');
  });

  test('tema que não é contrato pula a pergunta de tipo de contrato', () => {
    const answers = { area_especifica: 'Indenização' };
    const q = getNextQuestion('civel', 1, answers);
    expect(q.field).toBe('parte_contraria');
    expect(q.step).toBe(2);
  });

  test('fluxo trabalhista não é afetado', () => {
    const q = getNextQuestion('trabalhista', 0);
    expect(q.field).toBe('tempo_trabalho');
    expect(q.step).toBe(0);
  });

  test('intake completo quando não há mais perguntas', () => {
    const flow = getFlow('civel');
    expect(isIntakeComplete('civel', flow.questions.length, {})).toBe(true);
  });

  test('intake não está completo no início', () => {
    expect(isIntakeComplete('civel', 0, {})).toBe(false);
  });

  test('extractCivilTheme encontra contrato', () => {
    expect(extractCivilTheme('quitação de contrato')).toBe('Contratos');
    expect(extractCivilTheme('rescisão contratual')).toBe('Contratos');
  });

  test('extractCivilTheme retorna null sem contrato', () => {
    expect(extractCivilTheme('fui atropelado e quero indenização')).toBeNull();
  });

  test('isContractTheme reconhece variações de contrato', () => {
    expect(isContractTheme('Contratos')).toBe(true);
    expect(isContractTheme('contrato de prestação de serviços')).toBe(true);
    expect(isContractTheme('Indenização')).toBe(false);
  });
});
