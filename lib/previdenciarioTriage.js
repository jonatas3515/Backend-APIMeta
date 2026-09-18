// ============================================================================
// TRIAGEM CONTEXTUAL PREVIDENCIÁRIA
// ============================================================================
//
// Regras:
// - Não é um formulário rígido.
// - A cada turno, interpreta o que já foi dito e faz UMA pergunta relevante.
// - Em casos de urgência/risco, aplica handoff determinístico.
// - Nunca calcula benefício, tempo, renda ou valor.
// - Nunca afirma que há direito.
// - Nunca recusa atendimento por área.
//

const HANDOFF_REPLY = 'Vou encaminhar sua situação para avaliação da equipe. Aguarde o retorno.';

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

const THEME_PATTERNS = [
  { key: 'bpc_loas', patterns: [/\b(loas|bpc)\b/i, /\b(assistencia|asistencia)\b/i, /\bsalario\s*familia\b/i] },
  { key: 'pensao_morte', patterns: [/\b(pensao\s*por\s*morte|morte|obito|falecimento)\b/i, /\bpensao\b.*\b(morte|obito|falecido|falecida)\b/i] },
  { key: 'auxilio_doenca', patterns: [/\b(auxilio\s*doenca|doenca\s*temporaria|incapacidade\s*temporaria|afastado)\b/i] },
  { key: 'aposentadoria_invalidez', patterns: [/\b(aposentadoria\s*por\s*invalidez|invalidez|incapacidade\s*permanente)\b/i] },
  { key: 'revisao', patterns: [/\b(revisao|revisar\s*beneficio|revisao\s*de\s*beneficio)\b/i] },
  { key: 'tempo_contribuicao', patterns: [/\b(tempo\s*de\s*contribuicao|tempo\s*de\s*servico|cnis|vinculos)\b/i] },
  { key: 'aposentadoria', patterns: [/\b(aposentadoria|aposentar|aposentado)\b/i, /\b(inss)\b.*\b(aposent|beneficio)\b/i] }
];

const NEGADO_PATTERNS = [/\b(negado|negada|indeferido|indeferida|recusado|recusada|nao\s*conced|nao\s*deu|nao\s*deram|denegado)\b/i];
const PRAZO_PATTERNS = [/\b(prazo|recorrer|recurso|vence|vencimento|segunda|terca|quarta|quinta|sexta|sabado|domingo|\d+\s*dias)\b/i];
const URGENCY_PATTERNS = [/\b(urgente|emergencia|prazo|vence\s*logo|ultimo\s*dia)\b/i];
const PERICIA_PATTERNS = [/\b(pericia|pericia\s*medica|laudo|cid|atestado)\b/i];
const CNIS_PATTERNS = [/\b(cnis|extrato\s*de\s*vinculos|carteira\s*de\s*vinculos)\b/i];
const CTPS_PATTERNS = [/\b(ctps|carteira\s*de\s*trabalho)\b/i];

function detectTheme(text) {
  const n = normalize(text);
  for (const theme of THEME_PATTERNS) {
    if (theme.patterns.some(re => re.test(n))) return theme.key;
  }
  return 'geral';
}

function hasPattern(text, patterns) {
  const n = normalize(text);
  return patterns.some(re => re.test(n));
}

function extractYears(text) {
  const n = normalize(text);
  // Anos de contribuição/serviço, prioridade máxima
  const m1 = n.match(/(\d+)\s*anos?\s*(de\s*contribuicao|de\s*servico|trabalhando|contribuindo)/);
  if (m1) return { value: parseInt(m1[1], 10), raw: m1[0] };
  // Contribui há X anos
  const m2 = n.match(/(?:contribui|trabalha|trabalhei)\w*\s+(?:h[aá]\s+)?(\d+)\s*anos?/);
  if (m2) return { value: parseInt(m2[1], 10), raw: m2[0] };
  return null;
}

function extractAge(text) {
  const n = normalize(text);
  const m = n.match(/(?:tenho|sou|idade)\s+(?:de\s+)?(\d+)\s*anos?/);
  if (m) return { value: parseInt(m[1], 10), raw: m[0] };
  return null;
}

