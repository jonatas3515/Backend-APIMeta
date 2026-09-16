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

module.exports = { formatLaborSettlementResponse };
