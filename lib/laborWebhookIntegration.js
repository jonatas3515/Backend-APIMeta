/**
 * Integração simplificada do cálculo de verbas trabalhistas com o webhook do WhatsApp.
 *
 * Regras:
 * - Não usa conversation_labor_states no caminho feliz.
 * - Reconstrói contexto a partir das mensagens já existentes da conversa.
 * - Não loga mensagens, salários, datas, respostas, payload ou PII.
 * - Persistência cifrada (laborSettlementState) continua existindo, mas ociosa.
 */

const { adaptLaborSettlement } = require('./laborSettlementAdapter');
const { extractLaborFields, normalizeText } = require('./laborSettlementOrchestrator');
const { classifyLaborIntent } = require('./laborSettlementIntent');

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

const WEBHOOK_ACTOR = 'system:whatsapp';

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

function findLastLaborQuestionIndex(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.sender_type === 'client' || isPlaceholderText(m.text)) continue;
    const text = String(m.text || '');
    const isQuestion = Object.values(QUESTION_MARKERS).some(regex => regex.test(text)) ||
      text.includes('Para estimar sua rescisão');
    if (isQuestion) return i;
  }
  return -1;
}

function countUnproductiveClientMessagesAfterLastQuestion(messages) {
  const lastQuestionIndex = findLastLaborQuestionIndex(messages);
  if (lastQuestionIndex < 0) return 0;
  let count = 0;
  for (let i = messages.length - 1; i > lastQuestionIndex; i--) {
    const m = messages[i];
    if (m.sender_type !== 'client' || isPlaceholderText(m.text)) continue;
    const extracted = extractLaborFields(m.text, KNOWN_FIELDS, {});
    if (Object.keys(extracted).length === 0) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Processa mensagem de texto para o fluxo trabalhista.
 * Retorna { handled, reply, flow, stateSaved, errorCode }.
 *
 * - handled: indica se a mensagem foi reconhecida como trabalhista.
 * - reply: texto a ser enviado ao cliente (se houver).
 * - flow: identificador do fluxo trabalhista.
 * - stateSaved: sempre false nesta versão simplificada (não persiste em conversation_labor_states).
 * - errorCode: código sanitizado de erro, se houver.
 */
function countClientMessagesSinceLastLaborQuestion(messages) {
  const lastQuestionIndex = findLastLaborQuestionIndex(messages);
  if (lastQuestionIndex < 0) return 0;
  let count = 0;
  for (let i = messages.length - 1; i > lastQuestionIndex; i--) {
    const m = messages[i];
    if (m.sender_type === 'client' && !isPlaceholderText(m.text)) count++;
  }
  return count;
}

function hasMinimumForEstimate(collected) {
  return collected &&
    typeof collected.salary === 'number' &&
    collected.admissionDate &&
    collected.terminationDate;
}

async function handleLaborSettlementWebhook(params) {
  const { conversation, normalizedPhone, waMessageId, textBody, messageType, messages = [], log } = params;

  if (!validatePreconditions({ conversation, normalizedPhone, messageType, textBody })) {
    return { handled: false, reply: null, flow: null, stateSaved: false, errorCode: null };
  }

  // Se a última resposta do bot já foi a estimativa preliminar, não reativa o fluxo.
  // Dúvidas subsequentes vão para o Gemini ou para atendimento humano.
  if (lastBotMessageIsEstimate(messages)) {
    return { handled: false, reply: null, flow: null, stateSaved: false, errorCode: null };
  }

  if (log && typeof log === 'function') {
    log('labor_integration_invoked', {
      hasHistory: Array.isArray(messages) && messages.length > 0,
      textLength: textBody.length
    });
  }

  const askedFields = buildAskedFieldsFromMessages(messages);
  const collected = buildCollectedFromMessages(messages, textBody, askedFields);
  const isContinuation = lastBotMessageIsLaborQuestion(messages);
  const clientMessagesSinceQuestion = isContinuation
    ? countClientMessagesSinceLastLaborQuestion(messages)
    : 0;
  const forceComplete = isContinuation &&
    clientMessagesSinceQuestion >= MAX_LABOR_TURNS &&
    hasMinimumForEstimate(collected);

  if (log && typeof log === 'function') {
    log('labor_context_rebuilt', {
      hasHistory: messages.length > 0,
      hasActiveContext: isContinuation,
      askedFieldsCount: askedFields.length,
      collectedKeysCount: Object.keys(collected).length
    });
  }

  const initialState = {
    active: isContinuation,
    intent: isContinuation ? 'labor_settlement_estimate' : null,
    collected,
    askedFields,
    status: isContinuation ? 'collecting' : 'idle',
    forceComplete
  };

  // Se a continuação existe, mas a resposta não reconhece dados e não é laboral
  // (saudação, mudança de assunto ou dúvida), solta para o fluxo normal.
  if (isContinuation) {
    const currentExtracted = extractLaborFields(textBody, askedFields, collected);
    const currentIntent = classifyLaborIntent(textBody);
    const unproductiveCount = countUnproductiveClientMessagesAfterLastQuestion(messages);
    const isOffTopic = currentIntent.intent === 'other' && Object.keys(currentExtracted).length === 0;
    if (isOffTopic || unproductiveCount >= 2) {
      if (log && typeof log === 'function') {
        log('labor_released_to_normal_flow', {
          reason: isOffTopic ? 'off_topic_or_greeting' : 'max_unproductive_replies',
          attempts: unproductiveCount
        });
      }
      return { handled: false, reply: null, flow: null, stateSaved: false, errorCode: null };
    }
  }

  let result;
  try {
    result = adaptLaborSettlement({
      message: textBody,
      state: initialState,
      metadata: { source: 'whatsapp' }
    });
  } catch (err) {
    if (log && typeof log === 'function') {
      log('labor_integration_exception', { errorCode: err.code || 'ADAPT_FAILED' });
    }
    return { handled: false, reply: null, flow: 'error', stateSaved: false, errorCode: err.code || 'ADAPT_FAILED' };
  }

  const handled = !!(result && result.handled && result.response && result.response.text);
  const flow = (result && result.flow) || null;

  if (log && typeof log === 'function') {
    log('labor_integration_result', {
      handled,
      flow,
      hasReply: !!(result && result.response && result.response.text),
      missingFieldsCount: (result && result.missingFields && result.missingFields.length) || 0
    });
  }

  if (!handled) {
    return { handled: false, reply: null, flow, stateSaved: false, errorCode: null, calculation: result.calculation, collected: result.state?.collected || {} };
  }

  return {
    handled: true,
    reply: result.response.text,
    flow,
    stateSaved: false,
    errorCode: null,
    calculation: result.calculation,
    collected: result.state?.collected || {}
  };
}

module.exports = {
  handleLaborSettlementWebhook,
  lastBotMessageIsLaborQuestion,
  countUnproductiveClientMessagesAfterLastQuestion
};
module.exports.__esModule = true;
module.exports.default = module.exports;
