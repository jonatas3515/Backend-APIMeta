/**
 * Formatador determinístico de resposta para a calculadora trabalhista.
 *
 * Regras:
 * - Nunca recalcula nem arredonda valores.
 * - Não adiciona informação que não venha do motor ou do intake.
 * - Nunca apresenta valores condicionais como certos.
 * - Sempre inclui os avisos obrigatórios de estimativa.
 * - Não expõe PII em texto.
 * - Dedup rigoroso: um item nunca aparece duas vezes na tela.
 * - Omitir menções que não se aplicam ao caso (ex.: férias vencidas para
 *   vínculos inferiores a 12 meses).
 */

function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(amount));
}

function formatDate(iso) {
  if (!iso) return '—';
  const [year, month, day] = String(iso).split('-');
  return `${day}/${month}/${year}`;
}

function bulletList(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return '\n' + items.map(i => `• ${i}`).join('\n');
}

const REASON_LABELS = {
  dispensa_sem_justa_causa: 'Dispensa sem justa causa',
  justa_causa: 'Dispensa por justa causa',
  pedido_demissao: 'Pedido de demissão',
  acordo: 'Acordo',
  rescisao_indireta_em_discussao: 'Rescisão indireta (em discussão)',
  contrato_temporario: 'Contrato temporário',
  desconhecido: 'Não informado'
};

const NOTICE_LABELS = {
  trabalhado: 'Trabalhado',
  indenizado: 'Indenizado',
  nao_cumprido: 'Não cumprido',
  desconhecido: 'Não informado'
};

const CTPS_LABELS = {
  yes: 'Registrado em CTPS',
  no: 'Sem registro em CTPS',
  unknown: 'Situação de CTPS não informada'
};

function findItem(items, code) {
  if (!Array.isArray(items)) return null;
  return items.find(i => i.code === code) || null;
}

function toBrl(number) {
  return Number(Number(number).toFixed(2));
}

function buildDadosUsados(inputSummary) {
  const parts = [
    `• Salário base: ${formatCurrency(inputSummary.salary)}`,
    `• Período aproximado: ${inputSummary.period?.monthsOfWork || 0} meses`,
    `• Admissão: ${formatDate(inputSummary.admissionDate)}`,
    `• Desligamento: ${formatDate(inputSummary.terminationDate)}`,
    `• Motivo: ${REASON_LABELS[inputSummary.terminationReason] || inputSummary.terminationReason || '—'}`,
    `• Aviso-prévio: ${NOTICE_LABELS[inputSummary.noticeStatus] || inputSummary.noticeStatus || '—'}`
  ];

  if (inputSummary.hasCtps === 'no') {
    parts.push(`• CTPS: ${CTPS_LABELS.no}`);
  } else if (inputSummary.hasCtps === 'yes') {
    parts.push(`• CTPS: ${CTPS_LABELS.yes}`);
  }

  return parts;
}

function buildValoresEstimados(items) {
  const lines = [];
  const seen = new Set();

  const push = (label, value) => {
    if (seen.has(label)) return;
    seen.add(label);
    lines.push(`• ${label}: ${value}`);
  };

  const salary = findItem(items, 'salary_balance');
  if (salary) push('Saldo de salário', formatCurrency(salary.amount));

  const notice = findItem(items, 'notice_indemnity');
  if (notice && notice.status === 'calculated' && notice.amount > 0) {
    push('Aviso-prévio indenizado (30 dias)', formatCurrency(notice.amount));
  }

  const thirteenth = findItem(items, 'thirteenth_proportional');
  if (thirteenth) push('13º proporcional', formatCurrency(thirteenth.amount));

  const thirteenthAccrued = findItem(items, 'thirteenth_accrued');
  if (thirteenthAccrued && thirteenthAccrued.status === 'conditional' && thirteenthAccrued.amount > 0) {
    push('13º vencido', 'a confirmar');
  }

  const vacationProportional = findItem(items, 'vacation_proportional');
  const vacationOneThird = findItem(items, 'vacation_one_third');
  if (vacationProportional && vacationOneThird) {
    const totalFerias = toBrl(vacationProportional.amount + vacationOneThird.amount);
    const status = vacationProportional.status;
    push('Férias proporcionais + 1/3', status === 'calculated' ? formatCurrency(totalFerias) : 'a confirmar');
  }

  const vacationAccrued = findItem(items, 'vacation_accrued');
  if (vacationAccrued && vacationAccrued.status === 'conditional' && vacationAccrued.amount > 0) {
    push('Férias vencidas + 1/3', 'a confirmar');
  }

  const fgtsDeposits = findItem(items, 'fgts_deposits');
  if (fgtsDeposits && fgtsDeposits.amount > 0) {
    push('FGTS estimado (8% mensal)', formatCurrency(fgtsDeposits.amount));
  }

  const fgtsPenalty = findItem(items, 'fgts_penalty_40');
  if (fgtsPenalty && fgtsPenalty.amount > 0) {
    push('Multa de 40% sobre FGTS', formatCurrency(fgtsPenalty.amount));
  }

  return lines;
}

