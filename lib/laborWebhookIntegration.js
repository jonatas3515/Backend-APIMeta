/**
 * Integração determinística do cálculo de verbas trabalhistas com o webhook do WhatsApp.
 *
 * Regras:
 * - O Gemini nunca responde valores numéricos trabalhistas.
 * - Toda mensagem trabalhista é extraída, normalizada e calculada pelo motor JS.
 * - O resultado é respondido diretamente e/ou persistido em intake_data.laborCalculation.
 * - Logs são agregados e nunca contêm PII (salário, datas, telefone, nome, valores).
 */

const crypto = require('crypto');
const { classifyLaborIntent } = require('./laborSettlementIntent');
const { extractLaborFields, normalizeText } = require('./laborSettlementOrchestrator');
const { processLaborSettlementIntake } = require('./laborSettlementIntake');
const { formatLaborValueAnswer, formatSiteLaborSettlementResponse } = require('./laborSettlementResponse');
const { calculateSiteLaborSettlement } = require('./siteLaborSettlementCalculator');

const QUESTION_MARKERS = {
  salary: /sal[áa]rio mensal/i,
  admissionDate: /data de admiss[ãa]o/i,
  terminationDate: /data de desligamento/i,
  terminationReason: /(motivo da sa[íi]da|motivo do desligamento|desligamento ocorreu)/i,
  hasVacationAccrued: /f[eé]rias vencidas/i,
  hasThirteenthAccrued: /13[ºo]? sal[áa]rio vencido/i,
  noticeStatus: /aviso[-\s]?pr[eé]vio/i
};

const ESTIMATE_MARKER = /🧾 Estimativa preliminar/i;
const MAX_LABOR_TURNS = 3;

const TOPIC_RESET_PATTERNS = [
  /\b(?:quero|vamos|posso|queria|d[aá] pra)\s+(?:falar|tratar|perguntar|mudar|trocar)\s+(?:de\s+)?(?:outro|outra)\s+(?:assunto|assumto|asunto|coisa|tema|topico|pergunta)\b/i,
  /\b(?:e|eh|ehh|sera|parece|ta)\s+(?:outro|outra)\s+(?:assunto|assumto|asunto|coisa|tema|topico)\b/i,
  /\b(?:mudar|trocar)\s+(?:de\s+)?(?:assunto|assumto|asunto|tema|coisa|falar)\b/i,
  /\b(?:assunto|assumto|asunto|tema|coisa|topico)\s+(?:diferente|novo|outro)\b/i,
  /\b(?:nao|naum)\s+(?:e|eh)\s+(?:sobre|sobr|a respeito de)\s+(?:isso|esse|isto|isso aqui)\b/i,
  /\b(?:esquece|esqueca|esqueci)\s+(?:isso|tudo|ai|isso aqui)\b/i,
  /\b(?:outro|outra)\s+(?:assunto|assumto|asunto|coisa|pergunta)\b/i,
  /\b(?:trocou|mudou|trocao|mudao)\s+(?:de\s+)?(?:assunto|assumto|asunto)\b/i
];

const RESET_REPLY_TEXT = 'Claro. Qual assunto você gostaria de tratar?';

function validatePreconditions({ conversation, normalizedPhone, messageType, textBody }) {
  if (!conversation || !conversation.id) return false;
  if (messageType !== 'text') return false;
  if (!textBody || typeof textBody !== 'string' || textBody.trim().length === 0) return false;
  if (conversation.mode === 'human') return false;
  if (conversation.status === 'closed') return false;
  if (conversation.archived === true) return false;
  if (conversation.client_phone_normalized !== normalizedPhone) return false;
  return true;
}

function mergeCollected(current, extracted) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(extracted)) {
    if (value === undefined || value === null || value === '') continue;
    if (merged[key] !== undefined && merged[key] !== null && merged[key] !== '') continue;
    merged[key] = value;
  }
  return merged;
}

function isPlaceholderText(text) {
  if (!text || typeof text !== 'string') return true;
  return text.startsWith('[') || text.startsWith('(') || text.length === 0;
}

const KNOWN_FIELDS = Object.keys(QUESTION_MARKERS);
const CONTINUATION_TTL_MS = 2 * 60 * 60 * 1000;

