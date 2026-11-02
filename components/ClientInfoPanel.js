import { useState, useEffect } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';

// TODO (órfão): componente construído para histórico de client_info_requests, mas não integrado a nenhuma rota.
// Candidato a integração futura ou remoção após definição do fluxo de experiência do cliente.
export default function ClientInfoPanel({ conversationId, caseId }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (conversationId) {
      fetchRequests();
    }
  }, [conversationId]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const data = await apiJson(`/api/client-info?conversation_id=${conversationId}`, { method: 'GET' });
      setRequests(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('[CLIENT-INFO] Erro ao buscar requisições:', error);
    } finally {
      setLoading(false);
    }
  };

  const getIntentLabel = (intent) => {
    switch (intent) {
      case 'summary':
        return '📝 Resumo';
      case 'status':
        return '📊 Status';
      case 'documents':
        return '📄 Documentos';
      default:
        return intent;
    }
  };

  const getIntentColor = (intent) => {
    switch (intent) {
      case 'summary':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'status':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'documents':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      default:
        return 'bg-gray-100 text-gray-100 border-[#2A2D2F]';
    }
  };

  return (
    <div className="w-full bg-[#1B1D1E] rounded-lg shadow p-4">
      <h3 className="font-bold text-lg mb-3">💬 Comandos do Cliente</h3>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma requisição de informação ainda</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {requests.map(req => (
            <div key={req.id} className="border rounded-lg p-3 bg-[#181A1B]">
              <div className="flex justify-between items-start mb-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded border ${getIntentColor(req.intent_type)}`}>
                  {getIntentLabel(req.intent_type)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(req.created_at).toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="mb-2">
                <p className="text-xs font-semibold text-gray-300 mb-1">Pergunta do cliente:</p>
                <p className="text-xs text-gray-400 italic">"{req.request_text}"</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-300 mb-1">Resposta enviada:</p>
                <div className="text-xs text-gray-300 bg-[#1B1D1E] p-2 rounded border border-gray-800 max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {req.response_text}
                </div>
              </div>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(req.response_text);
                  alert('Resposta copiada!');
                }}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                📋 Copiar resposta
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

