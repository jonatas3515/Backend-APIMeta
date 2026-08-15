import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

export default function CalendarTokenManager() {
  const [token, setToken] = useState(null);
  const [icalUrl, setIcalUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchToken();
  }, []);

  const fetchToken = async () => {
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const { data } = await axios.get('/api/calendar/token', { headers });
      setToken(data.token);
      setIcalUrl(data.ical_url);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar token:', err);
      setError('Erro ao carregar token iCal');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!confirm('Tem certeza? O token anterior deixará de funcionar.')) {
      return;
    }

    try {
      setRegenerating(true);
      const headers = await getAuthHeaders();
      const { data } = await axios.post('/api/calendar/token', 
        { action: 'regenerate' }, 
        { headers }
      );
      
      setToken(data.token);
      setIcalUrl(data.ical_url);
      setSuccess('Token regenerado com sucesso!');
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Erro ao regenerar:', err);
      setError('Erro ao regenerar token');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopy = () => {
    if (icalUrl) {
      navigator.clipboard.writeText(icalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisable = async () => {
    if (!confirm('Tem certeza? Você não conseguirá acessar o calendário iCal até gerar um novo token.')) {
      return;
    }

    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      await axios.delete('/api/calendar/token', { headers });
      
      setToken(null);
      setIcalUrl(null);
      setSuccess('Token desabilitado com sucesso');
      
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error('Erro ao desabilitar:', err);
      setError('Erro ao desabilitar token');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-nc-text-muted">Carregando token iCal...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-nc-text mb-2">📅 Token iCal</h2>
        <p className="text-nc-text-muted">
          Integre sua agenda jurídica com qualquer aplicativo de calendário (Google Calendar, Outlook, Apple Calendar, etc.)
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-100 border border-red-300 rounded text-red-800">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-100 border border-green-300 rounded text-green-800">
          {success}
        </div>
      )}

      {token && icalUrl ? (
        <div className="space-y-6">
          {/* URL iCal */}
          <div className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg space-y-4">
            <h3 className="text-lg font-semibold text-nc-text">URL do Calendário iCal</h3>
            
            <div className="flex gap-2">
              <input
                type="text"
                value={icalUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-nc-gray-300 rounded bg-white text-nc-text text-sm font-mono"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition"
              >
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
            </div>

            <p className="text-sm text-nc-text-muted">
              Cole esta URL em qualquer aplicativo de calendário que suporte iCal/ICS
            </p>
          </div>

          {/* Instruções */}
          <div className="p-6 bg-blue-50 border border-blue-200 rounded-lg space-y-4">
            <h3 className="text-lg font-semibold text-blue-900">Como usar:</h3>
            
            <div className="space-y-3 text-sm text-blue-900">
              <div>
                <p className="font-medium">Google Calendar:</p>
                <ol className="list-decimal list-inside ml-2 space-y-1">
                  <li>Abra Google Calendar</li>
                  <li>Clique em "+" ao lado de "Outros calendários"</li>
                  <li>Selecione "Inscrever-se em calendário"</li>
                  <li>Cole a URL acima</li>
                </ol>
              </div>

              <div>
                <p className="font-medium">Outlook/Microsoft 365:</p>
                <ol className="list-decimal list-inside ml-2 space-y-1">
                  <li>Abra Outlook</li>
                  <li>Clique em "Adicionar calendário"</li>
                  <li>Selecione "De internet"</li>
                  <li>Cole a URL acima</li>
                </ol>
              </div>

              <div>
                <p className="font-medium">Apple Calendar:</p>
                <ol className="list-decimal list-inside ml-2 space-y-1">
                  <li>Abra Calendário</li>
                  <li>Vá para Arquivo → Inscrever-se em calendário</li>
                  <li>Cole a URL acima</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Gerenciamento */}
          <div className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg space-y-4">
            <h3 className="text-lg font-semibold text-nc-text">Gerenciamento</h3>
            
            <div className="space-y-3">
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="w-full px-4 py-2 bg-yellow-600 text-white font-medium rounded hover:bg-yellow-700 transition disabled:opacity-50"
              >
                {regenerating ? 'Regenerando...' : '🔄 Regenerar Token'}
              </button>

              <button
                onClick={handleDisable}
                className="w-full px-4 py-2 bg-red-600 text-white font-medium rounded hover:bg-red-700 transition"
              >
                🔒 Desabilitar Token
              </button>
            </div>

            <p className="text-sm text-nc-text-muted">
              Regenerar o token desabilitará a URL anterior. Desabilitar o token impedirá o acesso ao calendário até que você gere um novo.
            </p>
          </div>

          {/* Informações de Segurança */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-900">
            <p className="font-semibold mb-2">🔐 Segurança:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>O token é único e pessoal - não compartilhe com ninguém</li>
              <li>O calendário iCal é somente leitura</li>
              <li>Você pode regenerar o token a qualquer momento</li>
              <li>Todos os acessos são registrados para auditoria</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg text-center space-y-4">
          <p className="text-nc-text-muted">Nenhum token iCal ativo</p>
          <button
            onClick={fetchToken}
            className="px-4 py-2 bg-nc-yellow text-nc-text font-medium rounded hover:bg-nc-yellow-700 transition"
          >
            🔄 Recarregar
          </button>
        </div>
      )}
    </div>
  );
}
