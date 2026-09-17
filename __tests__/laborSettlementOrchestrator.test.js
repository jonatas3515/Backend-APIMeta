/**
 * Testes puros para o orquestrador de cálculo de verbas trabalhistas.
 */

const { handleLaborSettlementMessage, extractLaborFields } = require('../lib/laborSettlementOrchestrator');

const idleState = {
  active: false,
  intent: null,
  collected: {},
  askedFields: [],
  status: 'idle'
};

describe('handleLaborSettlementMessage - não repete perguntas rígidas', () => {
  test('mensagem vazia/inicial é liberada para o Gemini', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quero calcular minha rescisão',
      state: idleState
    });
    expect(result.intent).toBe('other');
    expect(result.response.text).toBe('');
    expect(result.response.kind).toBe('released_to_gemini');
    expect(result.response.text).not.toContain('Para estimar sua rescisão');
  });

  test('labor_question é liberada para o Gemini', () => {
    const result = handleLaborSettlementMessage({
      message: 'Posso pedir rescisão indireta?',
      state: idleState
    });
    expect(result.intent).toBe('other');
    expect(result.response.text).toBe('');
    expect(result.state.active).toBe(false);
  });

  test('other não inicia coleta', () => {
    const result = handleLaborSettlementMessage({
      message: 'Bom dia',
      state: idleState
    });
    expect(result.intent).toBe('other');
    expect(result.response.text).toBe('');
  });

  test('dados incompletos não geram pergunta de formulário', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? Fui demitido e ganhava R$ 2.500',
      state: idleState
    });
    expect(result.intent).toBe('other');
    expect(result.response.text).toBe('');
    expect(result.response.text).not.toContain('Para estimar sua rescisão');
    expect(result.state.collected.salary).toBe(2500);
  });

  test('expressões de desabafo não travam o fluxo', () => {
    const result = handleLaborSettlementMessage({
      message: 'Aff',
      state: idleState
    });
    expect(result.intent).toBe('other');
    expect(result.response.text).toBe('');
  });
});

describe('handleLaborSettlementMessage - cálculo e estimativa', () => {
  test('mensagem com salário, datas e motivo chega ao cálculo', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado',
      state: idleState
    });
    expect(result.status).toBe('completed');
    expect(result.response.kind).toBe('estimate');
    expect(result.calculation).not.toBeNull();
    expect(result.calculation.totalEstimated).toBeGreaterThan(0);
  });

  test('motivo ausente não bloqueia: assume desconhecido e calcula parcial', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber de rescisão? R$ 3.000, de 15/01/2023 a 10/07/2024',
      state: idleState
    });
    expect(result.status).toBe('completed');
    expect(result.response.kind).toBe('estimate');
    expect(result.warnings.some(w => w.includes('estimativa'))).toBe(true);
  });

  test('rescisão indireta permanece condicional', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 2.000, de 01/01/2023 a 30/06/2024, rescisão indireta em discussão, aviso não sei',
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
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado',
      state: idleState
    });
    expect(result.calculation).not.toBeNull();
    const vacation = result.calculation.items.find(i => i.code === 'vacation_accrued');
    expect(vacation.status).toBe('not_calculated');
  });

  test('aviso desconhecido permanece desconhecido', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso não sei',
      state: idleState
    });
    const notice = result.calculation.items.find(i => i.code === 'notice_unknown');
    expect(notice).toBeTruthy();
  });
});

describe('handleLaborSettlementMessage - datas relativas e contexto', () => {
  test('"hoje" preenche desligamento quando a admissão já foi indicada', () => {
    process.env.LABOR_TODAY_DATE = '2025-07-24';
    const state = {
      active: true,
      intent: 'labor_settlement_estimate',
      collected: { salary: 3000, admissionDate: '2025-01-01' },
      askedFields: [],
      status: 'collecting'
    };
    const result = handleLaborSettlementMessage({
      message: 'saí hoje',
      state
    });
    expect(result.state.collected.terminationDate).toBe('2025-07-24');
    delete process.env.LABOR_TODAY_DATE;
  });
});

describe('extractLaborFields - datas relativas e naturais', () => {
  beforeEach(() => {
    process.env.LABOR_TODAY_DATE = '2025-07-24';
  });
  afterEach(() => {
    delete process.env.LABOR_TODAY_DATE;
  });

  test('"entrei em janeiro e saí hoje" separa admissão e desligamento', () => {
    const result = extractLaborFields('entrei em janeiro e saí hoje', [], {});
    expect(result.admissionDate).toBe('2025-01-01');
    expect(result.terminationDate).toBe('2025-07-24');
  });

  test('"janeiro" preenche admissão', () => {
    const result = extractLaborFields('janeiro', [], {});
    expect(result.admissionDate).toBe('2025-01-01');
  });

  test('"janeiro dia 1" captura o dia', () => {
    const result = extractLaborFields('janeiro dia 1', [], {});
    expect(result.admissionDate).toBe('2025-01-01');
  });

  test('"dia 02/01" captura data incompleta', () => {
    const result = extractLaborFields('dia 02/01', [], {});
    expect(result.admissionDate).toBe('2025-01-02');
  });

  test('"ontem" preenche desligamento', () => {
    const result = extractLaborFields('fui demitido ontem', [], {});
    expect(result.terminationDate).toBe('2025-07-23');
  });

  test('hoje não sobrescreve admissão já conhecida', () => {
    const result = extractLaborFields('saí hoje', [], { admissionDate: '2025-01-01' });
    expect(result.admissionDate).toBeUndefined();
    expect(result.terminationDate).toBe('2025-07-24');
  });
});

