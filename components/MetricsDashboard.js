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
    <div className="h-full overflow-y-auto p-6 bg-nc-surface">
      <h2 className="text-2xl font-bold text-nc-text-title mb-6">📊 Métricas do Escritório</h2>

      {/* Cards principais */}
      <div className="grid grid-cols-4 gap-4 mb-6">
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
      <div className="grid grid-cols-2 gap-6">
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
          <div className="grid grid-cols-2 gap-2">
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
