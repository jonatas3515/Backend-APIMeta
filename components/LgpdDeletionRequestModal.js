import { useEffect, useRef, useState } from 'react';

const MODES = [
  { key: 'anonymized', label: 'Anonimização (manter relações)' },
  { key: 'full', label: 'Exclusão completa (remover conteúdo)' }
];

const REASONS = [
  { key: 'lgpd_request', label: 'Solicitação do titular (LGPD)' },
  { key: 'client_request', label: 'Pedido do cliente' },
  { key: 'internal_review', label: 'Revisão interna' },
  { key: 'other', label: 'Outro' }
];

export default function LgpdDeletionRequestModal({ clientId, onClose }) {
  const [mode, setMode] = useState('anonymized');
  const [reason, setReason] = useState('lgpd_request');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const modalRef = useRef(null);

  useEffect(() => {
    modalRef.current?.focus();

    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/lgpd/deletion-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, mode, reason, notes })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Erro ao registrar solicitação');
      }

      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Erro ao registrar solicitação');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Solicitar exclusão ou anonimização de dados"
    >
      <div
        ref={modalRef}
        tabIndex="-1"
        className="bg-white rounded-lg shadow-xl w-full max-w-md p-4 outline-none"
      >
        <h2 className="text-lg font-bold text-nc-text-title mb-3">Solicitar Exclusão/Anonimização (LGPD)</h2>

        {success ? (
          <div className="text-center py-4">
            <p className="text-green-700 font-medium mb-2">Solicitação registrada com sucesso.</p>
            <button onClick={onClose} className="nc-btn-primary text-xs py-1.5">Fechar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3 text-sm">
            <div>
              <label htmlFor="deletion-mode" className="block text-xs text-nc-text-secondary mb-1">Modo</label>
              <select
                id="deletion-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                className="nc-input text-xs w-full"
              >
                {MODES.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="deletion-reason" className="block text-xs text-nc-text-secondary mb-1">Motivo</label>
              <select
                id="deletion-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="nc-input text-xs w-full"
              >
                {REASONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="deletion-notes" className="block text-xs text-nc-text-secondary mb-1">Observações</label>
              <textarea
                id="deletion-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="nc-input text-xs w-full"
                rows="3"
                maxLength="500"
              />
            </div>

            {mode === 'full' && (
              <div className="p-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded text-xs" role="alert">
                A exclusão completa só é permitida se não houver casos ativos vinculados.
              </div>
            )}

            {error && (
              <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs" role="alert">
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={loading}
                className="nc-btn-primary text-xs py-1.5 flex-1 disabled:opacity-50"
              >
                {loading ? 'Registrando...' : 'Confirmar Solicitação'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="nc-btn text-xs py-1.5"
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
