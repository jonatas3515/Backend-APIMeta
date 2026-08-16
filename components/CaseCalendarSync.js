import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

export default function CaseCalendarSync({ eventId, table = 'cases', deadlineDate, title }) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState(null);

  const provider = 'google';

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const headers = await getAuthHeaders();

        const [{ data: integrationData }, { data: statusData }] = await Promise.all([
          axios.get('/api/calendar-integrations', { headers }),
          axios.get(`/api/calendar-integrations/sync-status?event_id=${eventId}&internal_table=${table}`, { headers })
        ]);

        if (!mounted) return;

        const google = (integrationData.integrations || []).find(
          (i) => i.provider === 'google' && i.is_active
        );
        setConnected(!!google);
        setStatus(statusData);
      } catch (err) {
        console.error('[CASE-CALENDAR-SYNC] Erro ao carregar:', err);
      }
    };

    load();
    return () => { mounted = false; };
  }, [eventId, table]);

  const handleConnect = () => {
    window.location.href = '/api/calendar-integrations/connect?provider=google';
  };

  const handleSync = async () => {
    if (!eventId) return;
    setLoading(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.post(
        '/api/calendar-integrations/sync-event',
        {
          event_id: eventId,
          internal_table: table,
          provider,
          action: 'sync'
        },
        { headers }
      );

      setStatus({
        synced: true,
        external_event_id: data.external_event_id,
        synced_at: new Date().toISOString(),
        last_sync_status: 'success'
      });
      setMessage({ type: 'success', text: `Sincronizado com Google Calendar em ${new Date().toLocaleString('pt-BR')}` });
    } catch (err) {
      const text = err.response?.data?.error || err.message || 'Erro ao sincronizar';
      setMessage({ type: 'error', text });
      console.error('[CASE-CALENDAR-SYNC] Erro ao sincronizar:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId) return;
    if (!confirm('Deseja remover este prazo/evento do Google Calendar? O evento interno não será apagado.')) return;
    setLoading(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      await axios.post(
        '/api/calendar-integrations/sync-event',
        {
          event_id: eventId,
          internal_table: table,
          provider,
          action: 'delete'
        },
        { headers }
      );

      setStatus(null);
      setMessage({ type: 'success', text: 'Removido do Google Calendar' });
    } catch (err) {
      const text = err.response?.data?.error || err.message || 'Erro ao remover';
      setMessage({ type: 'error', text });
      console.error('[CASE-CALENDAR-SYNC] Erro ao remover:', err);
    } finally {
      setLoading(false);
    }
  };

  const isSynced = status && status.synced;
  const statusLabel = isSynced
    ? `Sincronizado${status.synced_at ? ` em ${new Date(status.synced_at).toLocaleString('pt-BR')}` : ''}`
    : 'Não sincronizado';

  return (
    <div className="inline-flex flex-col gap-1">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-gray-500">📅 {statusLabel}</span>
        {!connected ? (
          <button
            onClick={handleConnect}
            className="text-blue-600 hover:text-blue-800 font-medium"
            title="Conectar Google Calendar para sincronizar"
          >
            Conectar Google Calendar
          </button>
        ) : isSynced ? (
          <>
            <button
              onClick={handleSync}
              disabled={loading}
              className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
              title="Atualizar no Google Calendar"
            >
              {loading ? 'Sincronizando...' : 'Atualizar'}
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            >
              Remover
            </button>
          </>
        ) : (
          <button
            onClick={handleSync}
            disabled={loading || !deadlineDate}
            className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
            title={!deadlineDate ? 'Prazo sem data definida' : 'Sincronizar prazo com Google Calendar'}
          >
            {loading ? 'Sincronizando...' : 'Sincronizar com Google Calendar'}
          </button>
        )}
      </div>

      {message && (
        <div
          className={`text-xs px-2 py-1 rounded ${
            message.type === 'error'
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
