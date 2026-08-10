import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function MetricsDashboard({ conversations }) {
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
  }, [conversations]);

  const calculateMetrics = () => {
    if (!conversations || conversations.length === 0) {
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

    const total = conversations.length;
    const leads = conversations.filter(c => c.client_status === 'lead').length;
    const activeClients = conversations.filter(c => c.client_status === 'cliente_ativo').length;
    const converted = conversations.filter(c => c.client_status === 'cliente_ativo' || c.client_status === 'cliente_antigo').length;

    const byArea = {};
    const byFunnel = {};
    const byMunicipality = {};

    conversations.forEach(conv => {
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

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">📊 Métricas do Escritório</h2>

      {/* Cards principais */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-500">Total de Conversas</p>
          <p className="text-2xl font-bold text-blue-600">{metrics.totalConversations}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-500">Leads</p>
          <p className="text-2xl font-bold text-yellow-600">{metrics.totalLeads}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-500">Clientes Ativos</p>
          <p className="text-2xl font-bold text-green-600">{metrics.totalActiveClients}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-500">Taxa de Conversão</p>
          <p className="text-2xl font-bold text-purple-600">{metrics.conversionRate}%</p>
        </div>
      </div>

      {/* Gráficos simples */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">Por Área Jurídica</h3>
          <div className="space-y-2">
            {Object.entries(metrics.byArea).map(([area, count]) => (
              <div key={area} className="flex justify-between items-center">
                <span className="text-sm">{areaLabels[area] || area}</span>
                <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-semibold">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <h3 className="font-bold text-gray-800 mb-4">Por Etapa do Funil</h3>
          <div className="space-y-2">
            {Object.entries(metrics.byFunnel).map(([funnel, count]) => (
              <div key={funnel} className="flex justify-between items-center">
                <span className="text-sm">{funnelLabels[funnel] || funnel}</span>
                <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-semibold">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow border border-gray-200 col-span-2">
          <h3 className="font-bold text-gray-800 mb-4">Por Município</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(metrics.byMunicipality).map(([municipality, count]) => (
              <div key={municipality} className="flex justify-between items-center p-2 bg-gray-50 rounded">
                <span className="text-sm">{municipality}</span>
                <span className="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded-full font-semibold">
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
