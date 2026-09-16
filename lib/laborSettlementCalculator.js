/**
 * Motor determinístico de estimativa de verbas trabalhistas básicas.
 *
 * Regras gerais:
 * - O resultado é uma ESTIMATIVA, nunca liquidação definitiva.
 * - Não presume vínculo de emprego; trata a existência do contrato como premissa.
 * - Não inclui horas extras, FGTS, multa 40%, juros, atualização monetária nem
 *   convenção coletiva sem dados e premissa explícitos.
 * - Separa verbas "calculated" das verbas "conditional" e "not_calculated".
 * - Arredondamento monetário em BRL com duas casas decimais.
 */

const TERMINATION_REASONS = new Set([
  'dispensa_sem_justa_causa',
  'pedido_demissao',
  'justa_causa',
  'acordo',
  'rescisao_indireta_em_discussao',
  'contrato_temporario',
  'desconhecido'
]);

const TRIPARTITE_OPTIONS = new Set(['yes', 'no', 'unknown']);
const NOTICE_OPTIONS = new Set(['trabalhado', 'indenizado', 'nao_cumprido', 'desconhecido']);
const CTPS_OPTIONS = new Set(['yes', 'no', 'unknown']);

const REQUIRED_FIELDS = ['salary', 'admissionDate', 'terminationDate', 'terminationReason'];

const MESSAGES = {
  disclaimer: 'Esta é uma estimativa preliminar e não representa garantia de valor em eventual rescisão ou processo.',
  depends: 'O cálculo depende da confirmação dos fatos, documentos, modalidade de desligamento e regras aplicáveis.',
  professional: 'Parcelas controvertidas ou dependentes de prova devem ser analisadas por profissional.',
  noOvertime: 'Não foram incluídas horas extras, reflexos, juros ou atualização monetária.',
  noCollective: 'Convenção coletiva não foi aplicada automaticamente.',
  partialVacation: 'Férias vencidas e proporcionais são estimadas sem histórico de pagamentos anteriores.',
  notice: 'Aviso-prévio indenizado só é incluído quando informado como indenizado e compatível com o motivo.',
  projectedNotice: 'Aviso-prévio indenizado projetado por 30 dias, adicionando reflexos de 1/12 nas verbas proporcionais.',
  noCtps: 'Havendo indícios de trabalho sem anotação de CTPS, inclui-se estimativa de FGTS (8% mensal) e multa rescisória de 40%.',
  ctpsYes: 'Trabalhador com registro em CTPS: FGTS fica fora desta estimativa por depender dos extratos reais de depósito.',
  ctpsUnknown: 'FGTS e multa de 40% não foram incluídos sem confirmação de depósitos e reconhecimento do vínculo.'
};

const ERRORS = {
  salary: 'Salário deve ser um número positivo.',
  admission: 'Data de admissão deve ser uma data válida.',
  termination: 'Data de desligamento deve ser uma data válida.',
  order: 'Data de desligamento não pode ser anterior à data de admissão.',
  reason: 'Motivo do desligamento deve ser um dos valores controlados.',
  missing: 'Campos obrigatórios ausentes.'
};

function toBrl(number) {
  return Number(Number(number).toFixed(2));
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeMonthInput(value) {
  if (value === undefined || value === null) return 'unknown';
  const lower = String(value).toLowerCase().trim();
  if (['yes', 'sim', 'true', '1'].includes(lower)) return 'yes';
  if (['no', 'nao', 'não', 'false', '0'].includes(lower)) return 'no';
  if (['unknown', 'desconhecido', ''].includes(lower)) return 'unknown';
  return 'unknown';
}

function normalizeNoticeInput(value) {
  if (value === undefined || value === null) return 'desconhecido';
  const lower = String(value).toLowerCase().trim().replace(/[_\s-]+/g, '_');
  if (['trabalhado', 'trabalhada', 'trabalhado(a)'].includes(lower.replace(/_/g, ''))) return 'trabalhado';
  if (['indenizado', 'indenizada', 'indenizado(a)'].includes(lower.replace(/_/g, ''))) return 'indenizado';
  if (['naocumprido', 'nao_cumprido', 'nao cumprido', 'não cumprido', 'não_cumprido'].includes(lower.replace(/_/g, ''))) return 'nao_cumprido';
  return 'desconhecido';
}

function normalizeCtpsInput(value) {
  if (value === undefined || value === null) return 'unknown';
  const lower = String(value).toLowerCase().trim();
  if (['yes', 'sim', 's', 'true', '1', 'tem', 'tem sim', 'registrado', 'carteira assinada', 'ctps assinada'].includes(lower)) return 'yes';
  if (['no', 'nao', 'não', 'n', 'false', '0', 'nao tem', 'não tem', 'nao tinha', 'não tinha', 'sem', 'nao assinaram', 'não assinaram', 'sem carteira', 'sem ctps', 'sem registro', 'nao registrado', 'não registrado'].includes(lower)) return 'no';
  return 'unknown';
}

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setDate(result.getDate() + days);
  return result;
}

