// Etapas padronizadas do funil de atendimento.
// Fonte única: usada por FunnelKanban, ChatWindow, ChatList e LegalClassification.
// Mantenha sincronizado com FUNNEL_STAGES de pages/api/funnel.js.
export const FUNNEL_STAGES = [
  { id: 'lead_novo', label: '🆕 Lead Novo', short: 'Novo' },
  { id: 'intake_em_andamento', label: '📥 Intake em Andamento', short: 'Intake' },
  { id: 'intake_concluido', label: '✅ Intake Concluído', short: 'Qualificado' },
  { id: 'proposta_enviada', label: '💰 Proposta Enviada', short: 'Proposta' },
  { id: 'contrato_assinado', label: '📝 Contrato Assinado', short: 'Contrato' },
  { id: 'acao_protocolada', label: '⚖️ Ação Protocolada', short: 'Em Juízo' },
  { id: 'aguardando_decisao', label: '⏳ Aguardando Decisão', short: 'Aguardando' },
  { id: 'encerrado', label: '🏁 Encerrado', short: 'Encerrado' }
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

// Badge compacto: emoji + rótulo curto (ex: "💰 Proposta", "📝 Contrato")
export function getFunnelStageShortLabel(stage) {
  const normalized = normalizeFunnelStage(stage) || 'lead_novo';
  const entry = FUNNEL_STAGES.find(s => s.id === normalized);
  if (!entry) return normalized;
  return `${entry.label.split(' ')[0]} ${entry.short}`;
}

// Posição ordinal da etapa no funil (-1 se desconhecida)
export function getFunnelStageIndex(stage) {
  return FUNNEL_STAGES.findIndex(s => s.id === normalizeFunnelStage(stage));
}
