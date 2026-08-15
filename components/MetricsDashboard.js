import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import useAreaFilter from '../hooks/useAreaFilter';
import ExportButtons from './ExportButtons';
import { exportMetricsPdf, exportMetricsExcel } from '../lib/export';

export default function MetricsDashboard({ conversations }) {
  const { selectedArea } = useAreaFilter();
  const [metrics, setMetrics] = useState({
    totalConversations: 0,
    totalLeads: 0,
    totalActiveClients: 0,
    avgResponseTime: 0,
    byArea: {},
    byFunnel: {},
    byMunicipality: {},
    conversionRate: 0
  });

  useEffect(() => {
    calculateMetrics();
  }, [conversations, selectedArea]);

  const filteredConversations = selectedArea
    ? (conversations || []).filter((c) => c.legal_area === selectedArea)
    : (conversations || []);

  const calculateMetrics = () => {
    if (!filteredConversations || filteredConversations.length === 0) {
      setMetrics({
        totalConversations: 0,
        totalLeads: 0,
        totalActiveClients: 0,
        avgResponseTime: 0,
        byArea: {},
        byFunnel: {},
        byMunicipality: {},
        conversionRate: 0
      });
      return;
    }

    const total = filteredConversations.length;
    const leads = filteredConversations.filter(c => c.client_status === 'lead').length;
    const activeClients = filteredConversations.filter(c => c.client_status === 'cliente_ativo').length;
    const converted = filteredConversations.filter(c => c.client_status === 'cliente_ativo' || c.client_status === 'cliente_antigo').length;

    const byArea = {};
    const byFunnel = {};
    const byMunicipality = {};

    filteredConversations.forEach(conv => {
      const area = conv.legal_area || 'Não classificado';
      byArea[area] = (byArea[area] || 0) + 1;

      const funnel = conv.funnel_stage || 'intake';
      byFunnel[funnel] = (byFunnel[funnel] || 0) + 1;

      const municipality = conv.municipality || 'Não informado';
      byMunicipality[municipality] = (byMunicipality[municipality] || 0) + 1;
    });

    setMetrics({
      totalConversations: total,
      totalLeads: leads,
      totalActiveClients: activeClients,
      avgResponseTime: 0, // Precisa calcular com base nas mensagens
      byArea,
      byFunnel,
      byMunicipality,
      conversionRate: total > 0 ? Math.round((converted / total) * 100) : 0
    });
  };

  const funnelLabels = {
    intake: '📥 Intake',
    qualificacao: '✅ Qualificação',
    proposta: '💰 Proposta',
    contrato: '📝 Contrato',
    andamento: '⚙️ Andamento',
    pos_caso: '🏁 Pós-caso'
  };

  const areaLabels = {
    trabalhista: '⚖️ Trabalhista',
    previdenciario: '🏛️ Previdenciário',
    civel: '📄 Cível',
    consumidor: '🛒 Consumidor',
    administrativo: '🏢 Administrativo'
  };

  const handleExportPdf = () => {
    const exportData = {
      summary: {
        total_cases: metrics.totalConversations,
        areas_count: Object.keys(metrics.byArea).length,
        municipalities_count: Object.keys(metrics.byMunicipality).length,
        agencies_count: 0
      },
      casesByArea: Object.entries(metrics.byArea).map(([area, count]) => ({ area, count })),
      casesByType: [],
      casesByLocation: Object.entries(metrics.byMunicipality).map(([municipality, count]) => ({ municipality, count, agency: '', areas: {} })),
      funnelData: Object.entries(metrics.byFunnel).map(([label, count]) => ({
        label,
        count,
        conversionRate: metrics.conversionRate
      })),
      timeSeriesData: [],
      filters: {}
    };
    return exportMetricsPdf(exportData);
  };

  const handleExportExcel = () => {
    const exportData = {
      summary: {
        total_cases: metrics.totalConversations,
        areas_count: Object.keys(metrics.byArea).length,
        municipalities_count: Object.keys(metrics.byMunicipality).length,
        agencies_count: 0
      },
      casesByArea: Object.entries(metrics.byArea).map(([area, count]) => ({ area, count })),
      casesByType: [],
      casesByLocation: Object.entries(metrics.byMunicipality).map(([municipality, count]) => ({ municipality, count, agency: '', areas: {} })),
      funnelData: Object.entries(metrics.byFunnel).map(([label, count]) => ({
        label,
        count,
        conversionRate: metrics.conversionRate
      })),
      timeSeriesData: []
    };
    return exportMetricsExcel(exportData);
  };

  return (
    <div className="h-full w-full overflow-y-auto p-4 md:p-6 bg-nc-surface">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
        <h2 className="text-2xl font-bold text-nc-text-title">📊 Métricas do Escritório</h2>
        <ExportButtons
          onPdf={handleExportPdf}
          onExcel={handleExportExcel}
          disabled={metrics.totalConversations === 0}
        />
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="nc-card p-4">
          <p className="text-sm text-nc-text-secondary">Total de Conversas</p>
          <p className="text-2xl font-bold text-nc-text">{metrics.totalConversations}</p>
        </div>
        <div className="nc-card p-4">
          <p className="text-sm text-nc-text-secondary">Leads</p>
          <p className="text-2xl font-bold text-nc-text">{metrics.totalLeads}</p>
        </div>
        <div className="nc-card p-4">
          <p className="text-sm text-nc-text-secondary">Clientes Ativos</p>
          <p className="text-2xl font-bold text-nc-text">{metrics.totalActiveClients}</p>
        </div>
        <div className="nc-card p-4">
          <p className="text-sm text-nc-text-secondary">Taxa de Conversão</p>
          <p className="text-2xl font-bold text-nc-yellow">{metrics.conversionRate}%</p>
        </div>
      </div>

      {/* Gráficos simples */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <div className="nc-card p-4">
          <h3 className="font-bold text-nc-text-title mb-4">Por Área Jurídica</h3>
          <div className="space-y-2">
            {Object.entries(metrics.byArea).map(([area, count]) => (
              <div key={area} className="flex justify-between items-center">
                <span className="text-sm text-nc-text">{areaLabels[area] || area}</span>
                <span className="bg-nc-gray-100 text-nc-text border border-nc-gray-200 text-xs px-2 py-1 rounded-full font-medium">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="nc-card p-4">
          <h3 className="font-bold text-nc-text-title mb-4">Por Etapa do Funil</h3>
          <div className="space-y-2">
            {Object.entries(metrics.byFunnel).map(([funnel, count]) => (
              <div key={funnel} className="flex justify-between items-center">
                <span className="text-sm text-nc-text">{funnelLabels[funnel] || funnel}</span>
                <span className="bg-nc-gray-100 text-nc-text border border-nc-gray-200 text-xs px-2 py-1 rounded-full font-medium">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="nc-card p-4 col-span-2">
          <h3 className="font-bold text-nc-text-title mb-4">Por Município</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {Object.entries(metrics.byMunicipality).map(([municipality, count]) => (
              <div key={municipality} className="flex justify-between items-center p-2 bg-nc-gray-50 rounded">
                <span className="text-sm text-nc-text">{municipality}</span>
                <span className="bg-nc-white text-nc-text border border-nc-gray-300 text-xs px-2 py-1 rounded-full font-medium">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
