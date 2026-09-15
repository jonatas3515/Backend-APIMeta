/**
 * Classificador offline de intenção trabalhista.
 *
 * Regras:
 * - Não usa IA, banco, API externa.
 * - Não registra o texto recebido.
 * - Não considera apenas palavras genéricas como "demitido" ou "salário"
 *   como pedido de cálculo; exige sinal de quantidade, valor ou estimativa.
 * - Retorna um objeto simples com intent, confidence, signals e requiresIntake.
 */

const CALCULATION_SIGNALS = new Set([
  'quanto', 'quanto vou', 'quanto tenho', 'quanto posso', 'quanto e',
  'valor', 'calcular', 'calculo', 'estimativa', 'estimar', 'estime',
  'acerto', 'conta', 'contas', 'somar', 'total', 'receber', 'receberei',
  'dar', 'daria', 'seria', 'fica', 'ficaria', 'sair', 'pedir conta',
  'solicitar demissao', 'quanto da', 'quanto daria', 'meu acerto'
]);

const LABOR_TOPIC_SIGNALS = new Set([
  'rescisao', 'rescisão', 'demissao', 'demissão', 'demitido', 'demitida',
  'trabalhista', 'trabalho', 'emprego', 'empregador', 'patrao', 'patrão',
  'carteira', 'registrado', 'registro', 'fgts', 'ferias', 'férias',
  'decimo terceiro', '13º', 'aviso previo', 'aviso prévio', 'horas extras',
  'jornada', 'intervalo', 'admissao', 'admissão', 'desligamento',
  'justa causa', 'dispensa', 'recesso', 'salario', 'salário',
  'verba', 'verbas', 'rescisorias', 'rescisoria', 'mandado', 'acerto'
]);

const QUESTION_FORMATS = new Set([
  'posso', 'tenho direito', 'tenho', 'qual', 'o que', 'como', 'quando',
  'onde', 'por que', 'quem', 'meu direito', 'devo', 'sou obrigado',
  'sou obrigada'
]);

function normalize(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findSignals(text, patterns) {
  const found = [];
  const norm = normalize(text);
  for (const pattern of patterns) {
    if (norm.includes(pattern)) found.push(pattern);
  }
  return found;
}

function calculateScore(text) {
  const norm = normalize(text);
  const words = norm.split(' ');

  let calcScore = 0;
  const calcSignals = findSignals(norm, CALCULATION_SIGNALS);
  calcScore = calcSignals.length;

  // Reforço para frases clássicas de cálculo
  if (/quanto vou (receber|ganhar|ter)/.test(norm)) calcScore += 3;
  if (/quanto tenho (direito|a receber)/.test(norm)) calcScore += 3;
  if (/quanto posso (receber|ganhar|ter)/.test(norm)) calcScore += 3;
  if (/calcule minha rescisao/.test(norm)) calcScore += 3;
  if (/quanto (e|seria|fica|daria) (minha|o valor|o acerto)/.test(norm)) calcScore += 2;
  if (/valor (das|da|do|meu) (verbas|verba|rescisao|demissao|acerto)/.test(norm)) calcScore += 2;

  let laborScore = 0;
  const laborSignals = findSignals(norm, LABOR_TOPIC_SIGNALS);
  laborScore = laborSignals.length;

  // Contagens únicas
  const uniqueCalcSignals = [...new Set(calcSignals)].length;
  const uniqueLaborSignals = [...new Set(laborSignals)].length;

  return {
    calcScore,
    laborScore,
    uniqueCalcSignals,
    uniqueLaborSignals,
    wordCount: words.length
  };
}

function classifyLaborIntent(text) {
  const norm = normalize(text);

  if (!norm) {
    return {
      intent: 'other',
      confidence: 'low',
      signals: ['empty_input'],
      requiresIntake: false
    };
  }

  const { calcScore, laborScore, uniqueCalcSignals, uniqueLaborSignals } = calculateScore(text);

  // Sinais de perguntas conceituais que não são cálculo de rescisão
  const explicitNonCalculation = (
    norm.includes('salario minimo') ||
    norm.includes('piso salarial') ||
    norm.includes('o que e ') ||
    norm.includes('como funciona') ||
    norm.includes('como pedir') ||
    norm.includes('como fazer') ||
    norm.includes('como calcular') ||
    (norm.includes('posso pedir') && !norm.includes('quanto'))
  );

  // Quando a pergunta é puramente conceitual e genérica (salário mínimo, FGTS genérico), prefere 'other'
  const genericConceptualQuestion = (
    (norm.includes('salario minimo') ||
     norm.includes('piso salarial') ||
     norm.includes('qual o salario minimo') ||
     norm.includes('quanto e o salario minimo') ||
     (norm.includes('o que e fgts') && !norm.includes('rescisao') && !norm.includes('demissao')) ||
     (norm.includes('como funciona fgts') && !norm.includes('rescisao') && !norm.includes('demissao'))) &&
    !norm.includes('rescisao') &&
    !norm.includes('demissao') &&
    !norm.includes('verba') &&
    !norm.includes('receber se') &&
    !norm.includes('quanto')
  );

  // Pergunta conceitual trabalhista sem cálculo
  const isQuestion = /\?/.test(text) || findSignals(norm, QUESTION_FORMATS).length > 0;
  const hasCalculationSignal = calcScore >= 2 || uniqueCalcSignals >= 1;
  const hasLaborSignal = laborScore >= 1;

  // Início explícito de simulação, mesmo sem palavras clássicas de cálculo.
  const explicitStart = (
    (norm.includes('quero resolver') || norm.includes('quero solucionar') || norm.includes('quero acertar')) &&
    hasLaborSignal
  );

  // Salário mínimo é outro tipo de consulta, não rescisão trabalhista
  if (norm.includes('salario minimo') || norm.includes('piso salarial')) {
    return {
      intent: 'other',
      confidence: 'low',
      signals: ['salario_minimo'],
      requiresIntake: false
    };
  }

  const signals = [];
  if (uniqueCalcSignals > 0) signals.push(`calculation_signals:${uniqueCalcSignals}`);
  if (uniqueLaborSignals > 0) signals.push(`labor_signals:${uniqueLaborSignals}`);
  if (isQuestion) signals.push('question_format');
  if (explicitNonCalculation) signals.push('explicit_non_calculation');

  if (genericConceptualQuestion) {
    return {
      intent: 'other',
      confidence: 'low',
      signals,
      requiresIntake: false
    };
  }

  if (explicitStart) {
    signals.push('explicit_start');
    return {
      intent: 'labor_settlement_estimate',
      confidence: 'medium',
      signals,
      requiresIntake: true
    };
  }

  if (hasCalculationSignal && hasLaborSignal && !explicitNonCalculation) {
    const confidence = (calcScore >= 3 || norm.includes('quanto')) ? 'high' : 'medium';
    return {
      intent: 'labor_settlement_estimate',
      confidence,
      signals,
      requiresIntake: true
    };
  }

  if (hasLaborSignal) {
    const confidence = isQuestion ? 'medium' : 'low';
    return {
      intent: 'labor_question',
      confidence,
      signals,
      requiresIntake: false
    };
  }

  return {
    intent: 'other',
    confidence: 'low',
    signals,
    requiresIntake: false
  };
}

module.exports = { classifyLaborIntent };
