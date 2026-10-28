import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';
import { useToast } from '../lib/useToast';
import { apiJson } from '../lib/apiClient';
import { getErrorMessage } from '../lib/errorMessage';
import { formatClientSalutation } from '../lib/genderFromName';

const cleanPhone = (p) => String(p || '').replace(/\D/g, '');

const STATUS_LABELS = {
  pendente: 'Pendente',
  solicitado: 'Já Solicitado',
  recebido: 'Recebido',
  recusado: 'Recusado',
  em_revisao: 'Em Revisão',
  revisado: 'Revisado',
  dispensado: 'Dispensado'
};

const STATUS_BADGES = {
  pendente: 'bg-amber-100 text-amber-800 border-amber-200',
  solicitado: 'bg-blue-100 text-blue-800 border-blue-200',
  recebido: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  recusado: 'bg-red-100 text-red-800 border-red-200',
  em_revisao: 'bg-purple-100 text-purple-800 border-purple-200',
  revisado: 'bg-green-100 text-green-800 border-green-200',
  dispensado: 'bg-gray-100 text-gray-800 border-gray-200'
};

export default function DocumentRequestModal({ caseItem, conversation, onClose }) {
  const { profile } = useAuth();
  const { addToast } = useToast();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState([]);
  const [draft, setDraft] = useState(null);
  const [customMessage, setCustomMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState(null);

  const conversationId = caseItem?.conversation_id || conversation?.id;
  const clientPhone = conversation?.client_phone || caseItem?.client_phone || '';
  const hasConversation = Boolean(conversationId);
  const hasClientPhone = Boolean(clientPhone?.trim());
  const canRequestDocuments = hasConversation && hasClientPhone;
  const requestDisabledReason = !hasConversation
    ? 'Vincule uma conversa ao caso antes de solicitar documentos.'
    : !hasClientPhone
    ? 'A conversa vinculada não possui telefone do cliente. Atualize o telefone antes de solicitar documentos.'
    : null;

  useEffect(() => {
    fetchItems();
  }, [caseItem.id]);

  useEffect(() => {
    if (draft?.message) {
      const rawName = (conversation?.client_name || caseItem?.client_name || '').trim();
      const salutation = formatClientSalutation(rawName);
      const intro = `${salutation} Aqui é do escritório Neves & Costa Advocacia.\n\n`;

      if (!draft.message.startsWith('Olá')) {
        setCustomMessage(intro + draft.message);
      } else {
        setCustomMessage(draft.message);
      }
    }
  }, [draft, conversation, caseItem]);

  const fetchItems = async () => {
    try {
      const data = await apiJson(`/api/document-checklists?case_id=${caseItem.id}`);
      setItems(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('[DOC_REQUEST_MODAL] Erro ao carregar checklist');
      setMessage({ type: 'error', text: getErrorMessage(error, 'Erro ao carregar itens do checklist.') });
    }
  };

  const availableItems = items.filter(i => !i.is_sensitive && i.status !== 'dispensado');

  const toggleItem = (id) => {
    setSelected(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) {
        setMessage({ type: 'warning', text: 'Você pode selecionar até 5 documentos por envio.' });
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleCreateDraft = async () => {
    if (!canRequestDocuments || loading) return;
    if (selected.length === 0) {
      setMessage({ type: 'warning', text: 'Selecione ao menos um item.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const data = await apiJson('/api/document-checklist-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: caseItem.id,
          conversation_id: conversationId,
          items: selected
        })
      });
      setDraft(data);
      addToast('Rascunho criado com sucesso.', 'success');
    } catch (error) {
      console.error('[DOC_REQUEST_MODAL] Erro ao criar rascunho');
      const text = getErrorMessage(error, 'Erro ao criar rascunho. Tente novamente.');
      setMessage({ type: 'error', text });
      addToast(text, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!draft || sending) return;
    setSending(true);
    setMessage(null);

    const phoneDigits = cleanPhone(clientPhone);
    const waUrl = phoneDigits
      ? `https://wa.me/55${phoneDigits}?text=${encodeURIComponent(customMessage)}`
      : null;

    try {
      await apiJson('/api/document-checklist-requests?action=send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: draft.id,
          message: customMessage
        })
      });

      if (waUrl && typeof window !== 'undefined') {
        window.open(waUrl, '_blank');
      }

      setMessage({ type: 'success', text: 'Solicitação registrada e WhatsApp aberto com sucesso!' });
      addToast('Solicitação registrada e WhatsApp aberto!', 'success');
      setTimeout(onClose, 1500);
    } catch (error) {
      console.warn('[DOC_REQUEST_MODAL] Erro ao registrar na API, mas abrindo WhatsApp direto:', error);
      if (waUrl && typeof window !== 'undefined') {
        window.open(waUrl, '_blank');
        addToast('WhatsApp aberto para envio da solicitação!', 'info');
        setTimeout(onClose, 1500);
      } else {
        const text = getErrorMessage(error, 'Erro ao enviar solicitação.');
        setMessage({ type: 'error', text });
        addToast(text, 'error');
      }
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
          {message && (
            <div
              className={`p-3 rounded text-sm mb-3 ${
                message.type === 'error' ? 'bg-red-100 text-red-700' :
                message.type === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-700'
              }`}
              role={message.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {message.text}
            </div>
          )}
          {!draft ? (
            <>
              <p className="text-sm text-gray-600 mb-3">
                Selecione os documentos para solicitar ao cliente (você pode solicitar qualquer documento quantas vezes for necessário):
              </p>

              {requestDisabledReason && (
                <p
                  id="doc-request-alert"
                  className="p-3 mb-3 text-sm text-yellow-800 bg-yellow-100 rounded"
                  role="alert"
                  aria-live="polite"
                >
                  {requestDisabledReason}
                </p>
              )}

              {availableItems.length === 0 ? (
                <p className="text-center text-gray-500">Nenhum item elegível para solicitação.</p>
              ) : (
                <div className="space-y-2 mb-4">
                  {availableItems.map(item => (
                    <label
                      key={item.id}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition ${
                        selected.includes(item.id) ? 'bg-blue-50 border-blue-400 shadow-xs' : 'bg-white hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="h-4 w-4 text-blue-600 rounded"
                      />
                      <div className="flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-800">{item.title || item.document_name}</p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_BADGES[item.status] || 'bg-gray-100 text-gray-700'}`}>
                            {STATUS_LABELS[item.status] || item.status}
                          </span>
                        </div>
                        {item.description && (
                          <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  id="doc-request-create"
                  onClick={handleCreateDraft}
                  disabled={loading || selected.length === 0 || !canRequestDocuments}
                  title={requestDisabledReason || 'Gerar rascunho da solicitacao'}
                  aria-describedby={requestDisabledReason ? 'doc-request-alert' : undefined}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Gerando...' : 'Gerar rascunho'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-medium mb-2">Mensagem a ser enviada pelo WhatsApp (você pode editar antes de disparar):</p>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                rows={9}
                data-gramm="false"
                data-gramm_editor="false"
                data-enable-grammarly="false"
                spellCheck="false"
                autoComplete="off"
                className="w-full border rounded-lg p-3 text-sm mb-4 font-sans text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={sending}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 font-semibold text-sm shadow-xs transition flex items-center gap-1.5"
                >
                  <span>📲</span> {sending ? 'Abrindo WhatsApp...' : 'Confirmar e abrir no WhatsApp'}
                </button>
                <button
                  type="button"
                  onClick={() => { setDraft(null); setSelected([]); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold text-sm transition"
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


