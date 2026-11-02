import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { canAccessFeature, isTrialActive, calculateTrialDaysRemaining } from '../lib/plans';
import SubscriptionModal from './SubscriptionModal';

/**
 * FeatureGate: Protege seções e abas do sistema conforme o plano do escritório.
 * Durante o período de teste (Trial 30 dias), o acesso é TOTALMENTE LIBERADO,
 * exibindo uma ressalva informativa amigável destacando a exclusividade do plano.
 *
 * @param {string} feature - Nome do recurso (ex: 'triage_ai', 'signatures', 'fee_reports', 'rag_custom')
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
  const inTrial = isTrialActive(office);
  const daysLeft = calculateTrialDaysRemaining(office?.trial_ends_at);

  // Master Admin e Matriz sempre têm acesso total sem banners
  const isMasterOrMatriz = isMaster?.() || office?.id === '00000000-0000-0000-0000-000000000001';

  // Verifica se o plano base (fora de trial) possui esse recurso
  const hasAccess = isMasterOrMatriz || canAccessFeature(planKey, feature, office);

  if (hasAccess) {
    return (
      <>
        {inTrial && !isMasterOrMatriz && (
          <div className="mb-4 mx-2 md:mx-4 px-4 py-3 bg-gradient-to-r from-amber-500/15 via-blue-900/20 to-transparent border border-amber-500/30 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs text-amber-200 shadow-sm animate-fadeIn">
            <div className="flex items-center gap-2.5">
              <span className="text-base">✨</span>
              <span>
                Você está utilizando esta funcionalidade exclusiva do <strong>Plano {requiredPlan}</strong> durante o período de <strong>Teste Grátis ({daysLeft} dias restantes)</strong>.
              </span>
            </div>
            <button
              onClick={() => setShowSubscription(true)}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold rounded-lg text-xs transition whitespace-nowrap shadow-md hover:scale-[1.02]"
            >
              🚀 Solicitar Upgrade
            </button>
          </div>
        )}
        {children}
        <SubscriptionModal
          open={showSubscription}
          onClose={() => setShowSubscription(false)}
        />
      </>
    );
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
        Este recurso exclusivo faz parte do plano <strong>{requiredPlan}</strong>. Solicite o upgrade agora para automatizar ainda mais as rotinas jurídicas do seu escritório.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={() => setShowSubscription(true)}
          className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition transform hover:-translate-y-0.5 text-sm"
        >
          🚀 Solicitar Upgrade para {requiredPlan}
        </button>
      </div>

      <SubscriptionModal
        open={showSubscription}
        onClose={() => setShowSubscription(false)}
      />
    </div>
  );
}
