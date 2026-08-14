import { useState } from 'react';

export default function ExportButtons({ onPdf, onExcel, disabled = false, className = '' }) {
  const [loading, setLoading] = useState(null);

  const handle = async (type, fn) => {
    setLoading(type);
    try {
      await fn();
    } catch (err) {
      console.error(`[EXPORT] Erro ao gerar ${type}:`, err);
      alert(`Não foi possível exportar. Tente novamente.\nErro: ${err.message || 'desconhecido'}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {onPdf && (
        <button
          onClick={() => handle('pdf', onPdf)}
          disabled={disabled || loading}
          className="px-3 py-2 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === 'pdf' ? '⏳ Gerando PDF...' : '📄 Exportar PDF'}
        </button>
      )}
      {onExcel && (
        <button
          onClick={() => handle('excel', onExcel)}
          disabled={disabled || loading}
          className="px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading === 'excel' ? '⏳ Gerando Excel...' : '📊 Exportar Excel'}
        </button>
      )}
    </div>
  );
}
