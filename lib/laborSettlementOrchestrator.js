/**
 * Orquestrador offline de fluxo de cálculo de verbas trabalhistas.
 *
 * Regras:
 * - Não calcula nem arredonda valores.
 * - Não persiste dados nem registra texto.
 * - Não integra com WhatsApp, Gemini, banco ou API externa.
 * - Encadeia: classifyLaborIntent → extrair campos → processLaborSettlementIntake
 *   → formatLaborSettlementResponse.
 * - O chamador decide se e como manter o state.
 */

const { classifyLaborIntent } = require('./laborSettlementIntent');
const { processLaborSettlementIntake } = require('./laborSettlementIntake');
const { formatLaborSettlementResponse } = require('./laborSettlementResponse');

const QUESTIONS = {
  salary: 'Qual era o salário mensal?',
  admissionDate: 'Qual foi a data de admissão? (ex: 15/01/2023)',
  terminationDate: 'Qual foi a data de desligamento? (ex: 10/07/2024 ou "hoje")',
  terminationReason: 'Qual foi o motivo? (sem justa causa, com justa causa, pedido de demissão, acordo, contrato temporário, rescisão indireta ou não sabe)',
  hasVacationAccrued: 'Havia férias vencidas não pagas? (sim/não/não sei)',
  hasThirteenthAccrued: 'Havia 13º salário vencido ou não pago? (sim/não/não sei)',
  noticeStatus: 'O aviso-prévio foi trabalhado, indenizado, não cumprido ou você não sabe?'
};

function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCancellation(text) {
  if (!text) return false;
  return /\b(cancelar|parar|desistir|encerrar|nao quero mais|não quero mais|para a simulacao|cancela)\b/.test(text);
}

function getTodayIso() {
  if (process.env.LABOR_TODAY_DATE && /^\d{4}-\d{2}-\d{2}$/.test(process.env.LABOR_TODAY_DATE)) {
    return process.env.LABOR_TODAY_DATE;
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

function parseIncompleteDate(text, referenceYear) {
  const patterns = [
    /(\d{1,2})\/(\d{1,2})(?!\/\d{2,4})/g,
    /(\d{1,2})-(\d{1,2})(?!-\d{2,4})/g
  ];
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      const [day, month] = matches[0].slice(1).map(Number);
      if (day < 1 || day > 31 || month < 1 || month > 12) return null;
      const paddedDay = String(day).padStart(2, '0');
      const paddedMonth = String(month).padStart(2, '0');
      return `${referenceYear}-${paddedMonth}-${paddedDay}`;
    }
  }
  return null;
}

function resolveDateTarget(askedFields, collected, text) {
  const lower = String(text).toLowerCase();
  const hasAdmission = askedFields.includes('admissionDate') && !collected.admissionDate;
  const hasTermination = askedFields.includes('terminationDate') && !collected.terminationDate;

  if (hasAdmission && /\b(admiss|admiti|entre|entrei|comecei|comece)\b/.test(lower)) return 'admissionDate';
  if (hasTermination && /\b(deslig|sai|sa[ií]|demiti|mandado|embora|hoje)\b/.test(lower)) return 'terminationDate';

  const admissionFirst = askedFields.indexOf('admissionDate') < askedFields.indexOf('terminationDate') || !askedFields.includes('terminationDate');

  if (admissionFirst) {
    if (hasAdmission) return 'admissionDate';
    if (hasTermination) return 'terminationDate';
  } else {
    if (hasTermination) return 'terminationDate';
    if (hasAdmission) return 'admissionDate';
  }
  return null;
}

