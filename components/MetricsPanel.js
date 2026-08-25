import { useState, useEffect } from 'react';

// TODO (órfão): componente legado. MetricsDashboard é o componente ativo de métricas.
// Candidato a integração futura ou remoção após confirmação de que não há mais uso.
export default function MetricsPanel() {
  const [casesByArea, setCasesByArea] = useState([]);
  const [casesByType, setCasesByType] = useState([]);
  const [casesByLocation, setCasesByLocation] = useState([]);
  const [funnelData, setFunnelData] = useState([]);
  const [timeSeriesData, setTimeSeriesData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    legal_area: '',
    start_date: '',
    end_date: ''
  });

  useEffect(() => {
    fetchMetrics();
  }, [filters]);

  const fetchMetrics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.legal_area) params.append('legal_area', filters.legal_area);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);

      const [areaRes, typeRes, locRes, funnelRes, timeRes, summaryRes] = await Promise.all([
        fetch(`/api/metrics?action=cases-by-area&${params}`),
        fetch(`/api/metrics?action=cases-by-type&${params}`),
        fetch(`/api/metrics?action=cases-by-location&${params}`),
        fetch(`/api/metrics?action=funnel-conversion&${params}`),
        fetch(`/api/metrics?action=time-series&${params}`),
        fetch(`/api/metrics?action=summary&${params}`)
      ]);

      if (areaRes.ok) setCasesByArea(await areaRes.json());
      if (typeRes.ok) setCasesByType(await typeRes.json());
      if (locRes.ok) setCasesByLocation(await locRes.json());
      if (funnelRes.ok) setFunnelData(await funnelRes.json());
      if (timeRes.ok) setTimeSeriesData(await timeRes.json());
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } catch (error) {
      console.error('[METRICS] Erro ao buscar:', error);
    } finally {
      setLoading(false);
    }
  };

  const getBarWidth = (value, max) => {
    return max > 0 ? (value / max) * 100 : 0;
  };

  return (
    <div className="w-full bg-white rounded-lg shadow p-6">
      <h2 className="text-2xl font-bold mb-4">📊 Inteligência de Demanda</h2>

      {/* Filtros */}
      <div className="grid grid-cols-3 gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
        <input
          type="date"
          value={filters.start_date}
          onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded text-sm"
          placeholder="Data inicial"
        />
        <input
          type="date"
          value={filters.end_date}
          onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          className="px-3 py-2 border border-gray-300 rounded text-sm"
          placeholder="Data final"
        />
        <button
          onClick={() => setFilters({ legal_area: '', start_date: '', end_date: '' })}
          className="px-3 py-2 bg-gray-300 text-gray-700 rounded text-sm font-medium hover:bg-gray-400"
        >
          Limpar Filtros
        </button>
      </div>

      {loading ? (
        <p className="text-center text-gray-500">Carregando métricas...</p>
      ) : (
        <div className="space-y-6">
          {/* Resumo Executivo */}
          {summary && (
            <div className="grid grid-cols-4 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-center">
                <p className="text-3xl font-bold text-blue-600">{summary.total_cases}</p>
                <p className="text-sm text-gray-600">Total de Casos</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-green-600">{summary.areas_count}</p>
                <p className="text-sm text-gray-600">Áreas Jurídicas</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-orange-600">{summary.municipalities_count}</p>
                <p className="text-sm text-gray-600">Municípios</p>
              </div>
              <div className="text-center">
                <p className="text-3xl font-bold text-purple-600">{summary.agencies_count}</p>
                <p className="text-sm text-gray-600">Órgãos</p>
              </div>
            </div>
          )}

          {/* Casos por Área */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-3">📋 Casos por Área Jurídica</h3>
            <div className="space-y-2">
              {casesByArea.length === 0 ? (
                <p className="text-gray-500 text-sm">Sem dados</p>
              ) : (
                casesByArea.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-32 text-sm font-medium truncate">{item.area}</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-blue-500 h-full flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${getBarWidth(item.count, Math.max(...casesByArea.map(x => x.count)))}%` }}
                      >
                        <span className="text-white text-xs font-bold">{item.count}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Casos por Tipo */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-3">🏷️ Casos por Tipo</h3>
            <div className="space-y-2">
              {casesByType.length === 0 ? (
                <p className="text-gray-500 text-sm">Sem dados</p>
              ) : (
                casesByType.slice(0, 10).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-40 text-sm font-medium truncate">{item.type}</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-6 relative overflow-hidden">
                      <div
                        className="bg-green-500 h-full flex items-center justify-end pr-2 transition-all"
                        style={{ width: `${getBarWidth(item.count, Math.max(...casesByType.map(x => x.count)))}%` }}
                      >
                        <span className="text-white text-xs font-bold">{item.count}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Mapa de Calor: Município/Órgão */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-3">🗺️ Distribuição por Município/Órgão</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2 font-semibold">Município</th>
                    <th className="text-left p-2 font-semibold">Órgão</th>
                    <th className="text-right p-2 font-semibold">Casos</th>
                    <th className="text-left p-2 font-semibold">Área Predominante</th>
                  </tr>
                </thead>
                <tbody>
                  {casesByLocation.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center p-4 text-gray-500">Sem dados</td>
                    </tr>
                  ) : (
                    casesByLocation.map((item, idx) => {
                      const topArea = Object.entries(item.areas || {}).sort((a, b) => b[1] - a[1])[0];
                      return (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="p-2">{item.municipality || 'N/A'}</td>
                          <td className="p-2">{item.agency || 'N/A'}</td>
                          <td className="p-2 text-right font-bold text-blue-600">{item.count}</td>
                          <td className="p-2 text-xs">{topArea ? `${topArea[0]} (${topArea[1]})` : 'N/A'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Funil de Conversão */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-3">📈 Funil de Conversão</h3>
            <div className="space-y-3">
              {funnelData.length === 0 ? (
                <p className="text-gray-500 text-sm">Sem dados</p>
              ) : (
                funnelData.map((stage, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <div className="w-40 text-sm font-medium">{stage.label}</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-8 relative overflow-hidden">
                      <div
                        className="bg-purple-500 h-full flex items-center justify-between px-3 transition-all"
                        style={{ width: `${getBarWidth(stage.count, Math.max(...funnelData.map(x => x.count)))}%` }}
                      >
                        <span className="text-white text-xs font-bold">{stage.count}</span>
                        <span className="text-white text-xs font-bold">{stage.conversionRate}%</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Série Temporal */}
          <div className="p-4 border rounded-lg">
            <h3 className="font-bold text-lg mb-3">📅 Evolução Mensal</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2 font-semibold">Mês</th>
                    <th className="text-right p-2 font-semibold">Conversas</th>
                    <th className="text-right p-2 font-semibold">Casos</th>
                    <th className="text-right p-2 font-semibold">Encerrados</th>
                  </tr>
                </thead>
                <tbody>
                  {timeSeriesData.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="text-center p-4 text-gray-500">Sem dados</td>
                    </tr>
                  ) : (
                    timeSeriesData.map((row, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium">{row.month}</td>
                        <td className="p-2 text-right">{row.conversations}</td>
                        <td className="p-2 text-right font-bold text-blue-600">{row.cases}</td>
                        <td className="p-2 text-right font-bold text-green-600">{row.closed}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
