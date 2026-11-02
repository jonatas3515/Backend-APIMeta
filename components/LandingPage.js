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
  const [form, setForm] = useState({
    office_name: '',
    cnpj: '',
    admin_name: '',
    email: '',
    phone: '',
    password: '',
    plan: 'trial',
    // Endereço do escritório (obrigatório)
    address_zip: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    // Dados de faturamento / pagamento (se pago)
    billing_cpf_cnpj: '',
    card_number: '',
    card_name: '',
    card_exp: '',
    card_cvc: ''
  });
  const [modalBillingCycle, setModalBillingCycle] = useState('monthly');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [landingContent, setLandingContent] = useState(DEFAULT_LANDING_CONTENT);
  const [legalModal, setLegalModal] = useState(null);

  const handleCepLookup = async (cepValue) => {
    const clean = String(cepValue || '').replace(/\D/g, '');
    if (clean.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        const data = await res.json();
        if (data && !data.erro) {
          setForm((prev) => ({
            ...prev,
            address_street: data.logradouro || prev.address_street,
            address_neighborhood: data.bairro || prev.address_neighborhood,
            address_city: data.localidade || prev.address_city,
            address_state: data.uf || prev.address_state
          }));
        }
      } catch {}
    }
  };

  const formatCardNumber = (value) => {
    const v = String(value || '').replace(/\D/g, '').slice(0, 16);
    const parts = [];
    for (let i = 0; i < v.length; i += 4) {
      parts.push(v.substring(i, i + 4));
    }
    return parts.join(' ');
  };

  const formatCardExp = (value) => {
    const clean = String(value || '').replace(/\D/g, '').slice(0, 4);
    if (clean.length >= 3) {
      return `${clean.slice(0, 2)}/${clean.slice(2, 4)}`;
    }
    return clean;
  };

  useEffect(() => {
    fetch('/api/admin/landing-content')
      .then((res) => res.json())
      .then((res) => {
        if (res?.content) setLandingContent((prev) => ({ ...prev, ...res.content }));
      })
      .catch((err) => safeError('landing_fetch_error', err, { component: 'LandingPage' }))
      .finally(() => setPlanosLoading(false));
  }, []);

  const onNavigate = (page, planKey = null) => {
    if (page === 'login') {
      if (onOpenLogin) {
        onOpenLogin();
      } else {
        window.location.href = '/?login=1';
      }
    } else {
      if (planKey) {
        setForm((prev) => ({ ...prev, plan: planKey }));
      }
      setModalBillingCycle(isAnual ? 'yearly' : 'monthly');
      setFeedback(null);
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

    if (!form.office_name.trim()) {
      setFeedback({ type: 'error', text: 'Informe o nome do escritório.' });
      return;
    }
    if (!form.admin_name.trim()) {
      setFeedback({ type: 'error', text: 'Informe seu nome completo.' });
      return;
    }
    if (!form.email.trim()) {
      setFeedback({ type: 'error', text: 'Informe seu e-mail profissional.' });
      return;
    }
    if (!form.phone.trim()) {
      setFeedback({ type: 'error', text: 'Informe o telefone / WhatsApp do escritório.' });
      return;
    }
    if (!form.password || form.password.length < 8) {
      setFeedback({ type: 'error', text: 'A senha deve conter ao menos 8 caracteres.' });
      return;
    }
    if (
      !form.address_zip.trim() ||
      !form.address_street.trim() ||
      !form.address_number.trim() ||
      !form.address_neighborhood.trim() ||
      !form.address_city.trim() ||
      !form.address_state.trim()
    ) {
      setFeedback({
        type: 'error',
        text: 'Preencha o endereço completo do escritório (CEP, Rua, Número, Bairro, Cidade e UF).'
      });
      return;
    }
    if (form.plan !== 'trial') {
      if (!form.billing_cpf_cnpj.trim()) {
        setFeedback({ type: 'error', text: 'Informe o CPF ou CNPJ para faturamento do plano contratado.' });
        return;
      }
      const cleanCard = form.card_number.replace(/\D/g, '');
      if (cleanCard.length < 13 || cleanCard.length > 19) {
        setFeedback({ type: 'error', text: 'Informe um número de cartão de crédito válido.' });
        return;
      }
      if (!form.card_name.trim()) {
        setFeedback({ type: 'error', text: 'Informe o nome impresso no cartão.' });
        return;
      }
      if (!form.card_exp.trim() || form.card_exp.length < 5) {
        setFeedback({ type: 'error', text: 'Informe a validade do cartão (MM/AA).' });
        return;
      }
      if (!form.card_cvc.trim() || form.card_cvc.length < 3) {
        setFeedback({ type: 'error', text: 'Informe o código de segurança do cartão (CVC).' });
        return;
      }
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/auth/register-office', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, billing_cycle: modalBillingCycle })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Erro ao criar conta');
      setFeedback({
        type: 'success',
        text:
          form.plan === 'trial'
            ? 'Escritório criado com sucesso! Período de 30 dias de teste grátis ativado. Você já pode entrar no sistema.'
            : `Escritório criado com sucesso e assinatura ativada! Você já pode entrar no sistema.`
      });
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
                  className={`w-5 h-5 bg-[#1B1D1E] rounded-full transition-transform absolute top-0.5 ${isAnual ? 'left-6' : 'left-0.5'}`}
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
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-gradient-to-r from-yellow-500 to-amber-600 rounded-full text-sm font-medium text-white">
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
                      onClick={() => onNavigate('signup', plano.tipo || 'trial')}
                      className={`w-full py-3 rounded-xl font-medium transition-colors ${isDestaque
                        ? 'bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-600 hover:to-amber-700 text-white font-bold'
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
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4" onClick={() => setSignupOpen(false)}>
          <div
            className="bg-[#181A1B] border border-gray-800 rounded-2xl shadow-2xl shadow-black/80 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-gray-800 flex justify-between items-center bg-[#151718]">
              <div>
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <span>🏢</span>
                  <span>Criar Escritório</span>
                </h3>
                <p className="text-xs text-gray-400">
                  {form.plan === 'trial'
                    ? `${diasTeste} dias de teste grátis com acesso total • Sem cartão de crédito`
                    : `Contratação: Plano ${form.plan === 'basico' ? 'Básico (R$ 49/mês)' : form.plan === 'profissional' ? 'Profissional (R$ 99/mês)' : 'Enterprise (R$ 199/mês)'}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSignupOpen(false)}
                className="w-8 h-8 rounded-lg bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition"
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSignup} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {feedback && (
                <div className={`p-3.5 rounded-xl text-sm border font-medium ${
                  feedback.type === 'error'
                    ? 'bg-red-950/40 text-red-300 border-red-500/40'
                    : 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
                }`}>
                  {feedback.text}
                </div>
              )}

              {/* Seletor de Planos e Periodicidade (Mensal / Anual) */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-[#141516] p-2.5 rounded-xl border border-gray-800">
                  <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                    Periodicidade:
                  </span>
                  <div className="inline-flex items-center gap-1.5 bg-[#1F2224] p-1 rounded-lg border border-gray-700/60">
                    <button
                      type="button"
                      onClick={() => setModalBillingCycle('monthly')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition ${
                        modalBillingCycle === 'monthly'
                          ? 'bg-neutral-800 text-white shadow-sm ring-1 ring-gray-600'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      Mensal
                    </button>
                    <button
                      type="button"
                      onClick={() => setModalBillingCycle('yearly')}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 ${
                        modalBillingCycle === 'yearly'
                          ? 'bg-emerald-600 text-white shadow-sm font-extrabold ring-1 ring-emerald-400'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <span>Anual</span>
                      <span className="text-[10px] px-1.5 py-0.2 bg-emerald-950 text-emerald-200 border border-emerald-400/40 rounded font-black">
                        2 meses grátis (-17%)
                      </span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { key: 'trial', name: 'Trial Grátis', price: 'R$ 0', period: '30 dias', badge: 'Sem cartão', sub: '30 dias grátis' },
                    { key: 'basico', name: 'Básico', price: modalBillingCycle === 'yearly' ? 'R$ 490' : 'R$ 49', period: modalBillingCycle === 'yearly' ? '/ano' : '/mês', badge: modalBillingCycle === 'yearly' ? '2 meses off' : 'Autônomo', sub: modalBillingCycle === 'yearly' ? 'equiv. R$ 40,83/mês' : null },
                    { key: 'profissional', name: 'Profissional', price: modalBillingCycle === 'yearly' ? 'R$ 990' : 'R$ 99', period: modalBillingCycle === 'yearly' ? '/ano' : '/mês', badge: modalBillingCycle === 'yearly' ? '2 meses off' : 'Popular', sub: modalBillingCycle === 'yearly' ? 'equiv. R$ 82,50/mês' : null },
                    { key: 'enterprise', name: 'Enterprise', price: modalBillingCycle === 'yearly' ? 'R$ 1.990' : 'R$ 199', period: modalBillingCycle === 'yearly' ? '/ano' : '/mês', badge: modalBillingCycle === 'yearly' ? '2 meses off' : 'IA Completa', sub: modalBillingCycle === 'yearly' ? 'equiv. R$ 165,83/mês' : null }
                  ].map((p) => {
                    const isSelected = form.plan === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setForm({ ...form, plan: p.key })}
                        className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? p.key === 'enterprise'
                              ? 'border-purple-500 bg-purple-950/40 ring-2 ring-purple-500/50 shadow-md'
                              : p.key === 'trial'
                              ? 'border-nc-yellow bg-amber-950/40 ring-2 ring-nc-yellow/60 shadow-md'
                              : 'border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/50 shadow-md'
                            : 'border-gray-800 bg-[#1F2224] hover:border-gray-700 hover:bg-[#25282B]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span className="font-bold text-xs text-white truncate">{p.name}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold ${
                            isSelected ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'
                          }`}>
                            {p.badge}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-sm font-black text-white">{p.price}</span>
                            <span className="text-[10px] text-gray-400">{p.period}</span>
                          </div>
                          {p.sub && (
                            <p className="text-[9px] text-emerald-400 font-medium">{p.sub}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Dados do Escritório e Admin */}
              <div className="space-y-3 pt-1">
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                  1. Dados do Escritório & Contato
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Nome do Escritório <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="Ex: Neves & Costa Advogados"
                      value={form.office_name}
                      onChange={(e) => setForm({ ...form, office_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">CNPJ do Escritório <span className="text-gray-500">(Opcional)</span></label>
                    <input
                      type="text"
                      placeholder="00.000.000/0000-00"
                      value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Seu Nome Completo (Admin) <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="Dr(a). Nome Sobrenome"
                      value={form.admin_name}
                      onChange={(e) => setForm({ ...form, admin_name: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Telefone / WhatsApp <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="tel"
                      placeholder="(00) 00000-0000"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">E-mail Profissional <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="email"
                      placeholder="contato@seuescritorio.com.br"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Senha de Acesso <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="password"
                      placeholder="Mínimo 8 caracteres"
                      minLength={8}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Endereço do Escritório */}
              <div className="space-y-3 pt-2 border-t border-gray-800">
                <p className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center justify-between">
                  <span>2. Endereço do Escritório <span className="text-red-400">*</span></span>
                  <span className="text-[10px] text-gray-500 font-normal">Digite o CEP para auto-completar</span>
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">CEP <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="00000-000"
                      maxLength={9}
                      value={form.address_zip}
                      onChange={(e) => {
                        const val = e.target.value;
                        setForm({ ...form, address_zip: val });
                        handleCepLookup(val);
                      }}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">Logradouro / Rua <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="Av. / Rua / Praça"
                      value={form.address_street}
                      onChange={(e) => setForm({ ...form, address_street: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Número <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="123"
                      value={form.address_number}
                      onChange={(e) => setForm({ ...form, address_number: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Complemento / Sala</label>
                    <input
                      type="text"
                      placeholder="Sala 402"
                      value={form.address_complement}
                      onChange={(e) => setForm({ ...form, address_complement: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Bairro <span className="text-red-400">*</span></label>
                    <input
                      required
                      type="text"
                      placeholder="Centro"
                      value={form.address_neighborhood}
                      onChange={(e) => setForm({ ...form, address_neighborhood: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-400 mb-1">Cidade <span className="text-red-400">*</span></label>
                      <input
                        required
                        type="text"
                        placeholder="Cidade"
                        value={form.address_city}
                        onChange={(e) => setForm({ ...form, address_city: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                      />
                    </div>
                    <div className="w-16">
                      <label className="block text-xs text-gray-400 mb-1">UF <span className="text-red-400">*</span></label>
                      <input
                        required
                        type="text"
                        maxLength={2}
                        placeholder="UF"
                        value={form.address_state}
                        onChange={(e) => setForm({ ...form, address_state: e.target.value.toUpperCase() })}
                        className="w-full px-2 py-2 text-center uppercase rounded-lg bg-[#111213] border border-gray-800 text-sm text-white focus:border-nc-yellow focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Seção Inline de Pagamento (somente visível se plano pago) */}
              {form.plan !== 'trial' && (
                <div className="space-y-3 pt-3 border-t border-purple-500/40 bg-purple-950/20 p-4 rounded-xl border animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-black text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span>💳</span>
                        <span>3. Dados de Faturamento e Cartão de Crédito</span>
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Total:{' '}
                        <strong className="text-white">
                          {modalBillingCycle === 'yearly'
                            ? form.plan === 'basico'
                              ? 'R$ 490/ano'
                              : form.plan === 'profissional'
                              ? 'R$ 990/ano'
                              : 'R$ 1.990/ano'
                            : form.plan === 'basico'
                            ? 'R$ 49/mês'
                            : form.plan === 'profissional'
                            ? 'R$ 99/mês'
                            : 'R$ 199/mês'}
                        </strong>{' '}
                        •{' '}
                        {modalBillingCycle === 'yearly' ? (
                          <span className="text-emerald-400 font-bold">2 meses grátis aplicados (17% off)</span>
                        ) : (
                          'Faturamento mensal seguro'
                        )}
                      </p>
                    </div>
                    <span className="text-xs px-2.5 py-1 rounded bg-purple-500/20 text-purple-200 border border-purple-500/40 font-bold">
                      Pagamento Seguro
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-300 mb-1">
                      CPF ou CNPJ para Nota Fiscal / Faturamento <span className="text-red-400">*</span>
                    </label>
                    <input
                      required
                      type="text"
                      placeholder="000.000.000-00 ou 00.000.000/0000-00"
                      value={form.billing_cpf_cnpj}
                      onChange={(e) => setForm({ ...form, billing_cpf_cnpj: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-purple-500/50 text-sm text-white focus:border-purple-400 focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        Número do Cartão de Crédito <span className="text-red-400">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="0000 0000 0000 0000"
                        maxLength={19}
                        value={form.card_number}
                        onChange={(e) => setForm({ ...form, card_number: formatCardNumber(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-purple-500/50 text-sm text-white focus:border-purple-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        Nome Impresso no Cartão <span className="text-red-400">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Como impresso no cartão"
                        value={form.card_name}
                        onChange={(e) => setForm({ ...form, card_name: e.target.value.toUpperCase() })}
                        className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-purple-500/50 text-sm text-white uppercase focus:border-purple-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        Validade (MM/AA) <span className="text-red-400">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="MM/AA"
                        maxLength={5}
                        value={form.card_exp}
                        onChange={(e) => setForm({ ...form, card_exp: formatCardExp(e.target.value) })}
                        className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-purple-500/50 text-sm text-white text-center focus:border-purple-400 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-300 mb-1">
                        CVC / CVV <span className="text-red-400">*</span>
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="123"
                        maxLength={4}
                        value={form.card_cvc}
                        onChange={(e) => setForm({ ...form, card_cvc: e.target.value.replace(/\D/g, '') })}
                        className="w-full px-3 py-2 rounded-lg bg-[#111213] border border-purple-500/50 text-sm text-white text-center focus:border-purple-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 text-[11px] text-gray-400">
                    <span>🔒</span>
                    <span>Ambiente criptografado. Seus dados de pagamento são protegidos com segurança PCI-DSS.</span>
                  </div>
                </div>
              )}

              {/* Botão de Submit */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full py-3 rounded-xl font-black text-sm transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-60 ${
                    form.plan === 'trial'
                      ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-500/25'
                      : 'bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white shadow-purple-500/30'
                  }`}
                >
                  {submitting
                    ? 'Processando...'
                    : form.plan === 'trial'
                    ? '✨ Criar minha conta grátis (30 dias)'
                    : `💳 Confirmar Assinatura do Plano ${
                        form.plan === 'basico' ? 'Básico' : form.plan === 'profissional' ? 'Profissional' : 'Enterprise'
                      } (${
                        modalBillingCycle === 'yearly'
                          ? form.plan === 'basico'
                            ? 'R$ 490/ano'
                            : form.plan === 'profissional'
                            ? 'R$ 990/ano'
                            : 'R$ 1.990/ano'
                          : form.plan === 'basico'
                          ? 'R$ 49/mês'
                          : form.plan === 'profissional'
                          ? 'R$ 99/mês'
                          : 'R$ 199/mês'
                      })`}
                </button>

                {feedback?.type === 'success' && (
                  <button
                    type="button"
                    onClick={() => onNavigate('login')}
                    className="mt-3 block w-full text-center text-sm text-nc-yellow hover:underline font-bold"
                  >
                    Entrar no sistema agora →
                  </button>
                )}
              </div>
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