function parseSalary(value) {
  if (!value) return undefined;
  const cleaned = String(value)
    .replace(/R?\$\s?/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .trim();
  const number = Number(cleaned);
  if (Number.isNaN(number) || number <= 0) return undefined;
  return number;
}

function parseDates(text) {
  const dates = [];
  const brPattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  const isoPattern = /(\d{4})-(\d{2})-(\d{2})/g;
  let match;

  while ((match = brPattern.exec(text)) !== null) {
    const [_, day, month, year] = match;
    dates.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }

  while ((match = isoPattern.exec(text)) !== null) {
    const [_, year, month, day] = match;
    dates.push(`${year}-${month}-${day}`);
  }

  return dates;
}

const REASON_MAP = [
  {
    reason: 'dispensa_sem_justa_causa',
    patterns: ['sem justa causa', 'sem justa', 'dispensa sem justa causa', 'dispensa injusta', 'demitido sem justa causa', 'demitida sem justa causa', 'mandado embora sem justa causa', 'mandada embora sem justa causa']
  },
  {
    reason: 'pedido_demissao',
    patterns: ['pedi demissao', 'pediu demissao', 'pedir demissao', 'pedi as contas', 'pediu as contas', 'pedi conta', 'pediu conta', 'pedi para sair', 'pediu para sair']
  },
  {
    reason: 'justa_causa',
    patterns: ['com justa causa', 'demitido por justa causa', 'demitida por justa causa', 'demissao por justa causa', 'motivo grave', 'comportamento grave', 'falta grave']
  },
  {
    reason: 'acordo',
    patterns: ['acordo', 'comum acordo', 'acordo extrajudicial', 'transacao extrajudicial', 'demissao consensual']
  },
  {
    reason: 'rescisao_indireta_em_discussao',
    patterns: ['rescisao indireta', 'rescindir indireta', 'indireta', 'rescisao em discussao', 'rescisao por discussao', 'rescisao na justica']
  },
  {
    reason: 'contrato_temporario',
    patterns: ['contrato temporario', 'temporario', 'prazo determinado', 'prazo certo']
  },
  {
    reason: 'desconhecido',
    patterns: ['nao sei', 'nao sabe', 'desconhecido', 'nao lembro', 'outro', 'outra', 'nao tenho certeza']
  }
];

function normalizeReasonText(value) {
  if (!value) return undefined;
  const lower = String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const { reason, patterns } of REASON_MAP) {
    if (patterns.some(p => lower.includes(p))) return reason;
  }
  return undefined;
}

function parseYesNoUnknown(text) {
  if (!text) return undefined;
  const lower = normalizeText(text);
  if (['sim', 's', 'yes', 'tem', 'tinha', 'houve', '1'].some(w => lower.includes(w))) return 'yes';
  if (['nao', 'não', 'n', 'no', 'nao tem', 'nao tinha', '0'].some(w => lower.includes(w))) return 'no';
  return undefined;
}

function parseNotice(text) {
  if (!text) return undefined;
  const lower = normalizeText(text);
  if (['trabalhado', 'trabalhada', 'trabalhei', 'cumprido'].some(w => lower.includes(w))) return 'trabalhado';
  if (['indenizado', 'indenizada', 'indenizacao', 'pago', 'recebi'].some(w => lower.includes(w))) return 'indenizado';
  if (['nao cumprido', 'naocumprido', 'faltei', 'faltou', 'nao cumpri'].some(w => lower.includes(w))) return 'nao_cumprido';
  if (['nao sei', 'nao sabe', 'nao lembro', 'desconhecido', 'nao tenho certeza'].some(w => lower.includes(w))) return 'desconhecido';
  return undefined;
}

function containsDatePattern(text) {
  return /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(text);
}

function assignSingleDate(possibleDate, askedFields, collected, text) {
  const target = resolveDateTarget(askedFields, collected, text);
  if (!target) return {};
  return { [target]: possibleDate };
}

