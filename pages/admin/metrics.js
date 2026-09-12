import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import { apiJson } from '../../lib/apiClient';
import { apiCall } from '../../lib/apiClient';
import Link from 'next/link';

export default function AdminMetrics() {
  const { profile, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState([]);
  const [collectedAt, setCollectedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) return;

    fetchMetrics();
  }, [authLoading, isAdmin]);

  async function fetchMetrics() {
    setLoading(true);
    setError(null);
    try {
      const data = await apiJson('/api/metrics?format=json');
      setCollectedAt(data.collectedAt);
      const rows = Object.entries(data.metrics || {}).map(([key, value]) => ({
        metric: key,
        value: Number(value) || 0
      }));
      setMetrics(rows.sort((a, b) => a.metric.localeCompare(b.metric)));
    } catch (err) {
      setError(err.message || 'Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  }

  async function downloadCsv() {
    try {
      const response = await apiCall('/api/metrics?format=csv');
      if (!response.ok) throw new Error('Erro ao baixar CSV');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
      const link = document.createElement('a');
      link.href = url;
      link.download = `metrics-${timestamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Erro ao baixar CSV');
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-nc-white text-nc-text">
        <p>Carregando...</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-nc-white text-nc-text p-6">
        <h1 className="text-xl font-bold mb-2">Acesso negado</h1>
        <p className="mb-4">Apenas administradores podem acessar esta página.</p>
        <Link href="/" className="text-nc-yellow hover:underline">
          Voltar ao início
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-nc-white text-nc-text p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-nc-text-title">Métricas</h1>
            {collectedAt && (
              <p className="text-sm text-nc-text-secondary mt-1">
                Coletado em: {new Date(collectedAt).toLocaleString('pt-BR')}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={fetchMetrics}
              disabled={loading}
              className="px-4 py-2 bg-nc-gray-100 text-nc-text rounded hover:bg-nc-gray-200 disabled:opacity-50"
            >
              {loading ? 'Atualizando...' : 'Atualizar'}
            </button>
            <button
              onClick={downloadCsv}
              className="px-4 py-2 bg-nc-yellow text-nc-black rounded hover:bg-nc-yellow-600"
            >
              Exportar CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded" role="alert">
            {error}
          </div>
        )}

        {loading && metrics.length === 0 ? (
          <p className="text-nc-text-secondary">Carregando métricas...</p>
        ) : (
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-nc-gray-100 border-b">
                <tr>
                  <th className="text-left p-3 font-semibold">Métrica</th>
                  <th className="text-right p-3 font-semibold">Valor</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((row) => (
                  <tr key={row.metric} className="border-b last:border-0 hover:bg-nc-gray-50">
                    <td className="p-3 font-mono text-nc-text-secondary">{row.metric}</td>
                    <td className="p-3 text-right font-medium">{row.value}</td>
                  </tr>
                ))}
                {metrics.length === 0 && (
                  <tr>
                    <td colSpan="2" className="p-6 text-center text-nc-text-secondary">
                      Nenhuma métrica disponível.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
