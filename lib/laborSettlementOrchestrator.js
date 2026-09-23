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

const MONTH_NAMES = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const MONTH_MAP = Object.fromEntries(MONTH_NAMES.map((n, i) => [n, String(i + 1).padStart(2, '0')]));

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

function findTemporalReferences(text, referenceYear) {
  const refs = [];
  const seen = new Set();
  const lower = text.toLowerCase();

  const today = getTodayIso();
  const [y, m, d] = today.split('-').map(Number);
  const yesterday = new Date(y, m - 1, d - 1, 12, 0, 0);
  const yesterdayIso = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  const add = (index, date) => {
    const key = `${index}:${date}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push({ index, date });
  };

  // Datas completas dd/mm/aaaa ou aaaa-mm-dd
  const brPattern = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/g;
  const isoPattern = /(\d{4})-(\d{2})-(\d{2})/g;
  let match;
  while ((match = brPattern.exec(text)) !== null) {
    const [_, day, month, year] = match;
    add(match.index, `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  }
  while ((match = isoPattern.exec(text)) !== null) {
    const [_, year, month, day] = match;
    add(match.index, `${year}-${month}-${day}`);
  }

  // Datas relativas
  const relativePattern = /\b(hoje|ontem)\b/gi;
  while ((match = relativePattern.exec(text)) !== null) {
    add(match.index, match[1].toLowerCase() === 'hoje' ? today : yesterdayIso);
  }

  // Datas incompletas dd/mm (sem ano). Exige fronteira de palavra para não
  // capturar fragmentos dentro de números longos (ex: processos).
  const incompletePatterns = [
    /(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/g,
    /(?<!\d)(\d{1,2})-(\d{1,2})(?!\d)/g
  ];
  for (const pattern of incompletePatterns) {
    while ((match = pattern.exec(text)) !== null) {
      const [day, month] = match.slice(1).map(Number);
      if (day < 1 || day > 31 || month < 1 || month > 12) continue;
      const paddedDay = String(day).padStart(2, '0');
      const paddedMonth = String(month).padStart(2, '0');
      add(match.index, `${referenceYear}-${paddedMonth}-${paddedDay}`);
    }
  }

  // Meses por extenso (com ou sem dia/ano)
  const monthPattern = new RegExp(`\\b(${MONTH_NAMES.join('|')})\\b`, 'gi');
  while ((match = monthPattern.exec(text)) !== null) {
    const monthName = match[1].toLowerCase();
    const month = MONTH_MAP[monthName];
    const start = match.index;
    const end = match.index + match[0].length;
    const after = text.slice(end, end + 30).toLowerCase();
    const before = text.slice(Math.max(0, start - 20), start).toLowerCase();

    let day = 1;
    let year = referenceYear;

    // "janeiro de 2023" / "janeiro/2023" / "janeiro 2023"
    const yearAfter = after.match(/^(?:\s*(?:de|\/)?\s*)?(\d{4})\b/);
    if (yearAfter) year = Number(yearAfter[1]);

    // "janeiro dia 1" / "janeiro 1"
    const dayAfter = after.match(/^\s*(?:dia\s+)?(\d{1,2})\b/);
    if (dayAfter) day = Number(dayAfter[1]);

    // "1 de janeiro" / "1/janeiro" / "dia 1 de janeiro"
    const dayBefore = before.match(/(?:\b(?:dia\s+)?(\d{1,2})\s*(?:de|[\/\-])?\s*)$/);
    if (dayBefore) day = Number(dayBefore[1]);

    const paddedDay = String(day).padStart(2, '0');
    add(start, `${year}-${month}-${paddedDay}`);
  }

  return refs.sort((a, b) => a.index - b.index);
}

function findPrevMatch(refIndex, text, pattern) {
  let match;
  let prev = null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index < refIndex) prev = match.index;
    if (match.index >= refIndex) break;
  }
  pattern.lastIndex = 0;
  return prev;
}

function findNextMatch(refIndex, text, pattern) {
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > refIndex) {
      pattern.lastIndex = 0;
      return match.index;
    }
  }
  pattern.lastIndex = 0;
  return null;
}