function extractLaborFields(message, askedFields, collected = {}) {
  const text = String(message || '');
  const normalized = normalizeText(text);
  const extracted = {};

  const possibleDates = parseDates(text);

  // Salário: prioriza sinal monetário. Se a pergunta for sobre salário,
  // aceita número isolado, mas nunca anos ou datas.
  const salaryMatch = text.match(/R?\$\s?([\d.,]+)/);
  if (salaryMatch) {
    const parsed = parseSalary(salaryMatch[1]);
    extracted.salary = parsed !== undefined ? parsed : 'invalid';
  } else if (askedFields.includes('salary')) {
    // Usuário respondeu a pergunta de salário: aceita "3000 reais", "2.500,00", etc.
    const salaryPatterns = [
      /\b\d{1,3}(?:\.\d{3})+(?:,\d{2})?\b/, // 2.500,00
      /\b\d{1,4},\d{2}\b/,                    // 2500,00
      /\b\d{3,6}\b/                           // 2500
    ];
    for (const pattern of salaryPatterns) {
      const m = text.match(pattern);
      if (m) {
        // Evita confundir o ano de uma data (ex: 2023 em 01/05/2023) com salário.
        const context = text.substring(Math.max(0, m.index - 4), Math.min(text.length, m.index + m[0].length + 4));
        if (/[\/-]\d{4}$|^\d{4}[\/-]/.test(context)) continue;
        const val = parseSalary(m[0]);
        if (val !== undefined) {
          extracted.salary = val;
          break;
        }
      }
    }
    // Se mencionou dinheiro mas não encontrou número, marca como inválido.
    if (extracted.salary === undefined && (/R?\$/.test(text) || /\breais?\b/.test(text))) {
      extracted.salary = 'invalid';
    }
  } else if (/R?\$/.test(text) || /\breais?\b/.test(text)) {
    // Menção a dinheiro sem salário explícito e fora de contexto de pergunta.
    extracted.salary = 'invalid';
  }

  // Datas: associa ao campo que ainda está em aberto, quando for resposta a pergunta.
  if (possibleDates.length >= 2) {
    extracted.admissionDate = possibleDates[0];
    extracted.terminationDate = possibleDates[1];
  } else if (possibleDates.length === 1) {
    const assigned = assignSingleDate(possibleDates[0], askedFields, collected, text);
    Object.assign(extracted, assigned);
  }

  // Se não achou data completa, tenta "hoje" ou datas incompletas (dd/mm).
  if (!extracted.admissionDate && !extracted.terminationDate) {
    const today = getTodayIso();
    const thisYear = Number(today.split('-')[0]);
    const lower = text.toLowerCase();

    if (/\bhoje\b/.test(lower)) {
      const target = resolveDateTarget(askedFields, collected, text);
      if (target) {
        extracted[target] = today;
      }
    } else {
      const incomplete = parseIncompleteDate(text, thisYear);
      if (incomplete) {
        const target = resolveDateTarget(askedFields, collected, text);
        if (target) {
          extracted[target] = incomplete;
        }
      }
    }
  }

  // Motivo
  const reason = normalizeReasonText(text);
  if (reason) extracted.terminationReason = reason;

  // Férias vencidas
  if (/\bferias\b/.test(normalized) || /\bf[eé]rias\b/.test(text.toLowerCase())) {
    const val = parseYesNoUnknown(text);
    if (val !== undefined) extracted.hasVacationAccrued = val;
  }

  // 13º
  if (/\b13[ºo]?\b/.test(normalized) || /decimo terceiro/.test(normalized)) {
    const val = parseYesNoUnknown(text);
    if (val !== undefined) extracted.hasThirteenthAccrued = val;
  }

  // Aviso-prévio
  if (/\baviso\b/.test(normalized) || /aviso[-\s]?previo/.test(text.toLowerCase())) {
    const val = parseNotice(text);
    if (val !== undefined) extracted.noticeStatus = val;
  }

  return extracted;
}

function mergeCollected(current, extracted) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(extracted)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

function findNextQuestion(missingFields, askedFields) {
  const unasked = missingFields.find(f => !askedFields.includes(f));
  if (unasked) return unasked;
  return missingFields[0];
}

function joinQuestions(questions) {
  if (questions.length === 0) return '';
  if (questions.length === 1) return questions[0];
  const last = questions[questions.length - 1];
  const rest = questions.slice(0, -1).join(', ');
  return `${rest} e ${last}`;
}

function buildCancelled(previousState) {
  return {
    status: 'cancelled',
    intent: previousState.intent || 'other',
    state: {
      active: false,
      intent: null,
      collected: {},
      askedFields: [],
      status: 'cancelled'
    },
    response: {
      kind: 'ignored',
      text: 'Simulação cancelada. Se quiser uma estimativa no futuro, é só me avisar.',
      data: null
    },
    calculation: null,
    missingFields: [],
    warnings: []
  };
}

function buildIgnored(state, intent) {
  return {
    status: 'idle',
    intent: intent.intent,
    state: {
      active: false,
      intent: null,
      collected: {},
      askedFields: [],
      status: 'idle'
    },
    response: {
      kind: 'ignored',
      text: '',
      data: null
    },
    calculation: null,
    missingFields: [],
    warnings: []
  };
}

function buildGuidance(state, intent) {
  return {
    status: 'idle',
    intent: intent.intent,
    state: {
      active: false,
      intent: null,
      collected: {},
      askedFields: [],
      status: 'idle'
    },
    response: {
      kind: 'guidance',
      text: 'Vejo que você tem uma dúvida trabalhista. Se quiser uma estimativa de verbas, me informe salário, datas de admissão e desligamento, e o motivo.',
      data: null
    },
    calculation: null,
    missingFields: [],
    warnings: ['Esta é uma estimativa preliminar e não representa garantia de valor.']
  };
}

