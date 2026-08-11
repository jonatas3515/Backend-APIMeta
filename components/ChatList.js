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
      <div className="w-80 bg-white border-r border-gray-200 flex items-center justify-center">
        <p className="text-gray-500">Carregando conversas...</p>
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
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-2xl font-bold text-gray-800">Chat Advocacia N&C</h1>
          <button
            onClick={onNewConversation}
            className="w-8 h-8 bg-blue-600 text-white rounded-full hover:bg-blue-700 flex items-center justify-center text-xl font-bold"
            title="Nova conversa"
          >
            +
          </button>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Pesquisar..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        <div className="flex gap-2 mt-3">
          {FILTERS.map(filter => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition ${
                activeFilter === filter.key
                  ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {searchTerm ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv)}
              className={`p-4 border-b border-gray-100 cursor-pointer transition ${
                selectedConversation?.id === conv.id
                  ? 'bg-blue-50 border-l-4 border-l-blue-500'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">
                    {conv.client_name || conv.client_phone}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {conv.messages?.[0]?.text || 'Sem mensagens'}
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full font-semibold ${
                    conv.mode === 'bot'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {conv.mode === 'bot' ? 'Bot' : 'Humano'}
                </span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <p className="text-xs text-gray-400">
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
                {conv.status === 'open' && (
                  <span className="w-2 h-2 bg-green-500 rounded-full" title="Conversa ativa"></span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conv);
                  }}
                  disabled={deletingId === conv.id}
                  className="ml-2 text-red-500 hover:text-red-700 text-xs"
                  title="Excluir conversa"
                >
                  {deletingId === conv.id ? '...' : '🗑️'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