function resolveDateTarget(askedFields, collected, extracted, ref, text) {
  const lower = String(text).toLowerCase();
  const admissionAvailable = !collected.admissionDate && !extracted?.admissionDate;
  const terminationAvailable = !collected.terminationDate && !extracted?.terminationDate;

  if (!admissionAvailable && !terminationAvailable) return null;

  const admissionPattern = /\b(admiss|admiti|entre|entrei|comecei|comece)\b/g;
  const terminationPattern = /\b(deslig|sai|sa[ií]|demiti|mandado|embora)\b/g;

  const prevAdmission = findPrevMatch(ref.index, lower, admissionPattern);
  const prevTermination = findPrevMatch(ref.index, lower, terminationPattern);
  const nextAdmission = findNextMatch(ref.index, lower, admissionPattern);
  const nextTermination = findNextMatch(ref.index, lower, terminationPattern);

  const hasAdmissionKeyword = prevAdmission !== null || nextAdmission !== null;
  const hasTerminationKeyword = prevTermination !== null || nextTermination !== null;

  // Preferência explícita: palavra anterior é a mais forte.
  const askedOnlyAdmission = askedFields.length === 1 && askedFields[0] === 'admissionDate';
  const askedOnlyTermination = askedFields.length === 1 && askedFields[0] === 'terminationDate';

  if (askedOnlyAdmission && admissionAvailable) return 'admissionDate';
  if (askedOnlyTermination && terminationAvailable) return 'terminationDate';

  if (prevAdmission !== null && admissionAvailable && (prevTermination === null || prevAdmission > prevTermination)) {
    return 'admissionDate';
  }
  if (prevTermination !== null && terminationAvailable && (prevAdmission === null || prevTermination > prevAdmission)) {
    return 'terminationDate';
  }

  const relativeDate = /\b(hoje|ontem)\b/.test(lower);
  const monthDate = new RegExp(`\\b(${MONTH_NAMES.join('|')})\\b`, 'i').test(lower);

  if (terminationAvailable && relativeDate) return 'terminationDate';
  if (admissionAvailable && monthDate) return 'admissionDate';

  // Se há apenas palavra seguinte, use-a como pista.
  if (admissionAvailable && (nextAdmission !== null && (nextTermination === null || nextAdmission < nextTermination))) {
    return 'admissionDate';
  }
  if (terminationAvailable && (nextTermination !== null && (nextAdmission === null || nextTermination < nextAdmission))) {
    return 'terminationDate';
  }

  const admissionFirst = askedFields.indexOf('admissionDate') < askedFields.indexOf('terminationDate') || !askedFields.includes('terminationDate');
  if (admissionAvailable && terminationAvailable) {
    return admissionFirst ? 'admissionDate' : 'terminationDate';
  }
  if (admissionAvailable) return 'admissionDate';
  if (terminationAvailable) return 'terminationDate';
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

const PROCESS_NUMBER_RE = /\b\d{7,}-\d{2}\.\d{4}\.(?:\d{1,2}\.){2}\d{4}\b/g;

function stripProcessNumbers(text) {
  if (!text || typeof text !== 'string') return text;
  return text.replace(PROCESS_NUMBER_RE, ' [PROCESSO] ');
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
  const text = stripProcessNumbers(String(message || ''));
  const normalized = normalizeText(text);
  const extracted = {};

  const today = getTodayIso();
  const thisYear = Number(today.split('-')[0]);
  const temporalRefs = findTemporalReferences(text, thisYear);

  for (const ref of temporalRefs) {
    const target = resolveDateTarget(askedFields, collected, extracted, ref, text);
    if (target && !extracted[target]) {
      extracted[target] = ref.date;
    }
  }

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
  } else if (collected.salary === undefined) {
    // Tolerante a digitação: verbo de remuneração seguido de valor
    // ("anhava 2500", "ganhava 2.500", "salario 2500", "recebia 2500").
    const verbSalary = text.match(/\b(g?anhav\w*|receb\w*|salari\w*|soldo|venciment\w*|pagav\w*|ganh\w*)\s*(?:r?\$?\s*)?(?:de\s+|cerca\s+de\s+|uns?\s+)?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{3,6}(?:,\d{2})?)\b/i);
    if (verbSalary) {
      const val = parseSalary(verbSalary[2]);
      if (val !== undefined) extracted.salary = val;
    }

    // Contexto informal: "2500 mês", "2500 mensal", "ganhava 2500 por mês"
    if (extracted.salary === undefined) {
      const looseSalary = text.match(/\b(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{3,6}(?:,\d{2})?)\s*(?:reais?|mensal|por\s+m[eê]s|m[eê]s|\/\s*m[eê]s)\b/i);
      if (looseSalary) {
        const val = parseSalary(looseSalary[1]);
        if (val !== undefined) extracted.salary = val;
      }
    }

    // Fallback: contexto de demissão/informalidade + número plausível
    // que não faça parte de data ("mandou embora", "sem carteira", "patrão").
    if (extracted.salary === undefined) {
      const dismissalCtx = /(mandou embora|mandaram embora|mandad[oa] embora|demiti\w*|demiss|dispens|sem carteira|nao assinaram|patrao|patroa|empregador|emprego|trabalhava|trabalhei|empresa)/.test(normalized);
      if (dismissalCtx) {
        const numericMatches = normalized.match(/\b\d{3,5}\b/g) || [];
        for (const numText of numericMatches) {
          const idx = normalized.indexOf(numText);
          const around = normalized.slice(Math.max(0, idx - 2), idx + numText.length + 2);
          if (/[\/\-.]/.test(around)) continue; // provável data
          const num = Number(numText);
          if (num >= 1900 && num <= 2100) continue; // provável ano
          const val = parseSalary(numText);
          if (val !== undefined) {
            extracted.salary = val;
            break;
          }
        }
      }
    }
  } else if (/R?\$/.test(text) || /\breais?\b/.test(text)) {
    // Menção a dinheiro sem salário explícito e fora de contexto de pergunta.
    extracted.salary = 'invalid';
  }

  // Motivo
  const reason = normalizeReasonText(text);
  if (reason) extracted.terminationReason = reason;

  // Campos sim/não pendentes (evita atribuir "sim" quando há ambiguidade)
  const pendingYesNo = ['hasVacationAccrued', 'hasThirteenthAccrued'].filter(f => askedFields.includes(f) && collected[f] === undefined);

  // Férias vencidas
  const vacationAsked = askedFields.includes('hasVacationAccrued') && collected.hasVacationAccrued === undefined;
  const vacationMention = /\bferias\b/.test(normalized) || /\bf[eé]rias\b/.test(text.toLowerCase());
  if (vacationMention || (vacationAsked && pendingYesNo.length === 1)) {
    const val = parseYesNoUnknown(text);
    if (val !== undefined) extracted.hasVacationAccrued = val;
  }

  // 13º
  const thirteenthAsked = askedFields.includes('hasThirteenthAccrued') && collected.hasThirteenthAccrued === undefined;
  const thirteenthMention = /\b13[ºo]?\b/.test(normalized) || /decimo terceiro/.test(normalized);
  if (thirteenthMention || (thirteenthAsked && pendingYesNo.length === 1)) {
    const val = parseYesNoUnknown(text);
    if (val !== undefined) extracted.hasThirteenthAccrued = val;
  }

  // Aviso-prévio: aceita respostas diretas (ex: "Indenizado") quando o bot perguntou
  const noticeAsked = askedFields.includes('noticeStatus') && collected.noticeStatus === undefined;
  const noticeMention = /\baviso\b/.test(normalized) || /aviso[-\s]?previo/.test(text.toLowerCase());
  if (noticeMention || noticeAsked) {
    const val = parseNotice(text);
    if (val !== undefined) extracted.noticeStatus = val;
  }

  // Dispensa imediata (sem cumprimento em serviço) → aviso-prévio indenizado.
  const immediateDismissal = [
    'nao precisa vir mais',
    'nao precisa voltar mais',
    'nao precisa mais vir',
    'nao precisa mais voltar',
    'falaram para nao ir mais',
    'falaram para nao vir mais',
    'falaram pra nao ir mais',
    'falaram pra nao vir mais',
    'pediram para nao voltar',
    'pediram pra nao voltar',
    'mandado embora',
    'mandada embora',
    'mandaram embora',
    'mandou embora',
    'me mandou embora',
    'me demitiu',
    'me dispensou',
    'demitido hoje',
    'demitida hoje',
    'dispensado hoje',
    'dispensada hoje',
    'me dispensaram',
    'nao vai mais',
    'nao volte mais',
    'nao e mais necessario',
    'nao e mais necessaria'
  ].some(p => normalized.includes(p));

  if (immediateDismissal) {
    const reasonKnown = extracted.terminationReason !== undefined || collected.terminationReason !== undefined;
    const compatibleReason = !reasonKnown ||
      extracted.terminationReason === 'dispensa_sem_justa_causa' ||
      collected.terminationReason === 'dispensa_sem_justa_causa';
    if (compatibleReason) {
      // Dispensa imediata sem motivo declarado presume dispensa sem justa causa
      // para fins de estimativa preliminar e implica aviso-prévio indenizado.
      if (!reasonKnown) extracted.terminationReason = 'dispensa_sem_justa_causa';
      if (extracted.noticeStatus === undefined && collected.noticeStatus === undefined) {
        extracted.noticeStatus = 'indenizado';
      }
    }
  }

  // CTPS / carteira assinada
  const noCtpsPatterns = [
    'nao assinaram', 'nunca assinaram', 'sem registro', 'sem carteira',
    'nao registrado', 'nao registrada', 'sem ctps', 'nao anotaram',
    'sem carteira assinada', 'nao tinha carteira', 'carteira nao foi assinada',
    'carteira nao e assinada', 'trabalhava sem registro', 'trabalho sem registro',
    'trabalho informal', 'trabalhava informal', 'sem contrato de trabalho'
  ];
  const yesCtpsPatterns = [
    'assinaram carteira', 'assinaram minha carteira', 'carteira assinada',
    'com registro', 'ctps assinada', 'era registrado', 'era registrada',
    'tinha registro', 'carteira foi assinada'
  ];
  if (noCtpsPatterns.some(p => normalized.includes(p))) {
    extracted.hasCtps = 'no';
  } else if (yesCtpsPatterns.some(p => normalized.includes(p))) {
    extracted.hasCtps = 'yes';
  }

  // Jornada acima de 8h diárias / 44h semanais
  const overtimePatterns = [
    /\b(?:trabalhava|trabalhando|jornada|fazia|ficava|cumpria|cumpri|faz)\s+(?:\d{2,}|mais\s+de\s+8)\s*(?:horas?|h)\b/i,
    /\b\d{2,}\s*(?:horas?|h)\s*(?:por\s+dia|diarias?|de\s+trabalho|semanais?)\b/i,
    /\bmais\s+de\s+8\s*(?:horas?|h)\s*(?:por\s+dia|diarias?)?\b/i
  ];
  if (overtimePatterns.some(p => p.test(normalized))) {
    extracted.hasOvertime = true;
  }

  return extracted;
}

