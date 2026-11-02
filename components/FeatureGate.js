import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { canAccessFeature, isTrialActive, calculateTrialDaysRemaining } from '../lib/plans';
import SubscriptionModal from './SubscriptionModal';

/**
 * Banner informativo de destaque com alto contraste (compatível com tema claro e escuro)
 * exibindo o plano exigido e os dias restantes de teste grátis.
 */
export function TrialBanner({ requiredPlan = 'Profissional', daysLeft = 30, onUpgrade }) {
  return (
    <div className="mb-4 mx-2 md:mx-4 p-3.5 bg-slate-900 border-2 border-amber-500/80 rounded-xl shadow-xl flex flex-wrap items-center justify-between gap-3 text-slate-100 animate-fadeIn">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xl">✨</span>
        <span className="text-xs sm:text-sm font-medium">
          Você está utilizando esta funcionalidade exclusiva do
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 text-slate-950 font-black text-xs uppercase tracking-wide shadow-md">
          👑 Plano {requiredPlan}
        </span>
        <span className="text-xs sm:text-sm font-medium">
          durante o período de
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 text-white font-black text-xs shadow-md">
          ⏳ {daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}
        </span>
      </div>

      <button
        type="button"
        onClick={onUpgrade}
        className="px-4 py-2 bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black rounded-lg text-xs sm:text-sm transition transform hover:scale-105 active:scale-95 whitespace-nowrap shadow-lg shadow-amber-500/30 flex items-center gap-1.5"
      >
        🚀 Solicitar Upgrade
      </button>
    </div>
  );
}

/**
 * FeatureGate: Protege seções e abas do sistema conforme o plano do escritório.
 * Durante o período de teste (Trial 30 dias), o acesso é TOTALMENTE LIBERADO,
 * exibindo uma ressalva informativa amigável destacando a exclusividade do plano.
 *
 * @param {string} feature - Nome do recurso (ex: 'triage_ai', 'signatures', 'fee_reports', 'rag_custom', 'ai_extract_decision')
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

  const isEstagiario = profile?.role === 'estagiario';
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
        {inTrial && !isMasterOrMatriz && !isEstagiario && (
          <TrialBanner
            requiredPlan={requiredPlan}
            daysLeft={daysLeft}
            onUpgrade={() => setShowSubscription(true)}
          />
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
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center bg-slate-900/90 border-2 border-slate-700/60 rounded-2xl m-4 backdrop-blur-sm animate-fadeIn shadow-2xl">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-3xl shadow-inner">
        👑
      </div>
      <h3 className="text-xl font-black text-white mb-2">
        {title} — Exclusivo do Plano {requiredPlan}
      </h3>
      <p className="text-slate-300 max-w-md text-sm mb-6 leading-relaxed">
        Este recurso avançado está disponível para assinantes do <strong className="text-amber-400 font-bold">Plano {requiredPlan}</strong>.
      </p>

      {isEstagiario ? (
        <div className="p-3 bg-slate-800/80 border border-slate-700 text-slate-300 rounded-xl text-xs max-w-md">
          🎓 Você está acessando como <strong>Estagiário</strong>. Solicite ao administrador ou advogado do seu escritório para liberar este recurso através do upgrade de plano.
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setShowSubscription(true)}
            className="bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 hover:from-amber-300 hover:to-yellow-400 text-slate-950 font-black px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/30 transition transform hover:scale-105 active:scale-95 text-sm flex items-center gap-2"
          >
            🚀 Solicitar Upgrade para {requiredPlan}
          </button>
        </div>
      )}

      <SubscriptionModal
        open={showSubscription}
        onClose={() => setShowSubscription(false)}
      />
    </div>
  );
}
