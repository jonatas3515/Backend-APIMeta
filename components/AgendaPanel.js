import { useState, useEffect } from 'react';
import { askGemini } from '../lib/ai';
import { getAuthHeaders } from '../lib/api';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function AgendaPanel() {
  const [activeTab, setActiveTab] = useState('today');
  const [agenda, setAgenda] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [filters, setFilters] = useState({
    legal_area: '',
    municipality: '',
    agency: '',
    priority: ''
  });

  useEffect(() => {
    fetchAgenda();
  }, [activeTab, filters]);

  const fetchAgenda = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('range', activeTab);
      if (filters.legal_area) params.append('legal_area', filters.legal_area);
      if (filters.municipality) params.append('municipality', filters.municipality);
      if (filters.agency) params.append('agency', filters.agency);
      if (filters.priority) params.append('priority', filters.priority);

      const response = await fetch(`/api/agenda?${params.toString()}`, { headers: await getAuthHeaders() });
      if (response.ok) {
        const data = await response.json();
        setAgenda(data);
      }
    } catch (error) {
      console.error('[AGENDA] Erro ao buscar:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    setGeneratingSummary(true);
    try {
      const response = await fetch('/api/agenda', {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          action: 'summary',
          range: activeTab
        })
      });

      if (response.ok) {
        const data = await response.json();
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('[AGENDA] Erro ao gerar resumo:', error);
      alert('Erro ao gerar resumo');
    } finally {
      setGeneratingSummary(false);
    }
  };

  const copyToClipboard = () => {
    if (summary) {
      navigator.clipboard.writeText(summary);
      alert('Resumo copiado!');
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'alta':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'media':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'baixa':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'alta':
        return '🔴';
      case 'media':
        return '🟡';
      case 'baixa':
        return '🟢';
      default:
        return '⚪';
    }
  };

  const getItemTypeIcon = (itemType) => {
    switch (itemType) {
      case 'case_deadline':
        return '⚖️';
      case 'reminder':
        return '🔔';
      case 'case_event':
        return '📅';
      default:
        return '📌';
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <div className="w-full bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <h2 className="text-2xl font-bold mb-4">📅 Agenda Jurídica</h2>
        <div className="flex gap-2 flex-wrap mb-4">
          <button
            onClick={() => setActiveTab('today')}
            disabled={activeTab !== 'today'}
            className={`px-4 py-2 rounded font-medium transition ${
              activeTab === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            📆 Hoje
          </button>
          <button
            onClick={() => setActiveTab('week')}
            disabled={activeTab !== 'week'}
            className={`px-4 py-2 rounded font-medium transition ${
              activeTab === 'week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            📊 Próximos 7 dias
          </button>
          <button
            onClick={() => setActiveTab('month')}
            disabled={activeTab !== 'month'}
            className={`px-4 py-2 rounded font-medium transition ${
              activeTab === 'month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed'
            }`}
          >
            📈 Próximos 30 dias
          </button>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <select
            value={filters.legal_area}
            onChange={(e) => setFilters({ ...filters, legal_area: e.target.value })}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">Todas as áreas</option>
            <option value="Direito Trabalhista">Direito Trabalhista</option>
            <option value="Direito Previdenciário">Direito Previdenciário</option>
            <option value="Direito Civil">Direito Civil</option>
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value="">Todas as prioridades</option>
            <option value="alta">Alta</option>
            <option value="media">Média</option>
            <option value="baixa">Baixa</option>
          </select>
        </div>

        {/* Botão de resumo */}
        <button
          onClick={generateSummary}
          disabled={generatingSummary}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
        >
          {generatingSummary ? '⏳ Gerando...' : '✨ Gerar Resumo com IA'}
        </button>
      </div>

      {/* Resumo */}
      {summary && (
        <div className="p-4 bg-purple-50 border-b border-purple-200">
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-bold text-purple-900">📝 Resumo da Agenda</h3>
            <button
              onClick={copyToClipboard}
              className="text-xs bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700"
            >
              📋 Copiar
            </button>
          </div>
          <p className="text-sm text-purple-800">{summary}</p>
        </div>
      )}

      {/* Conteúdo */}
      <div className="p-4">
        {loading ? (
          <p className="text-center text-gray-500">Carregando agenda...</p>
        ) : Object.keys(agenda.by_day || {}).length === 0 ? (
          <p className="text-center text-gray-500">Nenhum prazo ou lembrete para este período</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(agenda.by_day || {})
              .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
              .map(([date, items]) => (
                <div key={date} className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-bold text-lg mb-3">
                    {formatDate(date)}
                    <span className="text-sm text-gray-600 ml-2">({items.length} item{items.length !== 1 ? 'ns' : ''})</span>
                  </h3>

                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 border-l-4 rounded flex justify-between items-start ${getPriorityColor(item.priority)}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span>{getItemTypeIcon(item.item_type)}</span>
                            <span className="font-semibold">{item.title}</span>
                            <span className="text-xs bg-white bg-opacity-60 px-2 py-0.5 rounded">
                              {item.event_type}
                            </span>
                          </div>

                          <div className="text-xs space-y-1">
                            {item.legal_area && (
                              <p className="text-gray-700">
                                <strong>Área:</strong> {item.legal_area}
                              </p>
                            )}
                            {item.case_type && (
                              <p className="text-gray-700">
                                <strong>Tipo:</strong> {item.case_type}
                              </p>
                            )}
                            {item.municipality && (
                              <p className="text-gray-700">
                                <strong>Município:</strong> {item.municipality}
                              </p>
                            )}
                            {item.event_time && (
                              <p className="text-gray-700">
                                <strong>Horário:</strong> {item.event_time}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-right ml-4">
                          <div className="text-lg">{getPriorityIcon(item.priority)}</div>
                          <span className="text-xs font-semibold capitalize">{item.priority}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Estatísticas */}
      {agenda.total_items > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <p className="text-sm text-gray-600">
            <strong>Total:</strong> {agenda.total_items} item{agenda.total_items !== 1 ? 'ns' : ''} no período
          </p>
        </div>
      )}
    </div>
  );
}
