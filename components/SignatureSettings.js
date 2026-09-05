import { useState, useEffect } from 'react';
import axios from 'axios';
import { apiCall } from '../lib/apiClient';\nimport { supabase } from '../lib/supabaseClient';\n// import { getAuthHeaders } from '../lib/api';';

export default function SignatureSettings() {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(null);
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
      const headers = await getAuthHeaders();
      const { data } = await axios.get('/api/signatures/config', { headers });
      setIntegrations(data.integrations || []);
      setError(null);
    } catch (err) {
      console.error('Erro ao buscar integrações:', err);
      setError('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const headers = await getAuthHeaders();
      const { data } = await axios.patch('/api/signatures/config', formData, { headers });
      
      setSuccess('Configuração salva com sucesso');
      setFormData({ platform: 'zapsign', api_key: '', api_secret: '' });
      setShowForm(false);
      fetchIntegrations();
      
      setTimeout(() => setSuccess(null), 3000);
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
      const headers = await getAuthHeaders();
      const integration = integrations.find(i => i.id === integrationId);

      const { data } = await axios.post('/api/signatures/config',
        { platform: integration.platform },
        { headers }
      );

      if (data.status === 'success') {
        setSuccess(data.message || `${integration.platform} conectado com sucesso!`);
      } else {
        setError(data.error || data.message || 'Falha ao conectar');
      }
      fetchIntegrations();

      setTimeout(() => { setSuccess(null); setError(null); }, 3000);
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
        <h2 className="text-2xl font-bold text-nc-text">🔐 Assinatura Eletrônica</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-nc-yellow text-nc-text font-medium rounded hover:bg-nc-yellow-700 transition"
        >
          {showForm ? '✕ Cancelar' : '+ Adicionar Integração'}
        </button>
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

      {showForm && (
        <form onSubmit={handleSave} className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg space-y-4">
          <div>
            <label className="block text-sm font-medium text-nc-text mb-2">
              Plataforma
            </label>
            <select
              value={formData.platform}
              onChange={(e) => setFormData({ ...formData, platform: e.target.value })}
              className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow"
            >
              <option value="zapsign">Zapsign</option>
              <option value="clicksign">ClickSign</option>
              <option value="docusign">DocuSign</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-nc-text mb-2">
              API Key
            </label>
            <input
              type="password"
              value={formData.api_key}
              onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
              placeholder="Cole sua API Key aqui"
              required
              className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-nc-text mb-2">
              API Secret (opcional)
            </label>
            <input
              type="password"
              value={formData.api_secret}
              onChange={(e) => setFormData({ ...formData, api_secret: e.target.value })}
              placeholder="Cole seu API Secret aqui (se aplicável)"
              className="w-full px-3 py-2 border border-nc-gray-300 rounded focus:outline-none focus:border-nc-yellow"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-2 bg-nc-yellow text-nc-text font-medium rounded hover:bg-nc-yellow-700 transition disabled:opacity-50"
          >
            {loading ? 'Salvando...' : 'Salvar Configuração'}
          </button>
        </form>
      )}

      <div className="space-y-4">
        {integrations.length === 0 ? (
          <div className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg text-center">
            <p className="text-nc-text-muted">Nenhuma integração configurada</p>
          </div>
        ) : (
          integrations.map((integration) => (
            <div
              key={integration.id}
              className="p-6 bg-nc-surface border border-nc-gray-300 rounded-lg space-y-4"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-nc-text capitalize">
                    {integration.platform}
                  </h3>
                  <p className="text-sm text-nc-text-muted">
                    Status: {integration.is_active ? '✅ Ativo' : '❌ Inativo'}
                  </p>
                </div>
                <button
                  onClick={() => handleTest(integration.id)}
                  disabled={testing === integration.id}
                  className="px-4 py-2 bg-blue-600 text-white font-medium rounded hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {testing === integration.id ? 'Testando...' : '🔗 Testar Conexão'}
                </button>
              </div>

              {integration.tested_at && (
                <div className="text-sm text-nc-text-muted">
                  Último teste: {new Date(integration.tested_at).toLocaleString('pt-BR')}
                </div>
              )}

              {integration.test_status === 'success' && (
                <div className="p-3 bg-green-100 border border-green-300 rounded text-green-800 text-sm">
                  ✅ Conexão estabelecida com sucesso
                </div>
              )}

              {integration.test_status === 'failed' && (
                <div className="p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
                  ❌ Falha na conexão: {integration.test_error}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <p className="font-semibold mb-2">💡 Como usar:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Configure sua API Key da plataforma de assinatura</li>
          <li>Clique em "Testar Conexão" para validar as credenciais</li>
          <li>Após validar, você poderá enviar documentos para assinatura nos casos</li>
          <li>O status de assinatura será atualizado em tempo real</li>
        </ul>
      </div>
    </div>
  );
}
