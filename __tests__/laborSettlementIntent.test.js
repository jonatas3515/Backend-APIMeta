/**
 * Testes puros para o classificador de intenção trabalhista.
 */

const { classifyLaborIntent } = require('../lib/laborSettlementIntent');

describe('laborSettlementIntent - cálculo', () => {
  test('"Quanto vou receber se for demitido?" → labor_settlement_estimate', () => {
    const result = classifyLaborIntent('Quanto vou receber se for demitido?');
    expect(result.intent).toBe('labor_settlement_estimate');
    expect(result.confidence).toBe('high');
    expect(result.requiresIntake).toBe(true);
  });

  test('"Calcule minha rescisão" → labor_settlement_estimate', () => {
    const result = classifyLaborIntent('Calcule minha rescisão');
    expect(result.intent).toBe('labor_settlement_estimate');
    expect(result.confidence).toBe('high');
  });

  test('"Trabalhei sem carteira, quanto posso receber?" → labor_settlement_estimate', () => {
    const result = classifyLaborIntent('Trabalhei sem carteira, quanto posso receber?');
    expect(result.intent).toBe('labor_settlement_estimate');
    expect(result.confidence).toBe('high');
  });

  test('"Quanto dá minha rescisão?" → labor_settlement_estimate', () => {
    const result = classifyLaborIntent('Quanto dá minha rescisão?');
    expect(result.intent).toBe('labor_settlement_estimate');
    expect(result.confidence).toBe('high');
  });

  test('"Quanto é o acerto se eu sair?" → labor_settlement_estimate', () => {
    const result = classifyLaborIntent('Quanto é o acerto se eu sair?');
    expect(result.intent).toBe('labor_settlement_estimate');
  });
});

describe('laborSettlementIntent - perguntas trabalhistas', () => {
  test('"Posso pedir rescisão indireta?" → labor_question', () => {
    const result = classifyLaborIntent('Posso pedir rescisão indireta?');
    expect(result.intent).toBe('labor_question');
    expect(result.requiresIntake).toBe(false);
  });

  test('"Tenho direito a férias?" → labor_question', () => {
    const result = classifyLaborIntent('Tenho direito a férias?');
    expect(result.intent).toBe('labor_question');
  });

  test('"O que é aviso-prévio?" → labor_question', () => {
    const result = classifyLaborIntent('O que é aviso-prévio?');
    expect(result.intent).toBe('labor_question');
  });

  test('"A empresa não assinou minha carteira" → labor_question', () => {
    const result = classifyLaborIntent('A empresa não assinou minha carteira');
    expect(result.intent).toBe('labor_question');
  });
});

describe('laborSettlementIntent - não deve disparar cálculo', () => {
  test('"Fui mandado embora" sem pedido de valor → labor_question', () => {
    const result = classifyLaborIntent('Fui mandado embora');
    expect(result.intent).toBe('labor_question');
  });

  test('"Quanto é o salário mínimo?" → other', () => {
    const result = classifyLaborIntent('Quanto é o salário mínimo?');
    expect(result.intent).toBe('other');
  });

  test('"O que é FGTS?" → other', () => {
    const result = classifyLaborIntent('O que é FGTS?');
    expect(result.intent).toBe('other');
  });

  test('"Rescisão" sozinho → labor_question', () => {
    const result = classifyLaborIntent('Rescisão');
    expect(result.intent).toBe('labor_question');
    expect(result.requiresIntake).toBe(false);
  });

  test('"Tenho direito a férias e 13º?" → labor_question', () => {
    const result = classifyLaborIntent('Tenho direito a férias e 13º?');
    expect(result.intent).toBe('labor_question');
  });
});

describe('laborSettlementIntent - outras e vazias', () => {
  test('Mensagem vazia → other', () => {
    const result = classifyLaborIntent('');
    expect(result.intent).toBe('other');
    expect(result.confidence).toBe('low');
  });

  test('Mensagem nula → other', () => {
    const result = classifyLaborIntent(null);
    expect(result.intent).toBe('other');
  });

  test('Pergunta de consumidor → other', () => {
    const result = classifyLaborIntent('Quanto posso cobrar de juros por atraso?');
    expect(result.intent).toBe('other');
  });

  test('Saudação → other', () => {
    const result = classifyLaborIntent('Bom dia');
    expect(result.intent).toBe('other');
  });
});

describe('laborSettlementIntent - normalização', () => {
  test('Texto com acentos e caixa alta é normalizado', () => {
    const result = classifyLaborIntent('CALCULE O VALOR DAS MINHAS VERBAS RESCISÓRIAS');
    expect(result.intent).toBe('labor_settlement_estimate');
  });

  test('Pontuação não impede classificação', () => {
    const result = classifyLaborIntent('Quanto vou receber, se for demitido?!');
    expect(result.intent).toBe('labor_settlement_estimate');
  });
});
