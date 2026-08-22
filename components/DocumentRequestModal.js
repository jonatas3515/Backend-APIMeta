import { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../lib/useAuth';
import { getAuthHeaders } from '../lib/api';

export default function DocumentRequestModal({ caseItem, onClose }) {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [draft, setDraft] = useState(null);
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [caseItem.id]);

  useEffect(() => {
    setCustomMessage(draft?.message || '');
  }, [draft]);

  const fetchItems = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/document-checklists?case_id=${caseItem.id}`, { headers });
      setItems(data || []);
    } catch (error) {
      console.error('[DOC_REQUEST_MODAL] Erro ao carregar checklist:', error);
    }
  };

  const pendingItems = items.filter(i =>
    ['pendente', 'recusado'].includes(i.status) && !i.is_sensitive
  );

  const toggleItem = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 3) {
        alert('Limite de 3 itens por solicitacao');
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCreateDraft = async () => {
    if (selected.length === 0) {
      alert('Selecione ao menos um item');
      return;
    }
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.post('/api/document-checklist-requests', {
        case_id: caseItem.id,
        conversation_id: caseItem.conversation_id,
        items: selected
      }, { headers });
      setDraft(data);
    } catch (error) {
      console.error('[DOC_REQUEST_MODAL] Erro ao criar rascunho:', error);
      alert(error.response?.data?.error || 'Erro ao criar rascunho');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draft) return;
    setSending(true);
    try {
      const headers = await getAuthHeaders();
      await axios.post('/api/document-checklist-requests?action=send', {
        id: draft.id,
        message: customMessage
      }, { headers });
      alert('Solicitacao enviada com sucesso');
      onClose();
    } catch (error) {
      console.error('[DOC_REQUEST_MODAL] Erro ao enviar:', error);
      alert(error.response?.data?.error || 'Erro ao enviar solicitacao');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold">Solicitar Documentos pelo WhatsApp</h3>
            <p className="text-sm text-gray-500">{caseItem.title}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {!draft ? (
            <>
              <p className="text-sm text-gray-600 mb-3">
                Selecione ate 3 documentos nao sensiveis para enviar ao cliente.
              </p>

              {pendingItems.length === 0 ? (
                <p className="text-center text-gray-500">Nenhum item elegivel para solicitacao.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {pendingItems.map(item => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 p-3 border rounded cursor-pointer ${
                        selected.includes(item.id) ? 'bg-blue-50 border-blue-300' : 'bg-white'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{item.title || item.document_name}</p>
                        {item.description && (
                          <p className="text-xs text-gray-500">{item.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleCreateDraft}
                  disabled={loading || selected.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Gerando...' : 'Gerar rascunho'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium mb-2">Mensagem a ser enviada (edite se desejar):</p>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={8}
                className="w-full border rounded p-3 text-sm mb-4"
              />

              <div className="flex gap-2">
                <button
                  onClick={handleSend}
                  disabled={sending}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                >
                  {sending ? 'Enviando...' : 'Confirmar e enviar'}
                </button>
                <button
                  onClick={() => { setDraft(null); setSelected([]); }}
                  className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
                >
                  Voltar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
