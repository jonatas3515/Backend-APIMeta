import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import WhatsAppMetricsChart from './WhatsAppMetricsChart';
import WhatsAppFunnelEvents from './WhatsAppFunnelEvents';

const STAGES = [
  { id: 'first_contact', label: 'Primeiro contato' },
  { id: 'qualification', label: 'Qualificação' },
  { id: 'proposal_sent', label: 'Proposta enviada' },
  { id: 'negotiation', label: 'Negociação' },
  { id: 'closed', label: 'Fechado' },
  { id: 'lost', label: 'Perdido' }
];

export default function WhatsAppFunnelDashboard({ from, to }) {
  const [metrics, setMetrics] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchData() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);

      const [metricsData, history] = await Promise.all([
        apiJson(`/api/funnel/whatsapp-metrics?${params.toString()}`, { method: 'GET' }),
        apiJson('/api/funnel?action=history&limit=200', { method: 'GET' })
      ]);

      setMetrics(metricsData);
      const whatsappEvents = (history || []).filter(
        h => STAGES.some(s => s.id === h.to_stage)
      );
      setEvents(whatsappEvents);
    } catch (err) {
      setError('Erro ao carregar dados do funil');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
  }, [from, to]);

  if (loading) {
    return <p className="p-4 text-sm text-nc-text-muted" role="status">Carregando funil de WhatsApp...</p>;
  }

  return (
    <div className="space-y-6 p-4" aria-label="Dashboard de funil e métricas de WhatsApp">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm" role="alert">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white border border-nc-gray-200 rounded">
          <p className="text-xs text-nc-text-secondary">Conversas</p>
          <p className="text-2xl font-bold text-nc-text">{metrics?.totalConversations || 0}</p>
        </div>
        <div className="p-4 bg-white border border-nc-gray-200 rounded">
          <p className="text-xs text-nc-text-secondary">Mensagens</p>
          <p className="text-2xl font-bold text-nc-text">{metrics?.totalMessages || 0}</p>
        </div>
        <div className="p-4 bg-white border border-nc-gray-200 rounded">
          <p className="text-xs text-nc-text-secondary">Conversão first → closed</p>
          <p className="text-2xl font-bold text-nc-text">{metrics?.conversionRate || 0}%</p>
        </div>
      </div>

      <div className="p-4 bg-white border border-nc-gray-200 rounded">
        <h2 className="text-sm font-bold text-nc-text-title mb-3">Distribuição de eventos</h2>
        <WhatsAppMetricsChart data={metrics?.eventDistribution || {}} labels={STAGES} />
      </div>

      <div className="p-4 bg-white border border-nc-gray-200 rounded">
        <h2 className="text-sm font-bold text-nc-text-title mb-3">Volume de mensagens por dia</h2>
        <WhatsAppMetricsChart
          data={(metrics?.volumeByDay || []).reduce((acc, d) => {
            acc[d.date] = d.inbound + d.outbound;
            return acc;
          }, {})}
          labels={[]}
        />
      </div>

      <WhatsAppFunnelEvents events={events} />
    </div>
  );
}