function buildNaoIncluidos(items) {
  const names = new Set();

  for (const item of items || []) {
    if (item.status === 'calculated') continue;
    if (item.amount > 0 && item.status === 'conditional') {
      names.add(`${item.name} (a confirmar)`);
    } else if (item.status === 'conditional' || item.status === 'not_calculated') {
      names.add(item.name);
    }
  }

  const deduped = [...names];
  return deduped.length > 0 ? deduped.map(n => `• ${n}`) : [];
}

function formatLaborSettlementResponse({
  status,
  intakeResult,
  calculation,
  intent,
  missingFields = [],
  ambiguousFields = [],
  warnings = [],
  nextQuestions = []
}) {
  const defaultWarnings = [
    'Esta é uma estimativa preliminar e não representa garantia de valor.',
    'O cálculo depende de confirmação dos fatos, documentos e regras aplicáveis.',
    'Parcelas controvertidas devem ser analisadas por profissional.'
  ];

  const effectiveWarnings = warnings.length > 0 ? warnings : defaultWarnings;

  if (intent && intent.intent === 'labor_question' && intent.requiresIntake === false) {
    return {
      type: 'labor_question',
      text: 'Entendi que você tem uma dúvida trabalhista. Assim que quiser uma estimativa de valores, me informe salário, datas de admissão e desligamento, e o motivo do desligamento.',
      disclaimers: effectiveWarnings
    };
  }

  if (status === 'needs_information' || (status === 'invalid' && missingFields.length > 0)) {
    const fieldsText = missingFields.length > 0
      ? `Para estimar sua rescisão, preciso das seguintes informações:${bulletList(nextQuestions)}`
      : `Há informações inconsistentes ou incompletas.`;

    return {
      type: 'needs_information',
      text: fieldsText,
      missingFields,
      ambiguousFields,
      disclaimers: effectiveWarnings,
      nextQuestions,
      isInvalid: false
    };
  }

  if (status === 'invalid') {
    const warningText = warnings.length > 0 ? `\n\n${warnings.join(' ')}` : '';
    const askText = nextQuestions.length > 0
      ? `\n\nPor favor, corrija:${bulletList(nextQuestions)}`
      : '';

    return {
      type: 'invalid',
      text: `Há informações inconsistentes ou incompletas.${warningText}${askText}`,
      missingFields,
      ambiguousFields,
      disclaimers: effectiveWarnings,
      nextQuestions,
      isInvalid: true
    };
  }

  if (status !== 'ready' || !calculation) {
    return {
      type: 'incomplete',
      text: 'Não consegui preparar a estimativa com os dados disponíveis. Verifique se as informações estão corretas.',
      disclaimers: effectiveWarnings
    };
  }

  const dados = buildDadosUsados(calculation.inputSummary);
  const valores = buildValoresEstimados(calculation.items);
  const naoIncluidos = buildNaoIncluidos(calculation.items);
  const hasCtpsNo = calculation.inputSummary.hasCtps === 'no';

  const parts = [
    '🧾 Estimativa preliminar da rescisão',
    '',
    '📌 Dados considerados',
    ...dados,
    '',
    '💰 Verbas estimadas',
    ...valores,
    '',
    `➡️ Total estimado: ${formatCurrency(calculation.totalEstimated)}`
  ];

  if (hasCtpsNo) {
    parts.push('', 'Como não havia registro em carteira, o total já considera a estimativa dos depósitos de FGTS que deixaram de ser feitos, além da multa rescisória de 40%.');
  } else {
    parts.push('', 'Além desse valor, você terá direito à liberação do FGTS e ao pagamento da multa rescisória de 40% sobre os valores depositados na sua conta vinculada.');
  }

  if (naoIncluidos.length > 0) {
    parts.push('', '⚠️ Não incluídos ou dependentes de confirmação:');
    parts.push(...naoIncluidos);
  }

  parts.push('', 'Essa é uma noção inicial — dependendo dos documentos, os valores podem variar.');
  parts.push('Envie extratos, holerites, conversas com o patrão ou recibos para a equipe jurídica analisar e formalizar o pedido.');

  return {
    type: 'labor_settlement_estimate',
    text: parts.join('\n'),
    disclaimers: effectiveWarnings,
    totalEstimated: calculation.totalEstimated,
    currency: calculation.currency
  };
}