function completeMonthsBetween(start, end) {
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

function workingDaysInTerminationMonth(admission, termination) {
  const lastDay = termination.getDate();

  if (
    termination.getFullYear() === admission.getFullYear() &&
    termination.getMonth() === admission.getMonth()
  ) {
    const firstDay = admission.getDate();
    return Math.max(0, lastDay - firstDay + 1);
  }

  return Math.max(1, lastDay);
}

function monthsForThirteenth(admission, termination) {
  const januaryStart = new Date(termination.getFullYear(), 0, 1);
  const referenceStart = admission > januaryStart ? admission : januaryStart;
  const months = (termination.getFullYear() - referenceStart.getFullYear()) * 12 +
                 (termination.getMonth() - referenceStart.getMonth());
  if (termination.getDate() < referenceStart.getDate()) return Math.max(0, months);
  return Math.max(0, months + 1);
}

function createItem(code, name, amount, status, assumptions = []) {
  return {
    code,
    name,
    amount: toBrl(amount),
    status,
    assumptions: Array.isArray(assumptions) ? assumptions : [assumptions]
  };
}

function validateInput(input) {
  const errors = [];
  const missing = [];

  for (const field of REQUIRED_FIELDS) {
    if (input[field] === undefined || input[field] === null || input[field] === '') {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    errors.push(ERRORS.missing);
    return { valid: false, errors, missing };
  }

  const salary = Number(input.salary);
  if (Number.isNaN(salary) || salary <= 0) {
    errors.push(ERRORS.salary);
  }

  const admission = parseDate(input.admissionDate);
  const termination = parseDate(input.terminationDate);

  if (!admission) errors.push(ERRORS.admission);
  if (!termination) errors.push(ERRORS.termination);

  if (admission && termination && termination < admission) {
    errors.push(ERRORS.order);
  }

  const reason = String(input.terminationReason || '').toLowerCase().trim();
  if (!TERMINATION_REASONS.has(reason)) {
    errors.push(ERRORS.reason);
  }

  const hasVacation = normalizeMonthInput(input.hasVacationAccrued);
  const hasThirteenth = normalizeMonthInput(input.hasThirteenthAccrued);
  const notice = normalizeNoticeInput(input.noticeStatus);
  const hasCtps = normalizeCtpsInput(input.hasCtps);

  return {
    valid: errors.length === 0,
    errors,
    missing,
    normalized: {
      salary,
      admission,
      termination,
      reason,
      hasVacation,
      hasThirteenth,
      notice,
      hasCtps
    }
  };
}

function calculateSalaryBalance(salary, admission, termination) {
  const days = workingDaysInTerminationMonth(admission, termination);
  const amount = (days / 30) * salary;
  return createItem(
    'salary_balance',
    'Saldo de salário',
    amount,
    'calculated',
    [`Dias trabalhados no mês do desligamento: ${days}/30`]
  );
}

function calculateThirteenthProportional(salary, admission, termination, hasThirteenth) {
  const months = monthsForThirteenth(admission, termination);
  const amount = (months / 12) * salary;
  const assumptions = [`Meses trabalhados no ano de desligamento: ${months}/12`];

  if (hasThirteenth === 'unknown') {
    assumptions.push('Existência de 13º vencido não informada; cálculo considera proporcional até a data do desligamento.');
  } else if (hasThirteenth === 'yes') {
    assumptions.push('Há 13º salário vencido ou não pago de anos anteriores; este item não o inclui.');
  }

  return createItem('thirteenth_proportional', '13º salário proporcional', amount, 'calculated', assumptions);
}

function calculateThirteenthAccrued(salary, hasThirteenth) {
  if (hasThirteenth !== 'yes') {
    return createItem(
      'thirteenth_accrued',
      '13º salário vencido',
      0,
      'not_calculated',
      ['Não informado 13º salário vencido ou não pago.']
    );
  }

  return createItem(
    'thirteenth_accrued',
    '13º salário vencido',
    salary,
    'conditional',
    [
      'Informado 13º salário vencido ou não pago.',
      'Valor estimado para um 13º integral; depende de verificação dos meses não pagos.'
    ]
  );
}

function calculateVacation(normalized, monthsOfWork, effectiveMonthsOfWork = monthsOfWork) {
  const items = [];
  const { salary, hasVacation } = normalized;

  const eligibleForAccrued = monthsOfWork >= 12;
  const fullYears = Math.floor(effectiveMonthsOfWork / 12);
  const residualMonths = effectiveMonthsOfWork % 12;

  if (eligibleForAccrued) {
    let accruedAmount = 0;
    let accruedStatus = 'not_calculated';
    const accruedAssumptions = [];

    if (hasVacation === 'yes') {
      accruedAmount = salary * (4 / 3);
      accruedStatus = 'conditional';
      accruedAssumptions.push('Informadas férias vencidas; valor representa um período de férias acrescido de 1/3 constitucional.');
    } else if (hasVacation === 'unknown') {
      accruedAssumptions.push('Existência de férias vencidas não informada.');
    } else {
      accruedAssumptions.push('Informado que não há férias vencidas.');
    }

    items.push(createItem('vacation_accrued', 'Férias vencidas', accruedAmount, accruedStatus, accruedAssumptions));
  }

  const proportionalAmount = (residualMonths / 12) * salary;
  const proportionalStatus = residualMonths > 0 ? 'calculated' : 'not_calculated';
  const proportionalAssumptions = [
    `Meses residuais no período aquisitivo em andamento: ${residualMonths}/12`,
    'Adicionado 1/3 constitucional sobre o valor de férias.'
  ];

  if (hasVacation === 'yes' && fullYears > 0) {
    proportionalAssumptions.push('Considerado que as férias vencidas referem-se a um período completo anterior.');
  }

  const vacationOneThird = proportionalAmount / 3;
  items.push(createItem(
    'vacation_proportional',
    'Férias proporcionais',
    proportionalAmount,
    proportionalStatus,
    proportionalAssumptions
  ));
  items.push(createItem(
    'vacation_one_third',
    '1/3 constitucional sobre férias proporcionais',
    vacationOneThird,
    proportionalStatus,
    ['Corresponde a um terço do valor de férias proporcionais.']
  ));

  return items;
}

function getEffectiveTermination(termination, notice, reason) {
  const includeNotice = (
    (reason === 'dispensa_sem_justa_causa' || reason === 'contrato_temporario') &&
    notice === 'indenizado'
  );
  if (!includeNotice) return termination;
  return addDays(termination, 30);
}

function calculateNotice(normalized) {
  const { salary, reason, notice } = normalized;
  const items = [];

  const includeNotice = (
    (reason === 'dispensa_sem_justa_causa' || reason === 'contrato_temporario') &&
    notice === 'indenizado'
  );

  if (includeNotice) {
    items.push(createItem(
      'notice_indemnity',
      'Aviso-prévio indenizado',
      salary,
      'calculated',
      ['Motivo compatível com indenização de aviso-prévio e situação informada como indenizada.']
    ));
  } else if (notice === 'trabalhado') {
    items.push(createItem(
      'notice_worked',
      'Aviso-prévio trabalhado',
      0,
      'not_calculated',
      ['Aviso-prévio trabalhado já é remunerado na contagem de dias trabalhados.']
    ));
  } else if (notice === 'nao_cumprido') {
    items.push(createItem(
      'notice_not_fulfilled',
      'Aviso-prévio não cumprido',
      0,
      'conditional',
      ['Pode gerar indenização a cargo do empregado, dependendo do motivo e prova.']
    ));
  } else {
    items.push(createItem(
      'notice_unknown',
      'Aviso-prévio',
      0,
      'conditional',
      ['Situação do aviso-prévio não informada.']
    ));
  }

  return items;
}

function conditionalFgts() {
  return createItem(
    'fgts',
    'FGTS e multa de 40%',
    0,
    'conditional',
    [
      'Não incluído no total desta versão.',
      'Depende de reconhecimento do vínculo, base mensal, depósitos anteriores, modalidade de desligamento e incidência sobre parcelas.'
    ]
  );
}

function conditionalOvertime() {
  return createItem(
    'overtime',
    'Horas extras',
    0,
    'not_calculated',
    [
      'Não incluído nesta versão.',
      'Depende de jornada efetiva, intervalo, dias trabalhados e prova.'
    ]
  );
}

function conditionalCollectiveAgreement() {
  return createItem(
    'collective_agreement',
    'Convenção coletiva / Acordo coletivo',
    0,
    'not_calculated',
    [
      'Não aplicado automaticamente.',
      'Depende de categoria, vigência e cláusulas específicas.'
    ]
  );
}

function calculateFgts(normalized, monthsOfWork) {
  const { salary, hasCtps } = normalized;
  if (hasCtps !== 'no') return [];

  const base = toBrl(salary * 0.08 * Math.max(0, monthsOfWork));
  const penalty = toBrl(base * 0.40);

  return [
    createItem(
      'fgts_deposits',
      'FGTS estimado (8% mensal)',
      base,
      'calculated',
      [`Base: 8% sobre R$ ${toBrl(salary).toFixed(2).replace('.', ',')} × ${monthsOfWork} meses.`]
    ),
    createItem(
      'fgts_penalty_40',
      'Multa de 40% sobre FGTS',
      penalty,
      'calculated',
      ['Multa rescisória de 40% sobre o valor estimado de FGTS.']
    )
  ];
}

function calculateConfidence(normalized, months, missing) {
  const unknownCount = [
    normalized.hasVacation,
    normalized.hasThirteenth,
    normalized.notice
  ].filter(v => v === 'unknown').length;

  if (missing.length > 0) return 'low';
  if (normalized.reason === 'desconhecido') return 'low';
  if (months < 1) return 'low';
  if (unknownCount >= 2) return 'medium';
  if (normalized.reason === 'rescisao_indireta_em_discussao') return 'medium';
  return 'high';
}

function calculateLaborSettlement(input = {}) {
  const validation = validateInput(input);

  if (!validation.valid) {
    return {
      status: 'insufficient_data',
      currency: 'BRL',
      totalEstimated: null,
      items: [],
      inputSummary: {
        salary: input.salary ?? null,
        admissionDate: input.admissionDate ?? null,
        terminationDate: input.terminationDate ?? null,
        terminationReason: input.terminationReason ?? null
      },
      missingFields: validation.missing,
      validationErrors: validation.errors,
      assumptions: [],
      warnings: [
        MESSAGES.disclaimer,
        MESSAGES.depends,
        MESSAGES.professional,
        MESSAGES.noOvertime,
        MESSAGES.noCollective
      ],
      confidence: 'low'
    };
  }

  const { salary, admission, termination, reason } = validation.normalized;
  const monthsOfWork = completeMonthsBetween(admission, termination);
  const effectiveTermination = getEffectiveTermination(termination, validation.normalized.notice, reason);
  const effectiveMonthsOfWork = completeMonthsBetween(admission, effectiveTermination);

  const items = [];

  if (reason === 'rescisao_indireta_em_discussao') {
    items.push(createItem('salary_balance', 'Saldo de salário', 0, 'conditional', ['Reconhecimento de rescisão indireta depende de decisão judicial.']));
    items.push(createItem('thirteenth_proportional', '13º salário proporcional', 0, 'conditional', ['Depende de reconhecimento da rescisão indireta.']));
    items.push(...calculateVacation(validation.normalized, monthsOfWork, effectiveMonthsOfWork).map(i => ({ ...i, status: 'conditional' })));
    items.push(...calculateNotice(validation.normalized).map(i => ({ ...i, status: 'conditional' })));
    items.push(conditionalFgts());
    items.push(conditionalOvertime());
    items.push(conditionalCollectiveAgreement());

    const total = 0;
    return buildResult(input, validation.normalized, validation.missing, items, total, 'partial', monthsOfWork, effectiveTermination);
  }

  if (reason === 'justa_causa') {
    items.push(calculateSalaryBalance(salary, admission, termination));
    items.push(calculateThirteenthProportional(salary, admission, effectiveTermination, validation.normalized.hasThirteenth));
    if (monthsOfWork >= 12) {
      items.push(calculateThirteenthAccrued(salary, validation.normalized.hasThirteenth));
    }
    const vacationItems = calculateVacation(validation.normalized, monthsOfWork, effectiveMonthsOfWork);
    vacationItems.forEach(i => {
      if (i.code === 'vacation_proportional' || i.code === 'vacation_one_third') {
        i.status = 'conditional';
        i.assumptions.push('Demissão por justa causa afasta férias proporcionais, salvo exceções judiciais.');
      }
    });
    items.push(...vacationItems);
    items.push(...calculateNotice(validation.normalized));
    items.push(...calculateFgts(validation.normalized, monthsOfWork));
    items.push(conditionalOvertime());
    items.push(conditionalCollectiveAgreement());

    const total = items
      .filter(i => i.status === 'calculated')
      .reduce((sum, i) => sum + i.amount, 0);
    return buildResult(input, validation.normalized, validation.missing, items, total, 'partial', monthsOfWork, effectiveTermination);
  }

  items.push(calculateSalaryBalance(salary, admission, termination));
  items.push(calculateThirteenthProportional(salary, admission, effectiveTermination, validation.normalized.hasThirteenth));
  if (monthsOfWork >= 12) {
    items.push(calculateThirteenthAccrued(salary, validation.normalized.hasThirteenth));
  }
  items.push(...calculateVacation(validation.normalized, monthsOfWork, effectiveMonthsOfWork));
  items.push(...calculateNotice(validation.normalized));
  if (validation.normalized.hasCtps === 'no') {
    items.push(...calculateFgts(validation.normalized, monthsOfWork));
  } else {
    items.push(conditionalFgts());
  }
  items.push(conditionalOvertime());
  items.push(conditionalCollectiveAgreement());

  const calculatedItems = items.filter(i => i.status === 'calculated');
  const conditionalItems = items.filter(i => i.status === 'conditional');

  const status = conditionalItems.length > 0 ? 'partial' : 'complete';
  const total = calculatedItems.reduce((sum, i) => sum + i.amount, 0);

  return buildResult(input, validation.normalized, validation.missing, items, total, status, monthsOfWork, effectiveTermination);
}

function buildResult(input, normalized, missing, items, total, status, monthsOfWork, effectiveTermination) {
  const effectiveMonths = completeMonthsBetween(normalized.admission, effectiveTermination);

  const assumptions = [
    `Salário base: R$ ${toBrl(normalized.salary).toFixed(2).replace('.', ',')}`,
    `Período de trabalho aproximado: ${monthsOfWork} meses`,
    `Motivo do desligamento: ${normalized.reason}`,
    MESSAGES.noOvertime,
    MESSAGES.noCollective
  ];

  if (effectiveTermination.getTime() !== normalized.termination.getTime()) {
    assumptions.push(MESSAGES.projectedNotice);
  }

  if (normalized.hasCtps === 'no') {
    assumptions.push(MESSAGES.noCtps);
  } else if (normalized.hasCtps === 'yes') {
    assumptions.push(MESSAGES.ctpsYes);
  } else {
    assumptions.push(MESSAGES.ctpsUnknown);
  }

  if (['yes', 'unknown'].includes(normalized.hasVacation)) {
    assumptions.push(MESSAGES.partialVacation);
  }

  if (normalized.notice !== 'desconhecido') {
    assumptions.push(MESSAGES.notice);
  }

  const missingFields = missing.length > 0 ? missing : deriveMissingFields(input, normalized);
  const salaryDays = workingDaysInTerminationMonth(normalized.admission, normalized.termination);
  const thirteenthMonths = monthsForThirteenth(normalized.admission, effectiveTermination);
  const vacationResidual = effectiveMonths % 12;

  return {
    status,
    currency: 'BRL',
    totalEstimated: status === 'insufficient_data' ? null : toBrl(total),
    items,
    inputSummary: {
      salary: toBrl(normalized.salary),
      admissionDate: normalized.admission.toISOString().split('T')[0],
      terminationDate: normalized.termination.toISOString().split('T')[0],
      effectiveTerminationDate: effectiveTermination.toISOString().split('T')[0],
      terminationReason: normalized.reason,
      noticeStatus: normalized.notice,
      hasCtps: normalized.hasCtps,
      period: {
        monthsOfWork,
        salaryBalanceDays: salaryDays,
        thirteenthMonths,
        vacationResidualMonths: vacationResidual
      }
    },
    missingFields,
    validationErrors: [],
    assumptions,
    warnings: [
      MESSAGES.disclaimer,
      MESSAGES.depends,
      MESSAGES.professional,
      MESSAGES.noOvertime,
      MESSAGES.noCollective
    ],
    confidence: calculateConfidence(normalized, monthsOfWork, missing)
  };
}

function deriveMissingFields(input, normalized) {
  const missing = [];
  if (input.hasVacationAccrued === undefined || input.hasVacationAccrued === null) missing.push('hasVacationAccrued');
  if (input.hasThirteenthAccrued === undefined || input.hasThirteenthAccrued === null) missing.push('hasThirteenthAccrued');
  if (input.noticeStatus === undefined || input.noticeStatus === null) missing.push('noticeStatus');
  if (input.hasCtps === undefined || input.hasCtps === null) missing.push('hasCtps');
  return missing;
}

module.exports = { calculateLaborSettlement };
