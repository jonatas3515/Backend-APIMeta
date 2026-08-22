/**
 * Testes sintéticos para a unificação Clientes dentro de Chat/Atendimento.
 * Não usam dados reais de clientes nem chamadas de rede.
 */

const { resolveChatView } = require('../lib/clientView');

const syntheticConversations = [
  { id: 'conv-001', client_name: 'Ana Silva', client_phone: '5511988887777', legal_area: 'trabalhista' },
  { id: 'conv-002', client_name: 'Bruno Souza', client_phone: '5511977776666', legal_area: 'civel' },
];

function findConversation(id) {
  return syntheticConversations.find((c) => c.id === id) || null;
}

describe('resolveChatView - compatibilidade de URLs', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
    console.log.mockRestore();
  });

  test('tab=clients redireciona para chat na visão Clientes', () => {
    const result = resolveChatView({ tab: 'clients' });

    expect(result.activeTab).toBe('chat');
    expect(result.chatView).toBe('clientes');
    expect(result.redirectUrl).toBe('/?tab=chat&view=clientes');
    expect(result.shouldOpenConversation).toBe(false);
    expect(result.selectedConversation).toBeNull();
  });

  test('tab=chat&view=clientes renderiza a visão Clientes', () => {
    const result = resolveChatView({ tab: 'chat', view: 'clientes' });

    expect(result.activeTab).toBe('chat');
    expect(result.chatView).toBe('clientes');
    expect(result.redirectUrl).toBeNull();
    expect(result.shouldOpenConversation).toBe(false);
    expect(result.selectedConversation).toBeNull();
  });

  test('view=clientes prioriza a lista e não abre conversa mesmo com conversation na URL', () => {
    const result = resolveChatView({
      tab: 'chat',
      view: 'clientes',
      conversation: 'conv-001',
      conversations: syntheticConversations,
    });

    expect(result.activeTab).toBe('chat');
    expect(result.chatView).toBe('clientes');
    expect(result.shouldOpenConversation).toBe(false);
    expect(result.selectedConversation).toBeNull();
  });

  test('tab=chat&conversation=<id> continua abrindo a conversa correspondente', () => {
    const result = resolveChatView({
      tab: 'chat',
      conversation: 'conv-002',
      conversations: syntheticConversations,
    });

    expect(result.activeTab).toBe('chat');
    expect(result.chatView).toBe('conversas');
    expect(result.shouldOpenConversation).toBe(true);
    expect(result.selectedConversation).toEqual(findConversation('conv-002'));
  });

  test('tab=chat sem view fica na visão Conversas', () => {
    const result = resolveChatView({ tab: 'chat' });

    expect(result.activeTab).toBe('chat');
    expect(result.chatView).toBe('conversas');
    expect(result.shouldOpenConversation).toBe(false);
    expect(result.selectedConversation).toBeNull();
  });

  test('não expõe PII nos logs - função não registra console.warn ou console.log', () => {
    resolveChatView({
      tab: 'chat',
      conversation: 'conv-001',
      conversations: syntheticConversations,
    });

    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  test('se conversation não é encontrada, não retorna conversa selecionada', () => {
    const result = resolveChatView({
      tab: 'chat',
      conversation: 'conv-inexistente',
      conversations: syntheticConversations,
    });

    expect(result.shouldOpenConversation).toBe(true);
    expect(result.selectedConversation).toBeNull();
  });
});
