import { DEFAULT_LANDING_CONTENT } from '../lib/legalContent';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { apiJson } from '../lib/apiClient';
import { useAuth } from '../lib/useAuth';
import { safeError } from '../lib/safeLogger';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'escritorios', label: 'Escritórios' },
  { key: 'planos', label: 'Planos' },
  { key: 'cupons', label: 'Cupons' },
  { key: 'mensagens', label: 'Mensagens' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'modelos', label: 'Modelos' },
  { key: 'landing', label: 'Landing Page' }
];

const TIPOS_MODELO = {
  peticao_inicial: 'Petição Inicial',
  contestacao: 'Contestação',
  contrato: 'Contrato',
  procuracao: 'Procuração',
  recurso: 'Recurso',
  acordo: 'Acordo',
  outro: 'Outro'
};

const AREAS_MODELO = {
  trabalhista: 'Trabalhista',
  civel: 'Cível',
  previdenciario: 'Previdenciário',
  tributario: 'Tributário',
  criminal: 'Criminal',
  familia: 'Família',
  outro: 'Outro'
};

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatarData = (d) => {
  if (!d) return '-';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return '-'; }
};

export default function AdminMasterPanel() {
  const router = useRouter();
  const { profile, authUser, loading: authLoading, signOut } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [offices, setOffices] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [planos, setPlanos] = useState([]);
  const [cupons, setCupons] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState(null);

  // Modais de Escritório
  const [modalOfficeForm, setModalOfficeForm] = useState(false);
  const [editingOffice, setEditingOffice] = useState(null);
  const [officeFormData, setOfficeFormData] = useState({ name: '', phone: '', cnpj: '', plan: 'trial' });

  // Modal de Período Grátis
  const [modalPeriodoGratis, setModalPeriodoGratis] = useState({ show: false, office: null, dias: 30 });

  // Modal de Pagamento Manual
  const [modalPagamento, setModalPagamento] = useState({ show: false, office: null, metodo: 'pix', valor: 99, meses: 1 });

  // Modais de Planos, Cupons, Mensagens, Modelos
  const [modalPlano, setModalPlano] = useState({ show: false, data: null });
  const [modalCupom, setModalCupom] = useState({ show: false, data: null });
  const [modalMensagem, setModalMensagem] = useState(false);
  const [msgForm, setMsgForm] = useState({ escritorio_id: 'todos', assunto: '', mensagem: '' });
  const [modalModelo, setModalModelo] = useState({ show: false, data: null });
  const [viewingModelo, setViewingModelo] = useState(null);

  // Filtros
  const [filtroPagamento, setFiltroPagamento] = useState('todos');
  const [filtroModeloArea, setFiltroModeloArea] = useState('');
  const [filtroModeloTipo, setFiltroModeloTipo] = useState('');
  const [buscaModelo, setBuscaModelo] = useState('');
  const [landingData, setLandingData] = useState(DEFAULT_LANDING_CONTENT);
  const [savingLanding, setSavingLanding] = useState(false);
  const [newFeatureInput, setNewFeatureInput] = useState({});

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    carregarTudo();
  }, [authLoading, isAdmin]);

  const showFeedback = (type, text) => {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 4000);
  };

  const carregarTudo = async () => {
    setLoading(true);
    try {
      const [o, m, p, c, msg, pag, mod, lnd] = await Promise.allSettled([
        apiJson('/api/admin/offices'),
        apiJson('/api/admin/metrics'),
        apiJson('/api/admin/planos'),
        apiJson('/api/admin/cupons'),
        apiJson('/api/admin/mensagens'),
        apiJson('/api/admin/pagamentos'),
        apiJson('/api/admin/modelos'),
        apiJson('/api/admin/landing-content')
      ]);

      if (o.status === 'fulfilled') setOffices(o.value?.offices || []);
      if (m.status === 'fulfilled') setMetrics(m.value);
      if (p.status === 'fulfilled') setPlanos(p.value?.planos || []);
      if (c.status === 'fulfilled') setCupons(c.value?.cupons || []);
      if (msg.status === 'fulfilled') setMensagens(msg.value?.mensagens || []);
      if (pag.status === 'fulfilled') setPagamentos(pag.value?.pagamentos || []);
      if (mod.status === 'fulfilled') setModelos(mod.value?.modelos || []);
      if (lnd.status === 'fulfilled' && lnd.value?.content) setLandingData(lnd.value.content);
    } catch (err) {
      safeError('admin_carregar_error', err, { component: 'AdminMasterPanel' });
    } finally {
      setLoading(false);
    }
  };

  // Handlers Escritórios
  const handleSaveOffice = async (e) => {
    e.preventDefault();
    try {
      if (editingOffice) {
        await apiJson('/api/admin/offices', {
          method: 'PATCH',
          body: JSON.stringify({ office_id: editingOffice.id, action: 'edit', ...officeFormData })
        });
        showFeedback('success', 'Escritório atualizado com sucesso!');
      } else {
        await apiJson('/api/admin/offices', {
          method: 'POST',
          body: JSON.stringify(officeFormData)
        });
        showFeedback('success', 'Escritório criado com sucesso!');
      }
      setModalOfficeForm(false);
      setEditingOffice(null);
      await carregarTudo();
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao salvar escritório');
    }
  };

  const handleDeleteOffice = async (id, name) => {
    if (!confirm(`Deseja realmente excluir o escritório "${name}"? Esta ação é irreversível.`)) return;
    try {
      await apiJson(`/api/admin/offices?id=${id}`, { method: 'DELETE' });
      showFeedback('success', 'Escritório excluído com sucesso!');
      await carregarTudo();
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao excluir escritório');
    }
  };

  const handleOfficeAction = async (officeId, action, extra = {}) => {
    try {
      await apiJson('/api/admin/offices', {
        method: 'PATCH',
        body: JSON.stringify({ office_id: officeId, action, ...extra })
      });
      showFeedback('success', 'Ação executada com sucesso!');
      await carregarTudo();
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao processar ação');
    }
  };

  const handleConfirmarPeriodoGratis = async () => {
    if (!modalPeriodoGratis.office) return;
    await handleOfficeAction(modalPeriodoGratis.office.id, 'grant_trial', { days: modalPeriodoGratis.dias });
    setModalPeriodoGratis({ show: false, office: null, dias: 30 });
  };

  const handleConfirmarPagamento = async () => {
    if (!modalPagamento.office) return;
    await handleOfficeAction(modalPagamento.office.id, 'add_payment', {
      valor: modalPagamento.valor,
      metodo: modalPagamento.metodo,
      meses: modalPagamento.meses
    });
    setModalPagamento({ show: false, office: null, metodo: 'pix', valor: 99, meses: 1 });
  };

  // Handlers Planos
  const handleSavePlano = async (e) => {
    e.preventDefault();
    const data = modalPlano.data;
    try {
      if (data.id) {
        await apiJson('/api/admin/planos', { method: 'PATCH', body: JSON.stringify(data) });
        showFeedback('success', 'Plano atualizado com sucesso!');
      } else {
        await apiJson('/api/admin/planos', { method: 'POST', body: JSON.stringify(data) });
        showFeedback('success', 'Plano criado com sucesso!');
      }
      setModalPlano({ show: false, data: null });
      await carregarTudo();
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao salvar plano');
    }
  };

  const handleTogglePlano = async (plano) => {
    try {
      await apiJson('/api/admin/planos', { method: 'PATCH', body: JSON.stringify({ id: plano.id, ativo: !plano.ativo }) });
      await carregarTudo();
    } catch (err) {
      showFeedback('error', 'Erro ao alterar status do plano');
    }
  };

  // Handlers Cupons
  const handleSaveCupom = async (e) => {
    e.preventDefault();
    const data = modalCupom.data;
    try {
      if (data.id) {
        await apiJson('/api/admin/cupons', { method: 'PATCH', body: JSON.stringify(data) });
        showFeedback('success', 'Cupom atualizado!');
      } else {
        await apiJson('/api/admin/cupons', { method: 'POST', body: JSON.stringify(data) });
        showFeedback('success', 'Cupom criado com sucesso!');
      }
      setModalCupom({ show: false, data: null });
      await carregarTudo();
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao salvar cupom');
    }
  };

  const handleDeleteCupom = async (id) => {
    if (!confirm('Deseja excluir este cupom?')) return;
    try {
      await apiJson(`/api/admin/cupons?id=${id}`, { method: 'DELETE' });
      showFeedback('success', 'Cupom excluído!');
      await carregarTudo();
    } catch (err) {
      showFeedback('error', 'Erro ao excluir cupom');
    }
  };

  // Handlers Mensagens
  const handleSendMensagem = async (e) => {
    e.preventDefault();
    try {
      await apiJson('/api/admin/mensagens', { method: 'POST', body: JSON.stringify(msgForm) });
      showFeedback('success', 'Mensagem enviada com sucesso!');
      setModalMensagem(false);
      setMsgForm({ escritorio_id: 'todos', assunto: '', mensagem: '' });
      await carregarTudo();
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao enviar mensagem');
    }
  };

  // Handlers Modelos
  const handleSaveModelo = async (e) => {
    e.preventDefault();
    const data = modalModelo.data;
    try {
      if (data.id) {
        await apiJson('/api/admin/modelos', { method: 'PATCH', body: JSON.stringify(data) });
        showFeedback('success', 'Modelo atualizado com sucesso!');
      } else {
        await apiJson('/api/admin/modelos', { method: 'POST', body: JSON.stringify(data) });
        showFeedback('success', 'Modelo criado com sucesso!');
      }
      setModalModelo({ show: false, data: null });
      await carregarTudo();
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao salvar modelo');
    }
  };

  // Handlers CMS Landing Page
  const handleUpdateRecurso = (idx, field, value) => {
    const list = [...(landingData.recursos || [])];
    list[idx] = { ...list[idx], [field]: value };
    setLandingData({ ...landingData, recursos: list });
  };

  const handleAddRecurso = () => {
    const list = [...(landingData.recursos || [])];
    list.push({
      id: Date.now().toString(),
      titulo: 'Novo Recurso',
      descricao: 'Descrição do novo recurso...',
      cor: 'blue'
    });
    setLandingData({ ...landingData, recursos: list });
  };

  const handleRemoveRecurso = (idx) => {
    const list = (landingData.recursos || []).filter((_, i) => i !== idx);
    setLandingData({ ...landingData, recursos: list });
  };

  const handleUpdatePlano = (idx, field, value) => {
    const list = [...(landingData.planos || [])];
    list[idx] = { ...list[idx], [field]: value };
    setLandingData({ ...landingData, planos: list });
  };

  const handleAddFuncionalidade = (planoIdx) => {
    const text = (newFeatureInput[planoIdx] || '').trim();
    if (!text) return;
    const list = [...(landingData.planos || [])];
    const plano = { ...list[planoIdx] };
    plano.funcionalidades = [...(plano.funcionalidades || []), text];
    list[planoIdx] = plano;
    setLandingData({ ...landingData, planos: list });
    setNewFeatureInput({ ...newFeatureInput, [planoIdx]: '' });
  };

  const handleRemoveFuncionalidade = (planoIdx, featIdx) => {
    const list = [...(landingData.planos || [])];
    const plano = { ...list[planoIdx] };
    plano.funcionalidades = (plano.funcionalidades || []).filter((_, i) => i !== featIdx);
    list[planoIdx] = plano;
    setLandingData({ ...landingData, planos: list });
  };

  const handleSaveLandingContent = async (e) => {
    if (e) e.preventDefault();
    setSavingLanding(true);
    try {
      await apiJson('/api/admin/landing-content', {
        method: 'POST',
        body: JSON.stringify(landingData)
      });
      showFeedback('success', 'Conteúdo da Landing Page atualizado com sucesso!');
    } catch (err) {
      showFeedback('error', err.message || 'Erro ao salvar conteúdo da Landing Page');
    } finally {
      setSavingLanding(false);
    }
  };

  const handleDeleteModelo = async (id) => {
    if (!confirm('Deseja excluir este modelo?')) return;
    try {
      await apiJson(`/api/admin/modelos?id=${id}`, { method: 'DELETE' });
      showFeedback('success', 'Modelo excluído com sucesso!');
      await carregarTudo();
    } catch (err) {
      showFeedback('error', 'Erro ao excluir modelo');
    }
  };

  const modelosFiltrados = useMemo(() => {
    return modelos.filter((m) => {
      if (filtroModeloArea && m.area !== filtroModeloArea) return false;
      if (filtroModeloTipo && m.tipo !== filtroModeloTipo) return false;
      if (buscaModelo) {
        const b = buscaModelo.toLowerCase();
        return (m.nome || '').toLowerCase().includes(b) || (m.descricao || '').toLowerCase().includes(b);
      }
      return true;
    });
  }, [modelos, filtroModeloArea, filtroModeloTipo, buscaModelo]);

  const pagamentosFiltrados = useMemo(() => {
    if (filtroPagamento === 'todos') return pagamentos;
    return pagamentos.filter((p) => p.status === filtroPagamento);
  }, [pagamentos, filtroPagamento]);

  if (authLoading) {
    return <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-gray-400">Carregando painel admin...</div>;
  }

  if (!authUser || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0b0f17] flex items-center justify-center text-white p-4">
        <div className="text-center p-8 bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-bold mb-2">Acesso Restrito</h2>
          <p className="text-gray-400 text-sm mb-6">Apenas administradores do SaaS JusJNC possuem acesso a este painel.</p>
          <a href="/" className="inline-block bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl transition">
            Voltar ao Meu Escritório
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f17] text-white flex flex-col font-sans" data-testid="admin-master-panel">
      {/* Header Fiel ao Legado */}
      <header className="bg-gray-900/90 backdrop-blur border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/JusJNC_White.png" alt="JusJNC" className="h-8 w-auto object-contain" />
            <span className="text-sm font-bold text-red-500 tracking-wide">Painel Admin</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white text-xs md:text-sm font-semibold px-4 py-2 rounded-xl transition shadow-md shadow-red-500/20"
              data-testid="admin-meu-escritorio"
            >
              Meu Escritório
            </a>
            <button
              onClick={() => signOut && signOut()}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs md:text-sm font-medium px-4 py-2 rounded-xl transition border border-gray-700"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Navegação por Pílulas (Pills) Fiel às Telas do Legado */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 w-full">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2.5 rounded-xl text-xs md:text-sm font-medium whitespace-nowrap transition-all ${
                tab === t.key
                  ? 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/20 font-bold'
                  : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300 hover:text-white border border-gray-700/60'
              }`}
              data-testid={`admin-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1 w-full space-y-6">
        {actionMsg && (
          <div className={`p-4 rounded-xl text-sm border flex items-center justify-between ${
            actionMsg.type === 'error'
              ? 'bg-red-950/40 border-red-800 text-red-300'
              : 'bg-green-950/40 border-green-800 text-green-300'
          }`} role="status">
            <span>{actionMsg.text}</span>
            <button onClick={() => setActionMsg(null)} className="text-gray-400 hover:text-white">✕</button>
          </div>
        )}

        {/* 1. ABA DASHBOARD (Fiel à Imagem 2) */}
        {tab === 'dashboard' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl p-6 shadow-xl space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white">Dashboard Financeiro</h2>
              <p className="text-gray-400 text-xs md:text-sm mt-1">Visão geral de receitas, escritórios e conversão</p>
            </div>

            {/* Banner Resumo dos últimos 30 dias */}
            <div className="bg-gradient-to-r from-green-950/30 via-gray-850 to-blue-950/30 border border-gray-700 rounded-xl p-5 shadow">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <span>📊</span> Resumo dos últimos 30 dias
                  </h3>
                  <p className="text-gray-300 text-xs md:text-sm mt-1">
                    Receita do mês: <span className="text-green-400 font-bold">{brl(metrics?.mrr || 0)}</span>
                  </p>
                </div>
                <div className="flex gap-4">
                  <div className="px-4 py-2 bg-gray-900/60 border border-gray-700/50 rounded-xl text-center min-w-[70px]">
                    <p className="text-xl font-bold text-green-400">{metrics?.active_count ?? offices.filter(o => o.status === 'active').length}</p>
                    <p className="text-[11px] text-gray-400">Ativos</p>
                  </div>
                  <div className="px-4 py-2 bg-gray-900/60 border border-gray-700/50 rounded-xl text-center min-w-[70px]">
                    <p className="text-xl font-bold text-yellow-400">{metrics?.trial_count ?? offices.filter(o => o.status === 'trial' || o.plan === 'trial').length}</p>
                    <p className="text-[11px] text-gray-400">Em Trial</p>
                  </div>
                  <div className="px-4 py-2 bg-gray-900/60 border border-gray-700/50 rounded-xl text-center min-w-[70px]">
                    <p className="text-xl font-bold text-purple-400">{metrics?.conversion_rate ?? 100}%</p>
                    <p className="text-[11px] text-gray-400">Conversão</p>
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Cards de Métricas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-850/80 border border-gray-700 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="p-2 bg-green-500/20 text-green-400 rounded-lg text-sm font-bold">$</span>
                  <span className="text-gray-400 text-xs font-medium">Receita Mensal</span>
                </div>
                <p className="text-2xl font-bold text-white">{brl(metrics?.mrr || 0)}</p>
              </div>

              <div className="bg-gray-850/80 border border-gray-700 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="p-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-bold">📈</span>
                  <span className="text-gray-400 text-xs font-medium">Receita Anual</span>
                </div>
                <p className="text-2xl font-bold text-white">{brl(metrics?.arr || 0)}</p>
              </div>

              <div className="bg-gray-850/80 border border-gray-700 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="p-2 bg-yellow-500/20 text-yellow-400 rounded-lg text-sm font-bold">👥</span>
                  <span className="text-gray-400 text-xs font-medium">Escritórios</span>
                </div>
                <p className="text-2xl font-bold text-white">{offices.length}</p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {metrics?.trial_count ?? 0} em trial • {metrics?.blocked_count ?? 0} bloqueados
                </p>
              </div>

              <div className="bg-gray-850/80 border border-gray-700 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-2">
                  <span className="p-2 bg-purple-500/20 text-purple-400 rounded-lg text-sm font-bold">📊</span>
                  <span className="text-gray-400 text-xs font-medium">Taxa de Conversão</span>
                </div>
                <p className="text-2xl font-bold text-white">{metrics?.conversion_rate ?? 100}.0%</p>
                <p className="text-[11px] text-gray-500 mt-1">Trial → Ativo</p>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={carregarTudo}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-2 border border-gray-700 transition"
              >
                <span>🔄</span> Atualizar
              </button>
            </div>
          </div>
        )}

        {/* 2. ABA ESCRITÓRIOS (Fiel à Imagem 5) */}
        {tab === 'escritorios' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-gray-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Gestão de Escritórios</h2>
                <p className="text-gray-400 text-xs md:text-sm mt-1">Aprove, bloqueie ou exclua escritórios cadastrados</p>
              </div>
              <button
                onClick={() => {
                  setEditingOffice(null);
                  setOfficeFormData({ name: '', phone: '', cnpj: '', plan: 'trial' });
                  setModalOfficeForm(true);
                }}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-xl text-xs md:text-sm flex items-center gap-2 transition shadow-md shadow-green-600/20 self-start sm:self-auto"
              >
                <span>+</span> Novo Escritório
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="bg-gray-900/60 text-gray-400 uppercase text-[11px] font-semibold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Nome</th>
                    <th className="px-6 py-3.5">Celular</th>
                    <th className="px-6 py-3.5">CNPJ</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Plano</th>
                    <th className="px-6 py-3.5">Cadastro</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {offices.map((o) => {
                    const isMatriz = o.name?.includes('Neves & Costa');
                    return (
                      <tr key={o.id} className="hover:bg-gray-800/30 transition">
                        <td className="px-6 py-4 font-semibold text-white whitespace-nowrap">{o.name}</td>
                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{o.phone || '-'}</td>
                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{o.cnpj || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            o.status === 'active' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            o.status === 'trial' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                            'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}>
                            {o.status === 'active' ? 'Ativo' : o.status === 'trial' ? 'Trial' : 'Suspenso'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {isMatriz ? (
                            <span className="text-green-400 font-bold">Gratuito</span>
                          ) : o.plan === 'trial' || (!o.plan && o.status === 'trial') ? (
                            <span className="text-red-400 font-medium">Trial (expirado)</span>
                          ) : (
                            <span className="text-yellow-400 font-bold capitalize">{o.plan || 'Básico'}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{formatarData(o.created_at)}</td>
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingOffice(o);
                                setOfficeFormData({ name: o.name, phone: o.phone || '', cnpj: o.cnpj || '', plan: o.plan || 'trial' });
                                setModalOfficeForm(true);
                              }}
                              className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-semibold transition"
                            >
                              Editar
                            </button>
                            {o.status === 'active' ? (
                              <button
                                onClick={() => handleOfficeAction(o.id, 'suspend')}
                                className="px-2.5 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-xs font-semibold transition"
                              >
                                Suspender
                              </button>
                            ) : (
                              <button
                                onClick={() => handleOfficeAction(o.id, 'activate')}
                                className="px-2.5 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-semibold transition"
                              >
                                Ativar
                              </button>
                            )}

                            {!isMatriz && (
                              <>
                                <button
                                  onClick={() => setModalPeriodoGratis({ show: true, office: o, dias: 30 })}
                                  className="p-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 rounded-lg transition"
                                  title="🎁 Liberar período grátis"
                                >
                                  🎁
                                </button>
                                <button
                                  onClick={() => setModalPagamento({ show: true, office: o, metodo: 'pix', valor: 99, meses: 1 })}
                                  className="p-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg transition"
                                  title="💳 Registrar pagamento manual"
                                >
                                  💳
                                </button>
                                <button
                                  onClick={() => handleOfficeAction(o.id, o.status === 'blocked' ? 'unblock' : 'block')}
                                  className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
                                  title={o.status === 'blocked' ? 'Desbloquear' : 'Bloquear'}
                                >
                                  {o.status === 'blocked' ? '🔓' : '🔒'}
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => handleDeleteOffice(o.id, o.name)}
                              className="p-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg transition"
                              title="Excluir escritório"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {offices.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">Nenhum escritório cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. ABA PLANOS (Fiel à Imagem 3) */}
        {tab === 'planos' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-gray-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Gestão de Planos</h2>
                <p className="text-gray-400 text-xs md:text-sm mt-1">Configure os planos e textos da Landing Page</p>
              </div>
              <button
                onClick={() => setModalPlano({
                  show: true,
                  data: { tipo: 'novo', nome: '', descricao: '', preco_mensal: 49, preco_anual: 490, subtitulo_landing: '', descricao_landing: '', tag_destaque: '', texto_botao: 'Começar 30 dias grátis', ativo: true }
                })}
                className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl text-xs md:text-sm flex items-center gap-2 transition shadow-md shadow-red-600/20 self-start sm:self-auto"
              >
                <span>+</span> Novo Plano
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="bg-gray-900/60 text-gray-400 uppercase text-[11px] font-semibold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Plano</th>
                    <th className="px-6 py-3.5">Preços</th>
                    <th className="px-6 py-3.5">Landing</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {planos.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-gray-700 text-gray-300 text-[10px] font-mono lowercase">{p.tipo || 'plano'}</span>
                          <span className="font-bold text-white">{p.nome}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{p.subtitulo_landing || p.descricao}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <p className="text-green-400 font-bold">{brl(p.preco_mensal)}/mês</p>
                        <p className="text-gray-400 text-xs">{brl(p.preco_anual)}/ano</p>
                      </td>
                      <td className="px-6 py-4">
                        {p.tag_destaque && (
                          <span className="inline-block px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 text-[10px] font-bold mb-1 border border-yellow-500/30">
                            {p.tag_destaque}
                          </span>
                        )}
                        <p className="text-xs text-gray-300">{p.texto_botao || 'Começar teste grátis'}</p>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${p.ativo !== false ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                          {p.ativo !== false ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setModalPlano({ show: true, data: { ...p } })}
                            className="px-3 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-semibold transition"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleTogglePlano(p)}
                            className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs font-semibold transition"
                          >
                            {p.ativo !== false ? 'Desativar' : 'Ativar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {planos.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-gray-500">Nenhum plano cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. ABA CUPONS */}
        {tab === 'cupons' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-gray-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Gestão de Cupons</h2>
                <p className="text-gray-400 text-xs md:text-sm mt-1">Crie e gerencie cupons de desconto promocionais</p>
              </div>
              <button
                onClick={() => setModalCupom({
                  show: true,
                  data: { codigo: '', descricao: '', tipo_desconto: 'percentual', valor_desconto: 20, validade: '', uso_maximo: 50, ativo: true }
                })}
                className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl text-xs md:text-sm flex items-center gap-2 transition shadow-md shadow-red-600/20 self-start sm:self-auto"
              >
                <span>+</span> Novo Cupom
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="bg-gray-900/60 text-gray-400 uppercase text-[11px] font-semibold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Código</th>
                    <th className="px-6 py-3.5">Descrição</th>
                    <th className="px-6 py-3.5">Desconto</th>
                    <th className="px-6 py-3.5">Validade</th>
                    <th className="px-6 py-3.5">Usos</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {cupons.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-6 py-4 font-mono font-bold text-yellow-400 whitespace-nowrap">{c.codigo}</td>
                      <td className="px-6 py-4 text-gray-300">{c.descricao || '-'}</td>
                      <td className="px-6 py-4 text-green-400 font-bold whitespace-nowrap">
                        {c.tipo_desconto === 'percentual' ? `${c.valor_desconto}%` : brl(c.valor_desconto)}
                      </td>
                      <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{formatarData(c.validade)}</td>
                      <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{c.usos_realizados || 0} / {c.uso_maximo}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${c.ativo ? 'bg-green-500/20 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
                          {c.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setModalCupom({ show: true, data: { ...c } })}
                            className="px-2.5 py-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-lg text-xs font-semibold"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleDeleteCupom(c.id)}
                            className="p-1 bg-red-600/20 hover:bg-red-600/40 text-red-400 rounded-lg"
                            title="Excluir"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {cupons.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-gray-500">Nenhum cupom cadastrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. ABA MENSAGENS */}
        {tab === 'mensagens' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-6 border-b border-gray-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Mensagens Administrativas</h2>
                <p className="text-gray-400 text-xs md:text-sm mt-1">Comunicação direta e avisos para os escritórios assinantes</p>
              </div>
              <button
                onClick={() => setModalMensagem(true)}
                className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl text-xs md:text-sm flex items-center gap-2 transition shadow-md shadow-red-600/20 self-start sm:self-auto"
              >
                <span>+</span> Nova Mensagem
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="bg-gray-900/60 text-gray-400 uppercase text-[11px] font-semibold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Destinatário</th>
                    <th className="px-6 py-3.5">Assunto</th>
                    <th className="px-6 py-3.5">Mensagem</th>
                    <th className="px-6 py-3.5">Data</th>
                    <th className="px-6 py-3.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {mensagens.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-6 py-4 font-semibold text-white whitespace-nowrap">{m.escritorio_nome}</td>
                      <td className="px-6 py-4 text-yellow-400 font-medium whitespace-nowrap">{m.assunto || '-'}</td>
                      <td className="px-6 py-4 text-gray-300 max-w-md truncate">{m.mensagem}</td>
                      <td className="px-6 py-4 text-gray-400 whitespace-nowrap">{formatarData(m.criado_em)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.lida ? 'bg-gray-700 text-gray-300' : 'bg-blue-500/20 text-blue-400'}`}>
                          {m.lida ? 'Lida' : 'Não lida'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {mensagens.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-gray-500">Nenhuma mensagem registrada.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. ABA PAGAMENTOS */}
        {tab === 'pagamentos' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl overflow-hidden shadow-xl space-y-4 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Histórico de Pagamentos</h2>
                <p className="text-gray-400 text-xs md:text-sm mt-1">Extrato financeiro de assinaturas e pagamentos de escritórios</p>
              </div>

              {/* Filtro por status */}
              <div className="flex gap-1.5 bg-gray-900 p-1 rounded-xl border border-gray-700/60 self-start sm:self-auto">
                {['todos', 'aprovado', 'pendente', 'recusado'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setFiltroPagamento(st)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition ${
                      filtroPagamento === st ? 'bg-red-600 text-white' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-left text-xs md:text-sm">
                <thead className="bg-gray-900/60 text-gray-400 uppercase text-[11px] font-semibold tracking-wider">
                  <tr>
                    <th className="px-6 py-3.5">Escritório</th>
                    <th className="px-6 py-3.5">Valor</th>
                    <th className="px-6 py-3.5">Método</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5">Período</th>
                    <th className="px-6 py-3.5">Data</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/50">
                  {pagamentosFiltrados.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-800/30 transition">
                      <td className="px-6 py-4 font-semibold text-white whitespace-nowrap">{p.escritorio_nome}</td>
                      <td className="px-6 py-4 font-bold text-green-400 whitespace-nowrap">{brl(p.valor)}</td>
                      <td className="px-6 py-4 text-gray-300 uppercase text-xs whitespace-nowrap">{p.metodo}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          p.status === 'aprovado' ? 'bg-green-500/20 text-green-400' :
                          p.status === 'pendente' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-red-500/20 text-red-400'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs whitespace-nowrap">
                        {formatarData(p.periodo_inicio)} até {formatarData(p.periodo_fim)}
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-xs whitespace-nowrap">{formatarData(p.criado_em)}</td>
                    </tr>
                  ))}
                  {pagamentosFiltrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-gray-500">Nenhum pagamento encontrado.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 7. ABA MODELOS */}
        {tab === 'modelos' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-white">Modelos de Documentos</h2>
                <p className="text-gray-400 text-xs md:text-sm mt-1">Biblioteca de templates de peças jurídicas, contratos e procurações</p>
              </div>
              <button
                onClick={() => setModalModelo({
                  show: true,
                  data: { nome: '', tipo: 'peticao_inicial', area: 'trabalhista', descricao: '', link_arquivo: '', texto_base: '', ativo: true }
                })}
                className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl text-xs md:text-sm flex items-center gap-2 transition shadow-md shadow-red-600/20 self-start sm:self-auto"
              >
                <span>+</span> Novo Modelo
              </button>
            </div>

            {/* Barra de Busca e Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                type="text"
                placeholder="Buscar modelo por título ou descrição..."
                value={buscaModelo}
                onChange={(e) => setBuscaModelo(e.target.value)}
                className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-xl text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
              />
              <select
                value={filtroModeloArea}
                onChange={(e) => setFiltroModeloArea(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
              >
                <option value="">Todas as Áreas</option>
                {Object.entries(AREAS_MODELO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              <select
                value={filtroModeloTipo}
                onChange={(e) => setFiltroModeloTipo(e.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-xl text-xs text-white focus:outline-none focus:border-red-500"
              >
                <option value="">Todos os Tipos</option>
                {Object.entries(TIPOS_MODELO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            {/* Grid de Modelos */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {modelosFiltrados.map((m) => (
                <div key={m.id} className="bg-gray-850/80 border border-gray-700 rounded-xl p-5 flex flex-col justify-between hover:border-red-500/40 transition">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded bg-red-600/20 text-red-400 text-[10px] font-bold border border-red-500/30 uppercase">
                        {AREAS_MODELO[m.area] || m.area}
                      </span>
                      <span className="text-[11px] text-gray-400 capitalize">
                        {TIPOS_MODELO[m.tipo] || m.tipo}
                      </span>
                    </div>
                    <h4 className="font-bold text-white text-sm mb-1">{m.nome}</h4>
                    <p className="text-gray-400 text-xs line-clamp-2 mb-4">{m.descricao || 'Sem descrição.'}</p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-gray-750">
                    <button
                      onClick={() => setViewingModelo(m)}
                      className="text-xs text-blue-400 hover:underline font-medium"
                    >
                      Ver Conteúdo →
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setModalModelo({ show: true, data: { ...m } })}
                        className="p-1 text-gray-400 hover:text-white"
                        title="Editar"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteModelo(m.id)}
                        className="p-1 text-gray-400 hover:text-red-400"
                        title="Excluir"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {modelosFiltrados.length === 0 && (
                <div className="col-span-full py-12 text-center text-gray-500">
                  Nenhum modelo de documento encontrado.
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'landing' && (
          <div className="bg-gray-800/40 border border-gray-700/60 rounded-2xl p-6 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-700/60 pb-4">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <span>🌐</span> Editor Completo da Landing Page & CMS
                </h2>
                <p className="text-gray-400 text-xs md:text-sm mt-1">
                  Gerencie todos os textos, dias de teste, ano de copyright, recursos (adicionar/excluir), planos e documentos legais
                </p>
              </div>
              <button
                type="button"
                onClick={handleSaveLandingContent}
                disabled={savingLanding}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-xs md:text-sm flex items-center gap-2 transition shadow-lg shadow-red-600/30 disabled:opacity-50 self-start sm:self-auto"
              >
                <span>💾</span> {savingLanding ? 'Salvando...' : 'Salvar Todas as Alterações'}
              </button>
            </div>

            <form onSubmit={handleSaveLandingContent} className="space-y-6">
              {/* Card 1: Configurações Gerais & Dias de Teste */}
              <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                  <span>⚙️</span> 1. Configurações Gerais, Dias de Teste & Rodapé
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Dias de Teste Grátis (Trial)</label>
                    <input
                      type="number"
                      value={landingData.dias_teste ?? 30}
                      onChange={(e) => setLandingData({ ...landingData, dias_teste: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">Aparece nos botões e no cadastro</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Ano do Copyright no Rodapé</label>
                    <input
                      type="number"
                      value={landingData.copyright_ano ?? 2026}
                      onChange={(e) => setLandingData({ ...landingData, copyright_ano: Number(e.target.value) })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">Exibido após o símbolo &copy;</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Texto de Copyright</label>
                    <input
                      type="text"
                      value={landingData.copyright_texto || 'Jus JNC. Todos os direitos reservados.'}
                      onChange={(e) => setLandingData({ ...landingData, copyright_texto: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">Texto da linha de copyright</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Título Bloco de Logos Parceiros</label>
                    <input
                      type="text"
                      value={landingData.footer_dev_title || 'Desenvolvidos por JNC Tecnologia.'}
                      onChange={(e) => setLandingData({ ...landingData, footer_dev_title: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                    <span className="text-[10px] text-gray-500 mt-0.5 block">Título acima das logos</span>
                  </div>
                </div>
              </div>

              {/* Card 2: Hero & Apresentação */}
              <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                  <span>🚀</span> 2. Hero & Apresentação Principal
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Badge Pulsante Superior</label>
                    <input
                      type="text"
                      value={landingData.hero_badge || ''}
                      onChange={(e) => setLandingData({ ...landingData, hero_badge: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Título - Prefixo</label>
                    <input
                      type="text"
                      value={landingData.hero_title_prefix || ''}
                      onChange={(e) => setLandingData({ ...landingData, hero_title_prefix: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Título - Destaque em Vermelho</label>
                    <input
                      type="text"
                      value={landingData.hero_title_highlight || ''}
                      onChange={(e) => setLandingData({ ...landingData, hero_title_highlight: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Subtítulo / Proposta de Valor</label>
                    <textarea
                      rows={2}
                      value={landingData.hero_subtitle || ''}
                      onChange={(e) => setLandingData({ ...landingData, hero_subtitle: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Botão Primário (CTA)</label>
                    <input
                      type="text"
                      value={landingData.cta_primary || ''}
                      onChange={(e) => setLandingData({ ...landingData, cta_primary: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Botão Secundário</label>
                    <input
                      type="text"
                      value={landingData.cta_secondary || ''}
                      onChange={(e) => setLandingData({ ...landingData, cta_secondary: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>

              {/* Card 3: Contatos Oficiais & Foro Jurídico */}
              <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                  <span>🏢</span> 3. Informações de Contato Oficiais & Foro de Eleição
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">E-mail Principal</label>
                    <input
                      type="email"
                      value={landingData.contact_email || ''}
                      onChange={(e) => setLandingData({ ...landingData, contact_email: e.target.value })}
                      placeholder="ex: contato@nevesecosta.com.br"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">E-mail DPO / Privacidade (LGPD)</label>
                    <input
                      type="email"
                      value={landingData.contact_dpo_email || ''}
                      onChange={(e) => setLandingData({ ...landingData, contact_dpo_email: e.target.value })}
                      placeholder="ex: dpo@nevesecosta.com.br"
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Telefone / WhatsApp</label>
                    <input
                      type="text"
                      value={landingData.contact_phone || ''}
                      onChange={(e) => setLandingData({ ...landingData, contact_phone: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">Foro de Eleição (Termos)</label>
                    <input
                      type="text"
                      value={landingData.contact_forum || ''}
                      onChange={(e) => setLandingData({ ...landingData, contact_forum: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>
              </div>

              {/* Card 4: Recursos / Features da Landing (Editar, Adicionar, Excluir) */}
              <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                      <span>✨</span> 4. Recursos da Landing Page (Features)
                    </h3>
                    <p className="text-gray-400 text-xs mt-0.5">Adicione, edite textos, selecione cores ou exclua recursos exibidos aos clientes</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddRecurso}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow"
                  >
                    <span>+</span> Novo Recurso
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(landingData.recursos || []).map((rec, idx) => (
                    <div key={rec.id || idx} className="p-4 bg-gray-800/80 border border-gray-700 rounded-xl relative space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Recurso #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecurso(idx)}
                          className="text-red-400 hover:text-red-300 p-1 text-xs rounded hover:bg-red-500/10 transition"
                          title="Excluir recurso"
                        >
                          🗑️ Excluir
                        </button>
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 block font-semibold mb-1">Título do Recurso</label>
                        <input
                          type="text"
                          value={rec.titulo || ''}
                          onChange={(e) => handleUpdateRecurso(idx, 'titulo', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 block font-semibold mb-1">Descrição</label>
                        <textarea
                          rows={2}
                          value={rec.descricao || ''}
                          onChange={(e) => handleUpdateRecurso(idx, 'descricao', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-gray-400 block font-semibold mb-1">Cor do Destaque</label>
                        <select
                          value={rec.cor || 'blue'}
                          onChange={(e) => handleUpdateRecurso(idx, 'cor', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                        >
                          <option value="blue">🔵 Azul</option>
                          <option value="purple">🟣 Roxo</option>
                          <option value="green">🟢 Verde</option>
                          <option value="yellow">🟡 Amarelo</option>
                          <option value="pink">🌸 Rosa</option>
                          <option value="cyan">🌊 Ciano</option>
                          <option value="red">🔴 Vermelho</option>
                        </select>
                      </div>
                    </div>
                  ))}
                  {(landingData.recursos || []).length === 0 && (
                    <div className="col-span-full py-8 text-center text-gray-500 text-xs">
                      Nenhum recurso cadastrado. Clique em "+ Novo Recurso" para adicionar.
                    </div>
                  )}
                </div>
              </div>

              {/* Card 5: Planos Completos & Funcionalidades */}
              <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
                <div className="border-b border-gray-800 pb-3">
                  <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                    <span>💳</span> 5. Planos & Funcionalidades da Landing Page
                  </h3>
                  <p className="text-gray-400 text-xs mt-0.5">
                    Edite nomes, valores mensais/anuais, tags de destaque e gerencie cada linha de funcionalidade de cada plano
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {(landingData.planos || []).map((plano, pIdx) => {
                    const isDestaque = !!plano.tagDestaque;
                    return (
                      <div
                        key={plano.id || pIdx}
                        className={`p-4 rounded-xl border space-y-4 ${
                          isDestaque ? 'bg-amber-950/20 border-amber-600/60 ring-1 ring-amber-500/40' : 'bg-gray-800/80 border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-bold uppercase tracking-wider ${isDestaque ? 'text-amber-400' : 'text-gray-300'}`}>
                            Plano #{pIdx + 1}: {plano.nome}
                          </span>
                          {isDestaque && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-bold">
                              Destaque
                            </span>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-400 block font-semibold mb-1">Nome do Plano</label>
                            <input
                              type="text"
                              value={plano.nome || ''}
                              onChange={(e) => handleUpdatePlano(pIdx, 'nome', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 block font-semibold mb-1">Tag Destaque (opcional)</label>
                            <input
                              type="text"
                              placeholder="ex: Mais escolhido"
                              value={plano.tagDestaque || ''}
                              onChange={(e) => handleUpdatePlano(pIdx, 'tagDestaque', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-400 block font-semibold mb-1">Preço Mensal (R$)</label>
                            <input
                              type="number"
                              value={plano.precoMensal ?? 0}
                              onChange={(e) => handleUpdatePlano(pIdx, 'precoMensal', Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-400 block font-semibold mb-1">Preço Anual (R$)</label>
                            <input
                              type="number"
                              value={plano.precoAnual ?? 0}
                              onChange={(e) => handleUpdatePlano(pIdx, 'precoAnual', Number(e.target.value))}
                              className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] text-gray-400 block font-semibold mb-1">Subtítulo</label>
                          <input
                            type="text"
                            value={plano.subtituloLanding || ''}
                            onChange={(e) => handleUpdatePlano(pIdx, 'subtituloLanding', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-gray-400 block font-semibold mb-1">Descrição</label>
                          <textarea
                            rows={2}
                            value={plano.descricaoLanding || ''}
                            onChange={(e) => handleUpdatePlano(pIdx, 'descricaoLanding', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] text-gray-400 block font-semibold mb-1">Texto do Botão CTA</label>
                          <input
                            type="text"
                            placeholder="ex: Começar 30 dias grátis"
                            value={plano.textoBotao || ''}
                            onChange={(e) => handleUpdatePlano(pIdx, 'textoBotao', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                          />
                        </div>

                        {/* Lista de Funcionalidades do Plano */}
                        <div className="pt-2 border-t border-gray-700">
                          <label className="text-[11px] text-yellow-400 font-bold block mb-2">
                            Funcionalidades ({ (plano.funcionalidades || []).length })
                          </label>
                          <ul className="space-y-1.5 mb-2.5 max-h-40 overflow-y-auto pr-1">
                            {(plano.funcionalidades || []).map((feat, fIdx) => (
                              <li key={fIdx} className="flex items-center justify-between gap-2 p-1.5 bg-gray-700/60 rounded text-xs text-gray-200">
                                <span className="truncate flex-1">✓ {feat}</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveFuncionalidade(pIdx, fIdx)}
                                  className="text-red-400 hover:text-red-300 px-1 font-bold text-xs"
                                  title="Remover funcionalidade"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                          </ul>

                          {/* Adicionar Funcionalidade */}
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              placeholder="Nova funcionalidade..."
                              value={newFeatureInput[pIdx] || ''}
                              onChange={(e) => setNewFeatureInput({ ...newFeatureInput, [pIdx]: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddFuncionalidade(pIdx);
                                }
                              }}
                              className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                            />
                            <button
                              type="button"
                              onClick={() => handleAddFuncionalidade(pIdx)}
                              className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold transition"
                            >
                              + Add
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card 6: Documentos Legais com Scroll */}
              <div className="bg-gray-900/60 border border-gray-700/60 rounded-xl p-5 space-y-4">
                <h3 className="text-sm font-bold text-yellow-500 uppercase tracking-wider flex items-center gap-2">
                  <span>⚖️</span> 6. Documentos Legais Integrados
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">
                      Texto dos Termos de Uso (Editável)
                    </label>
                    <textarea
                      rows={10}
                      value={landingData.termos_de_uso || ''}
                      onChange={(e) => setLandingData({ ...landingData, termos_de_uso: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-red-500 leading-relaxed"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 font-semibold mb-1 block">
                      Texto da Política de Privacidade (Editável)
                    </label>
                    <textarea
                      rows={10}
                      value={landingData.politica_privacidade || ''}
                      onChange={(e) => setLandingData({ ...landingData, politica_privacidade: e.target.value })}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-red-500 leading-relaxed"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingLanding}
                  className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl text-sm flex items-center gap-2 transition shadow-lg shadow-red-600/30 disabled:opacity-50"
                >
                  <span>💾</span> {savingLanding ? 'Salvando Alterações...' : 'Salvar Todas as Alterações na Landing Page'}
                </button>
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Modal Criar / Editar Escritório */}
      {modalOfficeForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-white">
                {editingOffice ? 'Editar Escritório' : 'Novo Escritório'}
              </h3>
              <button onClick={() => setModalOfficeForm(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSaveOffice} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome do Escritório *</label>
                <input
                  required
                  type="text"
                  value={officeFormData.name}
                  onChange={(e) => setOfficeFormData({ ...officeFormData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={officeFormData.phone}
                  onChange={(e) => setOfficeFormData({ ...officeFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
                  placeholder="(00) 00000-0000"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">CNPJ</label>
                <input
                  type="text"
                  value={officeFormData.cnpj}
                  onChange={(e) => setOfficeFormData({ ...officeFormData, cnpj: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Plano Inicial</label>
                <select
                  value={officeFormData.plan}
                  onChange={(e) => setOfficeFormData({ ...officeFormData, plan: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-red-500"
                >
                  <option value="trial">Trial (30 dias grátis)</option>
                  <option value="basico">Básico (R$ 49/mês)</option>
                  <option value="profissional">Profissional (R$ 99/mês)</option>
                  <option value="enterprise">Enterprise (R$ 199/mês)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalOfficeForm(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold shadow-md"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 🎁 Liberar Período Grátis */}
      {modalPeriodoGratis.show && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <span>🎁</span> Liberar Período Grátis
            </h3>
            <p className="text-xs text-gray-400">
              Escritório: <strong className="text-white">{modalPeriodoGratis.office?.name}</strong>
            </p>
            <div>
              <label className="text-xs text-gray-400 font-semibold mb-1 block">Dias a adicionar:</label>
              <select
                value={modalPeriodoGratis.dias}
                onChange={(e) => setModalPeriodoGratis({ ...modalPeriodoGratis, dias: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
              >
                <option value={7}>+ 7 dias</option>
                <option value={14}>+ 14 dias</option>
                <option value={30}>+ 30 dias (1 mês)</option>
                <option value={60}>+ 60 dias (2 meses)</option>
                <option value={90}>+ 90 dias (3 meses)</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalPeriodoGratis({ show: false, office: null, dias: 30 })}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarPeriodoGratis}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 💳 Registrar Pagamento Manual */}
      {modalPagamento.show && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="font-bold text-lg text-white flex items-center gap-2">
              <span>💳</span> Registrar Pagamento Manual
            </h3>
            <p className="text-xs text-gray-400">
              Escritório: <strong className="text-white">{modalPagamento.office?.name}</strong>
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Método</label>
                <select
                  value={modalPagamento.metodo}
                  onChange={(e) => setModalPagamento({ ...modalPagamento, metodo: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
                >
                  <option value="pix">PIX</option>
                  <option value="cartao">Cartão de Crédito</option>
                  <option value="admin_isencao">Isenção Admin</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Valor Mensal (R$)</label>
                <input
                  type="number"
                  value={modalPagamento.valor}
                  onChange={(e) => setModalPagamento({ ...modalPagamento, valor: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Meses Pagos</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={modalPagamento.meses}
                  onChange={(e) => setModalPagamento({ ...modalPagamento, meses: Number(e.target.value) })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white"
                />
              </div>
              <p className="text-xs text-green-400 font-bold">
                Total: {brl(modalPagamento.valor * modalPagamento.meses)}
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalPagamento({ show: false, office: null, metodo: 'pix', valor: 99, meses: 1 })}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarPagamento}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-xs font-semibold"
              >
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Plano */}
      {modalPlano.show && modalPlano.data && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-white">
                {modalPlano.data.id ? 'Editar Plano' : 'Novo Plano'}
              </h3>
              <button onClick={() => setModalPlano({ show: false, data: null })} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSavePlano} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome do Plano *</label>
                  <input
                    required
                    type="text"
                    value={modalPlano.data.nome || ''}
                    onChange={(e) => setModalPlano({ ...modalPlano, data: { ...modalPlano.data, nome: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Identificador (tipo)</label>
                  <input
                    type="text"
                    value={modalPlano.data.tipo || ''}
                    onChange={(e) => setModalPlano({ ...modalPlano, data: { ...modalPlano.data, tipo: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Preço Mensal (R$)</label>
                  <input
                    type="number"
                    value={modalPlano.data.preco_mensal || 0}
                    onChange={(e) => setModalPlano({ ...modalPlano, data: { ...modalPlano.data, preco_mensal: Number(e.target.value) } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Preço Anual (R$)</label>
                  <input
                    type="number"
                    value={modalPlano.data.preco_anual || 0}
                    onChange={(e) => setModalPlano({ ...modalPlano, data: { ...modalPlano.data, preco_anual: Number(e.target.value) } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Subtítulo na Landing</label>
                <input
                  type="text"
                  value={modalPlano.data.subtitulo_landing || ''}
                  onChange={(e) => setModalPlano({ ...modalPlano, data: { ...modalPlano.data, subtitulo_landing: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Tag Destaque (ex: Mais escolhido)</label>
                  <input
                    type="text"
                    value={modalPlano.data.tag_destaque || ''}
                    onChange={(e) => setModalPlano({ ...modalPlano, data: { ...modalPlano.data, tag_destaque: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Texto do Botão</label>
                  <input
                    type="text"
                    value={modalPlano.data.texto_botao || 'Começar 30 dias grátis'}
                    onChange={(e) => setModalPlano({ ...modalPlano, data: { ...modalPlano.data, texto_botao: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalPlano({ show: false, data: null })}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
                >
                  Salvar Plano
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Cupom */}
      {modalCupom.show && modalCupom.data && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-white">
                {modalCupom.data.id ? 'Editar Cupom' : 'Novo Cupom'}
              </h3>
              <button onClick={() => setModalCupom({ show: false, data: null })} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSaveCupom} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Código do Cupom *</label>
                <input
                  required
                  type="text"
                  value={modalCupom.data.codigo || ''}
                  onChange={(e) => setModalCupom({ ...modalCupom, data: { ...modalCupom.data, codigo: e.target.value.toUpperCase() } })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-yellow-400 font-mono font-bold"
                  placeholder="EX: PROMO50"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Descrição</label>
                <input
                  type="text"
                  value={modalCupom.data.descricao || ''}
                  onChange={(e) => setModalCupom({ ...modalCupom, data: { ...modalCupom.data, descricao: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Tipo</label>
                  <select
                    value={modalCupom.data.tipo_desconto || 'percentual'}
                    onChange={(e) => setModalCupom({ ...modalCupom, data: { ...modalCupom.data, tipo_desconto: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  >
                    <option value="percentual">Percentual (%)</option>
                    <option value="fixo">Fixo (R$)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Valor</label>
                  <input
                    required
                    type="number"
                    value={modalCupom.data.valor_desconto || 0}
                    onChange={(e) => setModalCupom({ ...modalCupom, data: { ...modalCupom.data, valor_desconto: Number(e.target.value) } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Uso Máximo</label>
                  <input
                    type="number"
                    value={modalCupom.data.uso_maximo || 1}
                    onChange={(e) => setModalCupom({ ...modalCupom, data: { ...modalCupom.data, uso_maximo: Number(e.target.value) } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Validade</label>
                  <input
                    type="date"
                    value={modalCupom.data.validade || ''}
                    onChange={(e) => setModalCupom({ ...modalCupom, data: { ...modalCupom.data, validade: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalCupom({ show: false, data: null })}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
                >
                  Salvar Cupom
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Nova Mensagem */}
      {modalMensagem && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-white">Nova Mensagem Administrativa</h3>
              <button onClick={() => setModalMensagem(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSendMensagem} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Destinatário</label>
                <select
                  value={msgForm.escritorio_id}
                  onChange={(e) => setMsgForm({ ...msgForm, escritorio_id: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                >
                  <option value="todos">Todos os Escritórios</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Assunto</label>
                <input
                  type="text"
                  required
                  value={msgForm.assunto}
                  onChange={(e) => setMsgForm({ ...msgForm, assunto: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  placeholder="Ex: Atualização do Sistema"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Mensagem</label>
                <textarea
                  required
                  rows={4}
                  value={msgForm.mensagem}
                  onChange={(e) => setMsgForm({ ...msgForm, mensagem: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white focus:outline-none focus:border-red-500"
                  placeholder="Escreva a mensagem..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalMensagem(false)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
                >
                  Enviar Mensagem
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Criar / Editar Modelo */}
      {modalModelo.show && modalModelo.data && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h3 className="font-bold text-lg text-white">
                {modalModelo.data.id ? 'Editar Modelo' : 'Novo Modelo de Documento'}
              </h3>
              <button onClick={() => setModalModelo({ show: false, data: null })} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <form onSubmit={handleSaveModelo} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Nome do Modelo *</label>
                <input
                  required
                  type="text"
                  value={modalModelo.data.nome || ''}
                  onChange={(e) => setModalModelo({ ...modalModelo, data: { ...modalModelo.data, nome: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Área</label>
                  <select
                    value={modalModelo.data.area || 'trabalhista'}
                    onChange={(e) => setModalModelo({ ...modalModelo, data: { ...modalModelo.data, area: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  >
                    {Object.entries(AREAS_MODELO).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 font-semibold mb-1 block">Tipo de Peça</label>
                  <select
                    value={modalModelo.data.tipo || 'peticao_inicial'}
                    onChange={(e) => setModalModelo({ ...modalModelo, data: { ...modalModelo.data, tipo: e.target.value } })}
                    className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  >
                    {Object.entries(TIPOS_MODELO).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Descrição do Modelo</label>
                <input
                  type="text"
                  value={modalModelo.data.descricao || ''}
                  onChange={(e) => setModalModelo({ ...modalModelo, data: { ...modalModelo.data, descricao: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Link do Arquivo (Google Drive / Word / PDF)</label>
                <input
                  type="url"
                  value={modalModelo.data.link_arquivo || ''}
                  onChange={(e) => setModalModelo({ ...modalModelo, data: { ...modalModelo.data, link_arquivo: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white"
                  placeholder="https://docs.google.com/..."
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 font-semibold mb-1 block">Texto Base / Minuta</label>
                <textarea
                  rows={6}
                  value={modalModelo.data.texto_base || ''}
                  onChange={(e) => setModalModelo({ ...modalModelo, data: { ...modalModelo.data, texto_base: e.target.value } })}
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-red-500"
                  placeholder="Cole aqui o texto da minuta com variáveis como [Nome do Cliente], [CPF]..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalModelo({ show: false, data: null })}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold"
                >
                  Salvar Modelo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Visualizar Modelo */}
      {viewingModelo && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div>
                <h3 className="font-bold text-lg text-white">{viewingModelo.nome}</h3>
                <span className="text-xs text-red-400 uppercase font-bold">{AREAS_MODELO[viewingModelo.area] || viewingModelo.area} • {TIPOS_MODELO[viewingModelo.tipo] || viewingModelo.tipo}</span>
              </div>
              <button onClick={() => setViewingModelo(null)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            {viewingModelo.link_arquivo && (
              <a
                href={viewingModelo.link_arquivo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:underline flex items-center gap-1 font-medium"
              >
                🔗 Abrir arquivo externo ({viewingModelo.link_arquivo})
              </a>
            )}
            <div className="flex-1 overflow-y-auto bg-gray-950 p-4 rounded-xl border border-gray-800 text-xs text-gray-200 font-mono whitespace-pre-wrap">
              {viewingModelo.texto_base || 'Sem texto cadastrado neste modelo.'}
            </div>
            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewingModelo.texto_base || '');
                  showFeedback('success', 'Texto copiado para a área de transferência!');
                }}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-xs font-semibold"
              >
                📋 Copiar Texto
              </button>
              <button
                onClick={() => setViewingModelo(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-xs font-semibold"
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
