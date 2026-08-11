import { useState } from 'react';

const FILTERS = [
  { key: 'all', label: 'Tudo' },
  { key: 'unread', label: 'Não lidos' },
  { key: 'archived', label: 'Arquivados' }
];

export default function ChatList({ conversations, selectedConversation, onSelectConversation, loading, onNewConversation, onDeleteConversation, deletingId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');

  if (loading) {
    return (
      <div className="w-80 bg-nc-white border-r border-nc-gray-300 flex items-center justify-center">
        <p className="text-nc-text-muted">Carregando conversas...</p>
      </div>
    );
  }

  const filteredConversations = conversations
    .filter(conv => {
      if (activeFilter === 'unread') return conv.unread === true;
      if (activeFilter === 'archived') return conv.archived === true;
      return !conv.archived; // Tudo = ativas (não arquivadas)
    })
    .filter(conv => {
      const search = searchTerm.toLowerCase();
      return (
        conv.client_name?.toLowerCase().includes(search) ||
        conv.client_phone?.includes(search)
      );
    });

  return (
    <div className="w-80 bg-nc-white border-r border-nc-gray-300 flex flex-col">
      <div className="p-4 border-b border-nc-gray-200">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-bold text-nc-text-title">Conversas</h1>
          <button
            onClick={onNewConversation}
            className="w-8 h-8 bg-nc-yellow text-nc-black rounded-nc hover:bg-nc-yellow-600 flex items-center justify-center text-xl font-semibold transition"
            title="Nova conversa"
          >
            +
          </button>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar..."
          className="nc-input"
        />
        <div className="flex gap-2 mt-3">
          {FILTERS.map(filter => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`flex-1 py-1.5 px-2 rounded-nc text-xs font-medium transition border ${
                activeFilter === filter.key
                  ? 'bg-nc-yellow text-nc-black border-nc-yellow'
                  : 'bg-nc-white text-nc-text-secondary border-nc-gray-300 hover:border-nc-yellow hover:text-nc-yellow'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-nc-text-muted">
            {searchTerm ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv)}
              className={`p-4 border-b border-nc-gray-150 cursor-pointer transition relative ${
                selectedConversation?.id === conv.id
                  ? 'bg-nc-gray-100 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-nc-yellow'
                  : 'hover:bg-nc-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0 pr-2">
                  <p className={`font-semibold truncate ${
                    selectedConversation?.id === conv.id ? 'text-nc-text-title' : 'text-nc-text'
                  }`}>
                    {conv.client_name || conv.client_phone}
                  </p>
                  <p className="text-sm text-nc-text-secondary truncate">
                    {conv.messages?.[0]?.text || 'Sem mensagens'}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                    conv.mode === 'bot'
                      ? 'bg-nc-gray-100 text-nc-text border-nc-gray-200'
                      : 'bg-nc-white text-nc-text-secondary border-nc-gray-300'
                  }`}
                >
                  {conv.mode === 'bot' ? 'Bot' : 'Humano'}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-nc-text-muted">
                  {(() => {
                    const now = new Date();
                    const updated = new Date(conv.updated_at);
                    const diffMinutes = Math.floor((now - updated) / (1000 * 60));

                    if (diffMinutes < 1) return 'Agora';
                    if (diffMinutes < 60) return `${diffMinutes} min atrás`;
                    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h atrás`;
                    return updated.toLocaleDateString('pt-BR');
                  })()}
                </p>
                <div className="flex items-center gap-2">
                  {conv.status === 'open' && (
                    <span className="w-2 h-2 bg-nc-yellow rounded-full" title="Conversa ativa"></span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv);
                    }}
                    disabled={deletingId === conv.id}
                    className="text-nc-text-muted hover:text-red-600 text-xs transition"
                    title="Excluir conversa"
                  >
                    {deletingId === conv.id ? '...' : '🗑️'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
