import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { apiJson } from '../lib/apiClient';
import { useAuth } from '../lib/useAuth';
import { safeError } from '../lib/safeLogger';
import { PLANS } from '../lib/plans';

const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'escritorios', label: 'Escritórios' },
  { key: 'planos', label: 'Planos' },
  { key: 'cupons', label: 'Cupons' },
  { key: 'mensagens', label: 'Mensagens' },
  { key: 'pagamentos', label: 'Pagamentos' },
  { key: 'modelos', label: 'Modelos' }
];

const STATUS_BADGES = {
  active: 'bg-green-100 text-green-700 border-green-200',
  trial: 'bg-blue-100 text-blue-700 border-blue-200',
  trialing: 'bg-blue-100 text-blue-700 border-blue-200',
  blocked: 'bg-red-100 text-red-700 border-red-200',
  suspended: 'bg-red-100 text-red-700 border-red-200'
};

const PLAN_BADGES = {
  trial: 'bg-blue-100 text-blue-700',
  pro: 'bg-purple-100 text-purple-700',
  basico: 'bg-gray-100 text-gray-700',
  basic: 'bg-gray-100 text-gray-700',
  profissional: 'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-amber-100 text-amber-700'
};

const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

function PlanBadge({ plan }) {
  const key = (plan || 'trial').toLowerCase();
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${PLAN_BADGES[key] || PLAN_BADGES.trial}`}>
      {(plan || 'trial').toUpperCase()}
    </span>
  );
}

export default function AdminMasterPanel() {
  const router = useRouter();
  const { profile, authUser, loading: authLoading, signOut } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [offices, setOffices] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState(null);
  const [giftModal, setGiftModal] = useState(null);
  const [giftDays, setGiftDays] = useState(30);

  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    let mounted = true;
    Promise.allSettled([
      apiJson('/api/admin/offices'),
      apiJson('/api/admin/metrics')
    ]).then(([o, m]) => {
      if (!mounted) return;
      if (o.status === 'fulfilled') setOffices(o.value?.offices || []);
      if (m.status === 'fulfilled') setMetrics(m.value);
      [o, m].filter((r) => r.status === 'rejected')
        .forEach((r) => safeError('admin_load_error', r.reason, { component: 'AdminMasterPanel' }));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [authLoading, isAdmin]);

  const officeAction = async (officeId, action, extra = {}) => {
    setActionMsg(null);
    try {
      const result = await apiJson('/api/admin/offices', {
        method: 'PATCH',
        body: JSON.stringify({ office_id: officeId, action, ...extra })
      });
      setOffices((prev) => prev.map((o) => (o.id === officeId ? { ...o, ...result.office } : o)));
      setActionMsg({ type: 'success', text: 'Escritório atualizado com sucesso.' });
      return true;
    } catch (err) {
      safeError('admin_office_action_error', err, { component: 'AdminMasterPanel' });
      setActionMsg({ type: 'error', text: err?.message || 'Erro na ação administrativa.' });
      return false;
    }
  };

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">Carregando...</p></div>;
  }

  if (!authUser || !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Acesso restrito ao administrador do SaaS.</p>
          <a href="/" className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2 rounded-lg">
            Meu Escritório
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100" data-testid="admin-master-panel">
      {/* Header Admin */}
      <header className="bg-gray-900 text-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/JusJNC_White.png" alt="JusJNC" className="h-8 object-contain" />
            <span className="text-sm font-semibold text-red-500 font-bold">Painel Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-sm transition"
              data-testid="admin-meu-escritorio"
            >
              Meu Escritório
            </a>
            <button
              onClick={() => signOut && signOut()}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-4 py-2 rounded-lg text-sm transition"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition ${
                tab === t.key
                  ? 'border-red-600 text-red-600 font-bold'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
              data-testid={`admin-tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {actionMsg && (
          <div className={`mb-4 p-3 rounded text-sm ${actionMsg.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`} role="status">
            {actionMsg.text}
          </div>
        )}

        {/* ABA DASHBOARD */}
        {tab === 'dashboard' && (
          <div>
            <h1 className="text-lg font-bold text-gray-900 mb-4">Receita e Crescimento do SaaS</h1>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-lg shadow border-l-4 border-green-500">
                <p className="text-xs text-gray-500">Receita Mensal (MRR)</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="admin-mrr">{loading ? '…' : brl(metrics?.mrr)}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow border-l-4 border-teal-500">
                <p className="text-xs text-gray-500">Receita Anual (ARR)</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="admin-arr">{loading ? '…' : brl(metrics?.arr)}</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow border-l-4 border-blue-500">
                <p className="text-xs text-gray-500">Total de Escritórios</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="admin-total">{loading ? '…' : (metrics?.total_offices ?? offices.length)}</p>
                <p className="text-[10px] text-gray-400">{metrics?.trial_count ?? 0} em trial • {metrics?.active_count ?? 0} ativos</p>
              </div>
              <div className="p-4 bg-white rounded-lg shadow border-l-4 border-red-600">
                <p className="text-xs text-gray-500">Conversão Trial → Ativo</p>
                <p className="text-2xl font-bold text-gray-900" data-testid="admin-conversion">{loading ? '…' : `${metrics?.conversion_rate ?? 0}%`}</p>
              </div>
            </div>
          </div>
        )}

        {/* ABA ESCRITÓRIOS */}
        {tab === 'escritorios' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-lg font-bold text-gray-900">Gestão de Escritórios</h1>
                <p className="text-xs text-gray-500">Aprove, bloqueie ou exclua escritórios cadastrados</p>
              </div>
              <a
                href="/landing#planos"
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-4 py-2 rounded-lg text-sm"
                data-testid="admin-new-office"
              >
                + Novo Escritório
              </a>
            </div>

            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                    <th className="p-3">Nome</th>
                    <th className="p-3">Celular</th>
                    <th className="p-3">CNPJ</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Plano</th>
                    <th className="p-3">Cadastro</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {offices.map((o) => (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-gray-50" data-testid={`office-row-${o.id}`}>
                      <td className="p-3 font-medium text-gray-900">{o.name}</td>
                      <td className="p-3 text-gray-500">{o.phone || '-'}</td>
                      <td className="p-3 text-gray-500">{o.cnpj || '-'}</td>
                      <td className="p-3">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${STATUS_BADGES[o.status] || STATUS_BADGES.trial}`}>
                          {o.status === 'active' ? 'Ativo' : o.status === 'blocked' || o.status === 'suspended' ? 'Bloqueado' : 'Trial'}
                        </span>
                      </td>
                      <td className="p-3"><PlanBadge plan={o.subscription?.plan || o.plan} /></td>
                      <td className="p-3 text-gray-500">{o.created_at ? new Date(o.created_at).toLocaleDateString('pt-BR') : '-'}</td>
                      <td className="p-3 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => {
                            const newName = window.prompt('Novo nome do escritório:', o.name);
                            if (newName && newName.trim() && newName !== o.name) officeAction(o.id, 'edit', { name: newName });
                          }}
                          className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 font-medium"
                        >
                          Editar
                        </button>
                        {o.status === 'active' ? (
                          <button onClick={() => officeAction(o.id, 'suspend')} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-medium">
                            Suspender
                          </button>
                        ) : (
                          <button onClick={() => officeAction(o.id, 'activate')} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium">
                            Ativar
                          </button>
                        )}
                        <button
                          onClick={() => { setGiftModal(o); setGiftDays(30); }}
                          className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium"
                          data-testid={`gift-btn-${o.id}`}
                        >
                          🎁 Dar Dias Grátis
                        </button>
                      </td>
                    </tr>
                  ))}
                  {offices.length === 0 && (
                    <tr><td colSpan={7} className="p-6 text-center text-gray-400">{loading ? 'Carregando...' : 'Nenhum escritório cadastrado.'}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ABA PLANOS */}
        {tab === 'planos' && (
          <div>
            <h1 className="text-lg font-bold text-gray-900 mb-4">Planos do SaaS</h1>
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b bg-gray-50">
                    <th className="p-3">Plano</th>
                    <th className="p-3">Mensal</th>
                    <th className="p-3">Anual</th>
                    <th className="p-3">Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="p-3"><PlanBadge plan="trial" /></td>
                    <td className="p-3 font-bold">R$ 0</td>
                    <td className="p-3">R$ 0</td>
                    <td className="p-3 text-gray-500">14 dias grátis para novos escritórios</td>
                  </tr>
                  {Object.entries(PLANS).map(([key, p]) => (
                    <tr key={key} className="border-b last:border-0">
                      <td className="p-3"><PlanBadge plan={key} /></td>
                      <td className="p-3 font-bold">{brl(p.price)}/{p.interval}</td>
                      <td className="p-3">{brl(p.price * 10)}/ano <span className="text-[10px] text-green-600">(2 meses grátis)</span></td>
                      <td className="p-3 text-gray-500">{p.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* DEMAIS ABAS */}
        {['cupons', 'mensagens', 'pagamentos', 'modelos'].includes(tab) && (
          <div className="bg-white rounded-lg shadow p-10 text-center">
            <p className="text-4xl mb-3">🚧</p>
            <h2 className="font-bold text-gray-800 mb-1 capitalize">{tab}</h2>
            <p className="text-sm text-gray-500">Módulo em desenvolvimento — disponível na próxima iteração.</p>
          </div>
        )}
      </main>

      {/* Modal Dar Dias Grátis */}
      {giftModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setGiftModal(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b">
              <h3 className="font-bold">🎁 Presentear dias grátis</h3>
              <p className="text-xs text-gray-500">{giftModal.name}</p>
            </div>
            <div className="p-4 space-y-3">
              <label className="text-sm text-gray-600">Dias para estender o trial:</label>
              <input
                type="number"
                min={1}
                value={giftDays}
                onChange={(e) => setGiftDays(Number(e.target.value))}
                className="w-full px-3 py-2 border rounded"
                data-testid="gift-days-input"
              />
              <button
                onClick={async () => {
                  const ok = await officeAction(giftModal.id, 'extend_trial', { days: giftDays });
                  if (ok) setGiftModal(null);
                }}
                className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 rounded-lg"
              >
                Estender +{giftDays} dias
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
