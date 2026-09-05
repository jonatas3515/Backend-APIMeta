import { useState, useEffect } from 'react';
import axios from 'axios';
import { apiCall } from '../lib/apiClient';

export default function ConversationSelectorModal({ caseItem, onSelect, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    const term = search.toLowerCase();
    setFiltered(
      conversations.filter((c) => {
        const name = c.client_name?.toLowerCase() || '';
        const phone = c.client_phone || '';
        return name.includes(term) || phone.includes(term);
      })
    );
  }, [search, conversations]);

  const fetchConversations = async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get('/api/conversations', { headers });
      setConversations(data || []);
    } catch (error) {
      console.error('[CONV_SELECTOR] Erro ao carregar conversas:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPhone = (phone) => {
    if (!phone) return 'Sem telefone';
    return phone;
  };

  const formatDate = (value) => {
    if (!value) return '';
    return new Date(value).toLocaleDateString('pt-BR');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold">Vincular conversa ao caso</h3>
            <p className="text-sm text-gray-500">{caseItem.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        </div>

        <div className="p-4 border-b">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou telefone"
            className="w-full px-3 py-2 border rounded"
          />
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {loading ? (
            <p className="text-center text-gray-500">Carregando conversas...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-gray-500">Nenhuma conversa encontrada.</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => onSelect(conversation)}
                  className="w-full text-left p-3 border rounded hover:bg-blue-50 transition flex justify-between items-center"
                >
                  <div>
                    <p className="text-sm font-medium">{conversation.client_name || 'Sem nome'}</p>
                    <p className="text-xs text-gray-500">{formatPhone(conversation.client_phone)}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {conversation.legal_area && <p className="font-medium">{conversation.legal_area}</p>}
                    <p>Atualizado em {formatDate(conversation.updated_at)}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

