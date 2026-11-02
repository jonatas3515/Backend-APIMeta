import { useState } from 'react';
import SubscriptionModal from './SubscriptionModal';

export default function TrialExpiredBlocker({ office, profile, onSignOut }) {
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const isEstagiario = profile?.role === 'estagiario';
  const officeName = office?.name || 'Seu Escritório';

  const handleSupportWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá! Meu escritório (${officeName}) encerrou o período de teste grátis no JusJNC e tenho interesse em assinar um plano. Poderia me ajudar?`
    );
    window.open(`https://wa.me/5573999348552?text=${text}`, '_blank');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 backdrop-blur-md p-4 text-white"
      data-testid="trial-expired-blocker"
    >
      <div className="max-w-xl w-full bg-gray-900 border border-red-500/30 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center">
        {/* Glow de fundo */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-3xl shadow-lg">
          🔒
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 mb-3">
          Período de Teste Expirado
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
          {officeName}
        </h1>

        <p className="text-sm sm:text-base text-gray-300 mb-6 leading-relaxed">
          O período de avaliação gratuita de 30 dias encerrou.{' '}
          <span className="text-gray-400 block mt-1">
            Todos os seus contatos, processos, tarefas e documentos continuam salvos com segurança.
          </span>
        </p>

        {!isEstagiario ? (
          <div className="space-y-3">
            <button
              onClick={() => setShowSubscriptionModal(true)}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:to-yellow-500 text-black font-extrabold rounded-xl shadow-lg shadow-yellow-500/20 text-sm sm:text-base transition transform hover:-translate-y-0.5"
            >
              🚀 Escolher Plano & Renovar Acesso
            </button>

            <button
              onClick={handleSupportWhatsApp}
              className="w-full py-3 px-4 bg-gray-800 hover:bg-gray-750 text-gray-200 hover:text-white font-semibold rounded-xl border border-gray-700 text-xs sm:text-sm transition flex items-center justify-center gap-2"
            >
              <span>💬</span> Falar com Atendimento / Negociar Plano
            </button>
          </div>
        ) : (
          <div className="bg-gray-800/80 border border-gray-700 rounded-xl p-4 text-xs sm:text-sm text-gray-300 mb-4 text-left">
            <p className="font-semibold text-yellow-400 mb-1">Acesso suspenso para a equipe</p>
            <p className="text-gray-400">
              O período de testes do seu escritório expirou. Solicite ao administrador ou advogado titular da sua banca jurídica que renove a assinatura para restabelecer o acesso.
            </p>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
          <span>JusJNC Advocacia & Tecnologia</span>
          <button
            onClick={onSignOut}
            className="text-red-400 hover:text-red-300 font-medium hover:underline flex items-center gap-1"
          >
            <span>🚪</span> Sair da Conta
          </button>
        </div>
      </div>

      <SubscriptionModal
        open={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
      />
    </div>
  );
}
