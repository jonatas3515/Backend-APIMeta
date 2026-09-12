import { useState } from 'react';
import WhatsAppFunnelDashboard from '../../components/WhatsAppFunnelDashboard';

export default function WhatsAppFunnelPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-xl font-bold text-nc-text-title mb-4">Funil e Métricas de WhatsApp</h1>

      <div className="flex flex-wrap gap-2 mb-4">
        <div>
          <label htmlFor="funnel-from" className="block text-xs text-nc-text-secondary mb-1">De</label>
          <input
            id="funnel-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="nc-input text-xs"
          />
        </div>
        <div>
          <label htmlFor="funnel-to" className="block text-xs text-nc-text-secondary mb-1">Até</label>
          <input
            id="funnel-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="nc-input text-xs"
          />
        </div>
      </div>

      <WhatsAppFunnelDashboard from={from} to={to} />
    </div>
  );
}
