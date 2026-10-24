import { useState, useEffect } from 'react';
import { safeError } from '../lib/safeLogger';
import { DEFAULT_LANDING_CONTENT, RECURSOS_PADRAO, PLANOS_PADRAO } from '../lib/legalContent';

const COLOR_MAP = {
  blue: { bg: 'bg-blue-500/20', hoverBorder: 'hover:border-blue-500/50', hoverBg: 'group-hover:bg-blue-500/30', text: 'text-blue-400' },
  purple: { bg: 'bg-purple-500/20', hoverBorder: 'hover:border-purple-500/50', hoverBg: 'group-hover:bg-purple-500/30', text: 'text-purple-400' },
  green: { bg: 'bg-green-500/20', hoverBorder: 'hover:border-green-500/50', hoverBg: 'group-hover:bg-green-500/30', text: 'text-green-400' },
  yellow: { bg: 'bg-yellow-500/20', hoverBorder: 'hover:border-yellow-500/50', hoverBg: 'group-hover:bg-yellow-500/30', text: 'text-yellow-400' },
  pink: { bg: 'bg-pink-500/20', hoverBorder: 'hover:border-pink-500/50', hoverBg: 'group-hover:bg-pink-500/30', text: 'text-pink-400' },
  cyan: { bg: 'bg-cyan-500/20', hoverBorder: 'hover:border-cyan-500/50', hoverBg: 'group-hover:bg-cyan-500/30', text: 'text-cyan-400' },
  red: { bg: 'bg-red-500/20', hoverBorder: 'hover:border-red-500/50', hoverBg: 'group-hover:bg-red-500/30', text: 'text-red-400' }
};

