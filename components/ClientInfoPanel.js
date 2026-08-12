import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { getAuthHeaders } from '../lib/api';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
      const response = await fetch(`/api/client-info?conversation_id=${conversationId}`, { headers: await getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setRequests(data);
      }
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
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow p-4">
      <h3 className="font-bold text-lg mb-3">💬 Comandos do Cliente</h3>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma requisição de informação ainda</p>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {requests.map(req => (
            <div key={req.id} className="border rounded-lg p-3 bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <span className={`text-xs font-semibold px-2 py-1 rounded border ${getIntentColor(req.intent_type)}`}>
                  {getIntentLabel(req.intent_type)}
                </span>
                <span className="text-xs text-gray-500">
                  {new Date(req.created_at).toLocaleString('pt-BR')}
                </span>
              </div>

              <div className="mb-2">
                <p className="text-xs font-semibold text-gray-700 mb-1">Pergunta do cliente:</p>
                <p className="text-xs text-gray-600 italic">"{req.request_text}"</p>
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-700 mb-1">Resposta enviada:</p>
                <div className="text-xs text-gray-700 bg-white p-2 rounded border border-gray-200 max-h-32 overflow-y-auto whitespace-pre-wrap">
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
