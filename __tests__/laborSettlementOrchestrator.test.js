/**
 * Testes puros para o orquestrador de cálculo de verbas trabalhistas.
 */

const { handleLaborSettlementMessage } = require('../lib/laborSettlementOrchestrator');

const idleState = {
  active: false,
  intent: null,
  collected: {},
  askedFields: [],
  status: 'idle'
};

describe('handleLaborSettlementMessage - início do fluxo', () => {
  test('nova mensagem de cálculo sem dados inicia coleta', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quero calcular minha rescisão',
      state: idleState
    });
    expect(result.status).toBe('collecting');
    expect(result.response.kind).toBe('question');
    expect(result.state.active).toBe(true);
    expect(result.missingFields).toContain('salary');
  });

  test('labor_question não inicia cálculo', () => {
    const result = handleLaborSettlementMessage({
      message: 'Posso pedir rescisão indireta?',
      state: idleState
    });
    expect(result.status).toBe('idle');
    expect(result.response.kind).toBe('guidance');
    expect(result.state.active).toBe(false);
  });

  test('other não inicia coleta', () => {
    const result = handleLaborSettlementMessage({
      message: 'Bom dia',
      state: idleState
    });
    expect(result.status).toBe('idle');
    expect(result.response.kind).toBe('ignored');
  });

  test('nova mensagem com salário preserva salário e pergunta datas/motivo', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? Fui demitido e ganhava R$ 2.500',
      state: idleState
    });
    expect(result.state.collected.salary).toBe(2500);
    expect(result.status).toBe('collecting');
    expect(result.missingFields).not.toContain('salary');
    expect(result.missingFields).toContain('admissionDate');
    expect(result.missingFields).toContain('terminationDate');
  });
});

describe('handleLaborSettlementMessage - continuação', () => {
  test('continuação mantém salário e pergunta próximo campo', () => {
    const first = handleLaborSettlementMessage({
      message: 'Quero calcular minha rescisão',
      state: idleState
    });
    const second = handleLaborSettlementMessage({
      message: 'R$ 3.000,00',
      state: first.state
    });
    expect(second.state.collected.salary).toBe(3000);
    expect(second.status).toBe('collecting');
    expect(second.missingFields).not.toContain('salary');
  });

  test('dados válidos anteriores não são apagados', () => {
    const first = handleLaborSettlementMessage({
      message: 'Quanto vou receber de rescisão? Ganhei R$ 2.500',
      state: idleState
    });
    const second = handleLaborSettlementMessage({
      message: '01/01/2024',
      state: first.state
    });
    const third = handleLaborSettlementMessage({
      message: '30/06/2025',
      state: second.state
    });
    expect(third.state.collected.salary).toBe(2500);
    expect(third.state.collected.admissionDate).toBe('2024-01-01');
    expect(third.state.collected.terminationDate).toBe('2025-06-30');
  });

  test('dado ambíguo não sobrescreve dado confirmado', () => {
    const first = handleLaborSettlementMessage({
      message: 'Quanto vou receber de rescisão? Ganhei R$ 2.500',
      state: idleState
    });
    const second = handleLaborSettlementMessage({
      message: 'acho que fui embora', // ambíguo
      state: first.state
    });
    expect(second.state.collected.salary).toBe(2500);
    expect(second.state.collected.terminationReason).toBeUndefined();
  });
});

