import { useState, useEffect } from 'react';
import { safeError } from '../lib/safeLogger';

// Planos de fallback (equivalente aos PlanoPublico do legado)
const PLANOS_FALLBACK = [
  {
    id: '1',
    tipo: 'basico',
    nome: 'Básico',
    precoMensal: 49,
    precoAnual: 490,
    subtituloLanding: 'Para escritórios iniciantes',
    descricaoLanding: 'Funcionalidades essenciais para começar.',
    textoBotao: 'Começar 30 dias grátis',
    funcionalidades: [],
    ordem: 1
  },
  {
    id: '2',
    tipo: 'profissional',
    nome: 'Profissional',
    precoMensal: 99,
    precoAnual: 990,
    subtituloLanding: 'Crescimento e gestão avançada',
    descricaoLanding: 'Todas as funcionalidades para escritórios em crescimento.',
    tagDestaque: 'Mais escolhido',
    textoBotao: 'Começar 30 dias grátis',
    funcionalidades: [],
    ordem: 2
  },
  {
    id: '3',
    tipo: 'enterprise',
    nome: 'Enterprise',
    precoMensal: 199,
    precoAnual: 1990,
    subtituloLanding: 'Múltiplas empresas e equipe',
    descricaoLanding: 'Solução completa para grandes escritórios.',
    textoBotao: 'Começar 30 dias grátis',
    funcionalidades: [],
    ordem: 3
  }
];

