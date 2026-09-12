import { useState, useEffect, useRef } from 'react';
import { apiCall } from '../lib/apiClient';

const FORMATS = [
  { key: 'json', label: 'JSON' },
  { key: 'csv', label: 'CSV' }
];

export default function LgpdExportModal({ clientId, clientName, onClose }) {
  const [format, setFormat] = useState('json');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const modalRef = useRef(null);

  useEffect(() => {
    function handleKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    modalRef.current?.focus();
  }, []);

  async function handleExport() {
    setLoading(true);
    setError(null);

    try {
      const response = await apiCall(`/api/lgpd/export?clientId=${encodeURIComponent(clientId)}&format=${format}`);

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Erro ao exportar dados');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const safeName = (clientName || clientId).toString().replace(/[^a-zA-Z0-9-]/g, '_').slice(0, 30);
      const extension = format === 'csv' ? 'csv' : 'json';
      const filename = `lgpd-export-${safeName}-${timestamp}.${extension}`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setLoading(false);
      onClose();
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Erro ao exportar dados. Tente novamente.');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lgpd-export-title"
    >
      <div
        ref={modalRef}
        tabIndex="-1"
        className="bg-nc-white rounded-lg shadow-2xl w-full max-w-md outline-none"
      >
        <div className="p-4 border-b border-nc-gray-200">
          <h2 id="lgpd-export-title" className="text-lg font-bold text-nc-text-title">
            Exportar dados (LGPD)
          </h2>
          <p className="text-sm text-nc-text-secondary mt-1">
            Escolha o formato para baixar os dados pessoais do titular.
          </p>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-sm text-nc-text mb-2">Formato do arquivo</p>
            <div className="flex gap-3" role="radiogroup" aria-label="Formato de exportação">
              {FORMATS.map(f => (
                <label
                  key={f.key}
                  className={`flex-1 cursor-pointer rounded border p-3 text-center text-sm ${format === f.key ? 'border-nc-yellow bg-nc-yellow/10 text-nc-text-title' : 'border-nc-gray-200 text-nc-text-secondary'}`}
                >
                  <input
                    type="radio"
                    name="exportFormat"
                    value={f.key}
                    checked={format === f.key}
                    onChange={() => setFormat(f.key)}
                    className="sr-only"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm" role="alert">
              {error}
            </div>
          )}

          <p className="text-xs text-nc-text-muted">
            O download será iniciado no navegador. Os dados devem ser tratados conforme a LGPD.
          </p>
        </div>

        <div className="p-4 border-t border-nc-gray-200 flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded border border-nc-gray-200 text-nc-text text-sm hover:bg-nc-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={loading}
            className="px-4 py-2 rounded bg-nc-yellow text-nc-black text-sm font-medium hover:bg-nc-yellow-600 disabled:opacity-50"
          >
            {loading ? 'Exportando...' : 'Exportar'}
          </button>
        </div>
      </div>
    </div>
  );
}
