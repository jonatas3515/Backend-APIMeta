import { useState } from 'react';

export default function ConsentItem({ consent, onRevoke, canManage }) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  async function confirmRevoke() {
    setLoading(true);
    await onRevoke(consent.id);
    setLoading(false);
    setConfirming(false);
  }

  return (
    <div className="border border-nc-gray-200 rounded p-3 bg-white text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-nc-text truncate">{consent.purpose}</p>
          <p className="text-xs text-nc-text-secondary">
            Base: {consent.legalBasis} • Canal: {consent.channel} • Versão: {consent.version}
          </p>
          <p className="text-xs text-nc-text-secondary">
            Criado em: {new Date(consent.createdAt).toLocaleString('pt-BR')}
          </p>
          {consent.revokedAt && (
            <p className="text-xs text-red-600">
              Revogado em: {new Date(consent.revokedAt).toLocaleString('pt-BR')}
            </p>
          )}
          {consent.notes && (
            <p className="text-xs text-nc-text-muted mt-1">Obs: {consent.notes}</p>
          )}
        </div>

        <div>
          {consent.active ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
              Ativo
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 border border-red-200">
              Revogado
            </span>
          )}
        </div>
      </div>

      {canManage && consent.active && (
        <div className="mt-2">
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              aria-label={`Revogar consentimento de ${consent.purpose}`}
              className="text-xs text-red-600 hover:text-red-800 underline"
            >
              Revogar
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-nc-text-secondary">Confirma?</span>
              <button
                type="button"
                onClick={confirmRevoke}
                disabled={loading}
                className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
              >
                {loading ? 'Revogando...' : 'Sim'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="text-nc-text-secondary hover:text-nc-text"
              >
                Não
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
