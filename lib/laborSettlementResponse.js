/**
 * Formatador determinístico de resposta para a calculadora trabalhista.
 *
 * Regras:
 * - Nunca recalcula nem arredonda valores.
 * - Não adiciona informação que não venha do motor ou do intake.
 * - Nunca apresenta valores condicionais como certos.
 * - Sempre inclui os avisos obrigatórios de estimativa.
 * - Não expõe PII em texto.
 */

function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '—';
  return `R$ ${Number(amount).toFixed(2).replace('.', ',')}`;
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

function findItem(items, code) {
  if (!Array.isArray(items)) return null;
  return items.find(i => i.code === code) || null;
}

function buildDadosUsados(inputSummary) {
  const parts = [
    `• Salário: ${formatCurrency(inputSummary.salary)}`,
    `• Admissão: ${formatDate(inputSummary.admissionDate)}`,
    `• Desligamento: ${formatDate(inputSummary.terminationDate)}`,
    `• Motivo: ${REASON_LABELS[inputSummary.terminationReason] || inputSummary.terminationReason || '—'}`,
    `• Aviso-prévio: ${NOTICE_LABELS[inputSummary.noticeStatus] || inputSummary.noticeStatus || '—'}`
  ];

  if (inputSummary.period) {
    const { monthsOfWork, salaryBalanceDays, thirteenthMonths, vacationResidualMonths } = inputSummary.period;
    parts.push(`• Período: ${monthsOfWork || 0} meses, ${salaryBalanceDays || 0} dias de saldo`);
    parts.push(`• Avos 13º: ${thirteenthMonths || 0}/12 • Férias residuais: ${vacationResidualMonths || 0}/12`);
  }

  return parts;
}

function buildValoresEstimados(items) {
  const lines = [];

  const salary = findItem(items, 'salary_balance');
  if (salary) lines.push(`• Saldo de salário: ${formatCurrency(salary.amount)}`);

  const thirteenth = findItem(items, 'thirteenth_proportional');
  if (thirteenth) lines.push(`• 13º proporcional: ${formatCurrency(thirteenth.amount)}`);

  const vacationProportional = findItem(items, 'vacation_proportional');
  const vacationOneThird = findItem(items, 'vacation_one_third');
  if (vacationProportional && vacationOneThird) {
    const totalFerias = toBrl(vacationProportional.amount + vacationOneThird.amount);
    const status = vacationProportional.status;
    lines.push(`• Férias proporcionais + 1/3: ${status === 'calculated' ? formatCurrency(totalFerias) : 'a confirmar'}`);
  }

  const notice = findItem(items, 'notice_indemnity');
  if (notice && notice.status === 'calculated' && notice.amount > 0) {
    lines.push(`• Aviso-prévio: ${formatCurrency(notice.amount)}`);
  } else {
    lines.push('• Aviso-prévio: a confirmar');
  }

  return lines;
}

function toBrl(number) {
  return Number(Number(number).toFixed(2));
}

function buildNaoIncluidos(items) {
  const names = [];
  for (const item of items || []) {
    if (item.status === 'calculated') continue;
    if (item.amount > 0 && item.status === 'conditional') {
      names.push(`${item.name} (a confirmar)`);
    } else if (item.status === 'conditional' || item.status === 'not_calculated') {
      names.push(item.name);
    }
  }

  const explicit = [
    'FGTS e multa de 40%',
    'Férias vencidas',
    'Horas extras e reflexos',
    'Descontos',
    'Convenção coletiva'
  ];

  const deduped = [...new Set([...names, ...explicit])];
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

  const parts = [
    '🧾 Estimativa preliminar da rescisão',
    '',
    '📌 Dados usados',
    ...dados,
    '',
    '💰 Valores estimados',
    ...valores,
    '',
    `➡️ Total estimado: ${formatCurrency(calculation.totalEstimated)}`
  ];

  if (naoIncluidos.length > 0) {
    parts.push('', '⚠️ Não incluídos ou dependentes de confirmação:');
    parts.push(...naoIncluidos);
  }

  const disclaimersText = effectiveWarnings.map(w => `• ${w}`).join('\n');
  parts.push('', 'Avisos:', disclaimersText);
  parts.push('', 'Esta é uma estimativa inicial e depende da confirmação dos documentos e das condições do vínculo.');

  return {
    type: 'labor_settlement_estimate',
    text: parts.join('\n'),
    disclaimers: effectiveWarnings,
    totalEstimated: calculation.totalEstimated,
    currency: calculation.currency
  };
}

module.exports = { formatLaborSettlementResponse };
