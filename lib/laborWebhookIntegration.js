/**
 * Integração controlada do cálculo de verbas trabalhistas com o webhook do WhatsApp.
 *
 * Regras:
 * - Não acessa conversation_labor_states diretamente.
 * - Usa exclusivamente lib/laborSettlementState.js.
 * - Não loga mensagens, salários, datas, respostas, payload ou PII.
 * - Valida escopo a partir da conversa carregada no Supabase.
 */

const { adaptLaborSettlement } = require('./laborSettlementAdapter');
const {
  loadLaborSettlementState,
  saveLaborSettlementState,
  deleteLaborSettlementState
} = require('./laborSettlementState');

const WEBHOOK_ACTOR = 'system:whatsapp';

function buildAuthorizationContext(conversationId) {
  return {
    userId: WEBHOOK_ACTOR,
    allowedConversationId: conversationId
  };
}

function validatePreconditions({ conversation, normalizedPhone, messageType, textBody }) {
  if (!conversation || !conversation.id) return false;
  if (messageType !== 'text') return false;
  if (!textBody || typeof textBody !== 'string' || textBody.trim().length === 0) return false;
  if (conversation.mode !== 'bot') return false;
  if (conversation.status !== 'open') return false;
  if (conversation.archived === true) return false;
  if (conversation.client_phone_normalized !== normalizedPhone) return false;
  return true;
}

/**
 * Processa mensagem de texto para o fluxo trabalhista.
 * Retorna { handled, reply, stateSaved, errorCode }.
 *
 * - handled: indica se a mensagem foi reconhecida como trabalhista.
 * - reply: texto a ser enviado ao cliente (se houver).
 * - stateSaved: indica se o estado foi salvo.
 * - errorCode: código sanitizado de erro, se houver.
 */
async function handleLaborSettlementWebhook(params) {
  const { conversation, normalizedPhone, waMessageId, textBody, messageType, log } = params;

  const reply = null;
  const stateSaved = false;
  const errorCode = null;

  if (!validatePreconditions({ conversation, normalizedPhone, messageType, textBody })) {
    return { handled: false, reply, stateSaved, errorCode };
  }

  const authorizationContext = buildAuthorizationContext(conversation.id);
  const now = new Date();

  let loadedState = null;
  let expectedUpdatedAt = undefined;

  try {
    loadedState = await loadLaborSettlementState({
      conversationId: conversation.id,
      authorizationContext,
      now
    });
    expectedUpdatedAt = loadedState ? loadedState.updatedAt : undefined;
  } catch (err) {
    if (log && typeof log === 'function') {
      log('labor_state_load_failed', { errorCode: err.code || 'LOAD_FAILED' });
    }
    return { handled: false, reply, stateSaved, errorCode: err.code || 'LOAD_FAILED' };
  }

  const result = adaptLaborSettlement({
    message: textBody,
    state: loadedState || undefined,
    metadata: { source: 'whatsapp' }
  });

  if (!result || !result.handled || !result.state) {
    return { handled: false, reply, stateSaved, errorCode };
  }

  const finalState = result.state;
  const status = finalState.status;
  const shouldDelete = status === 'cancelled' || status === 'completed';
  const shouldSave = finalState.active === true;

  if (shouldDelete) {
    try {
      await deleteLaborSettlementState({
        conversationId: conversation.id,
        authorizationContext
      });
    } catch (err) {
      if (log && typeof log === 'function') {
        log('labor_state_delete_failed', { errorCode: err.code || 'DELETE_FAILED' });
      }
    }
  } else if (shouldSave) {
    const stateToSave = {
      active: finalState.active,
      intent: finalState.intent,
      status: finalState.status,
      collected: finalState.collected,
      askedFields: finalState.askedFields,
      lastMessageHash: waMessageId
    };

    try {
      await saveLaborSettlementState({
        conversationId: conversation.id,
        state: stateToSave,
        authorizationContext,
        expectedUpdatedAt,
        now
      });
    } catch (err) {
      if (log && typeof log === 'function') {
        log('labor_state_save_failed', { errorCode: err.code || 'SAVE_FAILED' });
      }
      const fallbackErrorCode = err.code || 'SAVE_FAILED';
      return {
        handled: true,
        reply: 'Não foi possível continuar a simulação agora. Pode repetir?',
        stateSaved: false,
        errorCode: fallbackErrorCode
      };
    }
  }

  const resultReply = result.response && result.response.text ? result.response.text : null;

  return {
    handled: true,
    reply: resultReply,
    stateSaved: shouldDelete || shouldSave,
    errorCode: null
  };
}

module.exports = { handleLaborSettlementWebhook };