function buildCollectedFromMessages(messages, currentText) {
  const collected = {};
  if (!Array.isArray(messages)) return collected;

  for (const message of messages) {
    if (message.sender_type !== 'client') continue;
    if (isPlaceholderText(message.text)) continue;
    if (message.text === currentText) continue;
    const extracted = extractLaborFields(message.text, KNOWN_FIELDS, collected);
    Object.assign(collected, mergeCollected(collected, extracted));
  }

  return collected;
}

function buildAskedFieldsFromMessages(messages) {
  const asked = [];
  if (!Array.isArray(messages)) return asked;

  for (const message of messages) {
    if (message.sender_type === 'client') continue;
    if (isPlaceholderText(message.text)) continue;
    const text = String(message.text || '');
    for (const [field, regex] of Object.entries(QUESTION_MARKERS)) {
      if (regex.test(text)) asked.push(field);
    }
  }

  return [...new Set(asked)];
}

function lastBotMessageIsLaborQuestion(messages) {
  if (!Array.isArray(messages)) return false;
  const botMessages = messages.filter(m => m.sender_type !== 'client' && !isPlaceholderText(m.text));
  if (botMessages.length === 0) return false;
  const lastBot = botMessages[botMessages.length - 1];
  if (lastBot.created_at) {
    const age = Date.now() - new Date(lastBot.created_at).getTime();
    if (Number.isFinite(age) && age > CONTINUATION_TTL_MS) return false;
  }
  const text = String(lastBot.text || '');
  return Object.values(QUESTION_MARKERS).some(regex => regex.test(text)) ||
    text.includes('Para estimar sua rescisão');
}

function lastBotMessageIsEstimate(messages) {
  if (!Array.isArray(messages)) return false;
  const botMessages = messages.filter(m => m.sender_type !== 'client' && !isPlaceholderText(m.text));
  if (botMessages.length === 0) return false;
  const lastBot = botMessages[botMessages.length - 1];
  return ESTIMATE_MARKER.test(String(lastBot.text || ''));
}

function hasMinimumForEstimate(collected) {
  return collected &&
    typeof collected.salary === 'number' &&
    collected.admissionDate &&
    collected.terminationDate;
}

const VALUE_ASK_RE = /\b(quanto|qual|valores?|fica|ficou|tenho|recebo|devidos?)\b/;
const VALUE_ITEM_RE = /\b(fgts|multa|ferias|decimo|13|aviso|saldo|salario|rescisao|acerto|verbas?|indenizacao|direitos?|receber|total|da|dar|horas?\s*extras?|jornada|adicional)\b/;

function isValueQuestion(text) {
  const t = normalizeText(text);
  if (!t) return false;
  return VALUE_ASK_RE.test(t) && VALUE_ITEM_RE.test(t);
}

function isValidLaborCalculation(calc) {
  return !!(calc && typeof calc === 'object' &&
    Number.isFinite(calc.totalEstimated) &&
    Array.isArray(calc.items) &&
    calc.items.every(i => i && typeof i === 'object' && Number.isFinite(i.amount) && typeof i.name === 'string'));
}

const MISSING_ESTIMATE_REPLY = 'Ainda não tenho uma estimativa calculada para informar esse valor. Vou confirmar os dados de salário e período antes de calcular.';

function isTopicResetCommand(text) {
  if (!text || typeof text !== 'string') return false;
  const t = normalizeText(text);
  if (!t) return false;
  return TOPIC_RESET_PATTERNS.some(re => re.test(t));
}

function buildLaborContextReset(intakeData) {
  const reset = { ...(intakeData || {}) };
  const keysToRemove = ['laborCalculation', 'laborFields', 'laborAskedFields', 'laborIntent', '_laborCalculation'];
  keysToRemove.forEach(k => { delete reset[k]; });
  reset.laborContextActive = false;
  reset.laborContextResetAt = new Date().toISOString();
  return reset;
}

function getActiveMessages(messages, intakeData) {
  if (!Array.isArray(messages) || messages.length === 0) return messages || [];
  const resetAt = intakeData?.laborContextResetAt;
  if (!resetAt) return messages;
  const threshold = new Date(resetAt).getTime();
  return messages.filter(m => {
    const t = m && m.created_at ? new Date(m.created_at).getTime() : Number.POSITIVE_INFINITY;
    return t > threshold;
  });
}