function handleLaborSettlementMessage({ message = '', state = {} } = {}) {
  const normalizedMessage = normalizeText(message);
  const currentState = {
    active: false,
    intent: null,
    collected: {},
    askedFields: [],
    status: 'idle',
    ...state
  };

  if (isCancellation(normalizedMessage)) {
    return buildCancelled(currentState);
  }

  const intent = classifyLaborIntent(message);

  if (!currentState.active && intent.intent === 'other') {
    return buildIgnored(currentState, intent);
  }

  if (!currentState.active && intent.intent === 'labor_question') {
    return buildGuidance(currentState, intent);
  }

  const isNewEstimate = (!currentState.active && intent.intent === 'labor_settlement_estimate') ||
                        (currentState.active && currentState.status === 'collecting');

  if (!isNewEstimate) {
    return buildIgnored(currentState, { intent: 'other' });
  }

  const extracted = extractLaborFields(message, currentState.askedFields, currentState.collected);
  const collected = mergeCollected(currentState.collected, extracted);
  const intakeResult = processLaborSettlementIntake(collected);

  if (collected.salary === 'invalid' && intakeResult.status !== 'ready') {
    return {
      status: 'collecting',
      intent: 'labor_settlement_estimate',
      state: {
        active: true,
        intent: 'labor_settlement_estimate',
        collected,
        askedFields: currentState.askedFields,
        status: 'collecting'
      },
      response: {
        kind: 'invalid',
        text: 'O salário informado não é um valor válido. Por favor, informe o salário mensal (ex: R$ 2.500).',
        data: null
      },
      calculation: null,
      missingFields: ['salary'],
      warnings: ['Esta é uma estimativa preliminar e não representa garantia de valor.']
    };
  }

  if (intakeResult.status === 'ready') {
    const formatted = formatLaborSettlementResponse({
      status: 'ready',
      intakeResult,
      calculation: intakeResult.calculation,
      intent: null,
      missingFields: [],
      warnings: intakeResult.warnings,
      nextQuestions: []
    });

    return {
      status: 'completed',
      intent: 'labor_settlement_estimate',
      state: {
        active: false,
        intent: 'labor_settlement_estimate',
        collected,
        askedFields: [],
        status: 'completed'
      },
      response: {
        kind: 'estimate',
        text: formatted.text,
        data: null
      },
      calculation: intakeResult.calculation,
      missingFields: [],
      warnings: intakeResult.warnings
    };
  }

  if (intakeResult.status === 'invalid') {
    const formatted = formatLaborSettlementResponse({
      status: 'invalid',
      intakeResult,
      calculation: null,
      intent: null,
      missingFields: intakeResult.missingFields,
      ambiguousFields: intakeResult.ambiguousFields,
      warnings: intakeResult.warnings,
      nextQuestions: intakeResult.nextQuestions
    });

    return {
      status: 'collecting',
      intent: 'labor_settlement_estimate',
      state: {
        active: true,
        intent: 'labor_settlement_estimate',
        collected,
        askedFields: currentState.askedFields,
        status: 'collecting'
      },
      response: {
        kind: 'invalid',
        text: formatted.text,
        data: null
      },
      calculation: null,
      missingFields: intakeResult.missingFields,
      warnings: intakeResult.warnings
    };
  }

  // Coleta progressiva: pergunta todos os campos ainda faltantes de uma vez,
  // mas em uma frase única com lista completa. Nas continuações, o histórico
  // de mensagens fornece o contexto, por isso não dependemos de estado cifrado.
  const nextQuestions = intakeResult.nextQuestions && intakeResult.nextQuestions.length > 0
    ? intakeResult.nextQuestions
    : (intakeResult.missingFields.map(f => QUESTIONS[f]).filter(Boolean));

  const formatted = formatLaborSettlementResponse({
    status: 'needs_information',
    intakeResult,
    calculation: null,
    intent: null,
    missingFields: intakeResult.missingFields,
    ambiguousFields: intakeResult.ambiguousFields,
    warnings: intakeResult.warnings,
    nextQuestions
  });

  return {
    status: 'collecting',
    intent: 'labor_settlement_estimate',
    state: {
      active: true,
      intent: 'labor_settlement_estimate',
      collected,
      askedFields: [...new Set([...currentState.askedFields, ...intakeResult.missingFields])],
      status: 'collecting'
    },
    response: {
      kind: 'question',
      text: formatted.text,
      data: null
    },
    calculation: null,
    missingFields: intakeResult.missingFields,
    warnings: intakeResult.warnings
  };
}

module.exports = {
  handleLaborSettlementMessage,
  extractLaborFields,
  QUESTIONS,
  normalizeText
};