const VALUE_ANSWER_DISCLAIMER = 'É uma estimativa preliminar: os valores exatos dependem do reconhecimento do vínculo e da conferência dos documentos pela nossa equipe jurídica.';

const CANONICAL_CODE_MAP = {
  notice_indemnity: 'notice_pay',
  inss_discount: 'inss',
  fgts_deposits: 'fgts',
  fgts_penalty_40: 'fgts_fine',
  vacation_one_third: 'vacation_bonus'
};

const CLIENT_LABELS = {
  salary_balance: 'Saldo de salário',
  notice_pay: 'Aviso-prévio indenizado',
  thirteenth_proportional: '13º proporcional',
  vacation_proportional: 'Férias proporcionais',
  vacation_bonus: '1/3 constitucional sobre férias',
  family_salary: 'Salário família',
  inss: 'INSS',
  fgts: 'Depósitos de FGTS',
  fgts_fine: 'Multa sobre FGTS'
};

const REASON_LABELS_CLIENT = {
  demissaoSemJustaCausa: 'dispensa sem justa causa',
  demissaoComJustaCausa: 'dispensa por justa causa',
  pedidoDemissao: 'pedido de demissão',
  acordoMutuo: 'acordo mútuo',
  contratoTemporario: 'contrato temporário'
};

function normalizeCode(code) {
  return CANONICAL_CODE_MAP[code] || code;
}

/**
 * Normaliza itens de cálculo: mapeia códigos antigos para os códigos únicos,
 * remove duplicatas por código e traduz nomes para a linguagem do cliente.
 * Não recalcula valores nem acessa texto já formatado.
 */
function normalizeLaborItems(items) {
  const map = new Map();
  if (!Array.isArray(items)) return map;

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const code = normalizeCode(item.code);
    const existing = map.get(code);
    const normalized = {
      ...item,
      code,
      name: CLIENT_LABELS[code] || item.name,
      amount: Number(item.amount || 0)
    };
    if (existing) {
      // Mantém o primeiro encontrado e acumula o valor, evitando duplicidade.
      normalized.amount = toBrl(existing.amount + normalized.amount);
      map.set(code, normalized);
    } else {
      map.set(code, normalized);
    }
  }

  return map;
}

function getAmount(normalizedItems, code) {
  const item = normalizedItems.get(code);
  return item ? Number(item.amount || 0) : 0;
}

function hasAmount(normalizedItems, code) {
  const item = normalizedItems.get(code);
  return !!(item && item.amount > 0);
}

