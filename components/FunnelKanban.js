import { useState, useEffect } from 'react';
import { apiJson } from '../lib/apiClient';
import { safeLog, safeError } from '../lib/safeLogger';
import { supabase } from '../lib/supabaseClient';
import useAreaFilter from '../hooks/useAreaFilter';
import { LEGAL_AREAS } from '../lib/legalAreas';
import ExportButtons from './ExportButtons';
import { exportFunnelPdf, exportFunnelExcel } from '../lib/export';
import CaseSuggestionBanner from './CaseSuggestionBanner';
import CaseCreationModal from './CaseCreationModal';
import CaseLinkModal from './CaseLinkModal';
import ConfirmModal from './ConfirmModal';
import { navigateToCase } from '../lib/router';
import { FUNNEL_STAGES as BASE_FUNNEL_STAGES, normalizeFunnelStage } from '../lib/funnelStages';

// Etapas padronizadas do funil (fonte única em lib/funnelStages.js)
const STAGE_COLORS = {
  lead_novo: 'bg-slate-900/90 border-b border-slate-700/60 text-slate-100',
  intake_em_andamento: 'bg-blue-950/70 border-b border-blue-800/60 text-blue-100',
  intake_concluido: 'bg-emerald-950/70 border-b border-emerald-800/60 text-emerald-100',
  proposta_enviada: 'bg-yellow-950/70 border-b border-yellow-800/60 text-yellow-100',
  contrato_assinado: 'bg-purple-950/70 border-b border-purple-800/60 text-purple-100',
  acao_protocolada: 'bg-amber-950/70 border-b border-amber-800/60 text-amber-100',
  aguardando_decisao: 'bg-rose-950/70 border-b border-rose-800/60 text-rose-100',
  encerrado: 'bg-gray-900/90 border-b border-gray-800 text-gray-300'
};

const FUNNEL_STAGES = BASE_FUNNEL_STAGES.map(stage => ({
  ...stage,
  color: STAGE_COLORS[stage.id] || 'bg-gray-100'
}));

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
            .eq('auth_user_id', user.id)
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
        
        const cases = {};
        
        await Promise.all(
          eligibleConvs.map(async (conv) => {
            try {
              const data = await apiJson(`/api/cases?conversation_id=${conv.id}`, { method: 'GET' });
              const list = Array.isArray(data) ? data : (data ? [data] : []);
              const activeCase = list.find(c => c && c.status !== 'encerrado');
              if (activeCase) cases[conv.id] = activeCase;
            } catch (err) {
              if (err.status === 403 || err.status === 404) {
                // Inacessível ou sem caso: não expõe nada
                return;
              }
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
      const result = await apiJson('/api/funnel', {
        method: 'PATCH',
        body: JSON.stringify({
          conversation_id: conversation.id,
          new_stage: newStage,
          reason: 'Movido via Kanban'
        })
      });

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

  // Antigos valores de funnel_stage são normalizados via lib/funnelStages.js

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
    <div className="h-full w-full min-w-0 flex flex-col bg-[#181A1B] text-gray-100">
      {/* Filtros */}
      <div className="bg-[#1B1D1E] p-4 border-b border-gray-800 shadow-sm">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
          <h2 className="text-xl font-bold text-white">🎯 Funil de Atendimento</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400">Total: <strong className="text-white">{totalConversations}</strong> conversas</span>
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
            className="px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-100 focus:outline-none focus:border-nc-yellow"
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
            className="px-3 py-2 bg-[#1E2022] border border-[#2A2D2F] rounded-lg text-sm text-gray-100 placeholder-gray-500 flex-1 min-w-[200px] focus:outline-none focus:border-nc-yellow"
          />
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 min-w-0 overflow-x-auto p-4 bg-[#181A1B]" style={{ minHeight: 0 }}>
        <div className="flex gap-4 h-full min-h-0 min-w-max">
          {groupedConversations.map(stage => (
            <div
              key={stage.id}
              className="w-80 h-full min-h-0 flex flex-col bg-[#1B1D1E] rounded-xl border border-gray-800 shadow-sm overflow-hidden"
            >
              {/* Header da coluna */}
              <div className={`p-3.5 ${stage.color} rounded-t-xl`}>
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-white tracking-wide">{stage.label}</h3>
                  <span className="bg-[#1E2022] text-gray-200 border border-[#2A2D2F] text-xs px-2.5 py-0.5 rounded-full font-bold">
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
                    className="p-3.5 bg-[#1E2022] border border-[#2A2D2F] rounded-xl cursor-pointer hover:border-nc-yellow/60 hover:shadow-lg transition"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-white truncate">
                          {conv.client_name || 'Sem nome'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{conv.client_phone}</p>
                      </div>
                      {conv.mode === 'human' && (
                        <span className="text-[10px] bg-amber-950/50 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded font-semibold ml-1">👤 Humano</span>
                      )}
                    </div>

                    {conv.legal_area && (
                      <span className="inline-block text-xs px-2 py-0.5 bg-blue-950/50 text-blue-300 border border-blue-800/60 rounded font-medium mb-2">
                        {conv.legal_area}
                      </span>
                    )}

                    {conv.has_case && (
                      <span className="inline-block text-xs px-2 py-0.5 bg-emerald-950/50 text-emerald-300 border border-emerald-800/60 rounded font-medium ml-1 mb-2">
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
                            className="w-full text-xs px-2 py-1.5 bg-emerald-950/50 text-emerald-300 border border-emerald-800/60 rounded-lg hover:bg-emerald-900/50 transition font-medium"
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
                                  className="flex-1 text-xs px-2 py-1.5 bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 rounded-lg hover:bg-yellow-500/30 transition font-medium"
                                >
                                  ⚖️ Criar caso
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleLinkCase(conv);
                                  }}
                                  className="flex-1 text-xs px-2 py-1.5 bg-[#181A1B] text-gray-200 border border-[#2A2D2F] rounded-lg hover:bg-gray-800 transition font-medium"
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
                      className="w-full mt-2 px-2 py-1 text-xs border border-[#2A2D2F] rounded bg-[#1B1D1E] hover:bg-[#181A1B] disabled:opacity-50"
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