// Sinal trabalhista vem SOMENTE da mensagem atual: campos coletados em
// mensagens antigas não podem, sozinhos, transformar uma mensagem nova
// ("aff", mudança de assunto) em gatilho de cálculo ou reenvio de estimativa.
function hasLaborSignal(text) {
  const t = normalizeText(text);
  if (!t) return false;
  return /(trabalh|empreg|salari|demit|demiss|dispens|fgts|carteira|patr[aã]o|empregador|rescis|verbas?)/.test(t);
}

// Itens que têm resposta determinística específica em formatLaborValueAnswer
// (FGTS/multa e horas extras/jornada). Menções genéricas ("e as férias?")
// seguem para o Gemini, que responde ao item sem reenviar a tabela inteira.
const ITEM_QUESTION_RE = /\b(fgts|multa|horas?\s*extras?|jornada|adicional)\b/;

// Pergunta pontual sobre um item da estimativa ("e o FGTS?").
// O "?" é checado no texto bruto porque normalizeText remove pontuação.
function isItemQuestion(text) {
  const raw = String(text || '');
  const t = normalizeText(raw);
  if (!t) return false;
  return raw.includes('?') && ITEM_QUESTION_RE.test(t);
}

// Usado pelo webhook para decidir se o bloco de estimativa entra no contexto
// do Gemini: só quando a mensagem atual for trabalhista ou de valores.
const LABOR_CONTEXT_RE = /(trabalh|empreg|salari|demit|demiss|dispens|fgts|carteira|patr[aã]o|empregador|rescis|verbas?|f[eé]rias|indeniza|acerto|inss|aviso[-\s]?pr[eé]vio|d[eé]cimo|13[ºo°]|horas?\s*extras?|jornada|adicional)/;

function isLaborRelevantText(text) {
  const t = normalizeText(text);
  if (!t) return false;
  return LABOR_CONTEXT_RE.test(t) || isValueQuestion(text) || isItemQuestion(text);
}

function estimateFingerprint(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 24);
}

function runSiteCalculation(normalizedInput) {
  const siteInput = {
    salary: normalizedInput.salary,
    admissionDate: normalizedInput.admissionDate,
    terminationDate: normalizedInput.terminationDate,
    terminationReason: normalizedInput.terminationReason,
    noticeStatus: normalizedInput.noticeStatus,
    hasVacationAccrued: normalizedInput.hasVacationAccrued,
    hasCtps: normalizedInput.hasCtps,
    dependents: normalizedInput.dependents || 0
  };
  return calculateSiteLaborSettlement(siteInput);
}

