import { useState } from 'react';

const FUNNEL_STAGES = [
  { id: 'intake', label: '📥 Intake', color: 'gray' },
  { id: 'qualificacao', label: '✅ Qualificação', color: 'blue' },
  { id: 'proposta', label: '💰 Proposta', color: 'yellow' },
  { id: 'contrato', label: '📝 Contrato', color: 'purple' },
  { id: 'andamento', label: '⚙️ Andamento', color: 'orange' },
  { id: 'pos_caso', label: '🏁 Pós-caso', color: 'green' }
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
    <div className="h-full flex flex-col bg-gray-50">
      {/* Filtros */}
      <div className="bg-white p-4 border-b border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-3">🎯 Funil de Atendimento</h2>
        <div className="flex gap-3 flex-wrap">
          <select
            value={filters.area}
            onChange={(e) => setFilters({ ...filters, area: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {LEGAL_AREAS.map(area => (
              <option key={area.value} value={area.value}>{area.label}</option>
            ))}
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {STATUS_OPTIONS.map(status => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>

          <input
            type="text"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="🔍 Buscar cliente..."
            className="flex-1 min-w-[200px] px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Kanban */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {groupedConversations.map(stage => (
            <div
              key={stage.id}
              className={`w-72 flex flex-col bg-${stage.color}-50 rounded-lg border border-${stage.color}-200`}
            >
              <div className={`p-3 bg-${stage.color}-100 border-b border-${stage.color}-200 rounded-t-lg`}>
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-sm text-gray-800">{stage.label}</h3>
                  <span className={`bg-${stage.color}-200 text-${stage.color}-800 text-xs px-2 py-1 rounded-full font-semibold`}>
                    {stage.items.length}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {stage.items.map(conv => (
                  <div
                    key={conv.id}
                    onClick={() => onSelectConversation(conv)}
                    className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition"
                  >
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {conv.client_name || conv.client_phone}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">{conv.client_phone}</p>

                    {conv.legal_area && (
                      <span className="inline-block text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded mb-1">
                        {conv.legal_area}
                      </span>
                    )}

                    {conv.priority && conv.priority !== 'normal' && (
                      <span className={`inline-block text-xs px-2 py-1 rounded mb-1 ml-1 ${
                        conv.priority === 'urgente' ? 'bg-red-100 text-red-800' :
                        conv.priority === 'alta' ? 'bg-orange-100 text-orange-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {conv.priority}
                      </span>
                    )}

                    <select
                      value={conv.funnel_stage || 'intake'}
                      onChange={(e) => handleStageChange(e, conv)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full mt-2 text-xs px-2 py-1 border border-gray-300 rounded"
                    >
                      {FUNNEL_STAGES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                ))}

                {stage.items.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">
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
