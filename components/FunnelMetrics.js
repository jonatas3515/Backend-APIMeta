import { useState, useEffect } from 'react';
import { apiCall } from '../lib/apiClient';\nimport { supabase } from '../lib/supabaseClient';\n// import { getAuthHeaders } from '../lib/api';';
import { supabase } from '../lib/supabaseClient';

export default function FunnelMetrics() {
  const [metrics, setMetrics] = useState(null);
  const [conversions, setConversions] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMetrics();
  }, []);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/funnel?action=metrics', { headers: await getAuthHeaders() });
      if (!response.ok) throw new Error('Erro ao buscar métricas');

      const data = await response.json();
      setMetrics(data.metrics);
      setConversions(data.conversions);
    } catch (error) {
      console.error('[METRICS] Erro:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Carregando métricas...</div>;
  }

  const totalLeads = metrics?.reduce((sum, m) => sum + m.total_count, 0) || 0;
  const totalWithCase = metrics?.reduce((sum, m) => sum + m.with_case_count, 0) || 0;
  const totalHumanMode = metrics?.reduce((sum, m) => sum + m.human_mode_count, 0) || 0;

  return (
    <div className="p-6 bg-white rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6">📊 Métricas do Funil</h2>

      {/* KPIs Principais */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-gray-600">Total de Leads</p>
          <p className="text-3xl font-bold text-blue-600">{totalLeads}</p>
        </div>
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-gray-600">Com Caso Jurídico</p>
          <p className="text-3xl font-bold text-green-600">{totalWithCase}</p>
          <p className="text-xs text-gray-500 mt-1">
            {totalLeads > 0 ? `${((totalWithCase / totalLeads) * 100).toFixed(1)}%` : '0%'}
          </p>
        </div>
        <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-sm text-gray-600">Em Atendimento Humano</p>
          <p className="text-3xl font-bold text-orange-600">{totalHumanMode}</p>
          <p className="text-xs text-gray-500 mt-1">
            {totalLeads > 0 ? `${((totalHumanMode / totalLeads) * 100).toFixed(1)}%` : '0%'}
          </p>
        </div>
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-gray-600">Tempo Médio Total</p>
          <p className="text-3xl font-bold text-purple-600">
            {metrics && metrics.length > 0
              ? (metrics.reduce((sum, m) => sum + (parseFloat(m.avg_days_in_stage) || 0), 0) / metrics.length).toFixed(1)
              : '0'}
            d
          </p>
        </div>
      </div>

      {/* Tabela de Métricas por Etapa */}
      <div className="mb-8">
        <h3 className="text-lg font-bold mb-4">Contagem por Etapa</h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-3 text-left">Etapa</th>
                <th className="border p-3 text-center">Total</th>
                <th className="border p-3 text-center">Com Caso</th>
                <th className="border p-3 text-center">Humano</th>
                <th className="border p-3 text-center">Tempo Médio (dias)</th>
              </tr>
            </thead>
            <tbody>
              {metrics?.map((metric, idx) => (
                <tr key={idx} className="border-b hover:bg-gray-50">
                  <td className="border p-3 font-semibold">{metric.funnel_stage}</td>
                  <td className="border p-3 text-center text-lg font-bold">{metric.total_count}</td>
                  <td className="border p-3 text-center text-green-600">{metric.with_case_count}</td>
                  <td className="border p-3 text-center text-orange-600">{metric.human_mode_count}</td>
                  <td className="border p-3 text-center">{metric.avg_days_in_stage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Taxa de Conversão */}
      <div>
        <h3 className="text-lg font-bold mb-4">Taxa de Conversão</h3>
        <div className="space-y-3">
          {conversions?.map((conv, idx) => (
            <div key={idx} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold">{conv.funnel_stage}</span>
                <span className="text-sm text-gray-600">
                  {conv.count} conversas ({conv.conversion_from_first}% do total)
                </span>
              </div>
              <div className="w-full bg-gray-300 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(conv.conversion_from_first || 0, 100)}%` }}
                />
              </div>
              {conv.drop_rate_from_previous && (
                <p className="text-xs text-red-600 mt-1">
                  ⚠️ Queda de {Math.abs(conv.drop_rate_from_previous).toFixed(1)}% da etapa anterior
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
