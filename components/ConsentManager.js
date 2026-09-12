import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import ConsentItem from './ConsentItem';
import ConsentForm from './ConsentForm';

export default function ConsentManager({ clientId, canManage = true }) {
  const [consents, setConsents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchConsents = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson(`/api/consents?clientId=${encodeURIComponent(clientId)}`);
      setConsents(data || []);
    } catch (err) {
      setError('Erro ao carregar consentimentos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (clientId) fetchConsents();
  }, [clientId]);

  async function handleRevoke(id) {
    try {
      await apiJson(`/api/consents/${id}?action=revoke`, { method: 'POST' });
      fetchConsents();
    } catch (err) {
      setError('Erro ao revogar consentimento');
    }
  }

  function handleSuccess() {
    setShowForm(false);
    fetchConsents();
  }

  return (
    <section className="bg-nc-surface rounded-lg border border-nc-gray-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-sm text-nc-text-title">🛡️ Consentimentos (LGPD)</h3>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="text-xs text-nc-yellow hover:underline"
            aria-label={showForm ? 'Cancelar novo consentimento' : 'Registrar novo consentimento'}
          >
            {showForm ? 'Cancelar' : 'Registrar'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="mb-4">
          <ConsentForm
            clientId={clientId}
            onSuccess={handleSuccess}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs mb-3" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-nc-text-muted">Carregando...</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {consents.length > 0 ? (
            consents.map(c => (
              <ConsentItem key={c.id} consent={c} onRevoke={handleRevoke} canManage={canManage} />
            ))
          ) : (
            <p className="text-sm text-nc-text-muted">Nenhum consentimento registrado.</p>
          )}
        </div>
      )}
    </section>
  );
}
