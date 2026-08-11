import { useState } from 'react';

const FUNNEL_STAGES = [
  { id: 'intake', label: '📥 Intake' },
  { id: 'qualificacao', label: '✅ Qualificação' },
  { id: 'proposta', label: '💰 Proposta' },
  { id: 'contrato', label: '📝 Contrato' },
  { id: 'andamento', label: '⚙️ Andamento' },
  { id: 'pos_caso', label: '🏁 Pós-caso' }
];

const LEGAL_AREAS = [
  { value: '', label: 'Todas as áreas' },
  { value: 'trabalhista', label: 'Trabalhista' },
  { value: 'previdenciario', label: 'Previdenciário' },
  { value: 'civel', label: 'Cível' },
  { value: 'consumidor', label: 'Consumidor' },
  { value: 'administrativo', label: 'Administrativo' }
];

const STATUS_OPTIONS = [
  { value: '', label: 'Todos os status' },
  { value: 'lead', label: 'Lead' },
  { value: 'cliente_ativo', label: 'Cliente Ativo' },
  { value: 'cliente_antigo', label: 'Cliente Antigo' },
  { value: 'caso_recusado', label: 'Caso Recusado' }
];

export default function FunnelKanban({ conversations, onSelectConversation }) {
  const [filters, setFilters] = useState({
    area: '',
    status: '',
    search: ''
  });

  const handleStageChange = (e, conversation) => {
    const newStage = e.target.value;
    // Aqui poderia chamar API para atualizar, por enquanto apenas log
    console.log('Mudar estágio:', conversation.id, newStage);
  };

  const filteredConversations = conversations.filter(conv => {
    if (filters.area && conv.legal_area !== filters.area) return false;
    if (filters.status && conv.client_status !== filters.status) return false;
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

  return (
    <div className="h-full flex flex-col bg-nc-surface">
      {/* Filtros */}
      <div className="bg-nc-white p-4 border-b border-nc-gray-200">
        <h2 className="text-xl font-bold text-nc-text-title mb-3">🎯 Funil de Atendimento</h2>
        <div className="flex gap-3 flex-wrap">
          <select
            value={filters.area}
            onChange={(e) => setFilters({ ...filters, area: e.target.value })}
            className="nc-input w-auto"
          >
            {LEGAL_AREAS.map(area => (
              <option key={area.value} value={area.value}>{area.label}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="nc-input w-auto"
          >
            {STATUS_OPTIONS.map(status => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>

          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Buscar cliente..."
            className="nc-input flex-1 min-w-[200px]"
          />
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {groupedConversations.map(stage => (
            <div
              key={stage.id}
              className="w-72 flex flex-col bg-nc-white rounded-nc border border-nc-gray-300"
            >
              <div className="p-3 bg-nc-gray-100 border-b border-nc-gray-200 rounded-t-nc">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-nc-text-title">{stage.label}</h3>
                  <span className="bg-nc-white text-nc-text border border-nc-gray-300 text-xs px-2 py-1 rounded-full font-medium">
                    {stage.items.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stage.items.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => onSelectConversation(conv)}
                    className="nc-card p-3 cursor-pointer hover:border-nc-yellow transition"
                  >
                    <p className="font-semibold text-sm text-nc-text truncate">
                      {conv.client_name || conv.client_phone}
                    </p>
                    <p className="text-xs text-nc-text-muted mb-2">{conv.client_phone}</p>

                    {conv.legal_area && (
                      <span className="inline-block text-xs px-2 py-1 bg-nc-gray-100 text-nc-text border border-nc-gray-200 rounded mb-1">
                        {conv.legal_area}
                      </span>
                    )}

                    {conv.priority && conv.priority !== 'normal' && (
                      <span className={`inline-block text-xs px-2 py-1 rounded mb-1 ml-1 border ${
                        conv.priority === 'urgente' ? 'bg-nc-gray-100 text-nc-text border-nc-gray-300' :
                        conv.priority === 'alta' ? 'bg-nc-gray-100 text-nc-text border-nc-gray-300' :
                        'bg-nc-white text-nc-text-secondary border-nc-gray-300'
                      }`}>
                        {conv.priority}
                      </span>
                    )}

                    <select
                      value={conv.funnel_stage || 'intake'}
                      onChange={(e) => handleStageChange(e, conv)}
                      onClick={(e) => e.stopPropagation()}
                      className="nc-input w-full mt-2 text-xs"
                    >
                      {FUNNEL_STAGES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                ))}

                {stage.items.length === 0 && (
                  <p className="text-xs text-nc-text-muted text-center py-4">
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
