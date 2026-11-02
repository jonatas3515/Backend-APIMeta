// ============================================================================
// Planos comerciais do SaaS (multi-escritorio) e Matriz de Permissões
// ============================================================================

export const PLANS = {
  trial: {
    name: 'Trial (14 dias)',
    price: 0,
    interval: 'dias',
    max_cases: 100,
    max_users: 3,
    description: '14 dias de teste grátis com recursos completos',
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda',
      'ai_extract_decision',
      'document_requests',
      'document_generator',
      'fee_reports',
      'calendar_sync'
    ]
  },
  basico: {
    name: 'Básico',
    price: 49,
    interval: 'mês',
    max_cases: 100,
    max_users: 1,
    description: 'Para advogados autônomos em início de carreira',
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda'
    ]
  },
  profissional: {
    name: 'Profissional',
    price: 99,
    interval: 'mês',
    max_cases: 500,
    max_users: 5,
    description: 'Para pequenos e médios escritórios de advocacia',
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda',
      'ai_extract_decision',
      'document_requests',
      'document_generator',
      'fee_reports',
      'calendar_sync'
    ]
  },
  enterprise: {
    name: 'Enterprise',
    price: 199,
    interval: 'mês',
    max_cases: -1, // Ilimitado
    max_users: -1, // Ilimitado
    description: 'Para bancas jurídicas e departamentos jurídicos de grande porte',
    features: [
      'chat_whatsapp',
      'cases',
      'tasks',
      'agenda',
      'ai_extract_decision',
      'document_requests',
      'document_generator',
      'fee_reports',
      'calendar_sync',
      'signatures',
      'triage_ai',
      'rag_custom',
      'priority_support'
    ]
  }
};

export function getPlanDetails(planKey) {
  return PLANS[planKey] || PLANS.trial;
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

  // Se estiver em período de trial ativo, tem as permissões do plano Trial (que inclui Profissional)
  if (isTrialActive(office)) {
    return PLANS.trial.features.includes(featureName);
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
