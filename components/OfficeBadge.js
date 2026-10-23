import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { safeError } from '../lib/safeLogger';
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
  const planLabel = PLAN_LABELS[(current.plan || 'pro').toLowerCase()] || String(current.plan || 'PRO').toUpperCase();

  return (
    <>
      <button
        type="button"
        onClick={() => setShowPlans(true)}
        className="w-full flex flex-col items-center gap-1 px-1 py-2 rounded hover:bg-nc-gray-800/40 transition"
        title={`${current.name} — planos e assinatura`}
        data-testid="office-badge"
      >
        <span className="text-[9px] font-semibold text-nc-gray-300 text-center leading-tight w-full truncate">
          {current.name}
        </span>
        <span
          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
            planLabel === 'PRO'
              ? 'bg-nc-yellow text-nc-black'
              : 'bg-nc-gray-700 text-nc-gray-200'
          }`}
          data-testid="office-plan-badge"
        >
          {planLabel}
        </span>
      </button>
      <SubscriptionModal open={showPlans} onClose={() => setShowPlans(false)} />
    </>
  );
}