describe('handleLaborSettlementMessage - cálculo completo', () => {
  test('mensagem com salário, datas e motivo chega ao cálculo', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    expect(result.status).toBe('completed');
    expect(result.response.kind).toBe('estimate');
    expect(result.calculation).not.toBeNull();
    expect(result.calculation.totalEstimated).toBeGreaterThan(0);
  });

  test('cálculo completo por etapas', () => {
    const s1 = handleLaborSettlementMessage({
      message: 'Quero calcular minha rescisão',
      state: idleState
    });
    const s2 = handleLaborSettlementMessage({ message: '2500', state: s1.state });
    const s3 = handleLaborSettlementMessage({ message: '01/01/2024', state: s2.state });
    const s4 = handleLaborSettlementMessage({ message: '30/06/2025', state: s3.state });
    const s5 = handleLaborSettlementMessage({
      message: 'fui demitido sem justa causa',
      state: s4.state
    });
    expect(s5.status).toBe('completed');
    expect(s5.response.kind).toBe('estimate');
    expect(s5.calculation.totalEstimated).toBeGreaterThan(0);
  });

  test('rescisão indireta permanece condicional', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 2.000, de 01/01/2023 a 30/06/2024, rescisão indireta em discussão',
      state: idleState
    });
    expect(result.status).toBe('completed');
    const calculated = result.calculation.items.filter(i => i.status === 'calculated');
    expect(calculated.length).toBe(0);
  });
});

describe('handleLaborSettlementMessage - campos opcionais', () => {
  test('férias e 13º desconhecidos permanecem unknown', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    expect(result.calculation).not.toBeNull();
    const vacation = result.calculation.items.find(i => i.code === 'vacation_accrued');
    expect(vacation.status).toBe('not_calculated');
  });

  test('aviso desconhecido permanece desconhecido', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    const notice = result.calculation.items.find(i => i.code === 'notice_unknown');
    expect(notice).toBeTruthy();
  });
});

describe('handleLaborSettlementMessage - invalidações', () => {
  test('datas inválidas retornam invalid sem cálculo fictício', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 10/07/2024 a 15/01/2023, fui demitido',
      state: idleState
    });
    expect(result.status).toBe('collecting');
    expect(result.response.kind).toBe('invalid');
    expect(result.calculation).toBeNull();
  });

  test('salário inválido retorna invalid', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ abc, de 15/01/2023 a 10/07/2024, fui demitido',
      state: idleState
    });
    expect(result.status).toBe('collecting');
    expect(result.response.kind).toBe('invalid');
    expect(result.calculation).toBeNull();
  });
});

describe('handleLaborSettlementMessage - cancelamento', () => {
  test('cancelamento limpa o estado', () => {
    const s1 = handleLaborSettlementMessage({
      message: 'Quero calcular minha rescisão',
      state: idleState
    });
    const cancelled = handleLaborSettlementMessage({
      message: 'Quero cancelar a simulação',
      state: s1.state
    });
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.state.active).toBe(false);
    expect(cancelled.state.collected).toEqual({});
  });
});

describe('handleLaborSettlementMessage - integridade', () => {
  test('horas extras não entram automaticamente', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, fiz muitas horas extras',
      state: idleState
    });
    const overtime = result.calculation.items.find(i => i.code === 'overtime');
    expect(overtime.status).toBe('not_calculated');
  });

  test('FGTS e multa não entram automaticamente', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    const fgts = result.calculation.items.find(i => i.code === 'fgts');
    expect(fgts.status).toBe('conditional');
  });

  test('total é exatamente o total do motor', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    const motorTotal = result.calculation.items
      .filter(i => i.status === 'calculated')
      .reduce((sum, i) => sum + i.amount, 0);
    expect(result.calculation.totalEstimated).toBeCloseTo(motorTotal, 2);
  });

  test('saída contém aviso de estimativa quando houver cálculo', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
    expect(result.response.text).toContain('estimativa');
  });
});

describe('handleLaborSettlementMessage - determinismo e privacidade', () => {
  test('mesma entrada e estado produzem mesma saída', () => {
    const r1 = handleLaborSettlementMessage({
      message: 'R$ 3.000, 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    const r2 = handleLaborSettlementMessage({
      message: 'R$ 3.000, 15/01/2023 a 10/07/2024, fui demitido sem justa causa',
      state: idleState
    });
    expect(r1).toEqual(r2);
  });

  test('nenhum log contém mensagem, salário ou datas', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    handleLaborSettlementMessage({
      message: 'R$ 3.000, 15/01/2023 a 10/07/2024, fui demitido',
      state: idleState
    });
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
