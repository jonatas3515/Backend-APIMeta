import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../lib/api';

// Etapas padronizadas do funil
const FUNNEL_STAGES = [
  { id: 'lead_novo', label: '🆕 Lead Novo', color: 'bg-gray-100' },
  { id: 'intake_em_andamento', label: '� Intake em Andamento', color: 'bg-blue-100' },
  { id: 'intake_concluido', label: '✅ Intake Concluído', color: 'bg-green-100' },
  { id: 'proposta_enviada', label: '💰 Proposta Enviada', color: 'bg-yellow-100' },
  { id: 'contrato_assinado', label: '� Contrato Assinado', color: 'bg-purple-100' },
  { id: 'acao_protocolada', label: '⚖️ Ação Protocolada', color: 'bg-orange-100' },
  { id: 'aguardando_decisao', label: '⏳ Aguardando Decisão', color: 'bg-red-100' },
  { id: 'encerrado', label: '🏁 Encerrado', color: 'bg-gray-200' }
];

const LEGAL_AREAS = [
  { value: '', label: 'Todas as áreas' },
  { value: 'Direito Trabalhista', label: 'Trabalhista' },
  { value: 'Direito Previdenciário', label: 'Previdenciário' },
  { value: 'Direito Civil', label: 'Civil' },
  { value: 'Direito do Consumidor', label: 'Consumidor' },
  { value: 'Direito Administrativo', label: 'Administrativo' }
];

export default function FunnelKanban({ conversations = [], onSelectConversation }) {
  const [filters, setFilters] = useState({
    area: '',
    search: ''
  });
  const [loading, setLoading] = useState(false);

  const handleStageChange = async (conversation, newStage) => {
    if (conversation.funnel_stage === newStage) return;

    setLoading(true);
    try {
      const response = await fetch('/api/funnel', {
        method: 'PATCH',
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          conversation_id: conversation.id,
          new_stage: newStage,
          reason: 'Movido via Kanban'
        })
      });

      if (!response.ok) throw new Error('Erro ao atualizar stage');

      const result = await response.json();
      console.log('[KANBAN] Stage atualizado:', result.message);
      
      // Atualiza a conversa localmente
      if (onSelectConversation) {
        onSelectConversation(result.conversation);
      }
    } catch (error) {
      console.error('[KANBAN] Erro ao mudar stage:', error);
      alert('Erro ao mover conversa');
    } finally {
      setLoading(false);
    }
  };

  // Mapeia antigos valores de funnel_stage para os atuais
  const normalizeFunnelStage = (stage) => {
    const map = {
      'intake': 'intake_em_andamento',
      'qualificacao': 'intake_concluido',
      'proposta': 'proposta_enviada',
      'contrato': 'contrato_assinado',
      'andamento': 'acao_protocolada',
      'pos_caso': 'encerrado'
    };
    return map[stage] || stage;
  };

  const normalizedConversations = conversations.map(conv => ({
    ...conv,
    funnel_stage: normalizeFunnelStage(conv.funnel_stage)
  }));

  const filteredConversations = normalizedConversations.filter(conv => {
    if (filters.area && conv.legal_area !== filters.area) return false;
    if (filters.search) {
      const term = filters.search.toLowerCase();
      return (
        conv.client_name?.toLowerCase().includes(term) ||
        conv.client_phone?.includes(term) ||
        conv.legal_area?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const groupedConversations = FUNNEL_STAGES.map(stage => ({
    ...stage,
    items: filteredConversations.filter(conv => conv.funnel_stage === stage.id)
  }));

  const totalConversations = filteredConversations.length;

  return (
    <div className="h-full flex flex-col bg-nc-surface">
      {/* Filtros */}
      <div className="bg-white p-4 border-b border-gray-200 shadow-sm">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-xl font-bold">🎯 Funil de Atendimento</h2>
          <span className="text-sm text-gray-600">Total: <strong>{totalConversations}</strong> conversas</span>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select
            value={filters.area}
            onChange={(e) => setFilters({ ...filters, area: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded text-sm"
          >
            {LEGAL_AREAS.map(area => (
              <option key={area.value} value={area.value}>{area.label}</option>
            ))}
          </select>

          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Buscar cliente ou telefone..."
            className="px-3 py-2 border border-gray-300 rounded text-sm flex-1 min-w-[200px]"
          />
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto p-4 bg-gray-50">
        <div className="flex gap-4 h-full min-w-max">
          {groupedConversations.map(stage => (
            <div
              key={stage.id}
              className="w-80 flex flex-col bg-white rounded-lg border border-gray-300 shadow-sm"
            >
              {/* Header da coluna */}
              <div className={`p-4 ${stage.color} border-b border-gray-300 rounded-t-lg`}>
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm">{stage.label}</h3>
                  <span className="bg-white text-gray-800 border border-gray-300 text-xs px-2.5 py-1 rounded-full font-semibold">
                    {stage.items.length}
                  </span>
                </div>
              </div>

              {/* Cards da coluna */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {stage.items.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => onSelectConversation?.(conv)}
                    className="p-3 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:border-blue-400 hover:shadow-md transition"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-gray-900 truncate">
                          {conv.client_name || 'Sem nome'}
                        </p>
                        <p className="text-xs text-gray-500">{conv.client_phone}</p>
                      </div>
                      {conv.mode === 'human' && (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded font-medium">👤 Humano</span>
                      )}
                    </div>

                    {conv.legal_area && (
                      <span className="inline-block text-xs px-2 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded mb-2">
                        {conv.legal_area}
                      </span>
                    )}

                    {conv.has_case && (
                      <span className="inline-block text-xs px-2 py-1 bg-green-100 text-green-800 border border-green-200 rounded ml-1 mb-2">
                        📋 Com caso
                      </span>
                    )}

                    {/* Dropdown para mudar stage */}
                    <select
                      value={conv.funnel_stage || 'lead_novo'}
                      onChange={(e) => handleStageChange(conv, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={loading}
                      className="w-full mt-2 px-2 py-1 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      {FUNNEL_STAGES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                ))}

                {stage.items.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-8">
                    Nenhuma conversa
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