describe('extractLaborFields - respostas diretas', () => {
  test('"Indenizado" sozinho preenche noticeStatus quando perguntado', () => {
    const result = extractLaborFields('Indenizado', ['noticeStatus'], {});
    expect(result.noticeStatus).toBe('indenizado');
  });

  test('"foi indenizado" preenche noticeStatus quando perguntado', () => {
    const result = extractLaborFields('foi indenizado', ['noticeStatus'], {});
    expect(result.noticeStatus).toBe('indenizado');
  });

  test('"sim" preenche férias vencidas quando for a única pendência', () => {
    const result = extractLaborFields('sim', ['hasVacationAccrued'], { salary: 1000, admissionDate: '2024-01-01', terminationDate: '2024-06-01', terminationReason: 'dispensa_sem_justa_causa', noticeStatus: 'trabalhado' });
    expect(result.hasVacationAccrued).toBe('yes');
  });
});

describe('extractLaborFields - dispensa imediata e informalidade', () => {
  beforeEach(() => {
    process.env.LABOR_TODAY_DATE = '2025-07-24';
  });
  afterEach(() => {
    delete process.env.LABOR_TODAY_DATE;
  });

  test.each([
    'fui mandado embora hoje',
    'fui mandada embora hoje',
    'mandaram embora',
    'me mandaram embora',
    'falaram para não ir mais',
    'não precisa voltar mais',
    'demitida hoje',
    'me dispensaram'
  ])('dispensa imediata "%s" infere aviso indenizado e dispensa sem justa causa', (phrase) => {
    const result = extractLaborFields(phrase, [], {});
    expect(result.noticeStatus).toBe('indenizado');
    expect(result.terminationReason).toBe('dispensa_sem_justa_causa');
  });

  test('dispensa imediata não sobrescreve motivo já coletado', () => {
    const result = extractLaborFields('pedi demissão e falaram para não ir mais', [], {});
    expect(result.terminationReason).toBe('pedido_demissao');
    expect(result.noticeStatus).toBeUndefined();
  });

  test.each([
    'não assinaram carteira',
    'não assinaram minha carteira',
    'sem registro',
    'sem carteira assinada',
    'trabalhava sem registro',
    'carteira não foi assinada'
  ])('informalidade "%s" preenche hasCtps=no', (phrase) => {
    const result = extractLaborFields(phrase, [], {});
    expect(result.hasCtps).toBe('no');
  });

  test('"carteira assinada" preenche hasCtps=yes', () => {
    const result = extractLaborFields('tinha carteira assinada', [], {});
    expect(result.hasCtps).toBe('yes');
  });

  test('relato completo sem pedido de valor gera estimativa com FGTS e aviso indenizado', () => {
    const result = handleLaborSettlementMessage({
      message: 'Fui mandada embora hoje, ganhava 2500 por mês, entrei em janeiro e não assinaram minha carteira',
      state: idleState
    });
    expect(result.status).toBe('completed');
    expect(result.calculation).not.toBeNull();
    expect(result.calculation.totalEstimated).toBeGreaterThan(0);
    const codes = result.calculation.items.map(i => i.code);
    expect(codes).toContain('notice_indemnity');
    expect(codes).toContain('fgts_deposits');
    expect(codes).toContain('fgts_penalty_40');
    expect(result.response.text).toContain('Total estimado');
  });

  test('mensagem não trabalhista com números e datas soltas não dispara estimativa', () => {
    const result = handleLaborSettlementMessage({
      message: 'entrei na academia em janeiro e hoje paguei 250 reais',
      state: idleState
    });
    expect(result.calculation).toBeNull();
  });
});

describe('handleLaborSettlementMessage - integridade', () => {
  test('resposta de cálculo é curta e organizada para WhatsApp', () => {
    const result = handleLaborSettlementMessage({
      message: 'Quanto vou receber? R$ 3.000, de 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado',
      state: idleState
    });
    expect(result.status).toBe('completed');
    expect(result.response.text).toContain('🧾 Estimativa preliminar');
    expect(result.response.text).toContain('📌 Dados considerados');
    expect(result.response.text).toContain('💰 Verbas estimadas');
    expect(result.response.text).toContain('➡️ Total estimado');
  });

  test('mesma entrada e estado produzem mesma saída', () => {
    const r1 = handleLaborSettlementMessage({
      message: 'R$ 3.000, 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado',
      state: idleState
    });
    const r2 = handleLaborSettlementMessage({
      message: 'R$ 3.000, 15/01/2023 a 10/07/2024, fui demitido sem justa causa, aviso indenizado',
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
