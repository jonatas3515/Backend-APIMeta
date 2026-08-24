import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import useAreaFilter from '../hooks/useAreaFilter';
import { LEGAL_AREAS } from '../lib/legalAreas';

export default function CaseInsightsPanel({ conversationId, caseId, onClose, initialTab = 'list' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [insights, setInsights] = useState([]);
  const [similarInsights, setSimilarInsights] = useState([]);
  const [selectedInsight, setSelectedInsight] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingProposal, setGeneratingProposal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [message, setMessage] = useState(null);
  const { selectedArea, setSelectedArea } = useAreaFilter();
  const [filters, setFilters] = useState({
    legal_area: '',
    case_type: '',
    municipality: '',
    agency: '',
    search: ''
  });

  useEffect(() => {
    setFilters((prev) => ({ ...prev, legal_area: selectedArea }));
  }, [selectedArea]);

  useEffect(() => {
    if (activeTab === 'list') {
      fetchInsights();
    } else if (activeTab === 'similar' && conversationId) {
      fetchSimilarInsights();
    }
  }, [activeTab, filters, caseId]);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.legal_area) params.append('legal_area', filters.legal_area);
      if (filters.case_type) params.append('case_type', filters.case_type);
      if (filters.municipality) params.append('municipality', filters.municipality);
      if (filters.agency) params.append('agency', filters.agency);
      if (filters.search) params.append('search', filters.search);
      if (caseId) params.append('case_id', caseId);

      const response = await fetch(`/api/insights?${params.toString()}`, { headers: await getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setInsights(data);
      } else {
        setMessage({ type: 'error', text: 'Erro ao buscar insights.' });
      }
    } catch (error) {
      console.error('[INSIGHTS] Erro ao buscar:', error);
      setMessage({ type: 'error', text: 'Erro ao buscar insights.' });
    } finally {
      setLoading(false);
    }
  };

  const fetchSimilarInsights = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/insights?action=similar&conversation_id=${conversationId}`, { headers: await getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setSimilarInsights(data);
      } else {
        setMessage({ type: 'error', text: 'Erro ao buscar insights similares.' });
      }
    } catch (error) {
      console.error('[INSIGHTS] Erro ao buscar similares:', error);
      setMessage({ type: 'error', text: 'Erro ao buscar insights similares.' });
    } finally {
      setLoading(false);
    }
  };

  const generateProposal = async () => {
    if (!conversationId) {
      setMessage({ type: 'error', text: 'Selecione uma conversa para gerar a proposta.' });
      return;
    }

    setGeneratingProposal(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/insights?action=generate_proposal&conversation_id=${conversationId}`, { headers: await getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setProposal(data);
        setActiveTab('create');
      } else {
        setMessage({ type: 'error', text: 'Erro ao gerar proposta de insight.' });
      }
    } catch (error) {
      console.error('[INSIGHTS] Erro ao gerar proposta:', error);
      setMessage({ type: 'error', text: 'Erro ao gerar proposta de insight.' });
    } finally {
      setGeneratingProposal(false);
    }
  };

  const saveInsight = async () => {
    if (!proposal) return;

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: 'create',
          conversation_id: conversationId,
          case_id: caseId || null,
          ...proposal
        })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Insight salvo com sucesso.' });
        setProposal(null);
        setActiveTab('list');
        fetchInsights();
      } else {
        setMessage({ type: 'error', text: 'Erro ao salvar insight.' });
      }
    } catch (error) {
      console.error('[INSIGHTS] Erro ao salvar:', error);
      setMessage({ type: 'error', text: 'Erro ao salvar insight.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow">
      {message && (
        <div className={`m-4 p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      {/* Header com abas */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-2xl font-bold mb-4">📚 Central de Conhecimento</h2>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('list')}
            disabled={activeTab !== 'list'}
            className={`px-4 py-2 rounded font-medium transition ${
              activeTab === 'list'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            📋 Insights
          </button>
          {conversationId && (
            <>
              <button
                onClick={() => setActiveTab('similar')}
                disabled={activeTab !== 'similar'}
                className={`px-4 py-2 rounded font-medium transition ${
                  activeTab === 'similar'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                🔗 Similares
              </button>
              <button
                onClick={() => setActiveTab('create')}
                disabled={activeTab !== 'create'}
                className={`px-4 py-2 rounded font-medium transition ${
                  activeTab === 'create'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                ✨ Criar Insight
              </button>
            </>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-4">
        {activeTab === 'list' && (
          <div>
            {/* Filtros */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="px-2 py-1 border rounded text-sm"
                />
                <select
                  value={filters.legal_area}
                  onChange={(e) => setSelectedArea(e.target.value)}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="">Todas as áreas</option>
                  {LEGAL_AREAS.map((area) => (
                    <option key={area.value} value={area.value}>{area.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Lista de insights */}
            {loading ? (
              <p className="text-center text-gray-500">Carregando...</p>
            ) : insights.length === 0 ? (
              <p className="text-center text-gray-500">Nenhum insight encontrado</p>
            ) : (
              <div className="space-y-3">
                {insights.map(insight => (
                  <div
                    key={insight.id}
                    onClick={() => setSelectedInsight(insight)}
                    className="p-3 border rounded-lg bg-gray-50 cursor-pointer hover:border-blue-400 transition"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-bold text-sm">{insight.legal_area}</h4>
                        <p className="text-xs text-gray-600 mb-1">{insight.case_type}</p>
                        <p className="text-sm text-gray-700 line-clamp-2">{insight.summary}</p>
                      </div>
                      <span className="text-xs text-gray-500 ml-2">
                        {new Date(insight.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'similar' && (
          <div>
            {loading ? (
              <p className="text-center text-gray-500">Carregando insights similares...</p>
            ) : similarInsights.length === 0 ? (
              <p className="text-center text-gray-500">Nenhum insight similar encontrado</p>
            ) : (
              <div className="space-y-3">
                {similarInsights.map(insight => (
                  <div
                    key={insight.insight_id}
                    className="p-3 border border-green-200 rounded-lg bg-green-50"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-sm">{insight.legal_area}</h4>
                      <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded">
                        Match: {insight.match_score}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{insight.case_type} • {insight.municipality}</p>
                    <p className="text-sm text-gray-700 mb-2">{insight.summary}</p>
                    <button
                      onClick={() => setSelectedInsight(insight)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Ver detalhes →
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'create' && (
          <div>
            {!proposal ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">Gerar proposta de insight usando IA?</p>
                <button
                  onClick={generateProposal}
                  disabled={generatingProposal}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {generatingProposal ? 'Gerando...' : '✨ Gerar Proposta com IA'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1">Resumo</label>
                  <textarea
                    value={proposal.summary}
                    onChange={(e) => setProposal({ ...proposal, summary: e.target.value })}
                    className="w-full px-3 py-2 border rounded text-sm"
                    rows="3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Estratégias</label>
                  <textarea
                    value={proposal.strategy_notes}
                    onChange={(e) => setProposal({ ...proposal, strategy_notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded text-sm"
                    rows="3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Riscos</label>
                  <textarea
                    value={proposal.risk_notes}
                    onChange={(e) => setProposal({ ...proposal, risk_notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded text-sm"
                    rows="3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Resultado</label>
                  <textarea
                    value={proposal.outcome_notes}
                    onChange={(e) => setProposal({ ...proposal, outcome_notes: e.target.value })}
                    className="w-full px-3 py-2 border rounded text-sm"
                    rows="3"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-1">Padrões Recorrentes</label>
                  <textarea
                    value={proposal.similar_patterns}
                    onChange={(e) => setProposal({ ...proposal, similar_patterns: e.target.value })}
                    className="w-full px-3 py-2 border rounded text-sm"
                    rows="3"
                  />
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={saveInsight}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Salvando...' : '💾 Salvar Insight'}
                  </button>
                  <button
                    onClick={() => {
                      setProposal(null);
                      setActiveTab('list');
                    }}
                    className="flex-1 px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal de detalhes */}
      {selectedInsight && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-bold">{selectedInsight.legal_area}</h3>
                <button
                  onClick={() => setSelectedInsight(null)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-semibold text-gray-600">Tipo: {selectedInsight.case_type}</p>
                  <p className="font-semibold text-gray-600">Município: {selectedInsight.municipality}</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">Resumo</h4>
                  <p className="text-gray-700">{selectedInsight.summary}</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">Estratégias</h4>
                  <p className="text-gray-700">{selectedInsight.strategy_notes}</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">Riscos</h4>
                  <p className="text-gray-700">{selectedInsight.risk_notes}</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">Resultado</h4>
                  <p className="text-gray-700">{selectedInsight.outcome_notes}</p>
                </div>

                <div>
                  <h4 className="font-bold mb-1">Padrões</h4>
                  <p className="text-gray-700">{selectedInsight.similar_patterns}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