async function handleLaborSettlementWebhook(params) {
  const { conversation, normalizedPhone, waMessageId, textBody, messageType, messages = [], log } = params;

  const safeLog = (event, data) => {
    if (log && typeof log === 'function') log(event, data);
  };

  safeLog('labor_message_received', {
    accepted: validatePreconditions({ conversation, normalizedPhone, messageType, textBody }),
    hasHistory: Array.isArray(messages) && messages.length > 0,
    source: messageType || 'unknown'
  });

  if (!validatePreconditions({ conversation, normalizedPhone, messageType, textBody })) {
    return { handled: false, reply: null, flow: null, stateSaved: false, errorCode: null };
  }

  if (isTopicResetCommand(textBody)) {
    safeLog('topic_reset_detected', { hasHistory: Array.isArray(messages) && messages.length > 0 });
    safeLog('labor_gemini_call_blocked', { reason: 'topic_reset' });
    return { handled: true, reset: true, reply: RESET_REPLY_TEXT, flow: 'topic_reset', stateSaved: false, errorCode: null };
  }

  // Cálculo trabalhista só roda quando a mensagem ATUAL tem sinal inequívoco.
  const { intent: currentLaborIntent } = classifyLaborIntent(textBody);
  const textLaborSignal = hasLaborSignal(textBody);
  safeLog('current_message_domain', { domain: 'labor_check', intent: currentLaborIntent, hasSignal: textLaborSignal });
  if (currentLaborIntent === 'other' && !textLaborSignal) {
    safeLog('labor_calculation_skip_reason', { reason: 'message_not_labor_related' });
    return { handled: false, reply: null, flow: null, stateSaved: false, errorCode: null, calculation: null };
  }

  const activeMessages = getActiveMessages(messages, conversation?.intake_data);
  const askedFields = buildAskedFieldsFromMessages(activeMessages);
  const collected = buildCollectedFromMessages(activeMessages, textBody);
  const currentExtracted = extractLaborFields(textBody, askedFields, collected);
  const mergedCollected = mergeCollected(collected, currentExtracted);

  const fieldsPresent = Object.keys(mergedCollected).filter(k => mergedCollected[k] !== undefined && mergedCollected[k] !== null && mergedCollected[k] !== '');
  const currentFields = Object.keys(currentExtracted).filter(k => currentExtracted[k] !== undefined && currentExtracted[k] !== null && currentExtracted[k] !== '');
  const hasMinMerged = hasMinimumForEstimate(mergedCollected);
  const hasMinCurrent = hasMinimumForEstimate(currentExtracted);
  const currentHasNewData = currentFields.length > 0;

  safeLog('labor_fields_extracted', {
    fieldsPresent,
    hasMinimum: hasMinMerged,
    hasSignal: textLaborSignal,
    currentHasNewData
  });

  const laborContextActive = conversation?.intake_data?.laborContextActive !== false;
  const persistedCalc = laborContextActive && conversation && conversation.intake_data && conversation.intake_data.laborCalculation;
  const hasPersistedCalc = isValidLaborCalculation(persistedCalc);
  if (hasPersistedCalc) {
    safeLog('labor_calculation_loaded', { source: 'intake_data', itemsCount: persistedCalc.items.length });
  }

  // O cálculo só roda quando a MENSAGEM ATUAL for trabalhista ou trouxer dados
  // novos. Mensagem de outro assunto ("aff", divórcio, cobrança) não recalcula
  // nem reenvia estimativa — mesmo com dados antigos no histórico.
  let freshCalc = null;
  if (hasMinMerged && (textLaborSignal || currentHasNewData)) {
    safeLog('labor_calculation_called', { source: 'site', reason: textLaborSignal ? 'labor_text' : 'new_data' });
    safeLog('labor_calculation_started', { source: 'site' });
    try {
      const intakeResult = processLaborSettlementIntake(mergedCollected);
      if (intakeResult && intakeResult.normalizedInput && hasMinimumForEstimate(intakeResult.normalizedInput)) {
        freshCalc = runSiteCalculation(intakeResult.normalizedInput);
        if (isValidLaborCalculation(freshCalc)) {
          safeLog('labor_calculation_result', { success: true, source: 'site', itemsCount: freshCalc.items.length });
        } else {
          safeLog('labor_calculation_result', { success: false, source: 'site', errorCode: 'CALC_INVALID' });
          freshCalc = null;
        }
      } else {
        safeLog('labor_calculation_result', { success: false, source: 'site', errorCode: 'INTAKE_INSUFFICIENT' });
      }
    } catch (err) {
      safeLog('labor_calculation_result', { success: false, source: 'site', errorCode: err.code || 'CALC_FAILED' });
      freshCalc = null;
    }
  } else if (hasMinMerged) {
    safeLog('labor_calculation_skip_reason', { reason: 'message_not_labor_related' });
  }

  const isValueQ = isValueQuestion(textBody);
  const isItemQ = isItemQuestion(textBody);
  const hasCalc = freshCalc || hasPersistedCalc;
  const calc = freshCalc || (hasPersistedCalc ? persistedCalc : null);

  // Impressão digital da última estimativa enviada + texto da última resposta
  // do bot: se a resposta calculada for idêntica, não reenvia — deixa o Gemini
  // responder à mensagem atual de forma conversacional.
  const lastEstimateFp = conversation?.intake_data?.laborEstimateFingerprint || null;
  const botMessagesForDup = activeMessages.filter(m => m.sender_type !== 'client' && !isPlaceholderText(m.text));
  const lastBotText = botMessagesForDup.length ? String(botMessagesForDup[botMessagesForDup.length - 1].text || '') : '';
  const isRepeatedReply = (replyText) => {
    const fp = estimateFingerprint(replyText);
    return (lastEstimateFp && fp === lastEstimateFp) || replyText === lastBotText;
  };

  if (hasCalc && (isValueQ || isItemQ) && !hasMinCurrent) {
    const valueReply = formatLaborValueAnswer(textBody, calc);
    if (valueReply) {
      if (isRepeatedReply(valueReply)) {
        safeLog('repeated_estimate_suppressed', { flow: 'labor_value_answer' });
        return { handled: false, reply: null, flow: 'estimate_suppressed', stateSaved: false, errorCode: null, calculation: calc, collected: mergedCollected };
      }
      safeLog('labor_gemini_call_blocked', { reason: 'deterministic_value_answer', source: freshCalc ? 'recalculated' : 'persisted' });
      safeLog('labor_direct_response_sent', { flow: 'labor_value_answer', source: freshCalc ? 'recalculated' : 'persisted', itemsCount: calc.items.length });
      return { handled: true, reply: valueReply, flow: 'labor_value_answer', stateSaved: false, errorCode: null, calculation: calc, collected: mergedCollected };
    }
  }

  if (hasCalc && hasMinCurrent) {
    const fullReply = formatSiteLaborSettlementResponse(calc);
    if (isRepeatedReply(fullReply.text)) {
      safeLog('repeated_estimate_suppressed', { flow: 'labor_settlement_estimate' });
      return { handled: false, reply: null, flow: 'estimate_suppressed', stateSaved: false, errorCode: null, calculation: calc, collected: mergedCollected };
    }
    safeLog('labor_gemini_call_blocked', { reason: 'full_estimate_sent', source: freshCalc ? 'recalculated' : 'persisted' });
    safeLog('labor_direct_response_sent', { flow: 'labor_settlement_estimate', source: freshCalc ? 'recalculated' : 'persisted', itemsCount: calc.items.length });
    safeLog('response_fingerprint', { fingerprint: estimateFingerprint(fullReply.text) });
    return {
      handled: true,
      reply: fullReply.text,
      flow: 'labor_settlement_estimate',
      stateSaved: false,
      errorCode: null,
      calculation: calc,
      collected: mergedCollected
    };
  }

  // Estimativa completa só sai quando a mensagem ATUAL trouxe dados novos que
  // fecham o cálculo (ou já traziam o mínimo). Sinal trabalhista com dados
  // antigos recalcula para contexto, mas NÃO reenvia a estimativa.
  if (freshCalc && currentHasNewData && !isValueQ && !isItemQ) {
    const fullReply = formatSiteLaborSettlementResponse(freshCalc);
    if (isRepeatedReply(fullReply.text)) {
      safeLog('repeated_estimate_suppressed', { flow: 'labor_settlement_estimate' });
      return { handled: false, reply: null, flow: 'estimate_suppressed', stateSaved: false, errorCode: null, calculation: freshCalc, collected: mergedCollected };
    }
    safeLog('labor_gemini_call_blocked', { reason: 'full_estimate_sent', source: 'recalculated' });
    safeLog('labor_direct_response_sent', { flow: 'labor_settlement_estimate', source: 'recalculated', itemsCount: freshCalc.items.length });
    safeLog('response_fingerprint', { fingerprint: estimateFingerprint(fullReply.text) });
    return {
      handled: true,
      reply: fullReply.text,
      flow: 'labor_settlement_estimate',
      stateSaved: false,
      errorCode: null,
      calculation: freshCalc,
      collected: mergedCollected
    };
  }

  if (isValueQ) {
    safeLog('labor_numeric_answer_blocked', { reason: 'no_valid_calculation' });
    safeLog('labor_gemini_call_blocked', { reason: 'numeric_question_without_calculation' });
    return {
      handled: true,
      reply: MISSING_ESTIMATE_REPLY,
      flow: 'labor_value_blocked',
      stateSaved: false,
      errorCode: null,
      calculation: null,
      collected: mergedCollected
    };
  }

  return { handled: false, reply: null, flow: null, stateSaved: false, errorCode: null, calculation: freshCalc, collected: mergedCollected };
}

module.exports = {
  handleLaborSettlementWebhook,
  lastBotMessageIsLaborQuestion,
  isTopicResetCommand,
  buildLaborContextReset,
  getActiveMessages,
  isLaborRelevantText,
  estimateFingerprint,
  RESET_REPLY_TEXT
};
module.exports.__esModule = true;
module.exports.default = module.exports;
