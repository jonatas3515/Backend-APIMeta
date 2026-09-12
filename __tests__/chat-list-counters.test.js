import { render, screen, fireEvent } from '@testing-library/react';
import ChatList from '../components/ChatList';

const mockConversations = [
  { id: '1', client_name: 'Ana', client_phone: '5511999990001', unread: true, archived: false, updated_at: new Date().toISOString() },
  { id: '2', client_name: 'Bruno', client_phone: '5511999990002', unread: false, archived: false, updated_at: new Date().toISOString() },
  { id: '3', client_name: 'Carlos', client_phone: '5511999990003', unread: false, archived: true, updated_at: new Date().toISOString() }
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

describe('ChatList - contadores por filtro', () => {
  test('exibe contadores pequenos para Tudo, Nao lidos e Arquivados', () => {
    renderChatList();
    expect(screen.getByRole('button', { name: 'Tudo (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não lidos (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivados (1)' })).toBeInTheDocument();
  });

  test('exibe contador zero quando filtro esta vazio', () => {
    renderChatList([
      { id: '1', client_name: 'Ana', client_phone: '5511999990001', unread: false, archived: true, updated_at: new Date().toISOString() }
    ]);
    expect(screen.getByRole('button', { name: 'Tudo (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Não lidos (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivados (1)' })).toBeInTheDocument();
  });

  test('filtra conversas ao clicar no botao', () => {
    renderChatList();
    fireEvent.click(screen.getByRole('button', { name: 'Não lidos (1)' }));
    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Arquivados (1)' }));
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
  });

  test('contadores sao renderizados em superscript pequeno', () => {
    renderChatList();
    const buttons = [
      screen.getByRole('button', { name: 'Tudo (2)' }),
      screen.getByRole('button', { name: 'Não lidos (1)' }),
      screen.getByRole('button', { name: 'Arquivados (1)' })
    ];
    buttons.forEach(btn => {
      const sup = btn.querySelector('sup');
      expect(sup).toBeInTheDocument();
      expect(sup.className).toContain('text-[10px]');
    });
  });
});