function extractBenefitType(text) {
  const n = normalize(text);
  const map = [
    ['bpc', 'BPC/LOAS'],
    ['loas', 'BPC/LOAS'],
    ['pensao por morte', 'Pensão por morte'],
    ['auxilio doenca', 'Auxílio-doença'],
    ['auxilio doença', 'Auxílio-doença'],
    ['aposentadoria por invalidez', 'Aposentadoria por invalidez'],
    ['aposentadoria', 'Aposentadoria'],
    ['revisao', 'Revisão de benefício'],
    ['revisão', 'Revisão de benefício']
  ];
  for (const [key, label] of map) {
    if (n.includes(key)) return label;
  }
  return null;
}

function extractDependentType(text) {
  const n = normalize(text);
  if (/\b(mae|pai|genitor|progenitor)\b/.test(n)) return 'genitor';
  if (/\b(conjuge|marido|esposa|companheiro|companheira)\b/.test(n)) return 'conjuge/companheiro';
  if (/\b(filho|filha|filhos|filhas)\b/.test(n)) return 'filho';
  if (/\b(dependente|outro)\b/.test(n)) return 'outro dependente';
  return null;
}

function extractFacts(currentMessage, previousFacts = {}) {
  const n = normalize(currentMessage);
  const facts = { ...previousFacts };

  const theme = detectTheme(currentMessage);
  if (theme !== 'geral' || !facts.theme) {
    facts.theme = theme;
  }

  const benefitType = extractBenefitType(currentMessage);
  if (benefitType && !facts.benefit_type) {
    facts.benefit_type = benefitType;
  }

  const years = extractYears(currentMessage);
  if (years && !facts.contrib_years) {
    facts.contrib_years = years.value;
    facts.contrib_years_raw = years.raw;
  }

  const age = extractAge(currentMessage);
  if (age && !facts.client_age) {
    facts.client_age = age.value;
    facts.client_age_raw = age.raw;
  }

  if (hasPattern(currentMessage, NEGADO_PATTERNS)) {
    facts.benefit_denied = true;
  }

  if (hasPattern(currentMessage, PRAZO_PATTERNS)) {
    facts.has_deadline = true;
  }

  if (hasPattern(currentMessage, URGENCY_PATTERNS)) {
    facts.urgent = true;
  }

  if (hasPattern(currentMessage, PERICIA_PATTERNS)) {
    facts.has_medical_exam = true;
  }

  if (hasPattern(currentMessage, CNIS_PATTERNS)) {
    facts.has_cnis = true;
  }

  if (hasPattern(currentMessage, CTPS_PATTERNS)) {
    facts.has_ctps = true;
  }

  const dependent = extractDependentType(currentMessage);
  if (dependent && !facts.dependent_type) {
    facts.dependent_type = dependent;
  }

  if (/\b(j[aá]\s+requeri|j[aá]\s*solicitei|j[aá]\s*fiz\s*o\s*pedido|pedido\s*j[aá]\s*feito)\b/.test(n)) {
    facts.already_requested = true;
  } else if (/\b(n[aã]o\s*requeri|n[aã]o\s*solicitei|ainda\s*n[aã]o|não\s*fiz)\b/.test(n)) {
    facts.already_requested = false;
  }

  if (/\b(doenca|doença|deficiencia|deficiência|enfermidade)\b/.test(n)) {
    facts.has_condition = true;
  }

  if (/\b(n[aã]o\s*consigo\s*trabalhar|impossibilitado|impossibilitada|n[aã]o\s*posso\s*trabalhar)\b/.test(n)) {
    facts.unable_to_work = true;
  }

  return facts;
}

function shouldHandoff(facts, message) {
  if (facts.urgent || facts.has_deadline) return true;
  if (facts.benefit_denied && (facts.has_deadline || normalize(message).includes('prazo'))) return true;
  return false;
}

