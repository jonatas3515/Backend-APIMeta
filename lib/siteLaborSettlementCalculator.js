/**
 * Calculadora pura de rescisão trabalhista extraída do site Neves & Costa.
 *
 * Regras de negócio:
 * - Replica fielmente as fórmulas de src/app/calculadora/page.tsx do site.
 * - Não depende de React, DOM, banco, API ou variáveis de ambiente.
 * - Recebe dados normalizados e devolve itens com code/name/amount/status.
 * - Sempre inclui FGTS e multa conforme a modalidade de desligamento.
 * - Desconta INSS sobre saldo + 13º + salário-família (tabela 2025).
 *
 * Limites propositais para equivalência com o site:
 * - Contagem de meses por dias/30 (meses inteiros, não calendário exato).
 * - Saldo de salário usa o dia do mês do desligamento como dias trabalhados.
 * - Aviso-prévio = 30 dias + 3 dias por ano completo (apenas sem justa causa).
 * - Férias e 13º usam meses restantes do ano civil (meses % 12).
 * - Sem verificação de CTPS: FGTS e multa sempre quando a modalidade exige.
 */

const INSS_2025 = [
  { limit: 1518.00, rate: 0.075, cumulative: 0 },
  { limit: 2793.88, rate: 0.09, cumulative: 1518.00 * 0.075 },
  { limit: 4190.83, rate: 0.12, cumulative: (1518.00 * 0.075) + ((2793.88 - 1518.00) * 0.09) },
  { limit: 8157.41, rate: 0.14, cumulative: (1518.00 * 0.075) + ((2793.88 - 1518.00) * 0.09) + ((4190.83 - 2793.88) * 0.12) },
  { limit: Number.POSITIVE_INFINITY, rate: 0, cumulative: (1518.00 * 0.075) + ((2793.88 - 1518.00) * 0.09) + ((4190.83 - 2793.88) * 0.12) + ((8157.41 - 4190.83) * 0.14) }
];

const SALARIO_FAMILIA_2025 = 65.00;

function toBrl(number) {
  return Number(Number(number).toFixed(2));
}

function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
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

function calculateInss(base) {
  for (let i = 0; i < INSS_2025.length; i++) {
    const faixa = INSS_2025[i];
    if (base <= faixa.limit) {
      if (i === 0) return toBrl(base * faixa.rate);
      const prevLimit = INSS_2025[i - 1].limit;
      return toBrl(faixa.cumulative + (base - prevLimit) * faixa.rate);
    }
  }
  // Acima do teto
  const top = INSS_2025[INSS_2025.length - 1];
  return toBrl(top.cumulative);
}