function mergeCollected(current, extracted) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(extracted)) {
    if (value === undefined || value === null || value === '') continue;
    // Preserva valores já coletados para evitar que uma mesma mensagem
    // seja reatribuída a outro campo quando o histórico for reprocessado.
    if (merged[key] !== undefined && merged[key] !== null && merged[key] !== '') continue;
    merged[key] = value;
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

function buildReleasedToGemini(state, intent) {
  return {
    status: 'idle',
    intent: 'other',
    state: {
      active: false,
      intent: null,
      collected: { ...(state?.collected || {}) },
      askedFields: [],
      status: 'idle'
    },
    response: {
      kind: 'released_to_gemini',
      text: '',
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

  // Extrai antes de decidir pela intenção: se a mensagem já trouxer os dados
  // mínimos (salário + período), a estimativa é calculada mesmo sem pedido
  // explícito de valor — evita resposta genérica quando o cliente já informou tudo.
  const extracted = extractLaborFields(message, currentState.askedFields, currentState.collected);
  const collected = mergeCollected(currentState.collected, extracted);
  const hasMinimum = typeof collected.salary === 'number' && collected.salary > 0 &&
    collected.admissionDate && collected.terminationDate;

  // Sinal trabalhista evita que mensagens não relacionadas com números e datas
  // soltas (ex.: "entrei na academia em janeiro") disparem estimativa.
  const laborSignal = intent.intent !== 'other' ||
    collected.terminationReason !== undefined ||
    collected.hasCtps !== undefined ||
    collected.noticeStatus !== undefined ||
    /\b(demiss|demit|rescis|carteira|fgts|empreg|trabalh|patr|salario|aviso|ferias|registr)\w*/.test(normalizedMessage);

  const shouldEstimate = hasMinimum && laborSignal;

  if (!currentState.active && intent.intent === 'other' && !shouldEstimate) {
    return buildIgnored(currentState, intent);
  }

  if (!currentState.active && intent.intent === 'labor_question' && !shouldEstimate) {
    return buildReleasedToGemini(currentState, intent);
  }

  const isNewEstimate = (!currentState.active && (intent.intent === 'labor_settlement_estimate' || shouldEstimate)) ||
                        (currentState.active && currentState.status === 'collecting');

  if (!isNewEstimate) {
    return buildIgnored(currentState, { intent: 'other' });
  }

  const intakeResult = processLaborSettlementIntake(collected);

  if (collected.salary === 'invalid' && intakeResult.status !== 'ready') {
    return buildReleasedToGemini({ ...currentState, collected }, { intent: 'labor_settlement_estimate' });
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
    return buildReleasedToGemini({ ...currentState, collected }, { intent: 'labor_settlement_estimate' });
  }

  // Não faz perguntas rígidas. Libera o diálogo para o Gemini responder
  // de forma empática e resolutiva.
  return buildReleasedToGemini({ ...currentState, collected }, { intent: 'labor_settlement_estimate' });
}

module.exports = {
  handleLaborSettlementMessage,
  extractLaborFields,
  QUESTIONS,
  normalizeText
};
