import { useState } from 'react';
import { PLANS } from '../lib/plans';

const FEATURES = [
  {
    icon: '💬',
    title: 'Atendimento WhatsApp com IA',
    description: 'Intake inteligente com Gemini: triagem, coleta de dados e respostas automáticas 24/7.'
  },
  {
    icon: '⚖️',
    title: 'Ficha Processual CNJ',
    description: 'Número do processo, tribunal, vara, comarca, fase e valor da causa em um só lugar.'
  },
  {
    icon: '✍️',
    title: 'Assinatura Eletrônica',
    description: 'Contratos e procurações assinados digitalmente com integração ZapSign.'
  },
  {
    icon: '📅',
    title: 'Agenda e Honorários',
    description: 'Prazos sincronizados com Google Calendar, simulador de honorários e funil comercial.'
  }
];

const PLAN_ORDER = [
  { key: 'basico', highlight: false },
  { key: 'profissional', highlight: true },
  { key: 'enterprise', highlight: false }
];

export default function LandingPage({ onOpenLogin }) {
  const [signupOpen, setSignupOpen] = useState(false);
  const [form, setForm] = useState({ office_name: '', admin_name: '', email: '', phone: '', password: '', plan: 'trial' });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const handleSignup = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/auth/register-office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Erro ao criar conta');
      setFeedback({ type: 'success', text: 'Escritório criado! Você já pode entrar no sistema.' });
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Erro ao criar conta' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      {/* Header público */}
      <header className="border-b border-gray-800 bg-gray-900/90 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/JusJNC_White.png" alt="JusJNC Logo" className="h-8 object-contain" />
          </div>
          <div className="flex items-center gap-3">
            <a href="#planos" className="text-sm text-gray-300 hover:text-white transition">Planos</a>
            {onOpenLogin ? (
              <button
                onClick={onOpenLogin}
                className="text-sm px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-white font-medium transition"
              >
                Entrar no Sistema
              </button>
            ) : (
              <a
                href="/"
                className="text-sm px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-white font-medium transition"
              >
                Entrar no Sistema
              </a>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 py-20 text-center">
        <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/30 mb-6">
          Plataforma completa para advocacia
        </span>
        <h1 className="text-3xl md:text-5xl font-bold leading-tight mb-6">
          O Sistema Operacional Completo para{' '}
          <span className="bg-gradient-to-r from-red-500 to-rose-600 bg-clip-text text-transparent">
            Escritórios de Advocacia
          </span>
        </h1>
        <p className="text-gray-400 max-w-2xl mx-auto mb-8 text-sm md:text-base">
          Atendimento automatizado no WhatsApp, gestão de processos, agenda inteligente,
          documentos, assinatura eletrônica e cobrança — tudo em uma única plataforma.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => setSignupOpen(true)}
            className="px-8 py-3 rounded-lg font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/25 transition"
          >
            Começar 14 dias grátis
          </button>
          <a
            href="#planos"
            className="px-8 py-3 rounded-lg font-semibold bg-gray-800 hover:bg-gray-700 text-gray-200 transition"
          >
            Ver planos
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-gray-800 border border-gray-700 rounded-lg p-5 hover:border-red-500/50 transition">
              <span className="text-3xl">{f.icon}</span>
              <h3 className="font-bold mt-3 mb-2 text-sm">{f.title}</h3>
              <p className="text-xs text-gray-400">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-2">Planos para todos os portes</h2>
        <p className="text-gray-400 text-center mb-10 text-sm">Comece grátis por 14 dias. Sem cartão de crédito.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLAN_ORDER.map(({ key, highlight }) => {
            const plan = PLANS[key];
            return (
              <div
                key={key}
                className={`relative rounded-lg p-6 flex flex-col ${
                  highlight
                    ? 'bg-gray-800 border-2 border-red-500 shadow-lg shadow-red-500/25 md:-translate-y-2'
                    : 'bg-gray-800/60 border border-gray-700'
                }`}
              >
                {highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-1 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white">
                    MAIS ESCOLHIDO
                  </span>
                )}
                <h3 className="font-bold text-lg">{plan.name}</h3>
                <p className="text-3xl font-bold mt-2">
                  R$ {plan.price}
                  <span className="text-sm font-normal text-gray-400">/{plan.interval}</span>
                </p>
                <p className="text-xs text-gray-400 mt-2 mb-6 flex-1">{plan.description}</p>
                <button
                  onClick={() => setSignupOpen(true)}
                  className={`w-full py-2.5 rounded-lg font-semibold transition ${
                    highlight
                      ? 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white shadow-lg shadow-red-500/25'
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                  }`}
                >
                  Começar agora
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 text-center text-xs text-gray-500">
        JNC Legal SaaS — Gestão jurídica inteligente.
      </footer>

      {/* Modal de cadastro */}
      {signupOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSignupOpen(false)}>
          <div
            className="bg-gray-800 border border-gray-700 rounded-lg shadow-xl shadow-red-500/10 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">Criar escritório</h3>
                <p className="text-xs text-gray-400">14 dias grátis, sem cartão</p>
              </div>
              <button onClick={() => setSignupOpen(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSignup} className="p-4 space-y-3">
              {feedback && (
                <div className={`p-3 rounded text-sm ${feedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-green-500/10 text-green-400 border border-green-500/30'}`}>
                  {feedback.text}
                </div>
              )}
              <input required type="text" placeholder="Nome do escritório" value={form.office_name}
                onChange={(e) => setForm({ ...form, office_name: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm focus:border-red-500 focus:outline-none" />
              <input required type="text" placeholder="Seu nome completo" value={form.admin_name}
                onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm focus:border-red-500 focus:outline-none" />
              <input required type="email" placeholder="E-mail" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm focus:border-red-500 focus:outline-none" />
              <input type="tel" placeholder="Telefone / WhatsApp" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm focus:border-red-500 focus:outline-none" />
              <input required type="password" placeholder="Senha (mín. 8 caracteres)" minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm focus:border-red-500 focus:outline-none" />
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/25 transition disabled:opacity-60"
              >
                {submitting ? 'Criando...' : 'Criar minha conta grátis'}
              </button>
              {feedback?.type === 'success' && (
                <a href="/" className="block text-center text-sm text-red-400 hover:text-red-300 font-medium">
                  Entrar no sistema →
                </a>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
