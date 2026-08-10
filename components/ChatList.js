import { useState } from 'react';

export default function ChatList({ conversations, selectedConversation, onSelectConversation, loading }) {
  const [searchTerm, setSearchTerm] = useState('');

  if (loading) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 flex items-center justify-center">
        <p className="text-gray-500">Carregando conversas...</p>
      </div>
    );
  }

  const filteredConversations = conversations.filter(conv => {
    const search = searchTerm.toLowerCase();
    return (
      conv.client_name?.toLowerCase().includes(search) ||
      conv.client_phone?.includes(search)
    );
  });

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800 mb-3">Chat Advocacia N&C</h1>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Pesquisar..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
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
              <p className="text-xs text-gray-400 mt-2">
                {new Date(conv.updated_at).toLocaleString('pt-BR')}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
