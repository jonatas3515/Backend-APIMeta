import { useEffect, useState } from 'react';
import { getAuthHeaders } from '../lib/api';

export default function CalendarSettings() {
  const [integrations, setIntegrations] = useState([]);
  const [icalUrl, setIcalUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    fetchStatus();
  }, []);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/calendar-integrations', {
        headers: await getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setIntegrations(data.integrations || []);
        setIcalUrl(data.icalUrl);
      }
    } catch (error) {
      console.error('Erro ao buscar integrações:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (provider) => {
    setConnecting(provider);
    try {
      const response = await fetch('/api/calendar-integrations/connect', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ provider })
      });

      const data = await response.json();

      if (!response.ok) {
        alert(data.error || 'OAuth não configurado. Disponível na Fase 2.');
        return;
      }

      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Erro ao conectar:', error);
      alert('Erro ao iniciar conexão. Verifique se as credenciais estão configuradas.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (provider) => {
    if (!confirm(`Deseja desconectar o ${provider === 'google' ? 'Google Calendar' : 'Outlook Calendar'}?`)) return;

    try {
      const response = await fetch(`/api/calendar-integrations?provider=${provider}`, {
        method: 'DELETE',
        headers: await getAuthHeaders()
      });

      if (response.ok) {
        fetchStatus();
      } else {
        const data = await response.json();
        alert(data.error || 'Erro ao desconectar');
      }
    } catch (error) {
      console.error('Erro ao desconectar:', error);
      alert('Erro ao desconectar');
    }
  };

  const handleCopyIcal = () => {
    if (icalUrl) {
      navigator.clipboard.writeText(icalUrl).then(() => alert('Link iCal copiado!'));
    }
  };

  const handleRegenerateIcal = async () => {
    if (!confirm('Gerar novo link iCal? O link antigo será invalidado.')) return;

    try {
      const response = await fetch('/api/calendar-integrations/ical-token', {
        method: 'POST',
        headers: await getAuthHeaders()
      });

      if (response.ok) {
        const data = await response.json();
        setIcalUrl(data.icalUrl);
      } else {
        const data = await response.json();
        alert(data.error || 'Erro ao gerar link');
      }
    } catch (error) {
      console.error('Erro ao gerar iCal:', error);
      alert('Erro ao gerar novo link iCal');
    }
  };

  const isConnected = (provider) => integrations.find((i) => i.provider === provider);

  if (loading) {
    return <p className="text-sm text-gray-500">Carregando configurações...</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">📅 Calendários externos</h3>
        <p className="text-sm text-gray-600 mb-4">
          Sincronize prazos e eventos com seu calendário pessoal.
        </p>

        <div className="space-y-3">
          <div className="p-4 border rounded-lg bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Google Calendar</h4>
              <p className="text-xs text-gray-500">
                {isConnected('google') ? `Conectado - ${isConnected('google').email}` : 'Configuração pendente'}
              </p>
            </div>
            {isConnected('google') ? (
              <button
                onClick={() => handleDisconnect('google')}
                className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100"
              >
                Desconectar
              </button>
            ) : (
              <button
                onClick={() => handleConnect('google')}
                disabled={connecting === 'google'}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {connecting === 'google' ? 'Conectando...' : 'Conectar Google Calendar'}
              </button>
            )}
          </div>

          <div className="p-4 border rounded-lg bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h4 className="font-medium text-gray-900">Outlook Calendar</h4>
              <p className="text-xs text-gray-500">
                {isConnected('outlook') ? `Conectado - ${isConnected('outlook').email}` : 'Configuração pendente'}
              </p>
            </div>
            {isConnected('outlook') ? (
              <button
                onClick={() => handleDisconnect('outlook')}
                className="px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100"
              >
                Desconectar
              </button>
            ) : (
              <button
                onClick={() => handleConnect('outlook')}
                disabled={connecting === 'outlook'}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {connecting === 'outlook' ? 'Conectando...' : 'Conectar Outlook Calendar'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">🔗 Assinatura iCal</h3>
        <p className="text-sm text-gray-600 mb-4">
          Assine a agenda em qualquer aplicativo de calendário (Google, Outlook, Apple) sem OAuth.
        </p>

        {icalUrl ? (
          <div className="p-4 border rounded-lg bg-white space-y-3">
            <div className="text-sm text-gray-700 break-all bg-gray-50 p-2 rounded border border-gray-200">
              {icalUrl}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleCopyIcal}
                className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
              >
                Copiar link iCal
              </button>
              <button
                onClick={handleRegenerateIcal}
                className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded border border-gray-300 hover:bg-gray-200"
              >
                Gerar novo link
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleRegenerateIcal}
            className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
          >
            Gerar link iCal
          </button>
        )}
      </div>
    </div>
  );
}
