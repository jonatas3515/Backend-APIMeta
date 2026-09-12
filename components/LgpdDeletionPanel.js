import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';

export default function LgpdDeletionPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [executing, setExecuting] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supaError } = await import('../lib/supabaseClient').then(m => m.supabase)
        .from('anonymized_data')
        .select('id, conversation_id, mode, reason, notes, status, created_at, executed_at')
        .order('created_at', { ascending: false });

      if (supaError) throw supaError;
      setRequests(data || []);
    } catch (err) {
      setError('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  async function handleExecute(requestId) {
    setExecuting(requestId);
    setError(null);

    try {
      await apiJson('/api/lgpd/deletion-execute', {
        method: 'POST',
        body: JSON.stringify({ requestId, confirm: true })
      });
      fetchRequests();
    } catch (err) {
      setError(err.message || 'Erro ao executar');
    } finally {
      setExecuting(null);
    }
  }

  return (
    <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4 mt-4">
      <h3 className="font-bold text-sm text-nc-text-title mb-3">🗑️ Solicitações de Exclusão/Anonimização (LGPD)</h3>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs mb-3" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-nc-text-muted">Carregando...</p>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {requests.length > 0 ? (
            requests.map(r => (
              <div key={r.id} className="border border-nc-gray-200 rounded p-3 bg-white text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-nc-text">{r.mode === 'full' ? 'Exclusão completa' : 'Anonimização'}</p>
                    <p className="text-xs text-nc-text-secondary">Cliente: {r.conversation_id}</p>
                    <p className="text-xs text-nc-text-secondary">Motivo: {r.reason}</p>
                    <p className="text-xs text-nc-text-secondary">
                      Criado em: {new Date(r.created_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${
                    r.status === 'pending'
                      ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                      : 'bg-green-100 text-green-700 border-green-200'
                  }`}>
                    {r.status === 'pending' ? 'Pendente' : 'Concluído'}
                  </span>
                </div>

                {r.status === 'pending' && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => handleExecute(r.id)}
                      disabled={executing === r.id}
                      className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                      aria-label={`Executar solicitação ${r.id}`}
                    >
                      {executing === r.id ? 'Executando...' : 'Executar'}
                    </button>
                  </div>
                )}
              </div>
            ))
          ) : (
            <p className="text-sm text-nc-text-muted">Nenhuma solicitação encontrada.</p>
          )}
        </div>
      )}
    </section>
  );
}
