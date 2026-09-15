/**
 * Módulo de coleta e normalização de dados para o motor de estimativa
 * de verbas trabalhistas.
 *
 * Regras:
 * - Não calcula valores por conta própria.
 * - Chama lib/laborSettlementCalculator.js como única fonte de cálculo.
 * - Preserva o resultado original do motor.
 * - Não registra salário, datas, nomes ou PII em logs.
 * - Marca dados ambíguos sem assumir respostas definitivas.
 */

const { calculateLaborSettlement } = require('./laborSettlementCalculator');

const VALID_REASONS = new Set([
  'dispensa_sem_justa_causa',
  'pedido_demissao',
  'justa_causa',
  'acordo',
  'rescisao_indireta_em_discussao',
  'contrato_temporario',
  'desconhecido'
]);

const MINIMUM_FIELDS = ['salary', 'admissionDate', 'terminationDate', 'terminationReason'];

const MESSAGES = {
  disclaimer: 'Esta é uma estimativa preliminar e não representa garantia de valor.',
  noVinculo: 'A existência do vínculo de emprego deve ser confirmada por documentos e análise profissional.',
  partialData: 'Alguns campos estão desconhecidos; a estimativa pode ser incompleta.',
  professional: 'Parcelas controvertidas devem ser analisadas por profissional.'
};

const NEXT_QUESTIONS = {
  salary: 'Qual era o salário mensal?',
  admissionDate: 'Qual foi a data de admissão?',
  terminationDate: 'Qual foi a data de desligamento?',
  terminationReason: 'Qual foi o motivo da saída? (dispensa sem justa causa, pedido de demissão, justa causa, acordo, rescisão indireta, contrato temporário ou outra situação)',
  hasVacationAccrued: 'Havia férias vencidas não pagas?',
  hasThirteenthAccrued: 'Havia 13º salário vencido ou não pago?',
  noticeStatus: 'O aviso-prévio foi trabalhado, indenizado, não cumprido ou você não sabe?'
};