function formatSiteLaborSettlementResponse(calculation) {
  if (!calculation || calculation.totalEstimated == null || !Array.isArray(calculation.items)) {
    return {
      type: 'incomplete',
      text: 'Não consegui preparar a estimativa com os dados disponíveis. Verifique se as informações estão corretas.'
    };
  }

  const is = calculation.inputSummary || {};
  const items = normalizeLaborItems(calculation.items);

  const dados = [
    `• Salário base: ${formatCurrency(is.salary)}`,
    `• Admissão: ${formatDate(is.admissionDate)}`,
    `• Desligamento: ${formatDate(is.terminationDate)}`,
    `• Motivo: ${REASON_LABELS_CLIENT[is.terminationReason] || is.terminationReason || '—'}`
  ];

  if (is.hasCtps === 'yes' || is.hasCtps === 'no') {
    dados.push(`• Carteira assinada: ${is.hasCtps === 'yes' ? 'sim' : 'não'}`);
  }

  const salary = getAmount(items, 'salary_balance');
  const notice = getAmount(items, 'notice_pay');
  const thirteenth = getAmount(items, 'thirteenth_proportional');
  const vacation = toBrl(getAmount(items, 'vacation_proportional') + getAmount(items, 'vacation_bonus'));
  const family = getAmount(items, 'family_salary');
  const inss = getAmount(items, 'inss');
  const fgts = getAmount(items, 'fgts');
  const fgtsFine = getAmount(items, 'fgts_fine');

  const grossRescisory = toBrl(salary + notice + thirteenth + vacation + family);
  const netRescisory = toBrl(grossRescisory - inss);
  const fgtsTotal = toBrl(fgts + fgtsFine);
  const totalWithFgts = toBrl(netRescisory + fgtsTotal);

  const verbas = [];
  if (salary > 0) verbas.push(`• Saldo de salário: ${formatCurrency(salary)}`);
  if (notice > 0) verbas.push(`• Aviso-prévio indenizado: ${formatCurrency(notice)}`);
  if (thirteenth > 0) verbas.push(`• 13º proporcional: ${formatCurrency(thirteenth)}`);
  if (vacation > 0) verbas.push(`• Férias proporcionais + 1/3: ${formatCurrency(vacation)}`);
  if (family > 0) verbas.push(`• Salário família: ${formatCurrency(family)}`);

  const descontos = [];
  if (inss > 0) descontos.push(`• INSS: -${formatCurrency(inss)}`);

  const fgtsLines = [];
  if (fgts > 0) fgtsLines.push(`• Depósitos de FGTS: ${formatCurrency(fgts)}`);
  if (fgtsFine > 0) {
    const fineItem = items.get('fgts_fine');
    const pctMatch = fineItem && fineItem.assumptions ? fineItem.assumptions.find(a => /\d+%/.test(a)) : null;
    const pct = pctMatch ? pctMatch.match(/(\d+)%/)?.[0] : '40%';
    fgtsLines.push(`• Multa de ${pct || '40%'}: ${formatCurrency(fgtsFine)}`);
  }
  if (fgtsTotal > 0) fgtsLines.push(`• FGTS + multa: ${formatCurrency(fgtsTotal)}`);

  const parts = [
    '🧾 Estimativa preliminar da rescisão',
    '',
    '📌 Dados considerados',
    ...dados,
    '',
    '💰 Verbas rescisórias',
    ...(verbas.length > 0 ? verbas : ['• Nenhuma verba rescisória calculada.']),
    '',
    '➖ Descontos',
    ...(descontos.length > 0 ? descontos : ['• Nenhum desconto aplicado.']),
    '',
    '🏦 FGTS estimado',
    ...(fgtsLines.length > 0 ? fgtsLines : ['• FGTS não aplicável ao caso.']),
    '',
    `➡️ Total líquido das verbas rescisórias: ${formatCurrency(netRescisory)}`,
    `➡️ Total estimado incluindo FGTS + multa: ${formatCurrency(totalWithFgts)}`,
    '',
    '⚠️ O FGTS e a multa não devem ser apresentados como se fossem necessariamente pagos junto com as verbas rescisórias. A estimativa depende do reconhecimento do vínculo e da comprovação dos dados.'
  ];

  return {
    type: 'labor_settlement_estimate',
    text: parts.join('\n'),
    totalEstimated: calculation.totalEstimated,
    currency: calculation.currency
  };
}

/**
 * Resposta determinística para perguntas pontuais sobre valores já calculados.
 * Nunca calcula nem arredonda — apenas lê os itens normalizados.
 * Retorna null quando não há cálculo válido.
 */
