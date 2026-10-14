import { useState, useEffect } from 'react';

/**
 * Banner de sugestão para criar ou vincular caso
 * Exibido em Chat e Funil quando conversa está elegível
 * 
 * Props:
 * - conversation: objeto da conversa com funnel_stage
 * - activeCase: caso ativo vinculado (se existir)
 * - userRole: role do usuário (admin, advogado, estagiario)
 * - onCreateCase: callback para abrir modal de criação
 * - onLinkCase: callback para abrir modal de vinculação
 * - onOpenCase: callback para navegar ao caso ativo
 */
export default function CaseSuggestionBanner({
  conversation,
  activeCase,
  userRole,
  onCreateCase,
  onLinkCase,
  onOpenCase
}) {
  const [isEligible, setIsEligible] = useState(false);
  const [showInconsistencyWarning, setShowInconsistencyWarning] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const canEdit = userRole === 'admin' || userRole === 'advogado';

  // Estágios elegíveis para sugestão automática
  const eligibleStages = [
    'intake_concluido',
    'proposta_enviada',
    'contrato_assinado'
  ];

  // Estágios avançados que devem ter caso
  const advancedStages = [
    'acao_protocolada',
    'aguardando_decisao',
    'encerrado'
  ];

  useEffect(() => {
    if (!conversation) return;

    const stage = conversation.funnel_stage;
    const hasActiveCase = !!activeCase;

    // Verificar elegibilidade
    if (eligibleStages.includes(stage) && !hasActiveCase) {
      setIsEligible(true);
      setShowInconsistencyWarning(false);
    } else if (advancedStages.includes(stage) && !hasActiveCase) {
      // Inconsistência: estágio avançado sem caso ativo
      setIsEligible(false);
      setShowInconsistencyWarning(canEdit);
    } else {
      setIsEligible(false);
      setShowInconsistencyWarning(false);
    }
  }, [conversation, activeCase, canEdit]);

  const hasBanner = !!activeCase || (isEligible && canEdit) || showInconsistencyWarning;

  // Estado colapsado: barra fina de 1 linha
  if (isCollapsed && hasBanner) {
    const collapsedText = activeCase
      ? `📋 ${activeCase.title || 'Caso vinculado'}`
      : isEligible
        ? '✨ Conversa pronta para virar caso'
        : '⚠️ Conversa sem caso vinculado';
    const collapsedColor = activeCase
      ? 'bg-blue-50 border-blue-200 text-blue-800'
      : isEligible
        ? 'bg-green-50 border-green-200 text-green-800'
        : 'bg-yellow-50 border-yellow-200 text-yellow-800';
    return (
      <div className={`border rounded-lg px-3 py-1.5 mb-4 flex items-center justify-between gap-2 ${collapsedColor}`}>
        <span className="text-xs font-medium truncate">{collapsedText}</span>
        <div className="flex items-center gap-1 flex-shrink-0">
          {activeCase && (
            <button
              onClick={onOpenCase}
              className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Abrir Caso
            </button>
          )}
          {!activeCase && canEdit && (
            <button
              onClick={onCreateCase}
              className="text-xs px-2 py-0.5 bg-white border border-current rounded hover:opacity-80 transition-colors"
            >
              Criar Caso
            </button>
          )}
          <button
            onClick={() => setIsCollapsed(false)}
            className="text-xs px-1.5 py-0.5 text-current opacity-70 hover:opacity-100 transition"
            title="Expandir"
          >
            ▼
          </button>
        </div>
      </div>
    );
  }

  // Caso ativo existe - mostrar botão para abrir
  if (activeCase) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5 md:p-4 mb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-2">
            <span className="text-blue-600 font-medium text-sm truncate">📋 {activeCase.title}</span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded flex-shrink-0">
              {activeCase.status}
            </span>
            {activeCase.legal_area && (
              <span className="hidden md:inline text-xs text-gray-500">
                {activeCase.legal_area} {activeCase.case_type && `• ${activeCase.case_type}`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={onOpenCase}
              className="px-3 py-1.5 md:px-4 md:py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Abrir Caso
            </button>
            <button
              onClick={() => setIsCollapsed(true)}
              className="p-1.5 text-blue-400 hover:text-blue-600 transition"
              title="Minimizar"
            >
              ▲
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Sugestão para criar/vincular caso
  if (isEligible && canEdit) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 md:p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-green-800 font-medium">✨ Pronto para criar caso jurídico</p>
            <p className="text-sm text-gray-600 mt-1">
              Esta conversa está em <strong>{conversation.funnel_stage}</strong> e pode ser convertida em caso.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-2 ml-2 md:ml-4">
            <button
              onClick={onCreateCase}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors whitespace-nowrap"
            >
              + Criar Caso
            </button>
            <button
              onClick={onLinkCase}
              className="px-4 py-2 bg-white border border-green-600 text-green-700 text-sm rounded hover:bg-green-50 transition-colors whitespace-nowrap"
            >
              🔗 Vincular Existente
            </button>
            <button
              onClick={() => setIsCollapsed(true)}
              className="self-start p-1.5 text-green-400 hover:text-green-600 transition"
              title="Minimizar"
            >
              ▲
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Aviso de inconsistência (estágio avançado sem caso)
  if (showInconsistencyWarning) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2.5 md:p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-yellow-800 font-medium">⚠️ Atenção</p>
            <p className="text-sm text-gray-600 mt-1">
              Esta conversa está em <strong>{conversation.funnel_stage}</strong> mas não possui caso ativo vinculado.
            </p>
          </div>
          <div className="flex flex-col md:flex-row gap-2 ml-2 md:ml-4">
            <button
              onClick={onCreateCase}
              className="px-4 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 transition-colors whitespace-nowrap"
            >
              + Criar Caso
            </button>
            <button
              onClick={onLinkCase}
              className="px-4 py-2 bg-white border border-yellow-600 text-yellow-700 text-sm rounded hover:bg-yellow-50 transition-colors whitespace-nowrap"
            >
              🔗 Vincular Existente
            </button>
            <button
              onClick={() => setIsCollapsed(true)}
              className="self-start p-1.5 text-yellow-500 hover:text-yellow-700 transition"
              title="Minimizar"
            >
              ▲
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
