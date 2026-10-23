// ============================================================================
// Planos comerciais do SaaS (multi-escritorio)
// ============================================================================

export const PLANS = {
  basico: {
    name: 'Básico',
    price: 49,
    interval: 'mês',
    description: 'Para advogados autônomos'
  },
  profissional: {
    name: 'Profissional',
    price: 99,
    interval: 'mês',
    description: 'Para pequenos e médios escritórios'
  },
  enterprise: {
    name: 'Enterprise',
    price: 199,
    interval: 'mês',
    description: 'Para grandes bancas jurídicas'
  }
};

export function getPlanDetails(planKey) {
  return PLANS[planKey] || null;
}

export function calculateTrialDaysRemaining(trialEndsAt) {
  if (!trialEndsAt) return 0;
  const end = new Date(trialEndsAt);
  if (Number.isNaN(end.getTime())) return 0;
  const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}
