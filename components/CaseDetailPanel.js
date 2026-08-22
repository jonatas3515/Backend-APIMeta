import CollaborationPanel from './CollaborationPanel';
import CaseInsightsPanel from './CaseInsightsPanel';
import CaseProcessMonitoring from './CaseProcessMonitoring';

const TABS = [
  { key: 'visao-geral', label: 'Visão Geral' },
  { key: 'processos', label: 'Processos' },
  { key: 'documentos-checklist', label: 'Documentos e Checklist' },
  { key: 'colaboracao', label: 'Colaboração' },
  { key: 'insights', label: 'Insights' },
];

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function daysUntilDeadline(date) {
  if (!date) return null;
  const today = new Date();
  const deadline = new Date(date);
  const diff = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
  return diff;
}

const STATUS_COLORS = {
  prospect: 'bg-gray-100 text-gray-800',
  em_analise: 'bg-blue-100 text-blue-800',
  proposta_enviada: 'bg-yellow-100 text-yellow-800',
  contrato_assinado: 'bg-purple-100 text-purple-800',
  acao_protocolada: 'bg-orange-100 text-orange-800',
  aguardando_decisao: 'bg-red-100 text-red-800',
  encerrado: 'bg-green-100 text-green-800'
};

const PRIORITY_COLORS = {
  baixa: 'text-green-600',
  media: 'text-yellow-600',
  alta: 'text-red-600'
};

export default function CaseDetailPanel({
  caseItem,
  caseView,
  onChangeView,
  onBack,
  onOpenChecklist,
  onOpenDocuments,
  onOpenFee,
  userRole,
  conversations = [],
  onOpenConversationSelector,
  onUnlinkConversation
}) {
  const daysLeft = daysUntilDeadline(caseItem.deadline_date);
  const linkedConversation = conversations.find((c) => c.id === caseItem.conversation_id);

  return (
    <div className="flex-1 h-full flex flex-col bg-white rounded-lg shadow overflow-hidden">
      {/* Header com navegação */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={onBack}
            className="text-sm text-blue-600 hover:underline"
          >
            ← Voltar para lista
          </button>
          <h2 className="text-lg font-bold text-gray-800 truncate px-2">{caseItem.title}</h2>
          <span className={`text-xs px-2 py-1 rounded ${STATUS_COLORS[caseItem.status] || 'bg-gray-100 text-gray-800'}`}>
            {caseItem.status || 'sem status'}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => onChangeView(tab.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${
                caseView === tab.key
                  ? 'bg-blue-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto p-4">
        {caseView === 'visao-geral' && (
          <div className="space-y-4 max-w-3xl">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Área jurídica</p>
                <p className="text-sm font-medium">{caseItem.legal_area || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Tipo de caso</p>
                <p className="text-sm font-medium">{caseItem.case_type || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Prioridade</p>
                <p className={`text-sm font-medium ${PRIORITY_COLORS[caseItem.priority] || 'text-gray-600'}`}>
                  {caseItem.priority || '-'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Prazo</p>
                <p className="text-sm font-medium">
                  {caseItem.deadline_date ? (
                    <>
                      {formatDate(caseItem.deadline_date)}
                      {daysLeft !== null && (
                        <span className={`ml-2 ${daysLeft < 0 ? 'text-red-600' : daysLeft < 7 ? 'text-orange-600' : 'text-gray-600'}`}>
                          ({daysLeft < 0 ? `${Math.abs(daysLeft)}d atrasado` : `${daysLeft}d restantes`})
                        </span>
                      )}
                    </>
                  ) : '-'}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Município</p>
                <p className="text-sm font-medium">{caseItem.municipality || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Órgão</p>
                <p className="text-sm font-medium">{caseItem.agency || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Papel do cliente</p>
                <p className="text-sm font-medium">{caseItem.client_role || '-'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Tipo de prazo</p>
                <p className="text-sm font-medium">{caseItem.deadline_type || '-'}</p>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded border">
              <p className="text-xs text-gray-500 mb-1">Conversa vinculada</p>
              {linkedConversation ? (
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{linkedConversation.client_name || 'Sem nome'}</p>
                    <p className="text-xs text-gray-500">{linkedConversation.client_phone || 'Sem telefone'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={onOpenConversationSelector}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                    >
                      Trocar
                    </button>
                    <button
                      onClick={onUnlinkConversation}
                      className="px-3 py-1.5 bg-red-600 text-white rounded text-xs hover:bg-red-700"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <p className="text-sm text-gray-600">Nenhuma conversa vinculada.</p>
                  <button
                    onClick={onOpenConversationSelector}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    Vincular conversa
                  </button>
                </div>
              )}
            </div>

            {caseItem.notes && (
              <div className="p-3 bg-gray-50 rounded border">
                <p className="text-xs text-gray-500">Notas</p>
                <p className="text-sm whitespace-pre-wrap">{caseItem.notes}</p>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={onOpenFee}
                className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700"
              >
                💰 Honorários
              </button>
              <button
                onClick={onOpenChecklist}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
              >
                📎 Checklist
              </button>
              <button
                onClick={onOpenDocuments}
                className="px-3 py-1.5 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700"
              >
                📄 Documentos
              </button>
            </div>
          </div>
        )}

        {caseView === 'processos' && (
          <CaseProcessMonitoring caseId={caseItem.id} userRole={userRole} />
        )}

        {caseView === 'documentos-checklist' && (
          <div className="space-y-6 max-w-3xl">
            <p className="text-sm text-gray-600">
              Documentos e checklist são gerenciados em modais para preservar a experiência e permissões atuais.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onOpenChecklist}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                📎 Abrir Checklist
              </button>
              <button
                onClick={onOpenDocuments}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                📄 Abrir Documentos
              </button>
            </div>
          </div>
        )}

        {caseView === 'colaboracao' && (
          <CollaborationPanel conversationId={caseItem.conversation_id} caseId={caseItem.id} />
        )}

        {caseView === 'insights' && (
          <CaseInsightsPanel conversationId={caseItem.conversation_id} caseId={caseItem.id} />
        )}
      </div>
    </div>
  );
}
