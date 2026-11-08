// ============================================================================
// Planos comerciais do SaaS (multi-escritorio) e Matriz de Permissões
// ============================================================================

export const PLANS = {
  trial: {
    name: 'Trial (30 dias)',
    price: 0,
    interval: 'dias',
    max_cases: -1,
    max_users: -1,
    description: '30 dias de teste grátis com todos os recursos liberados',
    highlights: [
      'Acesso completo a todas as ferramentas durante 30 dias',
      'Inteligência Artificial, Triagem e Assistente Jurídico',
      'Assinatura Eletrônica e Central de Honorários',
      'Relatórios Financeiros e Modelos/Rotinas'
    ],
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda',
      'ai_extract_decision',
      'document_requests',
      'document_generator',
      'fee_reports',
      'fee_services',
      'calendar_sync',
      'signatures',
      'triage_ai',
      'rag_custom',
      'models_routines',
      'priority_support'
    ]
  },
  basico: {
    name: 'Básico',
    price: 49,
    interval: 'mês',
    max_cases: 100,
    max_users: 1,
    description: 'Para advogados autônomos gerenciarem processos e clientes',
    highlights: [
      'Atendimento e Chat WhatsApp (1 canal)',
      'Gestão de Casos e Clientes (até 100 processos)',
      'Painel de Tarefas e Prazos com Prioridades',
      'Calendário Mensal de Audiências e Prazos',
      '1 Usuário incluso'
    ],
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda',
      'calendar_sync'
    ]
  },
  profissional: {
    name: 'Profissional',
    price: 99,
    interval: 'mês',
    max_cases: 500,
    max_users: 5,
    description: 'Para escritórios em crescimento que precisam de financeiro e contratos',
    highlights: [
      'Tudo do Plano Básico, mais:',
      'Central de Honorários (Simulador + Tabela OAB própria)',
      'Relatórios Gerenciais e Financeiros',
      'Assinatura Eletrônica integrada (ZapSign / ClickSign)',
      'Gerador de Documentos e Minutas Jurídicas',
      'Funil de Atendimento com Kanban e Etapas',
      'Até 5 Usuários e 500 Processos'
    ],
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda',
      'calendar_sync',
      'document_requests',
      'document_generator',
      'fee_reports',
      'fee_services',
      'signatures',
      'funnel_advanced'
    ]
  },
  enterprise: {
    name: 'Enterprise',
    price: 199,
    interval: 'mês',
    max_cases: -1, // Ilimitado
    max_users: -1, // Ilimitado
    description: 'Banca jurídica de alta performance com Inteligência Artificial completa',
    highlights: [
      'Tudo do Plano Profissional, mais:',
      'IA Jurídica: Triagem Automática de Decisões e Despachos',
      'Assistente Jurídico com IA Especializado',
      'Modelos e Rotinas Processuais Automatizadas',
      'Base de Conhecimento RAG / Doutrina & Jurisprudência',
      'Monitoramento Automático de Movimentações de Tribunais',
      'Usuários e Casos Ilimitados',
      'Suporte VIP via WhatsApp Dedicado'
    ],
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda',
      'calendar_sync',
      'document_requests',
      'document_generator',
      'fee_reports',
      'fee_services',
      'signatures',
      'funnel_advanced',
      'ai_extract_decision',
      'ai_template_extractor',
      'triage_ai',
      'rag_custom',
      'models_routines',
      'priority_support'
    ]
  }
};

export function getPlanDetails(planKey) {
  if (!planKey) return null;
  return PLANS[planKey.toLowerCase()] || null;
}

export function calculateTrialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return 0;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export function isTrialActive(office) {
  if (!office) return false;
  if (office.status === 'active' && office.plan !== 'trial') return false; // Assinante pagante ativo
  if (office.status === 'trial' || office.plan === 'trial') {
    const days = calculateTrialDaysRemaining(office.trial_ends_at);
    return days > 0;
  }
  return false;
}

export function isTrialExpired(office) {
  if (!office) return false;
  // Matriz Neves & Costa nunca expira
  if (office.id === '00000000-0000-0000-0000-000000000001' || office.name?.includes('Neves & Costa')) return false;
  // Assinante pagante ativo não expira por trial
  if (office.status === 'active' && office.plan && office.plan !== 'trial') return false;
  // Se estiver explicitamente suspenso
  if (office.status === 'suspended') return true;
  // Em trial: expira quando dias restantes <= 0
  if (office.status === 'trial' || office.plan === 'trial') {
    const days = calculateTrialDaysRemaining(office.trial_ends_at);
    return days <= 0;
  }
  return false;
}

/**
 * Verifica se um escritório com determinado plano pode acessar uma funcionalidade
 * @param {string} planKey - Chave do plano ('trial', 'basico', 'profissional', 'enterprise')
 * @param {string} featureName - Nome da funcionalidade (ex: 'ai_extract_decision')
 * @param {object} office - Dados do escritório (status, trial_ends_at)
 */
export function canAccessFeature(planKey, featureName, office = null) {
  // Se for Master Admin, sempre liberado
  if (office?.is_master) return true;

  // Se o escritório for matriz Neves & Costa
  if (office?.id === '00000000-0000-0000-0000-000000000001') return true;

  // Se estiver em período de trial ativo, tem ACESSO TOTAL a todas as funcionalidades
  if (isTrialActive(office)) {
    return true;
  }

  const effectivePlanKey = (planKey || 'basico').toLowerCase();
  const plan = PLANS[effectivePlanKey] || PLANS.basico;
  return plan.features.includes(featureName);
}

/**
 * Retorna os limites do plano
 */
export function getPlanLimits(planKey) {
  const plan = PLANS[planKey] || PLANS.basico;
  return {
    max_cases: plan.max_cases,
    max_users: plan.max_users
  };
}
