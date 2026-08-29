/**
 * Utilitário central para construção de URLs internas entre App Router e Pages Router.
 * Mantém compatibilidade com query strings legadas e evita URLs hardcoded.
 */

export function buildInternalUrl({
  tab,
  view,
  caseId,
  caseView,
  conversation,
  conversationId,
  newConversation,
  clientView,
  movementId,
  processId,
  eventId,
  signatureId,
  reminderId,
} = {}) {
  const params = new URLSearchParams();

  if (tab) {
    params.set('tab', tab);
  } else if (caseId) {
    params.set('tab', 'cases');
  } else if (conversation || conversationId) {
    params.set('tab', 'chat');
  } else if (movementId || processId) {
    params.set('tab', 'triage');
  } else if (eventId) {
    params.set('tab', 'agenda');
  } else if (signatureId) {
    params.set('tab', 'users');
  }

  if (view) {
    params.set('view', view);
  }

  if (clientView) {
    params.set('view', clientView);
  }

  if (caseId) {
    params.set('caseId', caseId);
  }

  if (caseView) {
    params.set('caseView', caseView);
  }

  if (conversation) {
    params.set('conversation', conversation);
  }

  if (conversationId) {
    params.set('conversationId', conversationId);
  }

  if (newConversation) {
    params.set('new', '1');
  }

  if (movementId) {
    params.set('movementId', movementId);
  }

  if (processId) {
    params.set('processId', processId);
  }

  if (eventId) {
    params.set('eventId', eventId);
  }

  if (signatureId) {
    params.set('signatureId', signatureId);
  }

  if (reminderId) {
    params.set('reminderId', reminderId);
  }

  const query = params.toString();
  return `/${query ? `?${query}` : ''}`;
}

/**
 * Resolve query string para a estrutura normalizada do contrato de notificacao.
 * @param {Object} query - router.query
 * @returns {Object} { tab, view, caseId, caseView, conversationId, movementId, ... }
 */
export function resolveLegacyQuery(query = {}) {
  const {
    tab,
    view,
    case: legacyCase,
    caseId,
    caseView,
    conversation,
    conversationId,
    movement,
    movementId,
    process,
    processId,
    event,
    eventId,
    signatures,
    signature,
    signatureId,
    reminder,
    reminderId,
    new: newParam,
  } = query;

  const resolvedCaseId = caseId || legacyCase;
  const resolvedConversationId = conversationId || conversation;
  const resolvedMovementId = movementId || movement;
  const resolvedProcessId = processId || process;
  const resolvedEventId = eventId || event;
  const resolvedSignatureId = signatureId || signature;
  const resolvedReminderId = reminderId || reminder;

  if (tab === 'clients') {
    return {
      tab: 'chat',
      view: 'clientes',
      conversationId: undefined,
      redirectTo: buildInternalUrl({ tab: 'chat', clientView: 'clientes' }),
      notice: null,
    };
  }

  if (tab === 'templates' || tab === 'documents') {
    return {
      tab: 'models-routines',
      view: 'templates',
      redirectTo: buildInternalUrl({ tab: 'models-routines', view: 'templates' }),
      notice: null,
    };
  }

  if (tab === 'routines') {
    return {
      tab: 'models-routines',
      view: 'routines',
      redirectTo: buildInternalUrl({ tab: 'models-routines', view: 'routines' }),
      notice: null,
    };
  }

  if (tab === 'profile') {
    return {
      tab: 'users',
      view: 'profile',
      redirectTo: buildInternalUrl({ tab: 'users', view: 'profile' }),
      notice: null,
    };
  }

  if (tab === 'collaboration' && resolvedCaseId) {
    return {
      tab: 'cases',
      caseId: resolvedCaseId,
      caseView: 'colaboracao',
      redirectTo: buildInternalUrl({ tab: 'cases', caseId: resolvedCaseId, caseView: 'colaboracao' }),
      notice: null,
    };
  }

  if (tab === 'collaboration') {
    return {
      tab: 'cases',
      redirectTo: buildInternalUrl({ tab: 'cases' }),
      notice: 'Selecione um caso para acessar a colaboração.',
    };
  }

  if (tab === 'insights') {
    return {
      tab: 'cases',
      caseView: 'insights',
      redirectTo: buildInternalUrl({ tab: 'cases', caseView: 'insights' }),
      notice: null,
    };
  }

  const result = {
    tab,
    view,
    caseId: resolvedCaseId,
    caseView,
    conversationId: resolvedConversationId,
    newParam,
    movementId: resolvedMovementId,
    processId: resolvedProcessId,
    eventId: resolvedEventId,
    signatureId: resolvedSignatureId,
    reminderId: resolvedReminderId,
  };

  // Normaliza parametros legados sem tab explicito
  if (!result.tab) {
    if (resolvedConversationId) result.tab = 'chat';
    else if (resolvedCaseId) result.tab = 'cases';
    else if (resolvedMovementId) result.tab = 'triage';
    else if (resolvedProcessId) result.tab = 'triage';
    else if (resolvedEventId) result.tab = 'agenda';
    else if (resolvedSignatureId) {
      result.tab = 'users';
      if (!result.view) result.view = 'signatures';
    }
  }

  if (query.agenda === 'true' && !resolvedEventId) {
    result.tab = 'agenda';
  }

  if (signatures === 'true' || query.signatures === 'true') {
    result.tab = 'users';
    if (!result.view) result.view = 'signatures';
  }

  if (resolvedSignatureId && !result.view) {
    result.view = 'signatures';
  }

  if (result.tab === 'fee-services' && view) {
    result.view = view;
  }

  if (result.tab === 'users' && view) {
    result.view = view;
  }

  if (result.tab === 'models-routines' && view) {
    result.view = view;
  }

  if (result.tab === 'chat' && newParam) {
    result.newConversation = newParam === '1';
  }

  return result;
}

/**
 * Navega para um caso específico
 * @param {string} caseId - ID do caso
 * @param {string} caseView - View específica do caso (opcional)
 */
export function navigateToCase(caseId, caseView = null) {
  if (typeof window === 'undefined') return;
  
  const url = buildInternalUrl({ tab: 'cases', caseId, caseView });
  window.location.href = url;
}
