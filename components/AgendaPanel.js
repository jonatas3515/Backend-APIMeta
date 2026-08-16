import { useState, useEffect } from 'react';
import { askGemini } from '../lib/ai';
import { getAuthHeaders } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import useAreaFilter from '../hooks/useAreaFilter';
import { LEGAL_AREAS } from '../lib/legalAreas';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import ExportButtons from './ExportButtons';
import { exportAgendaPdf, exportAgendaExcel } from '../lib/export';
import CaseCalendarSync from './CaseCalendarSync';

export default function AgendaPanel() {
  const [activeTab, setActiveTab] = useState('today');
  const [agenda, setAgenda] = useState({});
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [icalUrl, setIcalUrl] = useState(null);
  const [showIcal, setShowIcal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const { selectedArea, setSelectedArea } = useAreaFilter();
  const [filters, setFilters] = useState({
    legal_area: '',
    municipality: '',
    agency: '',
    priority: ''
  });

  useEffect(() => {
    setFilters((prev) => ({ ...prev, legal_area: selectedArea }));
  }, [selectedArea]);

  useKeyboardShortcuts([
    { keys: ['h'], handler: () => setActiveTab('today') },
    { keys: ['7'], handler: () => setActiveTab('week') },
    { keys: ['3', '0'], handler: () => setActiveTab('month') }
  ]);

  useEffect(() => {
    fetchAgenda();
  }, [activeTab, filters]);

  useEffect(() => {
    if (showIcal && !icalUrl) {
      fetchIcalUrl();
    }
  }, [showIcal]);

  const fetchAgenda = async () => {
    setLoading(true);
    setApiError(null);
    setSelectedItems(new Set());
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
      } else {
        let errText = 'Erro ao carregar agenda';
        try {
          const data = await response.json();
          errText = data.error || errText;
        } catch (e) {}
        setApiError(errText);
      }
    } catch (error) {
      console.error('[AGENDA] Erro ao buscar:', error);
      setApiError('Erro de conexão ao carregar agenda');
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
          range: activeTab,
          legal_area: filters.legal_area
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

  const fetchIcalUrl = async () => {
    try {
      const response = await fetch('/api/calendar-integrations/ical-token', {
        headers: await getAuthHeaders()
      });
      if (response.ok) {
        const data = await response.json();
        setIcalUrl(data.icalUrl);
      }
    } catch (error) {
      console.error('[AGENDA] Erro ao buscar iCal:', error);
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
        alert(data.error || 'Erro ao gerar link iCal');
      }
    } catch (error) {
      console.error('[AGENDA] Erro ao gerar iCal:', error);
      alert('Erro ao gerar link iCal');
    }
  };

  const toggleSelectedItem = (item) => {
    const key = `${item.item_type}:${item.case_id}`;
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSyncSelected = async () => {
    if (selectedItems.size === 0) return;

    // Coleta itens selecionados
    const selected = [];
    Object.values(agenda.by_day || {}).forEach((dayItems) => {
      dayItems.forEach((item) => {
        const key = `${item.item_type}:${item.case_id}`;
        if (selectedItems.has(key) && item.item_type === 'case_deadline') {
          selected.push({ eventId: item.case_id, table: 'cases', title: item.title });
        }
      });
    });

    if (selected.length === 0) {
      setApiError('Selecione apenas prazos de casos para sincronização em lote.');
      return;
    }

    setSyncing(true);
    setApiError(null);
    let success = 0;
    let failed = 0;

    for (const { eventId, table, title } of selected) {
      try {
        const headers = await getAuthHeaders();
        const response = await fetch('/api/calendar-integrations/sync-event', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            event_id: eventId,
            internal_table: table,
            provider: 'google',
            action: 'sync'
          })
        });

        if (response.ok) {
          success++;
        } else {
          failed++;
          console.error(`[AGENDA] Falha ao sincronizar ${title}`);
        }
      } catch (error) {
        failed++;
        console.error(`[AGENDA] Erro ao sincronizar ${title}:`, error);
      }
    }

    setSyncing(false);
    setSelectedItems(new Set());

    if (failed > 0) {
      setApiError(`${success} sincronizado(s), ${failed} falha(s). Verifique a conexão com o Google Calendar.`);
    } else {
      setApiError(null);
      alert(`${success} prazo(s) sincronizado(s) com sucesso.`);
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
            className={`px-4 py-2 rounded font-medium transition ${
              activeTab === 'today'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            📆 Hoje
          </button>
          <button
            onClick={() => setActiveTab('week')}
            className={`px-4 py-2 rounded font-medium transition ${
              activeTab === 'week'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            📊 Próximos 7 dias
          </button>
          <button
            onClick={() => setActiveTab('month')}
            className={`px-4 py-2 rounded font-medium transition ${
              activeTab === 'month'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            📈 Próximos 30 dias
          </button>
        </div>

        {apiError && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded text-red-800 text-sm">
            {apiError}
          </div>
        )}

        {/* Filtros */}
        <div className="grid grid-cols-2 gap-2 mb-4">
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

        {/* Botões de resumo e exportação */}
        <div className="flex flex-wrap gap-3 items-center">
          <button
            onClick={generateSummary}
            disabled={generatingSummary}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm font-medium"
          >
            {generatingSummary ? '⏳ Gerando...' : '✨ Gerar Resumo com IA'}
          </button>

          <ExportButtons
            disabled={loading}
            onPdf={() => {
              if ((agenda.total_items || 0) === 0) {
                setApiError('Não há eventos para exportar neste período');
                return;
              }
              setApiError(null);
              exportAgendaPdf({ agenda, filters });
            }}
            onExcel={() => {
              if ((agenda.total_items || 0) === 0) {
                setApiError('Não há eventos para exportar neste período');
                return;
              }
              setApiError(null);
              exportAgendaExcel({ agenda, filters });
            }}
          />

          <div className="flex items-center gap-2 ml-auto">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={showIcal}
                onChange={(e) => setShowIcal(e.target.checked)}
                className="rounded border-gray-300"
              />
              Mostrar opções de calendário externo (iCal e Google)
            </label>
          </div>
        </div>

        {showIcal && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
              <div className="text-sm text-green-900">
                <strong>Assinatura iCal</strong>
                {icalUrl && (
                  <p className="break-all text-xs text-green-800 mt-1">{icalUrl}</p>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleCopyIcal}
                  disabled={!icalUrl}
                    className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                >
                  Copiar link iCal
                </button>
                <button
                  onClick={handleRegenerateIcal}
                  className="px-3 py-1.5 text-sm bg-green-100 text-green-800 rounded border border-green-300 hover:bg-green-200"
                >
                  Novo link
                </button>
                <button
                  onClick={handleSyncSelected}
                  disabled={syncing || selectedItems.size === 0}
                  className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {syncing ? 'Sincronizando...' : `Sincronizar selecionados (${selectedItems.size})`}
                </button>
              </div>
            </div>
          </div>
        )}
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
                          <input
                            type="checkbox"
                            checked={selectedItems.has(`${item.item_type}:${item.case_id}`)}
                            onChange={() => toggleSelectedItem(item)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 mb-2"
                            title="Selecionar para sincronização em lote"
                          />
                          <div className="text-lg">{getPriorityIcon(item.priority)}</div>
                          <span className="text-xs font-semibold capitalize">{item.priority}</span>
                          <div className="mt-2">
                            <CaseCalendarSync
                              eventId={item.case_id}
                              table={item.item_type === 'case_deadline' ? 'cases' : 'case_events'}
                              deadlineDate={item.event_date}
                              title={item.title}
                            />
                          </div>
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
