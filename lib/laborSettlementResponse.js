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

function bulletList(items) {
  if (!Array.isArray(items) || items.length === 0) return '';
  return '\n' + items.map(i => `• ${i}`).join('\n');
}

export function formatLaborSettlementResponse({
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

  if (status === 'needs_information' || status === 'invalid' || missingFields.length > 0) {
    const isInvalid = status === 'invalid';
    const fieldsText = missingFields.length > 0
      ? `Preciso de mais algumas informações:${bulletList(nextQuestions)}`
      : `Há informações inconsistentes ou incompletas.${warnings.length > 0 ? ` ${warnings.join(' ')}` : ''}`;

    return {
      type: 'needs_information',
      text: `Vou preparar uma estimativa preliminar de verbas rescisórias. ${fieldsText}`,
      missingFields,
      ambiguousFields,
      disclaimers: effectiveWarnings,
      nextQuestions,
      isInvalid
    };
  }

  if (status !== 'ready' || !calculation) {
    return {
      type: 'incomplete',
      text: 'Não consegui preparar a estimativa com os dados disponíveis. Verifique se as informações estão corretas.',
      disclaimers: effectiveWarnings
    };
  }

  const calculated = calculation.items.filter(i => i.status === 'calculated');
  const conditional = calculation.items.filter(i => i.status === 'conditional');
  const notCalculated = calculation.items.filter(i => i.status === 'not_calculated');

  const calculatedLines = calculated.map(i => `- ${i.name}: ${formatCurrency(i.amount)}`);
  const conditionalLines = conditional.map(i => `- ${i.name}: ${i.amount > 0 ? formatCurrency(i.amount) : 'a confirmar'}`);
  const notCalculatedLines = notCalculated.map(i => `- ${i.name}: não incluído nesta estimativa`);

  const totalText = calculation.totalEstimated !== null
    ? `\n\nTotal estimado: ${formatCurrency(calculation.totalEstimated)}`
    : '';

  const parts = [
    '*Estimativa preliminar de verbas trabalhistas*',
    '',
    '*Verbas calculadas:*',
    calculatedLines.length > 0 ? calculatedLines.join('\n') : 'Nenhuma verba pôde ser calculada com as premissas atuais.'
  ];

  if (conditionalLines.length > 0) {
    parts.push('', '*Verbas condicionais (dependem de prova ou reconhecimento):*', conditionalLines.join('\n'));
  }

  if (notCalculatedLines.length > 0) {
    parts.push('', '*Verbas não incluídas nesta estimativa:*', notCalculatedLines.join('\n'));
  }

  if (totalText) {
    parts.push('', totalText);
  }

  if (Array.isArray(calculation.assumptions) && calculation.assumptions.length > 0) {
    parts.push('', '*Premissas:*', calculation.assumptions.slice(0, 8).map(a => `- ${a}`).join('\n'));
  }

  parts.push('', '*Avisos:*');
  parts.push(effectiveWarnings.join('\n'));

  return {
    type: 'labor_settlement_estimate',
    text: parts.join('\n'),
    disclaimers: effectiveWarnings,
    totalEstimated: calculation.totalEstimated,
    currency: calculation.currency
  };
}
