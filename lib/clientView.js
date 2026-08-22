/**
 * Resolve o estado da visão de Chat/Clientes a partir dos parâmetros da URL.
 * Não realiza chamadas de rede nem expõe dados pessoais.
 *
 * @param {Object} params
 * @param {string|undefined} params.tab
 * @param {string|undefined} params.view
 * @param {string|undefined} params.conversation
 * @param {Array} params.conversations
 * @returns {Object} { activeTab, chatView, shouldOpenConversation, selectedConversation, redirectUrl }
 */
export function resolveChatView({ tab, view, conversation, conversations = [] }) {
  const chatView = view === 'clientes' || tab === 'clients' ? 'clientes' : 'conversas';
  const activeTab = tab === 'clients' ? 'chat' : (tab || 'chat');

  const shouldOpenConversation =
    activeTab === 'chat' &&
    chatView === 'conversas' &&
    !!conversation;

  const selectedConversation = shouldOpenConversation
    ? (conversations || []).find((c) => c.id === conversation) || null
    : null;

  const redirectUrl = tab === 'clients' ? '/?tab=chat&view=clientes' : null;

  return { activeTab, chatView, shouldOpenConversation, selectedConversation, redirectUrl };
}
