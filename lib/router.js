/**
 * Utilitário central para construção de URLs internas entre App Router e Pages Router.
 * Mantém compatibilidade com query strings legadas e evita URLs hardcoded.
 */

export function buildInternalUrl({
  tab,
  view,
  caseId,
  caseView,
  conversationId,
  newConversation,
  clientView,
} = {}) {
  const params = new URLSearchParams();

  if (tab) {
    params.set('tab', tab);
  } else if (caseId) {
    params.set('tab', 'cases');
  } else if (conversationId) {
    params.set('tab', 'chat');
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

  if (conversationId) {
    params.set('conversation', conversationId);
  }

  if (newConversation) {
    params.set('new', '1');
  }

  const query = params.toString();
  return `/${query ? `?${query}` : ''}`;
}

/**
 * Resolve query string legadas para a estrutura normalizada.
 * @param {Object} query - router.query
 * @returns {Object} { tab, view, caseId, caseView, conversationId, redirectTo, notice }
 */
export function resolveLegacyQuery(query = {}) {
  const { tab, view, caseId, caseView, conversation, new: newParam } = query;

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

  if (tab === 'collaboration' && caseId) {
    return {
      tab: 'cases',
      caseId,
      caseView: 'colaboracao',
      redirectTo: buildInternalUrl({ tab: 'cases', caseId, caseView: 'colaboracao' }),
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

  const result = { tab, view, caseId, caseView, conversationId: conversation, newParam };

  if (tab === 'fee-services' && view) {
    result.view = view;
  }

  if (tab === 'users' && view) {
    result.view = view;
  }

  if (tab === 'models-routines' && view) {
    result.view = view;
  }

  if (tab === 'chat' && newParam) {
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