const CheckIcon = () => (
  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function LandingPage({ onOpenLogin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAnual, setIsAnual] = useState(true);
  const [planos] = useState(PLANOS_FALLBACK);
  const [planosLoading, setPlanosLoading] = useState(true);
  const [showJusJNCPopup, setShowJusJNCPopup] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [form, setForm] = useState({ office_name: '', admin_name: '', email: '', phone: '', password: '', plan: 'trial' });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  // Legado buscava planos publicos da API; aqui usamos fallback (endpoint publico ainda nao existe)
  useEffect(() => {
    setPlanosLoading(false);
  }, []);

  // Navegacao do legado: 'login' abre o Login (prop), 'signup' abre o modal de onboarding
  const onNavigate = (page) => {
    if (page === 'login') {
      if (onOpenLogin) {
        onOpenLogin();
      } else {
        window.location.href = '/?login=1';
      }
    } else {
      setSignupOpen(true);
    }
  };

  const formatarPreco = (valor) => {
    if (valor >= 1000) {
      return valor.toLocaleString('pt-BR');
    }
    return valor.toString();
  };

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
      safeError('landing_signup_error', err, { component: 'LandingPage' });
      setFeedback({ type: 'error', text: err.message || 'Erro ao criar conta' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src="/JusJNC_White.png" alt="Jus JNC" className="h-14 w-auto" />
            </div>

            {/* Desktop Menu */}
            <nav className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-gray-300 hover:text-white transition-colors">
                Recursos
              </a>
              <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">
                Planos
              </a>
              <a href="#contact" className="text-gray-300 hover:text-white transition-colors">
                Contato
              </a>
            </nav>

            {/* Auth Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => onNavigate('login')}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors font-medium"
              >
                Entrar
              </button>
              <button
                onClick={() => onNavigate('signup')}
                className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 rounded-xl font-medium transition-all hover:shadow-lg hover:shadow-red-500/25 text-white"
              >
                Cadastrar
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="md:hidden p-2 text-gray-300 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile Menu */}
          {menuOpen && (
            <div className="md:hidden py-4 border-t border-gray-700/50">
              <nav className="flex flex-col gap-4">
                <a href="#features" className="text-gray-300 hover:text-white transition-colors">
                  Recursos
                </a>
                <a href="#pricing" className="text-gray-300 hover:text-white transition-colors">
                  Planos
                </a>
                <a href="#contact" className="text-gray-300 hover:text-white transition-colors">
                  Contato
                </a>
                <div className="flex flex-col gap-2 pt-4 border-t border-gray-700/50">
                  <button
                    onClick={() => onNavigate('login')}
                    className="px-4 py-2 text-gray-300 hover:text-white transition-colors font-medium text-left"
                  >
                    Entrar
                  </button>
                  <button
                    onClick={() => onNavigate('signup')}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-rose-600 rounded-xl font-medium text-center text-white"
                  >
                    Cadastrar
                  </button>
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-sm mb-8">
            <span className="animate-pulse w-2 h-2 bg-red-400 rounded-full"></span>
            Sistema completo para escritórios de advocacia
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Gerencie seu escritório com{' '}
            <span className="text-red-400 font-extrabold">
              eficiência e organização
            </span>
          </h1>

          <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-10">
            Calendário jurídico, gestão de clientes, processos, tarefas e muito mais.
            Tudo em um único lugar para otimizar o trabalho do seu escritório.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('signup')}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-red-500/25 hover:scale-105 text-white"
            >
              Começar Gratuitamente
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-8 py-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl font-semibold text-lg transition-all"
            >
              Já tenho conta
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-800/30">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Ferramentas poderosas para otimizar a gestão do seu escritório
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="p-6 bg-gray-800/50 border border-gray-700/50 rounded-2xl hover:border-blue-500/50 transition-all group">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition-colors">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Calendário Jurídico</h3>
              <p className="text-gray-400">
                Controle de prazos, audiências e compromissos com alertas automáticos
              </p>
            </div>

            {/* Feature 2 */}
            <div className="p-6 bg-gray-800/50 border border-gray-700/50 rounded-2xl hover:border-purple-500/50 transition-all group">
              <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-500/30 transition-colors">
                <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Gestão de Clientes</h3>
              <p className="text-gray-400">
                Cadastro completo de clientes com histórico de processos e atendimentos
              </p>
            </div>

            {/* Feature 3 */}
            <div className="p-6 bg-gray-800/50 border border-gray-700/50 rounded-2xl hover:border-green-500/50 transition-all group">
              <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-500/30 transition-colors">
                <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Controle de Processos</h3>
              <p className="text-gray-400">
                Acompanhamento detalhado de processos com status e andamentos
              </p>
            </div>

            {/* Feature 4 */}
            <div className="p-6 bg-gray-800/50 border border-gray-700/50 rounded-2xl hover:border-yellow-500/50 transition-all group">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-yellow-500/30 transition-colors">
                <svg className="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Tarefas e Prioridades</h3>
              <p className="text-gray-400">
                Organize tarefas por urgência e não perca nenhum prazo importante
              </p>
            </div>

            {/* Feature 5 */}
            <div className="p-6 bg-gray-800/50 border border-gray-700/50 rounded-2xl hover:border-pink-500/50 transition-all group">
              <div className="w-12 h-12 bg-pink-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-pink-500/30 transition-colors">
                <svg className="w-6 h-6 text-pink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Controle Financeiro</h3>
              <p className="text-gray-400">
                Honorários, despesas e relatórios financeiros detalhados
              </p>
            </div>

            {/* Feature 6 */}
            <div className="p-6 bg-gray-800/50 border border-gray-700/50 rounded-2xl hover:border-cyan-500/50 transition-all group">
              <div className="w-12 h-12 bg-cyan-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-cyan-500/30 transition-colors">
                <svg className="w-6 h-6 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold mb-2">Relatórios e Dashboard</h3>
              <p className="text-gray-400">
                Visão geral do escritório com métricas e indicadores importantes
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Conheça nossos planos
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto mb-8">
              Escolha o plano ideal para seu negócio
            </p>

            {/* Toggle Mensal/Anual */}
            <div className="flex items-center justify-center gap-4">
              <span className={`text-sm font-medium transition-colors ${!isAnual ? 'text-white' : 'text-gray-500'}`}>
                Mensal
              </span>
              <button
                onClick={() => setIsAnual(!isAnual)}
                className={`relative w-14 h-7 rounded-full transition-colors ${isAnual ? 'bg-green-500' : 'bg-gray-600'}`}
              >
                <span
                  className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${isAnual ? 'translate-x-7' : 'translate-x-0'}`}
                />
              </button>
              <span className={`text-sm font-medium transition-colors ${isAnual ? 'text-white' : 'text-gray-500'}`}>
                Anual
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {planosLoading ? (
              <>
                {[1, 2, 3].map(i => (
                  <div key={i} className="p-8 bg-gray-800/50 border border-gray-700/50 rounded-2xl animate-pulse">
                    <div className="h-6 bg-gray-700 rounded w-24 mb-2"></div>
                    <div className="h-4 bg-gray-700 rounded w-32 mb-6"></div>
                    <div className="h-10 bg-gray-700 rounded w-28 mb-6"></div>
                    <div className="space-y-3 mb-8">
                      {[1, 2, 3].map(j => (
                        <div key={j} className="h-4 bg-gray-700 rounded w-full"></div>
                      ))}
                    </div>
                    <div className="h-12 bg-gray-700 rounded"></div>
                  </div>
                ))}
              </>
            ) : (
              planos.map((plano) => {
                const isDestaque = !!plano.tagDestaque;
                const preco = isAnual ? plano.precoAnual : plano.precoMensal;
                const periodo = isAnual ? 'ano' : 'mês';

                return (
                  <div
                    key={plano.id}
                    className={`p-8 rounded-2xl relative ${isDestaque
                      ? 'bg-gradient-to-b from-yellow-500/20 to-amber-500/20 border-2 border-amber-500/50'
                      : 'bg-gray-800/50 border border-gray-700/50'
                      }`}
                  >
                    {/* Tag de destaque */}
                    {plano.tagDestaque && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full text-sm font-medium text-gray-900">
                        {plano.tagDestaque}
                      </div>
                    )}

                    {/* Nome e subtítulo */}
                    <h3 className="text-xl font-semibold mb-2">{plano.nome}</h3>
                    <p className="text-gray-400 mb-6">{plano.subtituloLanding}</p>

                    {/* Preço */}
                    <div className="mb-6">
                      <span className="text-sm text-gray-400">R$</span>
                      <span className="text-4xl font-bold">{formatarPreco(preco)}</span>
                      <span className="text-gray-400">/{periodo}</span>
                      {isAnual && plano.precoAnual > 0 && (
                        <span className="ml-2 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                          Economize 17%
                        </span>
                      )}
                    </div>

                    {/* Descrição como lista de features */}
                    <ul className="space-y-3 mb-8 text-gray-300">
                      {plano.descricaoLanding && (
                        <li className="flex items-center gap-2">
                          <CheckIcon />
                          {plano.descricaoLanding}
                        </li>
                      )}
                      {plano.tipo === 'basico' && (
                        <>
                          <li className="flex items-center gap-2"><CheckIcon />Calendário completo</li>
                          <li className="flex items-center gap-2"><CheckIcon />Gestão de processos</li>
                        </>
                      )}
                      {plano.tipo === 'profissional' && (
                        <>
                          <li className="flex items-center gap-2"><CheckIcon />Tudo do Básico</li>
                          <li className="flex items-center gap-2"><CheckIcon />Clientes ilimitados</li>
                          <li className="flex items-center gap-2"><CheckIcon />Suporte prioritário</li>
                        </>
                      )}
                      {plano.tipo === 'enterprise' && (
                        <>
                          <li className="flex items-center gap-2"><CheckIcon />Tudo do Profissional</li>
                          <li className="flex items-center gap-2"><CheckIcon />Múltiplos usuários</li>
                          <li className="flex items-center gap-2"><CheckIcon />Usuários ilimitados</li>
                        </>
                      )}
                    </ul>

                    {/* Botão CTA */}
                    <button
                      onClick={() => onNavigate('signup')}
                      className={`w-full py-3 rounded-xl font-medium transition-colors ${isDestaque
                        ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-gray-900'
                        : 'bg-gray-700 hover:bg-gray-600'
                        }`}
                    >
                      {plano.textoBotao}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-red-600/20 to-rose-600/20">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Pronto para transformar seu escritório?
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Comece hoje mesmo e ganhe 30 dias grátis para testar todas as funcionalidades
          </p>
          <button
            onClick={() => onNavigate('signup')}
            className="px-10 py-4 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-red-500/25 hover:scale-105 text-white"
            data-testid="cta-final"
          >
            Criar Conta Grátis
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="py-12 px-4 sm:px-6 lg:px-8 border-t border-gray-800">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Desenvolvidos por JNC Tecnologia - com logos */}
            <div className="col-span-1 md:col-span-2">
              <h4 className="text-lg font-semibold text-white mb-5 text-center">Desenvolvidos por JNC Tecnologia.</h4>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-6 mb-4 relative">
                {/* Fast Cash Flow */}
                <a
                  href="https://fastcashflow.vercel.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="Fast Cash Flow"
                >
                  <img src="https://i.im.ge/2025/11/02/nzgjAc.Logo-White.png" alt="Fast Cash Flow" className="h-10 w-auto" />
                </a>

                {/* Jus JNC - com popup */}
                <button
                  onClick={() => setShowJusJNCPopup(!showJusJNCPopup)}
                  className="hover:opacity-80 transition-opacity"
                  title="Jus JNC"
                >
                  <img src="https://i.im.ge/2025/12/20/BSw0fS.JusJNC-White.png" alt="Jus JNC" className="h-12 w-auto" />
                </button>

                {/* Neves & Costa */}
                <a
                  href="https://www.nevesecosta.com.br/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="Neves & Costa Advocacia"
                >
                  <img src="https://i.im.ge/2025/10/18/nRo1MP.Logo-transparente.png" alt="Neves & Costa" className="h-14 w-auto" />
                </a>

                {/* Animes JNC */}
                <a
                  href="https://www.instagram.com/animesjnc/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="Animes JNC"
                >
                  <img src="https://i.im.ge/2025/12/21/BDiDfm.Animes-JNC.png" alt="Animes JNC" className="h-12 w-auto" />
                </a>

                {/* Fast Savorys */}
                <a
                  href="https://fastsavorys.vercel.app/pages/fast.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-80 transition-opacity"
                  title="Fast Savorys"
                >
                  <img src="/FastSavorys.png" alt="Fast Savorys" className="h-12 w-auto" />
                </a>
              </div>

              {/* Popup do Jus JNC */}
              {showJusJNCPopup && (
                <div className="bg-gray-800 border border-yellow-500/30 rounded-lg p-3 relative inline-block">
                  <button
                    onClick={() => setShowJusJNCPopup(false)}
                    className="absolute top-1 right-2 text-gray-400 hover:text-white text-sm"
                  >
                    ✕
                  </button>
                  <p className="text-yellow-400 text-sm flex items-center gap-2 pr-4">
                    🚧 Sistema em produção - Gerenciador de Escritórios
                  </p>
                </div>
              )}
            </div>

            {/* Links */}
            <div>
              <h4 className="font-semibold mb-4">Links</h4>
              <ul className="space-y-2 text-gray-400">
                <li><a href="#features" className="hover:text-white transition-colors">Recursos</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Planos</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Termos de Uso</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Privacidade</a></li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contato</h4>
              <ul className="space-y-2 text-gray-400">
                <li>contato@nevesecosta.com.br</li>
                <li>(73) 99934-8552</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500">
            <p>&copy; {new Date().getFullYear()} Jus JNC. Todos os direitos reservados.</p>
            <p className="mt-2 flex items-center justify-center gap-2">
              Desenvolvido por <img src="/JNC.png" alt="JNC" className="h-6 w-auto inline" />
            </p>
          </div>
        </div>
      </footer>

      {/* Modal de cadastro de escritorio (onboarding SaaS) */}
      {signupOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSignupOpen(false)}>
          <div
            className="bg-gray-800 border border-gray-700 rounded-2xl shadow-xl shadow-red-500/10 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-white">Criar escritório</h3>
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
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input required type="text" placeholder="Seu nome completo" value={form.admin_name}
                onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input required type="email" placeholder="E-mail" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input type="tel" placeholder="Telefone / WhatsApp" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input required type="password" placeholder="Senha (mín. 8 caracteres)" minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 rounded bg-gray-900 border border-gray-700 text-sm text-white focus:border-red-500 focus:outline-none" />
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/25 transition disabled:opacity-60"
              >
                {submitting ? 'Criando...' : 'Criar minha conta grátis'}
              </button>
              {feedback?.type === 'success' && (
                <button
                  type="button"
                  onClick={() => onNavigate('login')}
                  className="block w-full text-center text-sm text-red-500 hover:text-red-400 font-medium"
                >
                  Entrar no sistema →
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