function normalizeSalary(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value > 0 ? value : null;

  const cleaned = String(value)
    .replace(/R?\$\s?/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim();

  const number = Number(cleaned);
  if (Number.isNaN(number) || number <= 0) return null;
  return number;
}

function parseLocalDate(value) {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;

  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
  const br2 = /^(\d{1,2})-(\d{1,2})-(\d{4})$/;

  if (iso.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  if (br.test(value) || br2.test(value)) {
    const sep = value.includes('/') ? '/' : '-';
    const [day, month, year] = value.split(sep).map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function toIsoString(date) {
  if (!date) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeMonthInput(value) {
  if (value === undefined || value === null) return 'unknown';
  const lower = String(value).toLowerCase().trim().replace(/[ãâáàä]/g, 'a').replace(/[êéè]/g, 'e');
  if (['yes', 'sim', 's', 'true', '1', 'tem', 'tinha', 'houve'].includes(lower)) return 'yes';
  if (['no', 'nao', 'não', 'n', 'false', '0', 'nao tinha', 'não tinha', 'nao tem', 'não tem'].includes(lower)) return 'no';
  return 'unknown';
}

function normalizeNoticeInput(value) {
  if (value === undefined || value === null) return 'desconhecido';
  const lower = String(value).toLowerCase().trim().replace(/[ãâáàä]/g, 'a');

  if (['trabalhado', 'trabalhada', 'trabalhei', 'trab', 'cumprido'].includes(lower)) return 'trabalhado';
  if (['indenizado', 'indenizada', 'indenizacao', 'recebi', 'pago'].includes(lower)) return 'indenizado';
  if (['naocumprido', 'nao_cumprido', 'nao cumprido', 'não cumprido', 'não_cumprido', 'nao cumpri', 'não cumpri', 'faltou', 'faltei'].includes(lower)) return 'nao_cumprido';
  return 'desconhecido';
}

function matchesOneOf(text, patterns) {
  return patterns.some(pattern => text.includes(pattern));
}

function normalizeReason(value) {
  if (value === undefined || value === null) return { value: null, ambiguous: true };
  const raw = String(value).toLowerCase().trim();
  if (VALID_REASONS.has(raw)) return { value: raw, ambiguous: false };
  const lower = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (matchesOneOf(lower, ['dispensa sem justa causa', 'demitido', 'demitida', 'sem justa causa', 'sem justa', 'justa causa do empregador', 'sem causa'])) {
    return { value: 'dispensa_sem_justa_causa', ambiguous: false };
  }

  if (matchesOneOf(lower, ['pedido de demissao', 'pediu demissao', 'pedi demissao', 'pedido demissao', 'pediu demis', 'pedi conta', 'pediu as contas'])) {
    return { value: 'pedido_demissao', ambiguous: false };
  }

  if (matchesOneOf(lower, ['demitido por justa causa', 'justa causa trabalhista', 'motivo grave']) && !lower.includes('sem justa')) {
    return { value: 'justa_causa', ambiguous: false };
  }

  if (matchesOneOf(lower, ['acordo', 'acordo extrajudicial', 'acordo trabalhista', 'rescisao por acordo', 'rescisão por acordo'])) {
    return { value: 'acordo', ambiguous: false };
  }

  if (matchesOneOf(lower, ['rescisao indireta', 'rescisão indireta', 'indireta', 'em discussao', 'discutindo', 'discussão'])) {
    return { value: 'rescisao_indireta_em_discussao', ambiguous: false };
  }

  if (matchesOneOf(lower, ['contrato temporario', 'contrato de duracao determinada', 'contrato termo'])) {
    return { value: 'contrato_temporario', ambiguous: false };
  }

  if (matchesOneOf(lower, ['nao sei', 'não sei', 'nao sabe', 'não sabe', 'incerto', 'outro', 'outros', 'desconhecido'])) {
    return { value: 'desconhecido', ambiguous: false };
  }

  return { value: 'desconhecido', ambiguous: true };
}

function validateDates(admission, termination) {
  const errors = [];
  if (!admission) errors.push('Data de admissão inválida.');
  if (!termination) errors.push('Data de desligamento inválida.');
  if (admission && termination && termination < admission) {
    errors.push('Data de desligamento não pode ser anterior à data de admissão.');
  }
  return errors;
}

function deriveMissingFields(raw) {
  const missing = [];
  for (const field of MINIMUM_FIELDS) {
    const value = raw[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      missing.push(field);
    }
  }
  return missing;
}

function deriveNextQuestions(missing, ambiguousFields) {
  const questions = [];
  for (const field of missing) {
    if (NEXT_QUESTIONS[field]) questions.push(NEXT_QUESTIONS[field]);
  }
  if (ambiguousFields.includes('terminationReason')) {
    questions.push(NEXT_QUESTIONS.terminationReason);
  }
  return [...new Set(questions)];
}

function sanitizeForIntake(input) {
  return {
    salary: normalizeSalary(input.salary),
    admissionDate: input.admissionDate,
    terminationDate: input.terminationDate,
    terminationReason: input.terminationReason,
    hasVacationAccrued: input.hasVacationAccrued,
    hasThirteenthAccrued: input.hasThirteenthAccrued,
    noticeStatus: input.noticeStatus
  };
}

function processLaborSettlementIntake(rawInput = {}) {
  const input = sanitizeForIntake(rawInput);

  const salary = normalizeSalary(input.salary);
  const admission = parseLocalDate(input.admissionDate);
  const termination = parseLocalDate(input.terminationDate);
  const reasonResult = normalizeReason(input.terminationReason);
  const hasVacation = normalizeMonthInput(input.hasVacationAccrued);
  const hasThirteenth = normalizeMonthInput(input.hasThirteenthAccrued);
  const notice = normalizeNoticeInput(input.noticeStatus);

  const normalizedInput = {
    salary,
    admissionDate: toIsoString(admission),
    terminationDate: toIsoString(termination),
    terminationReason: reasonResult.value,
    hasVacationAccrued: hasVacation,
    hasThirteenthAccrued: hasThirteenth,
    noticeStatus: notice
  };

  const ambiguousFields = [];
  if (reasonResult.ambiguous) ambiguousFields.push('terminationReason');
  if (hasVacation === 'unknown' && input.hasVacationAccrued !== undefined && input.hasVacationAccrued !== null) {
    // Marca como ambígua somente se o usuário forneceu algo que não foi claro
    if (!['yes', 'no'].includes(String(input.hasVacationAccrued).toLowerCase().trim()) &&
        !['sim', 'não', 'nao', 's', 'n', 'true', 'false', '1', '0'].includes(String(input.hasVacationAccrued).toLowerCase().trim())) {
      ambiguousFields.push('hasVacationAccrued');
    }
  }

  const missing = deriveMissingFields(input);
  const dateErrors = validateDates(admission, termination);
  const validationErrors = [];

  if (missing.includes('salary') || salary === null) {
    if (input.salary !== undefined && input.salary !== null && String(input.salary).trim() !== '') {
      validationErrors.push('Salário informado não é válido.');
    }
  }

  validationErrors.push(...dateErrors);

  if (missing.length > 0 || ambiguousFields.length > 0) {
    return {
      status: missing.length > 0 ? 'needs_information' : 'invalid',
      normalizedInput,
      missingFields: missing,
      ambiguousFields,
      calculation: null,
      warnings: [MESSAGES.disclaimer, MESSAGES.noVinculo, MESSAGES.partialData, ...validationErrors],
      nextQuestions: deriveNextQuestions(missing, ambiguousFields)
    };
  }

  if (validationErrors.length > 0) {
    return {
      status: 'invalid',
      normalizedInput,
      missingFields: [],
      ambiguousFields,
      calculation: null,
      warnings: [MESSAGES.disclaimer, ...validationErrors],
      nextQuestions: deriveNextQuestions(missing, ambiguousFields)
    };
  }

  const motorInput = {
    salary,
    admissionDate: normalizedInput.admissionDate,
    terminationDate: normalizedInput.terminationDate,
    terminationReason: reasonResult.value,
    hasVacationAccrued: hasVacation,
    hasThirteenthAccrued: hasThirteenth,
    noticeStatus: notice
  };

  const calculation = calculateLaborSettlement(motorInput);

  const hasUnknownOptional = [hasVacation, hasThirteenth, notice].some(v => v === 'unknown' || v === 'desconhecido');

  return {
    status: 'ready',
    normalizedInput,
    missingFields: [],
    ambiguousFields: [],
    calculation,
    warnings: [
      MESSAGES.disclaimer,
      MESSAGES.noVinculo,
      ...(hasUnknownOptional ? [MESSAGES.partialData] : []),
      MESSAGES.professional
    ],
    nextQuestions: []
  };
}

module.exports = { processLaborSettlementIntake };
