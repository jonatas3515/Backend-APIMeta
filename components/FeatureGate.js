import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { canAccessFeature, getPlanDetails } from '../lib/plans';
import SubscriptionModal from './SubscriptionModal';

/**
 * FeatureGate: Protege seções e abas do sistema conforme o plano do escritório.
 *
 * @param {string} feature - Nome do recurso (ex: 'ai_extract_decision', 'signatures', 'fee_reports', 'document_generator')
 * @param {string} title - Título amigável da funcionalidade
 * @param {string} requiredPlan - Nome do plano mínimo exigido ('Profissional', 'Enterprise')
 * @param {ReactNode} children - Conteúdo exibido se o escritório tiver acesso
 */
export default function FeatureGate({
  feature,
  title = 'Recurso Avançado',
  requiredPlan = 'Profissional',
  children
}) {
  const { profile, isMaster } = useAuth();
  const [showSubscription, setShowSubscription] = useState(false);

  const office = profile?.office;
  const planKey = (office?.plan || 'trial').toLowerCase();

  // Master Admin e Matriz sempre têm acesso total
  const hasAccess = isMaster?.() || canAccessFeature(planKey, feature, office);

  if (hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-gray-900/60 border border-gray-800 rounded-2xl m-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-3xl shadow-inner">
        ⭐
      </div>
      <h3 className="text-xl font-bold text-white mb-2">
        {title} — Disponível no Plano {requiredPlan}
      </h3>
      <p className="text-gray-400 max-w-md text-sm mb-6 leading-relaxed">
        Este recurso exclusivo faz parte do plano <strong>{requiredPlan}</strong>. Faça o upgrade agora para automatizar ainda mais as rotinas jurídicas do seu escritório.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => setShowSubscription(true)}
          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition transform hover:-translate-y-0.5 text-sm"
        >
          🚀 Fazer Upgrade para {requiredPlan}
        </button>
      </div>

      <SubscriptionModal
        open={showSubscription}
        onClose={() => setShowSubscription(false)}
      />
    </div>
  );
}