const CheckIcon = () => (
  <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const FeatureIcon = ({ index, colorClass }) => {
  const icons = [
    // 0: Calendar
    <path key="0" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />,
    // 1: Users
    <path key="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
    // 2: Cases / File
    <path key="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    // 3: Tasks / Check
    <path key="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
    // 4: Finance / Dollar
    <path key="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    // 5: Reports / Charts
    <path key="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  ];

  return (
    <svg className={`w-6 h-6 ${colorClass}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {icons[index % icons.length]}
    </svg>
  );
};

export default function LandingPage({ onOpenLogin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isAnual, setIsAnual] = useState(true);
  const [planosLoading, setPlanosLoading] = useState(true);
  const [showJusJNCPopup, setShowJusJNCPopup] = useState(false);
  const [signupOpen, setSignupOpen] = useState(false);
  const [form, setForm] = useState({ office_name: '', admin_name: '', email: '', phone: '', password: '', plan: 'trial' });
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [landingContent, setLandingContent] = useState(DEFAULT_LANDING_CONTENT);
  const [legalModal, setLegalModal] = useState(null);

  useEffect(() => {
    fetch('/api/admin/landing-content')
      .then((res) => res.json())
      .then((res) => {
        if (res?.content) setLandingContent((prev) => ({ ...prev, ...res.content }));
      })
      .catch((err) => safeError('landing_fetch_error', err, { component: 'LandingPage' }))
      .finally(() => setPlanosLoading(false));
  }, []);

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
    const num = Number(valor) || 0;
    if (num >= 1000) {
      return num.toLocaleString('pt-BR');
    }
    return num.toString();
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

  const recursosList = Array.isArray(landingContent.recursos) && landingContent.recursos.length > 0
    ? landingContent.recursos
    : RECURSOS_PADRAO;

  const planosList = Array.isArray(landingContent.planos) && landingContent.planos.length > 0
    ? landingContent.planos
    : PLANOS_PADRAO;

  const diasTeste = landingContent.dias_teste || 30;

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600 selection:text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-neutral-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src="/JusJNC_White.png" alt="Jus JNC" className="h-14 w-auto" />
            </div>

            {/* Desktop Menu */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-neutral-300 hover:text-white transition-colors">
                Recursos
              </a>
              <a href="#pricing" className="text-neutral-300 hover:text-white transition-colors">
                Planos
              </a>
              <a href="#contact" className="text-neutral-300 hover:text-white transition-colors">
                Contato
              </a>
            </nav>

            {/* CTA Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <button
                onClick={() => onNavigate('login')}
                className="px-4 py-2 text-neutral-300 hover:text-white transition-colors font-medium"
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
              className="md:hidden p-2 text-neutral-300 hover:text-white"
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
            <div className="md:hidden py-4 border-t border-neutral-800">
              <nav className="flex flex-col gap-4">
                <a href="#features" className="text-neutral-300 hover:text-white transition-colors">
                  Recursos
                </a>
                <a href="#pricing" className="text-neutral-300 hover:text-white transition-colors">
                  Planos
                </a>
                <a href="#contact" className="text-neutral-300 hover:text-white transition-colors">
                  Contato
                </a>
                <div className="flex flex-col gap-2 pt-4 border-t border-neutral-800">
                  <button
                    onClick={() => onNavigate('login')}
                    className="px-4 py-2 text-neutral-300 hover:text-white transition-colors font-medium text-left"
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
            {landingContent.hero_badge || 'Novo JusJNC 3.0 • IA Jurídica & Automação'}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            {landingContent.hero_title_prefix || 'Gerencie seu escritório com'}{' '}
            <span className="text-red-400 font-extrabold">
              {landingContent.hero_title_highlight || 'eficiência e organização'}
            </span>
          </h1>

          <p className="text-xl text-neutral-400 max-w-3xl mx-auto mb-10">
            {landingContent.hero_subtitle || 'A plataforma completa para advogados modernos: triagem inteligente via WhatsApp, gestão de prazos processuais e controle financeiro de honorários em um só lugar.'}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => onNavigate('signup')}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 rounded-xl font-semibold text-lg transition-all hover:shadow-xl hover:shadow-red-500/25 hover:scale-105 text-white"
            >
              {landingContent.cta_primary || 'Começar Gratuitamente'}
            </button>
            <button
              onClick={() => onNavigate('login')}
              className="w-full sm:w-auto px-8 py-4 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl font-semibold text-lg transition-all"
            >
              {landingContent.cta_secondary || 'Já tenho conta'}
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-neutral-950 border-y border-neutral-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que você precisa em um só lugar
            </h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto">
              Ferramentas poderosas para otimizar a gestão do seu escritório
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {recursosList.map((rec, idx) => {
              const cor = COLOR_MAP[rec.cor] || COLOR_MAP.blue;
              return (
                <div key={rec.id || idx} className={`p-6 bg-neutral-900 border border-neutral-800 rounded-2xl ${cor.hoverBorder} transition-all group`}>
                  <div className={`w-12 h-12 ${cor.bg} rounded-xl flex items-center justify-center mb-4 ${cor.hoverBg} transition-colors`}>
                    <FeatureIcon index={idx} colorClass={cor.text} />
                  </div>
                  <h3 className="text-xl font-semibold mb-2 text-white">{rec.titulo}</h3>
                  <p className="text-neutral-400 text-sm leading-relaxed">
                    {rec.descricao}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Planos transparentes para seu escritório
            </h2>
            <p className="text-neutral-400 text-lg max-w-2xl mx-auto mb-8">
              Escolha o plano ideal para o tamanho da sua equipe. Sem surpresas.
            </p>

            {/* Toggle Mensal/Anual */}
            <div className="inline-flex items-center gap-3 bg-neutral-900 p-1.5 rounded-full border border-neutral-800">
              <span className={`text-sm font-medium transition-colors ${!isAnual ? 'text-white' : 'text-gray-500'}`}>
                Mensal
              </span>
              <button
                onClick={() => setIsAnual(!isAnual)}
                className={`w-12 h-6 rounded-full transition-colors relative ${isAnual ? 'bg-green-500' : 'bg-neutral-700'}`}
              >
                <div
                  className={`w-5 h-5 bg-white rounded-full transition-transform absolute top-0.5 ${isAnual ? 'left-6' : 'left-0.5'}`}
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
                  <div key={i} className="p-8 bg-neutral-900 border border-neutral-800 rounded-2xl animate-pulse">
                    <div className="h-6 bg-neutral-800 rounded w-24 mb-2"></div>
                    <div className="h-4 bg-neutral-800 rounded w-32 mb-6"></div>
                    <div className="h-10 bg-neutral-800 rounded w-28 mb-6"></div>
                    <div className="space-y-3 mb-8">
                      {[1, 2, 3].map(j => (
                        <div key={j} className="h-4 bg-neutral-800 rounded w-full"></div>
                      ))}
                    </div>
                    <div className="h-12 bg-neutral-800 rounded"></div>
                  </div>
                ))}
              </>
            ) : (
              planosList.map((plano) => {
                const isDestaque = !!plano.tagDestaque;
                const preco = isAnual ? (plano.precoAnual ?? 0) : (plano.precoMensal ?? 0);
                const periodo = isAnual ? 'ano' : 'mês';

                return (
                  <div
                    key={plano.id || plano.tipo}
                    className={`p-8 rounded-2xl relative flex flex-col justify-between ${isDestaque
                      ? 'bg-gradient-to-b from-yellow-500/20 to-amber-500/20 border-2 border-amber-500/50'
                      : 'bg-neutral-900 border border-neutral-800'
                      }`}
                  >
                    <div>
                      {/* Tag de destaque */}
                      {plano.tagDestaque && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full text-sm font-medium text-gray-900">
                          {plano.tagDestaque}
                        </div>
                      )}

                      {/* Nome e subtítulo */}
                      <h3 className="text-xl font-semibold mb-2">{plano.nome}</h3>
                      <p className="text-neutral-400 mb-6 text-sm">{plano.subtituloLanding}</p>

                      {/* Preço */}
                      <div className="mb-6">
                        <span className="text-sm text-neutral-400">R$</span>
                        <span className="text-4xl font-bold">{formatarPreco(preco)}</span>
                        <span className="text-neutral-400">/{periodo}</span>
                        {isAnual && Number(plano.precoAnual) > 0 && (
                          <span className="ml-2 px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                            Economize 17%
                          </span>
                        )}
                      </div>

                      {/* Descrição e Lista de features */}
                      {plano.descricaoLanding && (
                        <p className="text-xs text-neutral-400 mb-4 pb-3 border-b border-neutral-800">
                          {plano.descricaoLanding}
                        </p>
                      )}

                      <ul className="space-y-3 mb-8 text-neutral-300 text-sm">
                        {(plano.funcionalidades || []).map((feat, fIdx) => (
                          <li key={fIdx} className="flex items-center gap-2">
                            <CheckIcon />
                            <span>{feat}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Botão CTA */}
                    <button
                      onClick={() => onNavigate('signup')}
                      className={`w-full py-3 rounded-xl font-medium transition-colors ${isDestaque
                        ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-gray-900 font-bold'
                        : 'bg-neutral-800 hover:bg-neutral-700 text-white'
                        }`}
                    >
                      {plano.textoBotao || `Começar ${diasTeste} dias grátis`}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-red-950/40 via-neutral-950 to-red-950/40 border-y border-neutral-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-6">
            Pronto para transformar seu escritório?
          </h2>
          <p className="text-xl text-neutral-300 mb-8">
            Comece hoje mesmo e ganhe {diasTeste} dias grátis para testar todas as funcionalidades
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
      <footer id="contact" className="py-12 px-4 sm:px-6 lg:px-8 border-t border-neutral-900 bg-black">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Desenvolvidos por JNC Tecnologia - perfeitamente centralizado no centro das logos */}
            <div className="col-span-1 md:col-span-2">
              <div className="w-fit flex flex-col items-center justify-center max-w-full">
                <h4 className="text-lg font-semibold text-white mb-5 text-center">
                  {landingContent.footer_dev_title || 'Desenvolvidos por JNC Tecnologia.'}
                </h4>
                <div className="flex flex-wrap items-center justify-center gap-6 mb-4 relative">
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
              </div>

              {/* Popup do Jus JNC */}
              {showJusJNCPopup && (
                <div className="bg-neutral-900 border border-yellow-500/30 rounded-lg p-3 relative inline-block mt-2">
                  <button
                    onClick={() => setShowJusJNCPopup(false)}
                    className="absolute top-1 right-2 text-neutral-400 hover:text-white text-sm"
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
              <ul className="space-y-2 text-neutral-400">
                <li><a href="#features" className="hover:text-white transition-colors">Recursos</a></li>
                <li><a href="#pricing" className="hover:text-white transition-colors">Planos</a></li>
                <li>
                  <button
                    onClick={() => setLegalModal('termos')}
                    className="hover:text-white transition-colors text-left"
                  >
                    Termos de Uso
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => setLegalModal('privacidade')}
                    className="hover:text-white transition-colors text-left"
                  >
                    Política de Privacidade
                  </button>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="font-semibold mb-4">Contato</h4>
              <ul className="space-y-2 text-neutral-400 text-sm">
                <li>
                  <a href={`mailto:${landingContent.contact_email || 'contato@nevesecosta.com.br'}`} className="hover:text-white transition-colors">
                    {landingContent.contact_email || 'contato@nevesecosta.com.br'}
                  </a>
                </li>
                <li>{landingContent.contact_phone || '(73) 99934-8552'}</li>
                <li className="text-xs text-neutral-500 pt-1">{landingContent.contact_forum || 'Comarca de Itamaraju - Estado da Bahia'}</li>
              </ul>
            </div>
          </div>

          <div className="mt-12 pt-8 border-t border-gray-800 text-center text-gray-500">
            <p>&copy; {landingContent.copyright_ano || new Date().getFullYear()} {landingContent.copyright_texto || 'Jus JNC. Todos os direitos reservados.'}</p>
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
            className="bg-neutral-900 border border-neutral-800 rounded-2xl shadow-xl shadow-red-500/10 w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-700 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg text-white">Criar escritório</h3>
                <p className="text-xs text-neutral-400">{diasTeste} dias grátis, sem cartão</p>
              </div>
              <button onClick={() => setSignupOpen(false)} className="text-neutral-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSignup} className="p-4 space-y-3">
              {feedback && (
                <div className={`p-3 rounded text-sm ${feedback.type === 'error' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 'bg-green-500/10 text-green-400 border border-green-500/30'}`}>
                  {feedback.text}
                </div>
              )}
              <input required type="text" placeholder="Nome do escritório" value={form.office_name}
                onChange={(e) => setForm({ ...form, office_name: e.target.value })}
                className="w-full px-3 py-2 rounded bg-black border border-neutral-800 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input required type="text" placeholder="Seu nome completo" value={form.admin_name}
                onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                className="w-full px-3 py-2 rounded bg-black border border-neutral-800 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input required type="email" placeholder="E-mail" value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded bg-black border border-neutral-800 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input type="tel" placeholder="Telefone / WhatsApp" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded bg-black border border-neutral-800 text-sm text-white focus:border-red-500 focus:outline-none" />
              <input required type="password" placeholder="Senha (mín. 8 caracteres)" minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 rounded bg-black border border-neutral-800 text-sm text-white focus:border-red-500 focus:outline-none" />
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

      {/* Modal Popup com Rolagem para Termos de Uso e Politica de Privacidade */}
      {legalModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setLegalModal(null)}
        >
          <div
            className="bg-neutral-900 border border-neutral-800 text-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between bg-neutral-950">
              <h3 className="font-bold text-base sm:text-lg text-white flex items-center gap-2">
                <span>{legalModal === 'termos' ? '📄' : '📋'}</span>
                {legalModal === 'termos' ? 'Termos de Uso e Condições Gerais' : 'Política de Privacidade e Proteção de Dados'}
              </h3>
              <button
                onClick={() => setLegalModal(null)}
                className="text-neutral-400 hover:text-white text-lg p-1 rounded hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs sm:text-sm text-neutral-300 leading-relaxed font-sans whitespace-pre-wrap select-text">
              {legalModal === 'termos'
                ? (landingContent.termos_de_uso || DEFAULT_LANDING_CONTENT.termos_de_uso)
                : (landingContent.politica_privacidade || DEFAULT_LANDING_CONTENT.politica_privacidade)}
            </div>
            <div className="p-4 border-t border-neutral-800 flex items-center justify-between bg-neutral-950">
              <a
                href={legalModal === 'termos' ? '/termos-de-uso' : '/politica-de-privacidade'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-red-400 hover:text-red-300 underline font-medium"
              >
                Abrir página completa em nova aba ↗
              </a>
              <button
                onClick={() => setLegalModal(null)}
                className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
