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

const QUESTION_MARKERS = {
  salary: /sal[áa]rio mensal/i,
  admissionDate: /data de admiss[ãa]o/i,
  terminationDate: /data de desligamento/i,
  terminationReason: /(motivo da sa[íi]da|motivo do desligamento|desligamento ocorreu)/i,
  hasVacationAccrued: /f[eé]rias vencidas/i,
  hasThirteenthAccrued: /13[ºo]? sal[áa]rio vencido/i,
  noticeStatus: /aviso[-\s]?pr[eé]vio/i
};

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
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

function isPlaceholderText(text) {
  if (!text || typeof text !== 'string') return true;
  return text.startsWith('[') || text.startsWith('(') || text.length === 0;
}

const KNOWN_FIELDS = Object.keys(QUESTION_MARKERS);

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
  const text = String(lastBot.text || '');
  return Object.values(QUESTION_MARKERS).some(regex => regex.test(text)) ||
    text.includes('Para estimar sua rescisão');
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
async function handleLaborSettlementWebhook(params) {
  const { conversation, normalizedPhone, waMessageId, textBody, messageType, messages = [], log } = params;

  if (!validatePreconditions({ conversation, normalizedPhone, messageType, textBody })) {
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
    status: isContinuation ? 'collecting' : 'idle'
  };

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
    return { handled: false, reply: null, flow, stateSaved: false, errorCode: null };
  }

  return {
    handled: true,
    reply: result.response.text,
    flow,
    stateSaved: false,
    errorCode: null
  };
}

module.exports = { handleLaborSettlementWebhook };
module.exports.__esModule = true;
module.exports.default = module.exports;
