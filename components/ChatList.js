export default function ChatList({ conversations, selectedConversation, onSelectConversation, loading }) {
  if (loading) {
    return (
      <div className="w-80 bg-white border-r border-gray-200 flex items-center justify-center">
        <p className="text-gray-500">Carregando conversas...</p>
      </div>
    );
  }

  return (
    <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-2xl font-bold text-gray-800">Chat Advocacia</h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            Nenhuma conversa ainda
          </div>
        ) : (
          conversations.map((conv) => (
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
