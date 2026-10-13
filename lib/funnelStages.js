// Etapas padronizadas do funil de atendimento.
// Fonte única: usada por FunnelKanban, ChatWindow e LegalClassification.
// Mantenha sincronizado com FUNNEL_STAGES de pages/api/funnel.js.
export const FUNNEL_STAGES = [
  { id: 'lead_novo', label: '🆕 Lead Novo' },
  { id: 'intake_em_andamento', label: '📥 Intake em Andamento' },
  { id: 'intake_concluido', label: '✅ Intake Concluído' },
  { id: 'proposta_enviada', label: '💰 Proposta Enviada' },
  { id: 'contrato_assinado', label: '📝 Contrato Assinado' },
  { id: 'acao_protocolada', label: '⚖️ Ação Protocolada' },
  { id: 'aguardando_decisao', label: '⏳ Aguardando Decisão' },
  { id: 'encerrado', label: '🏁 Encerrado' }
];

// Valores legados gravados em conversas antigas → etapa atual equivalente
const LEGACY_STAGE_MAP = {
  intake: 'intake_em_andamento',
  qualificacao: 'intake_concluido',
  proposta: 'proposta_enviada',
  contrato: 'contrato_assinado',
  andamento: 'acao_protocolada',
  pos_caso: 'encerrado'
};

export function normalizeFunnelStage(stage) {
  return LEGACY_STAGE_MAP[stage] || stage;
}

export function getFunnelStageLabel(stage) {
  const normalized = normalizeFunnelStage(stage);
  return FUNNEL_STAGES.find(s => s.id === normalized)?.label || normalized || 'Lead Novo';
}
