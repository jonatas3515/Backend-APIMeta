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

  // Caso ativo existe - mostrar botão para abrir
  if (activeCase) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-blue-600 font-medium">📋 Caso Vinculado</span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                {activeCase.status}
              </span>
            </div>
            <p className="text-sm text-gray-700 mt-1">{activeCase.title}</p>
            {activeCase.legal_area && (
              <p className="text-xs text-gray-500 mt-1">
                {activeCase.legal_area} {activeCase.case_type && `• ${activeCase.case_type}`}
              </p>
            )}
          </div>
          <button
            onClick={onOpenCase}
            className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Abrir Caso
          </button>
        </div>
      </div>
    );
  }

  // Sugestão para criar/vincular caso
  if (isEligible && canEdit) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-green-800 font-medium">✨ Pronto para criar caso jurídico</p>
            <p className="text-sm text-gray-600 mt-1">
              Esta conversa está em <strong>{conversation.funnel_stage}</strong> e pode ser convertida em caso.
            </p>
          </div>
          <div className="flex gap-2 ml-4">
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
          </div>
        </div>
      </div>
    );
  }

  // Aviso de inconsistência (estágio avançado sem caso)
  if (showInconsistencyWarning) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-yellow-800 font-medium">⚠️ Atenção</p>
            <p className="text-sm text-gray-600 mt-1">
              Esta conversa está em <strong>{conversation.funnel_stage}</strong> mas não possui caso ativo vinculado.
            </p>
          </div>
          <div className="flex gap-2 ml-4">
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
          </div>
        </div>
      </div>
    );
  }

  return null;
}
