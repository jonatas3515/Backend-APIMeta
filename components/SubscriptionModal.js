import { useEffect, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { PLANS } from '../lib/plans';
import { safeError } from '../lib/safeLogger';

const PLAN_ORDER = ['basico', 'profissional', 'enterprise'];
const PLAN_MATCHES = { basico: 'basico', basic: 'basico', profissional: 'profissional', pro: 'profissional', enterprise: 'enterprise', trial: null };

export default function SubscriptionModal({ open, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);
    setMessage(null);
    apiJson('/api/subscriptions/current')
      .then((result) => {
        if (mounted) setData(result);
      })
      .catch((err) => {
        safeError('subscription_current_error', err, { component: 'SubscriptionModal' });
        if (mounted) setMessage({ type: 'error', text: 'Não foi possível carregar a assinatura.' });
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [open]);

  if (!open) return null;

  const currentPlanKey = PLAN_MATCHES[data?.plan] || null;
  const isTrialing = data?.trial?.active && data?.trial?.days_remaining > 0;

  const handleCheckout = async (planKey) => {
    if (checkoutLoading) return;
    setCheckoutLoading(planKey);
    setMessage(null);
    try {
      const result = await apiJson('/api/subscriptions/create-checkout', {
        method: 'POST',
        body: JSON.stringify({ plan: planKey })
      });
      if (result?.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        setMessage({ type: 'success', text: result?.message || 'Stripe em modo demonstração' });
      }
    } catch (err) {
      safeError('subscription_checkout_error', err, { component: 'SubscriptionModal' });
      setMessage({ type: 'error', text: err?.message || 'Não foi possível iniciar o checkout.' });
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="font-bold text-lg">Planos e Assinatura</h3>
            <p className="text-xs text-gray-500">{data?.office?.name || 'Seu escritório'}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="p-4">
          {isTrialing && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800" data-testid="trial-banner">
              Você está em período de teste: <strong>{data.trial.days_remaining} dia(s) restante(s)</strong>.
            </div>
          )}

          {message && (
            <div
              className={`mb-4 p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
              role="status"
            >
              {message.text}
            </div>
          )}

          {loading ? (
            <p className="text-center text-sm text-gray-500 py-8">Carregando planos...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {PLAN_ORDER.map((key) => {
                const plan = PLANS[key];
                const isCurrent = currentPlanKey === key;
                const isEnterprise = key === 'enterprise';

                let buttonText = 'Assinar Plano';
                if (isCurrent) {
                  buttonText = isEnterprise ? '👑 Plano Máximo Ativo' : 'Plano Atual';
                } else if (isTrialing) {
                  buttonText = `Contratar ${plan.name}`;
                } else if (currentPlanKey === 'basico') {
                  buttonText = `🚀 Solicitar Upgrade para ${plan.name}`;
                } else if (currentPlanKey === 'profissional' && isEnterprise) {
                  buttonText = `🚀 Solicitar Upgrade para ${plan.name}`;
                }

                return (
                  <div
                    key={key}
                    className={`border rounded-xl p-4 flex flex-col justify-between transition ${
                      isCurrent
                        ? 'border-nc-yellow ring-2 ring-nc-yellow bg-yellow-50/40 shadow-md'
                        : isEnterprise
                        ? 'border-purple-300 bg-gradient-to-b from-purple-50/30 to-white shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    data-testid={`plan-card-${key}`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-bold text-base text-gray-900">{plan.name}</h4>
                        {isCurrent && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-nc-yellow text-nc-black font-extrabold">
                            PLANO ATUAL
                          </span>
                        )}
                        {!isCurrent && isEnterprise && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold">
                            MAIS COMPLETO
                          </span>
                        )}
                      </div>
                      <p className="text-2xl font-black mb-1 text-gray-900">
                        R$ {plan.price}
                        <span className="text-xs font-normal text-gray-500">/{plan.interval}</span>
                      </p>
                      <p className="text-xs text-gray-600 mb-4">{plan.description}</p>

                      <div className="border-t border-gray-100 pt-3 mb-4 space-y-1.5">
                        <p className="text-[11px] font-bold text-gray-700 uppercase tracking-wider mb-2">O que inclui:</p>
                        {(plan.highlights || []).map((highlight, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-xs text-gray-600">
                            <span className="text-green-500 font-bold shrink-0">✓</span>
                            <span>{highlight}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <button
                      onClick={() => handleCheckout(key)}
                      disabled={isCurrent || !!checkoutLoading}
                      className={`w-full py-2.5 rounded-lg text-xs font-bold transition shadow-sm ${
                        isCurrent
                          ? 'bg-gray-100 text-gray-400 cursor-default border border-gray-200'
                          : isEnterprise
                          ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:from-purple-700 hover:to-indigo-700 hover:shadow-md'
                          : 'bg-nc-black text-white hover:bg-nc-gray-800'
                      }`}
                    >
                      {checkoutLoading === key ? 'Abrindo checkout...' : buttonText}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {data?.subscription && (
            <div className="mt-4 text-xs text-gray-500 border-t pt-3">
              Assinatura atual: <strong>{data.subscription.plan}</strong> • Status: {data.subscription.status}
              {data.subscription.current_period_end &&
                ` • Renovação: ${new Date(data.subscription.current_period_end).toLocaleDateString('pt-BR')}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
