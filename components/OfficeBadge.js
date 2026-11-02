import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { safeError } from '../lib/safeLogger';
import { isTrialActive, calculateTrialDaysRemaining } from '../lib/plans';
import SubscriptionModal from './SubscriptionModal';

const FALLBACK_OFFICE = { name: 'Neves & Costa Advogados', plan: 'pro', status: 'active' };

const PLAN_LABELS = {
  trial: 'TRIAL',
  basico: 'BÁSICO',
  basic: 'BÁSICO',
  profissional: 'PRO',
  pro: 'PRO',
  enterprise: 'ENTERPRISE'
};

export default function OfficeBadge() {
  const [office, setOffice] = useState(null);
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    let mounted = true;
    apiJson('/api/office/current')
      .then((data) => {
        if (mounted && data) setOffice(data);
      })
      .catch((err) => {
        safeError('office_badge_load_error', err, { component: 'OfficeBadge' });
      });
    return () => { mounted = false; };
  }, []);

  const current = office || FALLBACK_OFFICE;
  const planKey = (current.plan || 'pro').toLowerCase();
  const planLabel = PLAN_LABELS[planKey] || String(current.plan || 'PRO').toUpperCase();
  const inTrial = isTrialActive(current);
  const trialDays = calculateTrialDaysRemaining(current.trial_ends_at);
  const isEnterprise = planKey === 'enterprise';

  return (
    <>
      <div className="w-full flex flex-col items-center gap-1.5 px-1 py-2 text-center" data-testid="office-badge">
        <span className="text-[10px] font-semibold text-nc-gray-300 leading-tight w-full truncate" title={current.name}>
          {current.name}
        </span>

        {inTrial ? (
          <div className="w-full flex flex-col items-center gap-1">
            <span
              className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 w-full truncate text-center"
              data-testid="office-plan-badge"
              title={`${trialDays} dias restantes de teste grátis`}
            >
              🕒 {trialDays} dias restantes
            </span>
            <button
              type="button"
              onClick={() => setShowPlans(true)}
              className="w-full text-[9px] py-1 px-1 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-extrabold rounded shadow-sm transition hover:scale-[1.02]"
            >
              Fazer Upgrade
            </button>
          </div>
        ) : (
          <div className="w-full flex flex-col items-center gap-1">
            <span
              className={`text-[9px] px-2 py-0.5 rounded font-bold ${
                isEnterprise
                  ? 'bg-purple-900/60 text-purple-300 border border-purple-500/40'
                  : planLabel === 'PRO'
                  ? 'bg-nc-yellow text-nc-black'
                  : 'bg-nc-gray-700 text-nc-gray-200'
              }`}
              data-testid="office-plan-badge"
            >
              {isEnterprise ? '👑 ENTERPRISE' : planLabel}
            </span>
            {!isEnterprise && (
              <button
                type="button"
                onClick={() => setShowPlans(true)}
                className="text-[9px] text-amber-400 hover:text-amber-300 underline font-semibold transition"
              >
                Solicitar Upgrade
              </button>
            )}
          </div>
        )}
      </div>
      <SubscriptionModal open={showPlans} onClose={() => setShowPlans(false)} />
    </>
  );
}
