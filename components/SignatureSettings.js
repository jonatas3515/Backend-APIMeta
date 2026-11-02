import { useState, useEffect } from 'react';
import { apiJson } from '../lib/apiClient';
import { useAuth } from '../lib/useAuth';

export default function SignatureSettings() {
  const { profile } = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/signatures/webhook${profile?.office_id ? `?office_id=${profile.office_id}` : ''}`
    : '';

  const copyWebhookUrl = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(webhookUrl);
      } else {
        const el = document.createElement('textarea');
        el.value = webhookUrl;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      setError('Não foi possível copiar a URL. Copie manualmente.');
    }
  };
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    platform: 'zapsign',
    api_key: '',
    api_secret: ''
  });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    try {
      setLoading(true);
      const data = await apiJson('/api/signatures/config');
      const list = (data && Array.isArray(data.integrations)) ? data.integrations : [];
      setIntegrations(list);
      // Se não houver integrações cadastradas, já abre o formulário de conexão
      if (list.length === 0) {
        setShowForm(true);
      }
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar integrações:', err);
      setError('Erro ao carregar configurações');
      setIntegrations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      
      await apiJson('/api/signatures/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      setSuccess('Configuração da plataforma salva com sucesso! Agora você pode testar a conexão.');
      setFormData({ platform: 'zapsign', api_key: '', api_secret: '' });
      setShowForm(false);
      fetchIntegrations();
      
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.error('Erro ao salvar:', err);
      setError(err.response?.data?.error || 'Erro ao salvar configuração');
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async (integrationId) => {
    try {
      setTesting(integrationId);
      
      const integration = integrations.find(i => i.id === integrationId);

      const data = await apiJson('/api/signatures/config', {
        method: 'POST',
        body: JSON.stringify({ action: 'test', platform: integration.platform })
      });

      if (data && data.status === 'success') {
        setSuccess(data.message || `${integration.platform} conectado com sucesso!`);
      } else {
        setError((data && (data.error || data.message)) || 'Falha ao conectar');
      }
      fetchIntegrations();

      setTimeout(() => { setSuccess(null); setError(null); }, 4000);
    } catch (err) {
      console.error('Erro ao testar:', err);
      setError(err.response?.data?.error || 'Erro ao testar conexão');
    } finally {
      setTesting(null);
    }
  };

  if (loading && integrations.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-nc-text-muted">Carregando configurações...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">🔐 Assinatura Eletrônica</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Conecte a conta do seu escritório na ZapSign, ClickSign ou DocuSign.
          </p>
        </div>
        {integrations.length > 0 && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-nc-yellow text-nc-black font-semibold rounded hover:bg-nc-yellow-700 transition"
          >
            {showForm ? '✕ Cancelar' : '+ Adicionar Outra Plataforma'}
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-900/40 border border-red-500/40 rounded text-red-200 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-4 bg-green-900/40 border border-green-500/40 rounded text-green-200 text-sm">
          {success}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSave} className="p-6 bg-nc-surface border border-nc-gray-800 rounded-xl space-y-4 shadow-md">
          <div className="border-b border-gray-800 pb-3">
            <h3 className="font-bold text-white text-base">🔑 Conectar Conta de Assinatura</h3>
            <p className="text-xs text-gray-400">
              Utilize suas credenciais. Os contratos e procurações serão emitidos diretamente pela sua conta.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Plataforma de Assinatura
            </label>
            <select
              value={formData.platform}
              onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
              className="w-full px-3 py-2 bg-nc-black border border-nc-gray-700 rounded text-white focus:outline-none focus:border-nc-yellow"
            >
              <option value="zapsign">ZapSign</option>
              <option value="clicksign">ClickSign</option>
              <option value="docusign">DocuSign</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              Chave de API (API Key da sua conta)
            </label>
            <input
              type="password"
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              placeholder="Cole o token ou API Key gerado no painel da sua plataforma"
              required
              className="w-full px-3 py-2 bg-nc-black border border-nc-gray-700 rounded text-white focus:outline-none focus:border-nc-yellow"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              No painel da ZapSign, acesse Configurações → Integrações / API e gere seu token de API.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-200 mb-1">
              API Secret (opcional)
            </label>
            <input
              type="password"
              value={formData.api_secret}
              onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
              placeholder="Cole o API Secret se exigido pela sua plataforma"
              className="w-full px-3 py-2 bg-nc-black border border-nc-gray-700 rounded text-white focus:outline-none focus:border-nc-yellow"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-nc-yellow text-nc-black font-bold rounded hover:bg-nc-yellow-700 transition disabled:opacity-50 text-sm"
            >
              {loading ? 'Salvando...' : '💾 Salvar e Ativar Integração'}
            </button>
            {integrations.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2.5 bg-gray-800 text-gray-300 rounded hover:bg-gray-700 text-sm"
              >
                Cancelar
              </button>
            )}
          </div>
        </form>
      )}

      {integrations.length > 0 && (
        <div className="space-y-4">
          {integrations.map((integration) => (
            <div
              key={integration.id}
              className="p-5 bg-nc-surface border border-nc-gray-800 rounded-xl space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-white capitalize flex items-center gap-2">
                    {integration.platform}
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      integration.is_active ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'
                    }`}>
                      {integration.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Integração vinculada ao seu escritório
                  </p>
                </div>
                <button
                  onClick={() => handleTest(integration.id)}
                  disabled={testing === integration.id}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded text-xs transition disabled:opacity-50"
                >
                  {testing === integration.id ? 'Testando...' : '🔗 Testar Conexão'}
                </button>
              </div>

              {integration.tested_at && (
                <div className="text-xs text-gray-400">
                  Último teste: {new Date(integration.tested_at).toLocaleString('pt-BR')}
                </div>
              )}

              {integration.test_status === 'success' && (
                <div className="p-2.5 bg-green-900/40 border border-green-500/40 rounded text-green-300 text-xs">
                  ✅ Conexão validada com sucesso! Você já pode enviar contratos para assinatura.
                </div>
              )}

              {integration.test_status === 'failed' && (
                <div className="p-2.5 bg-red-900/40 border border-red-500/40 rounded text-red-300 text-xs">
                  ❌ Falha na conexão: {integration.test_error}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="p-4 bg-amber-950/30 border border-amber-600/30 rounded-xl" data-testid="webhook-url-card">
        <p className="font-bold text-amber-300 mb-1 flex items-center gap-2">
          <span>🔔</span> URL Única de Webhook do seu Escritório
        </p>
        <p className="text-xs text-amber-200/80 mb-2 leading-relaxed">
          Cadastre esta URL nas configurações de Webhook da sua conta na plataforma (ZapSign / ClickSign).
          Quando um cliente assinar um documento, nossa plataforma atualizará o caso e avançará o funil de atendimento automaticamente.
        </p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-black/60 border border-amber-500/30 text-amber-100 rounded px-3 py-2 break-all" data-testid="webhook-url">
            {webhookUrl}
          </code>
          <button
            onClick={copyWebhookUrl}
            className="px-3 py-2 text-xs font-semibold bg-amber-500 text-black rounded hover:bg-amber-600 transition whitespace-nowrap shadow"
            data-testid="btn-copy-webhook"
          >
            {copied ? '✅ Copiado!' : '📋 Copiar URL'}
          </button>
        </div>
      </div>

      <div className="p-4 bg-blue-950/20 border border-blue-500/20 rounded-xl text-xs text-blue-200/90">
        <p className="font-bold text-blue-300 mb-1">💡 Como configurar:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-200/80">
          <li>Insira a sua <strong>API Key</strong> no formulário acima e clique em <em>Salvar e Ativar Integração</em>;</li>
          <li>Clique no botão <strong>Testar Conexão</strong> para validar suas credenciais;</li>
          <li>Copie a <strong>URL do Webhook</strong> acima e cole no painel da sua plataforma de assinatura;</li>
          <li>Pronto! Você poderá enviar procurações e contratos diretamente de dentro de cada caso.</li>
        </ol>
      </div>
    </div>
  );
}
