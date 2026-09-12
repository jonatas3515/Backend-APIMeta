import { useState, useEffect } from 'react';
import { getErrorMessage } from '../lib/errorMessage';
import { apiCall } from '../lib/apiClient';

const ACTIVE_CLIENT_STATUSES = ['ativo', 'active', ''];

export default function ConversationSelectorModal({ caseItem, onSelect, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    const term = search.toLowerCase();
    const active = conversations.filter(isActive);
    setFiltered(
      active.filter((c) => {
        const name = c.client_name?.toLowerCase() || '';
        const phone = c.client_phone || '';
        return name.includes(term) || phone.includes(term);
      })
    );
  }, [search, conversations]);

  const isActive = (conversation) => {
    const status = (conversation.client_status || '').toLowerCase();
    return ACTIVE_CLIENT_STATUSES.includes(status);
  };

  const fetchConversations = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiCall('/api/conversations');
      setConversations((data || []).filter(isActive));
    } catch (error) {
      const text = getErrorMessage(error, 'Erro ao carregar conversas. Tente novamente.');
      setError(text);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (conversation) => {
    if (selectingId) return;
    if (!isActive(conversation)) {
      setError('Conversa inativa. Selecione uma conversa ativa.');
      return;
    }
    setSelectingId(conversation.id);
    try {
      await onSelect(conversation);
    } catch (error) {
      const text = getErrorMessage(error, 'Erro ao vincular conversa. Tente novamente.');
      setError(text);
    } finally {
      setSelectingId(null);
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

        {error && (
          <div
            className="p-3 m-4 mb-0 bg-red-100 text-red-700 rounded text-sm"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

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
            <div className="text-center" role="status" aria-live="polite">
              <p className="text-gray-500">Nenhuma conversa ativa encontrada.</p>
              <p className="text-xs text-gray-400 mt-1">Cadastre uma conversa ativa para vincular a este caso.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => handleSelect(conversation)}
                  disabled={selectingId === conversation.id}
                  title={selectingId === conversation.id ? 'Vinculando...' : 'Selecionar conversa'}
                  className="w-full text-left p-3 border rounded hover:bg-blue-50 transition flex justify-between items-center disabled:opacity-60"
                >
                  <div>
                    <p className="text-sm font-medium">{conversation.client_name || 'Sem nome'}</p>
                    <p className="text-xs text-gray-500">{formatPhone(conversation.client_phone)}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {conversation.legal_area && <p className="font-medium">{conversation.legal_area}</p>}
                    <p>{selectingId === conversation.id ? 'Vinculando...' : `Atualizado em ${formatDate(conversation.updated_at)}`}</p>
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


