const { formatSiteLaborSettlementResponse, formatLaborValueAnswer } = require('../lib/laborSettlementResponse');

describe('formatSiteLaborSettlementResponse', () => {
  const baseCalculation = {
    status: 'complete',
    currency: 'BRL',
    totalEstimated: 10000,
    inputSummary: {
      salary: 2500,
      admissionDate: '2026-01-01',
      terminationDate: '2026-09-17',
      terminationReason: 'demissaoSemJustaCausa',
      hasCtps: 'no',
      period: { monthsOfWork: 8 }
    },
    items: [
      { code: 'salary_balance', name: 'Saldo de salário', amount: 1416.67, status: 'calculated' },
      { code: 'notice_pay', name: 'Aviso-prévio indenizado', amount: 2500, status: 'calculated' },
      { code: 'thirteenth_proportional', name: '13º proporcional', amount: 1666.67, status: 'calculated' },
      { code: 'vacation_proportional', name: 'Férias proporcionais', amount: 1666.67, status: 'calculated' },
      { code: 'vacation_bonus', name: '1/3 constitucional sobre férias', amount: 555.56, status: 'calculated' },
      { code: 'inss', name: 'INSS', amount: 263.41, status: 'calculated' },
      { code: 'fgts', name: 'Depósitos de FGTS', amount: 1800, status: 'calculated' },
      { code: 'fgts_fine', name: 'Multa de 40% sobre FGTS', amount: 720, status: 'calculated', assumptions: ['Multa rescisória: 40%'] }
    ]
  };

  test('exibe as quatro seções e o motivo traduzido', () => {
    const response = formatSiteLaborSettlementResponse(baseCalculation);
    expect(response.text).toContain('💰 Verbas rescisórias');
    expect(response.text).toContain('➖ Descontos');
    expect(response.text).toContain('🏦 FGTS estimado');
    expect(response.text).toContain('➡️ Total líquido das verbas rescisórias');
    expect(response.text).toContain('➡️ Total estimado incluindo FGTS + multa');
    expect(response.text).toContain('Motivo: dispensa sem justa causa');
    expect(response.text).toContain('Carteira assinada: não');
  });

  test('INSS aparece apenas uma vez e como desconto', () => {
    const response = formatSiteLaborSettlementResponse(baseCalculation);
    const matches = (response.text.match(/INSS/g) || []).length;
    expect(matches).toBe(1);
    expect(response.text).toMatch(/INSS:\s*-R\$\s*263,41/);
  });

  test('total líquido das verbas = bruto - INSS', () => {
    const response = formatSiteLaborSettlementResponse(baseCalculation);
    const gross = 1416.67 + 2500 + 1666.67 + 1666.67 + 555.56;
    const expectedNet = gross - 263.41;
    expect(response.text).toContain(`Total líquido das verbas rescisórias: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(expectedNet)}`);
  });

  test('total com FGTS = verbas líquidas + FGTS + multa', () => {
    const response = formatSiteLaborSettlementResponse(baseCalculation);
    const gross = 1416.67 + 2500 + 1666.67 + 1666.67 + 555.56;
    const net = gross - 263.41;
    const total = net + 1800 + 720;
    expect(response.text).toContain(`Total estimado incluindo FGTS + multa: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(total)}`);
  });

  test('mapeia códigos antigos e remove duplicatas', () => {
    const withOldCodes = {
      ...baseCalculation,
      items: [
        { code: 'salary_balance', name: 'Saldo de salário', amount: 1416.67, status: 'calculated' },
        { code: 'notice_indemnity', name: 'Aviso-prévio indenizado', amount: 2500, status: 'calculated' },
        { code: 'inss_discount', name: 'Desconto INSS', amount: 263.41, status: 'calculated' },
        { code: 'fgts_deposits', name: 'FGTS estimado', amount: 1800, status: 'calculated' },
        { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 720, status: 'calculated', assumptions: ['Multa rescisória: 40%'] }
      ]
    };
    const response = formatSiteLaborSettlementResponse(withOldCodes);
    const inssMatches = (response.text.match(/INSS/g) || []).length;
    expect(inssMatches).toBe(1);
    expect(response.text).toContain('Aviso-prévio indenizado');
    expect(response.text).toContain('FGTS + multa');
  });
});

describe('formatLaborValueAnswer', () => {
  const baseCalculation = {
    totalEstimated: 10000,
    items: [
      { code: 'salary_balance', name: 'Saldo de salário', amount: 1416.67, status: 'calculated' },
      { code: 'notice_pay', name: 'Aviso-prévio indenizado', amount: 2500, status: 'calculated' },
      { code: 'thirteenth_proportional', name: '13º proporcional', amount: 1666.67, status: 'calculated' },
      { code: 'vacation_proportional', name: 'Férias proporcionais', amount: 1666.67, status: 'calculated' },
      { code: 'vacation_bonus', name: '1/3 constitucional sobre férias', amount: 555.56, status: 'calculated' },
      { code: 'inss', name: 'INSS', amount: 263.41, status: 'calculated' },
      { code: 'fgts', name: 'Depósitos de FGTS', amount: 1800, status: 'calculated' },
      { code: 'fgts_fine', name: 'Multa de 40% sobre FGTS', amount: 720, status: 'calculated' }
    ]
  };

  test('pergunta específica de FGTS retorna FGTS, multa e total', () => {
    const reply = formatLaborValueAnswer('Quanto dá só de FGTS com essa multa aí?', baseCalculation);
    expect(reply).toContain('1.800,00');
    expect(reply).toContain('720,00');
    expect(reply).toContain('2.520,00');
    expect(reply).toContain('estimativa preliminar');
  });

  test('pergunta genérica de valor não duplica INSS e mostra totais', () => {
    const reply = formatLaborValueAnswer('Quanto vou receber?', baseCalculation);
    const inssMatches = (reply.match(/INSS/g) || []).length;
    expect(inssMatches).toBe(1);
    expect(reply).toContain('Total líquido das verbas');
    expect(reply).toContain('Total incluindo FGTS + multa');
  });

  test('objetos antigos sem códigos mapeados continuam compatíveis', () => {
    const oldCalculation = {
      totalEstimated: 10000,
      items: [
        { code: 'fgts_deposits', name: 'FGTS estimado (8% mensal)', amount: 1600, status: 'calculated' },
        { code: 'fgts_penalty_40', name: 'Multa de 40% sobre FGTS', amount: 640, status: 'calculated' }
      ]
    };
    const reply = formatLaborValueAnswer('Quanto dá só de FGTS?', oldCalculation);
    expect(reply).toContain('1.600,00');
    expect(reply).toContain('640,00');
    expect(reply).toContain('2.240,00');
  });
});