function formatLaborValueAnswer(message, calculation) {
  if (!calculation || calculation.totalEstimated == null || !Array.isArray(calculation.items)) return null;

  const normalized = String(message || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

  const items = normalizeLaborItems(calculation.items);
  const fgtsDeposits = items.get('fgts');
  const fgtsPenalty = items.get('fgts_fine');

  if (/horas?\s*extras?|jornada|adicional/.test(normalized) && !/fgts|multa/.test(normalized)) {
    return `As horas extras e seus reflexos serão apurados pela nossa equipe jurídica na análise do caso — não entram na estimativa preliminar. ${VALUE_ANSWER_DISCLAIMER}`;
  }

  if (/\bfgts\b|\bmulta\b/.test(normalized)) {
    if ((fgtsDeposits && fgtsDeposits.amount > 0) || (fgtsPenalty && fgtsPenalty.amount > 0)) {
      const depAmount = fgtsDeposits ? fgtsDeposits.amount : 0;
      const penAmount = fgtsPenalty ? fgtsPenalty.amount : 0;
      const dep = depAmount > 0 ? formatCurrency(depAmount) : null;
      const pen = penAmount > 0 ? formatCurrency(penAmount) : null;
      const total = formatCurrency(depAmount + penAmount);
      const finePct = fgtsPenalty && fgtsPenalty.assumptions
        ? (fgtsPenalty.assumptions.find(a => /\d+%/.test(a))?.match(/(\d+)%/)?.[0] || '40%')
        : '40%';
      const penaltyText = pen
        ? ` e a multa rescisória de ${finePct} em ${pen}`
        : ' (a multa rescisória depende da modalidade do desligamento)';
      return `Pelo que você me passou, o FGTS devido no período fica estimado em ${dep} (8% ao mês)${penaltyText} — juntos, cerca de ${total}. ${VALUE_ANSWER_DISCLAIMER}`;
    }
    return 'Além das verbas estimadas, você tem direito à liberação do FGTS depositado e à multa rescisória de 40% sobre esses valores. O valor exato depende do extrato da sua conta vinculada na Caixa, que nossa equipe confere na análise.';
  }

  const salary = getAmount(items, 'salary_balance');
  const notice = getAmount(items, 'notice_pay');
  const thirteenth = getAmount(items, 'thirteenth_proportional');
  const vacation = toBrl(getAmount(items, 'vacation_proportional') + getAmount(items, 'vacation_bonus'));
  const family = getAmount(items, 'family_salary');
  const inss = getAmount(items, 'inss');
  const fgts = getAmount(items, 'fgts');
  const fgtsFine = getAmount(items, 'fgts_fine');

  const grossRescisory = toBrl(salary + notice + thirteenth + vacation + family);
  const netRescisory = toBrl(grossRescisory - inss);
  const fgtsTotal = toBrl(fgts + fgtsFine);
  const totalWithFgts = toBrl(netRescisory + fgtsTotal);

  const lines = [];
  if (salary > 0) lines.push(`• Saldo de salário: ${formatCurrency(salary)}`);
  if (notice > 0) lines.push(`• Aviso-prévio indenizado: ${formatCurrency(notice)}`);
  if (thirteenth > 0) lines.push(`• 13º proporcional: ${formatCurrency(thirteenth)}`);
  if (vacation > 0) lines.push(`• Férias proporcionais + 1/3: ${formatCurrency(vacation)}`);
  if (family > 0) lines.push(`• Salário família: ${formatCurrency(family)}`);

  if (lines.length === 0) return null;

  return `Na estimativa preliminar, as verbas rescisórias são:\n${lines.join('\n')}${inss > 0 ? `\n• INSS: -${formatCurrency(inss)}` : ''}\n\n➡️ Total líquido das verbas: ${formatCurrency(netRescisory)}${(fgts > 0 || fgtsFine > 0) ? `\n➡️ Total incluindo FGTS + multa: ${formatCurrency(totalWithFgts)}` : ''}\n\n${VALUE_ANSWER_DISCLAIMER}`;
}

module.exports = { formatLaborSettlementResponse, formatSiteLaborSettlementResponse, formatLaborValueAnswer };
