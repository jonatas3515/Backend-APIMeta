import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../lib/api';
import { supabase } from '../lib/supabaseClient';
import { safeLog, safeError } from '../lib/safeLogger';
import useAreaFilter from '../hooks/useAreaFilter';
import { LEGAL_AREAS } from '../lib/legalAreas';
import ExportButtons from './ExportButtons';
import { exportFunnelPdf, exportFunnelExcel } from '../lib/export';
import CaseSuggestionBanner from './CaseSuggestionBanner';
import CaseCreationModal from './CaseCreationModal';
import CaseLinkModal from './CaseLinkModal';
import ConfirmModal from './ConfirmModal';
import { navigateToCase } from '../lib/router';

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

export default function FunnelKanban({ conversations = [], onSelectConversation }) {
  const { selectedArea, setSelectedArea } = useAreaFilter();
  const [items, setItems] = useState(conversations);
  const [filters, setFilters] = useState({
    area: selectedArea,
    search: ''
  });
  const [loading, setLoading] = useState(false);
  const [activeCases, setActiveCases] = useState({});
  const [userRole, setUserRole] = useState(null);
  const [selectedConvForCase, setSelectedConvForCase] = useState(null);
  const [showCaseCreationModal, setShowCaseCreationModal] = useState(false);
  const [showCaseLinkModal, setShowCaseLinkModal] = useState(false);
  const [pendingStageChange, setPendingStageChange] = useState(null);
  const [stageChangeError, setStageChangeError] = useState(null);

  useEffect(() => {
    setItems(conversations);
  }, [conversations]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, area: selectedArea }));
  }, [selectedArea]);

  // Buscar role do usuário
  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data, error } = await supabase
            .from('users')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();
          
          if (!error && data) {
            setUserRole(data.role || null);
          }
        }
      } catch (err) {
        console.error('[FUNNEL] Erro ao buscar role:', err);
      }
    };
    fetchUserRole();
  }, []);

  // Buscar casos ativos para conversas elegíveis
  useEffect(() => {
    const fetchActiveCases = async () => {
      const eligibleStages = ['intake_concluido', 'proposta_enviada', 'contrato_assinado', 'acao_protocolada', 'aguardando_decisao', 'encerrado'];
      const eligibleConvs = normalizedConversations.filter(c => eligibleStages.includes(c.funnel_stage));
      
      if (eligibleConvs.length === 0) return;

      try {
        const headers = await getAuthHeaders();
        const cases = {};
        
        await Promise.all(
          eligibleConvs.map(async (conv) => {
            try {
              const response = await fetch(`/api/cases?conversation_id=${conv.id}`, { headers });
              if (response.ok) {
                const data = await response.json();
                const list = Array.isArray(data) ? data : [data];
                const activeCase = list.find(c => c && c.status !== 'encerrado');
                if (activeCase) cases[conv.id] = activeCase;
              } else if (response.status === 403 || response.status === 404) {
                // Inacessível ou sem caso: não expõe nada
                return;
              }
            } catch (err) {
              safeError('funnel_active_case_error', err, { requestId: 'funnel' });
            }
          })
        );
        
        setActiveCases(cases);
      } catch (err) {
        safeError('funnel_active_cases_error', err, { requestId: 'funnel' });
      }
    };

    if (normalizedConversations.length > 0) {
      fetchActiveCases();
    }
  }, [items]);

  const handleStageSelect = (conversation, newStage) => {
    if (conversation.funnel_stage === newStage) return;
    setPendingStageChange({ conversation, newStage });
    setStageChangeError(null);
  };

  const handleStageChange = async () => {
    if (!pendingStageChange) return;

    const { conversation, newStage } = pendingStageChange;
    if (conversation.funnel_stage === newStage) {
      setPendingStageChange(null);
      return;
    }

    setLoading(true);
    setStageChangeError(null);
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
      safeLog('info', 'kanban_stage_updated', { requestId: 'funnel' });

      setItems(prev => prev.map(c => c.id === conversation.id ? result.conversation : c));
      setPendingStageChange(null);
    } catch (error) {
      safeError('kanban_stage_change_error', error, { requestId: 'funnel' });
      setStageChangeError('Não foi possível mover a conversa. Tente novamente.');
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

  const normalizedConversations = items.map(conv => ({
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

  const metrics = groupedConversations.map(stage => ({
    funnel_stage: stage.label,
    total_count: stage.items.length,
    with_case_count: stage.items.filter(c => c.has_case).length,
    human_mode_count: stage.items.filter(c => c.mode === 'human').length,
    avg_days_in_stage: 0
  }));

  const totalFirst = Math.max(totalConversations, 1);
  const conversions = groupedConversations.map((stage, index) => {
    const prev = index > 0 ? groupedConversations[index - 1].items.length : 0;
    const count = stage.items.length;
    const conversion_from_first = Number(((count / totalFirst) * 100).toFixed(1));
    const drop_rate_from_previous = index > 0 && prev > 0
      ? Number((((count - prev) / prev) * 100).toFixed(1))
      : null;
    return {
      funnel_stage: stage.label,
      count,
      conversion_from_first,
      drop_rate_from_previous
    };
  });

  const handleExportPdf = () => exportFunnelPdf({ metrics, conversions, filters });
  const handleExportExcel = () => exportFunnelExcel({ metrics, conversions });

  const handleCreateCase = (conversation) => {
    setSelectedConvForCase(conversation);
    setShowCaseCreationModal(true);
  };

  const handleLinkCase = (conversation) => {
    setSelectedConvForCase(conversation);
    setShowCaseLinkModal(true);
  };

  const handleOpenCase = (conversation) => {
    const activeCase = activeCases[conversation.id];
    if (activeCase) {
      navigateToCase(activeCase.id);
    }
  };

  const handleCaseCreated = (caseId) => {
    navigateToCase(caseId);
    // Recarregar casos ativos
    setItems([...items]);
  };

  const handleCaseLinked = (caseId) => {
    navigateToCase(caseId);
    // Recarregar casos ativos
    setItems([...items]);
  };

  return (
    <div className="h-full w-full min-w-0 flex flex-col bg-nc-surface">
      {/* Filtros */}
      <div className="bg-white p-4 border-b border-gray-200 shadow-sm">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
          <h2 className="text-xl font-bold">🎯 Funil de Atendimento</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">Total: <strong>{totalConversations}</strong> conversas</span>
            <ExportButtons
              onPdf={handleExportPdf}
              onExcel={handleExportExcel}
              disabled={totalConversations === 0}
            />
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <select
            value={filters.area}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded text-sm"
          >
            <option value="">Todas as áreas</option>
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
      <div className="flex-1 min-w-0 overflow-x-auto p-4 bg-gray-50" style={{ minHeight: 0 }}>
        <div className="flex gap-4 h-full min-h-0 min-w-max">
          {groupedConversations.map(stage => (
            <div
              key={stage.id}
              className="w-80 h-full min-h-0 flex flex-col bg-white rounded-lg border border-gray-300 shadow-sm"
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

                    {/* Ação de Caso */}
                    {userRole && ['intake_concluido', 'proposta_enviada', 'contrato_assinado', 'acao_protocolada', 'aguardando_decisao', 'encerrado'].includes(conv.funnel_stage) && (
                      <div className="mt-2 mb-2">
                        {activeCases[conv.id] ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenCase(conv);
                            }}
                            className="w-full text-xs px-2 py-1.5 bg-green-50 text-green-700 border border-green-300 rounded hover:bg-green-100 transition"
                          >
                            ⚖️ Abrir caso vinculado
                          </button>
                        ) : (
                          <>
                            {(userRole === 'admin' || userRole === 'advogado') && (
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCreateCase(conv);
                                  }}
                                  className="flex-1 text-xs px-2 py-1.5 bg-blue-50 text-blue-700 border border-blue-300 rounded hover:bg-blue-100 transition"
                                >
                                  ⚖️ Criar caso
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLinkCase(conv);
                                  }}
                                  className="flex-1 text-xs px-2 py-1.5 bg-purple-50 text-purple-700 border border-purple-300 rounded hover:bg-purple-100 transition"
                                >
                                  🔗 Vincular
                                </button>
                              </div>
                            )}
                            {['acao_protocolada', 'aguardando_decisao', 'encerrado'].includes(conv.funnel_stage) && !activeCases[conv.id] && (
                              <div className="text-xs text-orange-600 bg-orange-50 border border-orange-200 rounded px-2 py-1.5 mt-1">
                                ⚠️ Inconsistência: estágio avançado sem caso
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Dropdown para mudar stage */}
                    <select
                      value={conv.funnel_stage || 'lead_novo'}
                      onChange={(e) => handleStageSelect(conv, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      disabled={loading}
                      data-testid="funnel-stage-select"
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

      {/* Modais de Caso */}
      {selectedConvForCase && (
        <>
          <CaseCreationModal
            isOpen={showCaseCreationModal}
            onClose={() => {
              setShowCaseCreationModal(false);
              setSelectedConvForCase(null);
            }}
            conversation={selectedConvForCase}
            onSuccess={handleCaseCreated}
          />

          <CaseLinkModal
            isOpen={showCaseLinkModal}
            onClose={() => {
              setShowCaseLinkModal(false);
              setSelectedConvForCase(null);
            }}
            conversationId={selectedConvForCase.id}
            onSuccess={handleCaseLinked}
          />
        </>
      )}

      {pendingStageChange && (
        <ConfirmModal
          isOpen={true}
          title="Confirmar mudança de estágio"
          onConfirm={handleStageChange}
          onCancel={() => setPendingStageChange(null)}
          loading={loading}
          disabled={loading}
          error={stageChangeError}
        >
          <p>
            <strong>Atual:</strong>{' '}
            {FUNNEL_STAGES.find(s => s.id === pendingStageChange.conversation.funnel_stage)?.label || pendingStageChange.conversation.funnel_stage}
          </p>
          <p>
            <strong>Destino:</strong>{' '}
            {FUNNEL_STAGES.find(s => s.id === pendingStageChange.newStage)?.label || pendingStageChange.newStage}
          </p>
          <p className="text-yellow-700 bg-yellow-50 border border-yellow-200 rounded p-2">
            Atenção: esta alteração atualiza o estágio do Funil, mas não cria caso, prazo, evento ou tarefa automaticamente.
          </p>
        </ConfirmModal>
      )}

    </div>
  );
}
