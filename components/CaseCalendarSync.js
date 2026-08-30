import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';
import { safeError } from '../lib/safeLogger';

export default function CaseCalendarSync({
  eventId,
  table = 'cases',
  deadlineDate,
  title,
  internalUpdatedAt
}) {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [message, setMessage] = useState(null);

  const provider = 'google';

  const isOutdated =
    !!internalUpdatedAt &&
    !!status?.synced_at &&
    new Date(internalUpdatedAt) > new Date(status.synced_at);

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
        safeError('calendar_sync_load_error', err, { component: 'CaseCalendarSync' });
      }
    };

    load();
    return () => { mounted = false; };
  }, [eventId, table]);

  const handleConnect = async () => {
    if (loading) return;
    setLoading(true);
    setMessage(null);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.post(
        '/api/calendar-integrations/connect',
        { provider: 'google' },
        { headers }
      );
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setMessage({ type: 'error', text: 'Não foi possível iniciar a conexão com o Google Calendar' });
      }
    } catch (err) {
      safeError('calendar_connect_error', err, { component: 'CaseCalendarSync' });
      setMessage({ type: 'error', text: 'Não foi possível conectar. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (!eventId || loading) return;
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
          action: 'sync'
        },
        { headers }
      );

      setStatus({
        synced: true,
        synced_at: new Date().toISOString(),
        last_sync_status: 'success'
      });
      setMessage({ type: 'success', text: 'Sincronizado com o Google Calendar' });
    } catch (err) {
      safeError('calendar_sync_event_error', err, { component: 'CaseCalendarSync' });
      const statusCode = err.response?.status;
      const serverMessage = err.response?.data?.error;

      if (statusCode === 401 || err.response?.data?.reconnect) {
        setConnected(false);
        setMessage({ type: 'error', text: serverMessage || 'Conexão com o Google Calendar expirou. Conecte novamente.' });
      } else {
        setMessage({ type: 'error', text: serverMessage || 'Não foi possível sincronizar com o Google Calendar. Tente novamente.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!eventId || loading) return;
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
      safeError('calendar_delete_event_error', err, { component: 'CaseCalendarSync' });
      const statusCode = err.response?.status;
      const serverMessage = err.response?.data?.error;

      if (statusCode === 401 || err.response?.data?.reconnect) {
        setConnected(false);
        setMessage({ type: 'error', text: serverMessage || 'Conexão com o Google Calendar expirou. Conecte novamente.' });
      } else {
        setMessage({ type: 'error', text: serverMessage || 'Não foi possível remover do Google Calendar. Tente novamente.' });
      }
    } finally {
      setLoading(false);
    }
  };

  const formatSyncDate = (value) => {
    try {
      const date = new Date(value);
      return isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
    } catch {
      return value;
    }
  };

  const renderStatus = () => {
    if (!status || !status.synced) {
      return (
        <div className="text-xs text-gray-600" data-testid="sync-status">
          Ainda não sincronizado com o Google Calendar.
        </div>
      );
    }

    if (isOutdated) {
      return (
        <div className="text-xs" data-testid="sync-status">
          <div className="font-semibold text-orange-700" data-testid="outdated-warning">
            Google Calendar desatualizado
          </div>
          <div className="text-gray-700 mt-0.5">
            Este item foi alterado no sistema depois da última sincronização com o Google Calendar.
          </div>
          <div className="text-gray-500 mt-0.5">
            Última sincronização: {formatSyncDate(status.synced_at)}
          </div>
        </div>
      );
    }

    return (
      <div className="text-xs text-gray-600" data-testid="sync-status">
        <div>
          Última sincronização com o Google Calendar: {formatSyncDate(status.synced_at)}
        </div>
        <div className="text-gray-500 mt-0.5">
          Alterações feitas no sistema não são enviadas automaticamente ao Google Calendar.
        </div>
      </div>
    );
  };

  return (
    <div className="inline-flex flex-col gap-1">
      {renderStatus()}

      {!connected ? (
        <button
          onClick={handleConnect}
          disabled={loading}
          className="text-left text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
          title="Conectar Google Calendar para sincronizar"
          data-testid="connect-button"
        >
          Conectar Google Calendar
        </button>
      ) : status?.synced ? (
        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={handleSync}
            disabled={loading}
            className="text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
            title="Atualizar no Google Calendar"
            data-testid="sync-button"
          >
            {loading ? 'Sincronizando...' : isOutdated ? 'Atualizar no Google Calendar' : 'Atualizar'}
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={handleDelete}
            disabled={loading}
            className="text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
            data-testid="delete-button"
          >
            Remover
          </button>
        </div>
      ) : (
        <button
          onClick={handleSync}
          disabled={loading || !deadlineDate}
          className="text-left text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
          title={!deadlineDate ? 'Prazo sem data definida' : 'Sincronizar prazo com Google Calendar'}
          data-testid="sync-button"
        >
          {loading ? 'Sincronizando...' : 'Sincronizar com Google Calendar'}
        </button>
      )}

      {message && (
        <div
          className={`text-xs px-2 py-1 rounded ${
            message.type === 'error'
              ? 'bg-red-100 text-red-700'
              : 'bg-green-100 text-green-700'
          }`}
          data-testid="sync-message"
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