function chooseQuestion(facts) {
  if (facts.theme === 'aposentadoria') {
    if (!facts.contrib_years && !facts.contrib_years_raw) {
      return 'Claro. Você já contribui para o INSS há quanto tempo, aproximadamente?';
    }
    if (!facts.client_age) {
      return 'Entendi. Qual sua idade?';
    }
    if (facts.already_requested === undefined) {
      return 'Você já fez o pedido ao INSS?';
    }
    if (facts.benefit_denied && !facts.benefit_type) {
      return 'Qual benefício foi negado e quando você recebeu essa decisão?';
    }
    return 'Obrigado. Vou encaminhar as informações para nossa equipe conferir a melhor forma de prosseguir.';
  }

  if (facts.theme === 'auxilio_doenca' || (facts.has_condition && facts.unable_to_work)) {
    if (facts.has_medical_exam === undefined && facts.already_requested === undefined) {
      return 'Entendi. Você já passou por perícia ou chegou a solicitar algum benefício?';
    }
    if (facts.benefit_denied && !facts.benefit_type) {
      return 'Qual benefício foi negado e quando você recebeu essa decisão?';
    }
    return 'Como a situação envolve saúde e benefício, vou encaminhar para nossa equipe.';
  }

  if (facts.theme === 'aposentadoria_invalidez') {
    if (facts.already_requested === undefined) {
      return 'Entendi. O pedido de aposentadoria por invalidez já foi feito ao INSS?';
    }
    if (facts.benefit_denied) {
      return 'Você tem a decisão de indeferimento? Se souber a data, ajuda nosso time.';
    }
    return 'Vou encaminhar para nossa equipe, pois aposentadoria por invalidez precisa de análise cuidadosa.';
  }

  if (facts.theme === 'bpc_loas') {
    if (facts.has_condition === undefined && facts.client_age === undefined) {
      return 'Posso ajudar a direcionar. Sua mãe tem idade avançada ou alguma deficiência, e o pedido já foi feito ao INSS?';
    }
    if (facts.already_requested === undefined) {
      return 'O pedido ao INSS já foi feito?';
    }
    return 'Vou repassar para nossa equipe avaliar a situação do BPC/LOAS.';
  }

  if (facts.theme === 'pensao_morte') {
    if (!facts.dependent_type) {
      return 'Entendi. O pedido é para cônjuge, companheiro, filho ou outro dependente? O benefício já foi solicitado?';
    }
    if (facts.already_requested === undefined) {
      return 'O benefício já foi solicitado ao INSS?';
    }
    return 'Vou repassar para nossa equipe, pois pensão por morte envolve análise de vínculo e dependência.';
  }

  if (facts.theme === 'revisao') {
    if (!facts.benefit_type && !facts.contrib_years) {
      return 'Qual benefício você quer revisar e há quanto tempo ele está sendo pago?';
    }
    return 'Vou encaminhar para revisão. Se tiver a carta de concessão ou cálculo, guarde para enviar.';
  }

  if (facts.theme === 'tempo_contribuicao') {
    if (!facts.has_cnis && !facts.has_ctps) {
      return 'Claro. Você já tem o CNIS ou a carteira de trabalho para conferir os períodos?';
    }
    return 'Vou encaminhar para nossa equipe conferir a contagem do tempo de contribuição.';
  }

  if (facts.benefit_denied) {
    if (!facts.benefit_type) {
      return 'Qual benefício foi negado e quando você recebeu essa decisão?';
    }
    return 'Vou encaminhar a decisão de indeferimento para nossa equipe.';
  }

  return 'Conte-me um pouco sobre a sua situação para eu entender melhor.';
}

function triagePrevidenciario(currentMessage, previousFacts = {}) {
  const facts = extractFacts(currentMessage, previousFacts);

  if (shouldHandoff(facts, currentMessage)) {
    return { reply: HANDOFF_REPLY, facts, handoff: true };
  }

  const question = chooseQuestion(facts);
  return { reply: question, facts, handoff: false };
}

module.exports = {
  triagePrevidenciario,
  extractFacts,
  shouldHandoff,
  chooseQuestion,
  detectTheme,
  HANDOFF_REPLY
};
