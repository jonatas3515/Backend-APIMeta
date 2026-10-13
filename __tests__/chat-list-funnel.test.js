import { render, screen, fireEvent } from '@testing-library/react';
import ChatList from '../components/ChatList';

const mockConversations = [
  { id: '1', client_name: 'Ana', client_phone: '5511999990001', funnel_stage: 'proposta_enviada', unread: false, archived: false, updated_at: new Date().toISOString() },
  { id: '2', client_name: 'Bruno', client_phone: '5511999990002', funnel_stage: 'contrato_assinado', unread: false, archived: false, updated_at: new Date().toISOString() },
  { id: '3', client_name: 'Carlos', client_phone: '5511999990003', funnel_stage: 'proposta', unread: false, archived: false, updated_at: new Date().toISOString() },
  { id: '4', client_name: 'Diana', client_phone: '5511999990004', funnel_stage: null, unread: false, archived: false, updated_at: new Date().toISOString() }
];

function renderChatList(conversations = mockConversations) {
  return render(
    <ChatList
      conversations={conversations}
      selectedConversation={null}
      onSelectConversation={() => {}}
      loading={false}
      onNewConversation={() => {}}
      onDeleteConversation={() => {}}
      deletingId={null}
    />
  );
}

describe('ChatList - badge e filtro de etapa do funil', () => {
  test('exibe badge compacto com a etapa atual de cada conversa', () => {
    renderChatList();
    expect(screen.getAllByText('💰 Proposta').length).toBe(2); // Ana + Carlos (legado normalizado)
    expect(screen.getByText('📝 Contrato')).toBeInTheDocument();
    expect(screen.getByText('🆕 Novo')).toBeInTheDocument(); // Diana sem etapa -> lead_novo
  });

  test('badge de etapa legada normaliza para a etapa oficial', () => {
    renderChatList([mockConversations[2]]);
    const badge = screen.getByTestId('funnel-stage-badge');
    expect(badge).toHaveTextContent('💰 Proposta');
    expect(badge).toHaveAttribute('title', '💰 Proposta Enviada');
  });

  test('select de etapa lista as 8 etapas oficiais', () => {
    renderChatList();
    const select = screen.getByTestId('funnel-stage-filter');
    const values = Array.from(select.querySelectorAll('option')).map(o => o.value);
    expect(values).toEqual([
      '',
      'lead_novo', 'intake_em_andamento', 'intake_concluido', 'proposta_enviada',
      'contrato_assinado', 'acao_protocolada', 'aguardando_decisao', 'encerrado'
    ]);
  });

  test('filtro por etapa mostra apenas conversas correspondentes (inclui legados normalizados)', () => {
    renderChatList();
    fireEvent.change(screen.getByTestId('funnel-stage-filter'), { target: { value: 'proposta_enviada' } });
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument(); // 'proposta' legado casa com proposta_enviada
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
    expect(screen.queryByText('Diana')).not.toBeInTheDocument();
  });

  test('limpar o filtro de etapa volta a exibir todas as conversas', () => {
    renderChatList();
    const select = screen.getByTestId('funnel-stage-filter');
    fireEvent.change(select, { target: { value: 'contrato_assinado' } });
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Bruno')).toBeInTheDocument();
  });
});