function normalizeReason(raw) {
  const lower = String(raw || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (lower.includes('semjusta') || lower.includes('semcausa')) return 'demissaoSemJustaCausa';
  if (lower.includes('comjusta') || lower.includes('comcausa') || lower.includes('justacausa')) return 'demissaoComJustaCausa';
  if (lower.includes('pedido') || lower.includes('pedidodemissao')) return 'pedidoDemissao';
  if (lower.includes('acordo') || lower.includes('mutuo') || lower.includes('comumacordo')) return 'acordoMutuo';
  if (lower.includes('contratotemporario') || lower.includes('temporario')) return 'demissaoSemJustaCausa';
  return 'demissaoSemJustaCausa';
}

function normalizeNotice(raw) {
  if (raw === true || (typeof raw === 'string' && /trabalh/.test(raw))) return 'trabalhado';
  if (raw === false || (typeof raw === 'string' && /indeniz/.test(raw))) return 'indenizado';
  return 'desconhecido';
}

/**
 * Calcula a rescisão seguindo a lógica do site.
 *
 * @param {object} input
 * @param {number} input.salary
 * @param {string|Date} input.admissionDate
 * @param {string|Date} input.terminationDate
 * @param {string} [input.terminationReason]
 * @param {boolean|string} [input.noticeStatus]
 * @param {boolean|string} [input.hasVacationAccrued]
 * @param {number} [input.dependents]
 * @returns {object} cálculo no formato compatível com o webhook.
 */
function calculateSiteLaborSettlement(input = {}) {
  const salary = Number(input.salary);
  const admission = parseLocalDate(input.admissionDate);
  const termination = parseLocalDate(input.terminationDate);
  const reason = normalizeReason(input.terminationReason);
  const notice = normalizeNotice(input.noticeStatus);
  const hasVacation = ['yes', 'sim', 'true', '1', true].includes(input.hasVacationAccrued);
  const dependents = Number(input.dependents || input.filhosMenores14 || 0);

  if (!Number.isFinite(salary) || salary <= 0 || !admission || !termination || termination < admission) {
    return {
      status: 'insufficient_data',
      currency: 'BRL',
      totalEstimated: null,
      items: [],
      inputSummary: {},
      missingFields: [],
      validationErrors: ['Dados insuficientes ou inválidos para o cálculo.'],
      assumptions: [],
      warnings: ['Esta é uma estimativa preliminar.', 'O cálculo depende de confirmação dos fatos e documentos.'],
      confidence: 'low'
    };
  }

  const diffTime = Math.abs(termination.getTime() - admission.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const meses = Math.floor(diffDays / 30);
  const anos = Math.floor(meses / 12);
  const mesesRestantes = meses % 12;

  const diasUltimoMes = termination.getDate();

  const saldoSalario = (salary / 30) * diasUltimoMes;

  let avisoPrevio = 0;
  let diasAvisoPrevio = 0;
  if (reason === 'demissaoSemJustaCausa' && notice !== 'trabalhado') {
    diasAvisoPrevio = 30 + (anos * 3);
    avisoPrevio = (salary / 30) * diasAvisoPrevio;
  }

  let decimoTerceiro = 0;
  if (reason !== 'demissaoComJustaCausa') {
    decimoTerceiro = (salary / 12) * mesesRestantes;
  }

  let ferias = 0;
  if (reason !== 'demissaoComJustaCausa') {
    const feriasProporcionais = (salary / 12) * mesesRestantes;
    const umTercoFerias = feriasProporcionais / 3;
    ferias = feriasProporcionais + umTercoFerias;
  }

  if (hasVacation) {
    const feriasVencidas = salary;
    const umTercoVencidas = salary / 3;
    ferias += feriasVencidas + umTercoVencidas;
  }

  let salarioFamilia = 0;
  if (dependents > 0) {
    salarioFamilia = (SALARIO_FAMILIA_2025 / 30) * diasUltimoMes * dependents;
  }

  const baseCalculoINSS = saldoSalario + decimoTerceiro + salarioFamilia;
  const descontoINSS = calculateInss(baseCalculoINSS);

  let totalRemuneracoesFGTS = salary * meses;
  if (reason === 'demissaoSemJustaCausa' && notice !== 'trabalhado') {
    totalRemuneracoesFGTS += avisoPrevio;
    const diasTotaisUltimoMes = diasUltimoMes + diasAvisoPrevio;
    if (diasTotaisUltimoMes >= 30) {
      const mesesAdicionais = Math.floor(diasTotaisUltimoMes / 30);
      totalRemuneracoesFGTS += salary * (mesesAdicionais - 1);
    }
  }
  const fgts = totalRemuneracoesFGTS * 0.08;

  let multaFgts = 0;
  let multaRate = 0;
  if (reason === 'demissaoSemJustaCausa') {
    multaRate = 0.4;
    multaFgts = fgts * 0.4;
  } else if (reason === 'acordoMutuo') {
    multaRate = 0.2;
    multaFgts = fgts * 0.2;
  }

  const totalBruto = saldoSalario + avisoPrevio + decimoTerceiro + ferias + multaFgts + salarioFamilia;
  const total = totalBruto - descontoINSS;

  const items = [
    createItem('salary_balance', 'Saldo de salário', saldoSalario, 'calculated', [`Dias trabalhados no mês do desligamento: ${diasUltimoMes}/30`]),
    createItem('notice_pay', 'Aviso-prévio indenizado', avisoPrevio, 'calculated', reason === 'demissaoSemJustaCausa' ? [`Aviso-prévio: ${diasAvisoPrevio} dias`] : []),
    createItem('thirteenth_proportional', '13º salário proporcional', decimoTerceiro, 'calculated', [`Meses no ano: ${mesesRestantes}/12`]),
    createItem('vacation_proportional', 'Férias proporcionais', reason === 'demissaoComJustaCausa' ? 0 : ((salary / 12) * mesesRestantes), 'calculated', []),
    createItem('vacation_bonus', '1/3 constitucional sobre férias', reason === 'demissaoComJustaCausa' ? 0 : (((salary / 12) * mesesRestantes) / 3), 'calculated', []),
    createItem('vacation_accrued', 'Férias vencidas', hasVacation ? salary + salary / 3 : 0, hasVacation ? 'calculated' : 'not_calculated', hasVacation ? ['Férias vencidas informadas pelo usuário.'] : ['Não informado.']),
    createItem('family_salary', 'Salário família', salarioFamilia, 'calculated', [`Filhos menores de 14 anos: ${dependents}`]),
    createItem('inss', 'INSS', descontoINSS, 'calculated', ['Desconto sobre saldo + 13º + salário família.']),
    createItem('fgts', 'Depósitos de FGTS', fgts, 'calculated', [`FGTS: 8% sobre ${meses} meses de remuneração`]),
    createItem('fgts_fine', `Multa de ${Math.round(multaRate * 100)}% sobre FGTS`, multaFgts, multaFgts > 0 ? 'calculated' : 'not_calculated', [`Multa rescisória: ${Math.round(multaRate * 100)}%`])
  ];

  const inputSummary = {
    salary: toBrl(salary),
    admissionDate: admission.toISOString().split('T')[0],
    terminationDate: termination.toISOString().split('T')[0],
    terminationReason: reason,
    noticeStatus: notice,
    hasVacationAccrued: hasVacation,
    hasCtps: input.hasCtps,
    dependents,
    period: {
      monthsOfWork: meses,
      salaryBalanceDays: diasUltimoMes,
      thirteenthMonths: mesesRestantes,
      vacationResidualMonths: mesesRestantes
    }
  };

  const assumptions = [
    `Salário base: R$ ${toBrl(salary).toFixed(2).replace('.', ',')}`,
    `Período: ${meses} meses`,
    `Motivo: ${reason}`,
    `Aviso-prévio: ${notice === 'trabalhado' ? 'trabalhado' : 'indenizado/não informado'}`
  ];

  return {
    status: 'complete',
    currency: 'BRL',
    totalEstimated: toBrl(total),
    items,
    inputSummary,
    missingFields: [],
    validationErrors: [],
    assumptions,
    warnings: [
      'Esta é uma estimativa preliminar e não representa garantia de valor.',
      'O cálculo depende de confirmação dos fatos, documentos e regras aplicáveis.',
      'Para um cálculo preciso, consulte a equipe jurídica.'
    ],
    confidence: 'high'
  };
}

module.exports = {
  calculateSiteLaborSettlement,
  toBrl
};
