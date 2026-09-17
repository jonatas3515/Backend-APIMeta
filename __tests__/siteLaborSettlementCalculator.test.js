const { calculateSiteLaborSettlement } = require('../lib/siteLaborSettlementCalculator');

describe('siteLaborSettlementCalculator', () => {
  test('calcula rescisão sem justa causa com saldo, aviso, 13º, férias, FGTS e multa', () => {
    const result = calculateSiteLaborSettlement({
      salary: 2500,
      admissionDate: '2025-01-01',
      terminationDate: '2025-09-16',
      terminationReason: 'demissaoSemJustaCausa',
      noticeStatus: 'indenizado',
      hasVacationAccrued: false,
      dependents: 0
    });

    expect(result.status).toBe('complete');
    expect(result.currency).toBe('BRL');
    expect(result.totalEstimated).toBeGreaterThan(0);
    expect(result.items.some(i => i.code === 'salary_balance' && i.amount > 0)).toBe(true);
    expect(result.items.some(i => i.code === 'notice_indemnity' && i.amount > 0)).toBe(true);
    expect(result.items.some(i => i.code === 'thirteenth_proportional' && i.amount > 0)).toBe(true);
    expect(result.items.some(i => i.code === 'fgts_deposits' && i.amount > 0)).toBe(true);
    const penalty = result.items.find(i => i.code === 'fgts_penalty_40');
    expect(penalty).toBeTruthy();
    expect(penalty.amount).toBeGreaterThan(0);
    expect(result.inputSummary.terminationReason).toBe('demissaoSemJustaCausa');
  });

  test('demissão com justa causa zera aviso, 13º e férias, e multa fica zero', () => {
    const result = calculateSiteLaborSettlement({
      salary: 2500,
      admissionDate: '2025-01-01',
      terminationDate: '2025-09-16',
      terminationReason: 'demissaoComJustaCausa',
      noticeStatus: 'indenizado',
      hasVacationAccrued: false,
      dependents: 0
    });

    expect(result.status).toBe('complete');
    const notice = result.items.find(i => i.code === 'notice_indemnity');
    const thirteenth = result.items.find(i => i.code === 'thirteenth_proportional');
    const vacation = result.items.find(i => i.code === 'vacation_proportional');
    const penalty = result.items.find(i => i.code === 'fgts_penalty_40');
    expect(notice.amount).toBe(0);
    expect(thirteenth.amount).toBe(0);
    expect(vacation.amount).toBe(0);
    expect(penalty.amount).toBe(0);
  });

  test('acordo mútuo aplica multa de 20% sobre FGTS', () => {
    const result = calculateSiteLaborSettlement({
      salary: 3000,
      admissionDate: '2024-06-01',
      terminationDate: '2025-06-01',
      terminationReason: 'acordoMutuo',
      noticeStatus: 'trabalhado',
      hasVacationAccrued: false,
      dependents: 0
    });

    expect(result.status).toBe('complete');
    const penalty = result.items.find(i => i.code === 'fgts_penalty_40');
    const deposits = result.items.find(i => i.code === 'fgts_deposits');
    expect(penalty).toBeTruthy();
    expect(penalty.amount).toBeCloseTo(deposits.amount * 0.2, 2);
    expect(penalty.name).toMatch(/20%/);
  });

  test('dados insuficientes retornam status insuficiente', () => {
    const result = calculateSiteLaborSettlement({
      salary: 2500,
      admissionDate: '',
      terminationDate: '',
      terminationReason: 'demissaoSemJustaCausa'
    });

    expect(result.status).toBe('insufficient_data');
    expect(result.totalEstimated).toBeNull();
    expect(result.items).toEqual([]);
  });

  test('filhos menores de 14 adicionam salário família e INSS', () => {
    const result = calculateSiteLaborSettlement({
      salary: 2000,
      admissionDate: '2025-01-01',
      terminationDate: '2025-09-30',
      terminationReason: 'demissaoSemJustaCausa',
      noticeStatus: 'indenizado',
      hasVacationAccrued: false,
      dependents: 2
    });

    expect(result.status).toBe('complete');
    const family = result.items.find(i => i.code === 'family_salary');
    const inss = result.items.find(i => i.code === 'inss_discount');
    expect(family).toBeTruthy();
    expect(family.amount).toBeGreaterThan(0);
    expect(inss).toBeTruthy();
    expect(inss.amount).toBeGreaterThan(0);
  });
});
