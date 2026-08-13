import { useState } from 'react';

const FILTERS = [
  { key: 'all', label: 'Tudo' },
  { key: 'unread', label: 'Não lidos' },
  { key: 'archived', label: 'Arquivados' }
];

const LEGAL_AREA_OPTIONS = [
  { value: '', label: 'Área' },
  { value: 'trabalhista', label: 'Trabalhista' },
  { value: 'administrativo', label: 'Administrativo' },
  { value: 'previdenciario', label: 'Previdenciário' },
  { value: 'civel', label: 'Cível' },
  { value: 'consumidor', label: 'Consumidor' }
];

export default function ChatList({ conversations, selectedConversation, onSelectConversation, loading, onNewConversation, onDeleteConversation, deletingId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [triageFilters, setTriageFilters] = useState({ legal_area: '', municipality: '', agency: '', client_role: '' });

  const uniqueValues = (field) => {
    const values = [];
    conversations.forEach(c => {
      const v = c[field];
      if (v && !values.includes(v)) values.push(v);
    });
    return values.sort();
  };

  if (loading) {
    return (
      <div className="w-full h-full bg-nc-white border-r border-nc-gray-300 flex items-center justify-center">
        <p className="text-nc-text-muted">Carregando conversas...</p>
      </div>
    );
  }

  const filteredConversations = conversations
    .filter(conv => {
      if (activeFilter === 'unread') return conv.unread === true;
      if (activeFilter === 'archived') return conv.archived === true;
      return !conv.archived; // Tudo = ativas (não arquivadas)
    })
    .filter(conv => {
      if (triageFilters.legal_area && conv.legal_area !== triageFilters.legal_area) return false;
      if (triageFilters.municipality && conv.municipality !== triageFilters.municipality) return false;
      if (triageFilters.agency && conv.agency !== triageFilters.agency) return false;
      if (triageFilters.client_role && conv.client_role !== triageFilters.client_role) return false;
      return true;
    })
    .filter(conv => {
      const search = searchTerm.toLowerCase();
      return (
        conv.client_name?.toLowerCase().includes(search) ||
        conv.client_phone?.includes(search) ||
        conv.legal_area?.toLowerCase().includes(search) ||
        conv.case_type?.toLowerCase().includes(search)
      );
    });

  return (
    <div className="w-full h-full bg-nc-white border-r border-nc-gray-300 flex flex-col">
      <div className="p-4 border-b border-nc-gray-200">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-bold text-nc-text-title">Conversas</h1>
          <button
            onClick={onNewConversation}
            className="w-8 h-8 bg-nc-yellow text-nc-black rounded-nc hover:bg-nc-yellow-600 flex items-center justify-center text-xl font-semibold transition"
            title="Nova conversa"
          >
            +
          </button>
        </div>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Pesquisar..."
          className="nc-input"
        />
        <div className="flex gap-2 mt-3">
          {FILTERS.map(filter => (
            <button
              key={filter.key}
              onClick={() => setActiveFilter(filter.key)}
              className={`flex-1 py-1.5 px-2 rounded-nc text-xs font-medium transition border ${
                activeFilter === filter.key
                  ? 'bg-nc-yellow text-nc-black border-nc-yellow'
                  : 'bg-nc-white text-nc-text-secondary border-nc-gray-300 hover:border-nc-yellow hover:text-nc-yellow'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* Filtros de triagem jurídica */}
        <div className="grid grid-cols-2 gap-2 mt-3">
          <select
            value={triageFilters.legal_area}
            onChange={(e) => setTriageFilters({ ...triageFilters, legal_area: e.target.value })}
            className="nc-select text-xs py-1.5"
          >
            {LEGAL_AREA_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <select
            value={triageFilters.municipality}
            onChange={(e) => setTriageFilters({ ...triageFilters, municipality: e.target.value })}
            className="nc-select text-xs py-1.5"
          >
            <option value="">Município</option>
            {uniqueValues('municipality').map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          <select
            value={triageFilters.agency}
            onChange={(e) => setTriageFilters({ ...triageFilters, agency: e.target.value })}
            className="nc-select text-xs py-1.5"
          >
            <option value="">Órgão</option>
            {uniqueValues('agency').map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>

          <select
            value={triageFilters.client_role}
            onChange={(e) => setTriageFilters({ ...triageFilters, client_role: e.target.value })}
            className="nc-select text-xs py-1.5"
          >
            <option value="">Papel</option>
            {uniqueValues('client_role').map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.length === 0 ? (
          <div className="p-3 text-center text-nc-text-muted text-sm">
            {searchTerm ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => onSelectConversation(conv)}
              className={`px-3 py-2 border-b border-nc-gray-150 cursor-pointer transition relative ${
                selectedConversation?.id === conv.id
                  ? 'bg-nc-gray-100 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-nc-yellow'
                  : 'hover:bg-nc-gray-50'
              }`}
            >
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <p className={`text-sm font-medium truncate ${
                      selectedConversation?.id === conv.id ? 'text-nc-text-title' : 'text-nc-text'
                    }`}>
                      {conv.client_name || conv.client_phone}
                    </p>
                    <span className="text-xs text-nc-text-muted whitespace-nowrap">
                      {(() => {
                        const now = new Date();
                        const updated = new Date(conv.updated_at);
                        const diffMinutes = Math.floor((now - updated) / (1000 * 60));

                        if (diffMinutes < 1) return 'Agora';
                        if (diffMinutes < 60) return `${diffMinutes}m`;
                        if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h`;
                        return updated.toLocaleDateString('pt-BR');
                      })()}
                    </span>
                  </div>
                  {(conv.legal_area || conv.case_type) && (
                    <div className="flex flex-wrap gap-0.5 mb-1">
                      {conv.legal_area && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-nc-gray-100 text-nc-text-secondary border border-nc-gray-200">
                          {conv.legal_area}
                        </span>
                      )}
                      {conv.case_type && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-nc-white text-nc-text-secondary border border-nc-gray-200">
                          {conv.case_type}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-nc-text-secondary truncate">
                    {conv.messages?.[0]?.text || 'Sem mensagens'}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Status de leitura: ✓✓ azul = lido, ✓ cinza = enviado */}
                  <span className="text-xs" title={conv.unread ? 'Não lido' : 'Lido'}>
                    {conv.unread ? '✓' : '✓✓'}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteConversation(conv);
                    }}
                    disabled={deletingId === conv.id}
                    className="text-nc-text-muted hover:text-red-600 text-xs transition"
                    title="Excluir conversa"
                  >
                    {deletingId === conv.id ? '...' : '🗑️'}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
