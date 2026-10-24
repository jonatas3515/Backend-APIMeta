import { useEffect, useMemo, useState } from 'react';

import { apiJson } from '../lib/apiClient';
import { useAuth } from '../lib/useAuth';
import { safeError } from '../lib/safeLogger';
import ProcessAnalyticsPanel from './ProcessAnalyticsPanel';
import MetricsDashboard from './MetricsDashboard';
import TasksQuickPanel from './TasksQuickPanel';

const STEP_LABELS = {
  conciliacao: 'Conciliação', instrucao: 'Instrução', sentenca: 'Sentença',
  recurso: 'Recurso', execucao: 'Execução', acordo: 'Acordo', outro: 'Outro'
};

function brl(value) {
  return (value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

function shortDate(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '-';
}

export default function ExecutiveDashboard({ onNavigateTab }) {
  const navigate = (tab, extra = '') => {
    if (onNavigateTab) return onNavigateTab(tab);
    if (typeof window !== 'undefined') window.location.href = `/?tab=${tab}${extra}`;
  };
  const { profile } = useAuth();
  const [office, setOffice] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [cases, setCases] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('executive');

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      apiJson('/api/office/current'),
      apiJson('/api/cases/metrics'),
      apiJson('/api/cases'),
      apiJson('/api/conversations')
    ]).then(([officeR, metricsR, casesR, convsR]) => {
      if (!mounted) return;
      if (officeR.status === 'fulfilled') setOffice(officeR.value);
      if (metricsR.status === 'fulfilled') setMetrics(metricsR.value);
      if (casesR.status === 'fulfilled') setCases(casesR.value || []);
      if (convsR.status === 'fulfilled') setConversations(convsR.value || []);
      [officeR, metricsR, casesR, convsR]
        .filter((r) => r.status === 'rejected')
        .forEach((r) => safeError('dashboard_load_error', r.reason, { component: 'ExecutiveDashboard' }));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const newThisMonth = useMemo(
    () => cases.filter((c) => { const now = new Date(); return c.created_at && new Date(c.created_at) >= new Date(now.getFullYear(), now.getMonth(), 1); }).length,
    [cases]
  );

  const urgentDeadlines = useMemo(
    () => cases
      .filter((c) => c.deadline_date && new Date(c.deadline_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) && c.status !== 'encerrado')
      .sort((a, b) => new Date(a.deadline_date) - new Date(b.deadline_date)),
    [cases]
  );

  const upcoming = urgentDeadlines.slice(0, 5);
  const convsThisMonth = useMemo(
    () => conversations.filter((c) => { const now = new Date(); return c.updated_at && new Date(c.updated_at) >= new Date(now.getFullYear(), now.getMonth(), 1); }).length,
    [conversations]
  );

  const greeting = profile?.name ? `Olá, ${String(profile.name).split(' ')[0]}!` : 'Bem-vindo!';

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const todayCases = useMemo(() => {
    const tomorrow = new Date(today.getTime() + 86400000);
    return cases.filter((c) => {
      if (!c.deadline_date || c.status === 'encerrado') return false;
      const dt = new Date(c.deadline_date);
      return dt >= today && dt < tomorrow;
    });
  }, [cases, today]);

  const todayHearings = useMemo(() => {
    return todayCases.filter((c) => {
      const txt = `${c.title || ''} ${c.case_type || ''} ${c.procedural_step || ''}`.toLowerCase();
      return txt.includes('audiência') || txt.includes('audiencia');
    }).length;
  }, [todayCases]);

  const todayDeadlinesCount = Math.max(0, todayCases.length - todayHearings);

  const activeClientsCount = useMemo(() => {
    const active = cases.filter((c) => c.status !== 'encerrado');
    const set = new Set(active.map((c) => c.client_name || c.conversation_id || c.id));
    return set.size;
  }, [cases]);

  const totalActiveCases = useMemo(() => {
    return cases.filter((c) => c.status !== 'encerrado').length;
  }, [cases]);

  return (
    <div className="p-4 md:p-6 space-y-6 w-full h-full overflow-y-auto" data-testid="executive-dashboard">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <img src="/JNC.png" alt="JNC" className="h-9 w-9 object-contain" />
            <h1 className="text-xl md:text-2xl font-bold text-gray-900" data-testid="dashboard-greeting">{greeting}</h1>
          </div>
          <p className="text-sm text-gray-500">
            {office?.name || 'Neves & Costa Advogados'}
            {office?.plan && (
              <span className="ml-2 text-[10px] px-2 py-0.5 rounded bg-nc-yellow text-nc-black font-bold">
                {String(office.plan).toUpperCase()}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Card de Destaque: Resumo de Hoje (absorvido do legado) */}
      <div className="bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 border border-yellow-500/30 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
            <span className="text-xl">📅</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Resumo de Hoje</h2>
            <p className="text-gray-500 text-xs">O que precisa de atenção imediata no escritório</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{todayDeadlinesCount}</div>
            <div className="text-xs text-red-700 font-medium">Prazos de Hoje</div>
          </div>
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{todayHearings}</div>
            <div className="text-xs text-orange-700 font-medium">Audiências</div>
          </div>
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{urgentDeadlines.length}</div>
            <div className="text-xs text-blue-700 font-medium">Eventos Próximos (7d)</div>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
            <div className="text-2xl font-bold text-green-600">{activeClientsCount}</div>
            <div className="text-xs text-green-700 font-medium">Clientes Ativos</div>
          </div>
        </div>
      </div>

      {/* Seletor de visao */}
      <div className="flex gap-2" data-testid="dashboard-view-selector">
        <button
          onClick={() => setView('executive')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === 'executive'
              ? 'bg-nc-black text-white'
              : 'bg-white text-gray-700 border hover:bg-gray-50'
          }`}
        >
          📊 Visão Executiva & Processos
        </button>
        <button
          onClick={() => setView('funil')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            view === 'funil'
              ? 'bg-nc-black text-white'
              : 'bg-white text-gray-700 border hover:bg-gray-50'
          }`}
        >
          📈 Atendimento & Funil
        </button>
      </div>

      {view === 'funil' && (
        <MetricsDashboard conversations={conversations} />
      )}

      {view === 'executive' && (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-white rounded-lg shadow border-l-4 border-blue-500">
          <p className="text-xs text-gray-500">⚖️ Casos & Processos Ativos</p>
          <p className="text-2xl font-bold text-gray-900" data-testid="kpi-cases">{loading ? '…' : (metrics?.total ?? cases.length)}</p>
          {newThisMonth > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-medium" data-testid="kpi-new-month">
              +{newThisMonth} este mês
            </span>
          )}
        </div>
        <div className="p-4 bg-white rounded-lg shadow border-l-4 border-green-500">
          <p className="text-xs text-gray-500">💰 Patrimônio Sob Gestão</p>
          <p className="text-2xl font-bold text-gray-900" data-testid="kpi-patrimony">{loading ? '…' : brl(metrics?.case_value?.total)}</p>
        </div>
        <div className={`p-4 bg-white rounded-lg shadow border-l-4 ${urgentDeadlines.length > 0 ? 'border-red-500' : 'border-amber-400'}`}>
          <p className="text-xs text-gray-500">📅 Prazos Urgentes (7 dias)</p>
          <p className={`text-2xl font-bold ${urgentDeadlines.length > 0 ? 'text-red-700' : 'text-gray-900'}`} data-testid="kpi-urgent">
            {loading ? '…' : urgentDeadlines.length}
          </p>
        </div>
        <div className="p-4 bg-white rounded-lg shadow border-l-4 border-teal-500">
          <p className="text-xs text-gray-500">💬 Atendimentos WhatsApp</p>
          <p className="text-2xl font-bold text-gray-900" data-testid="kpi-conversations">{loading ? '…' : convsThisMonth}</p>
          <span className="text-[10px] text-gray-400">este mês</span>
        </div>
      </div>

      {/* Graficos */}
      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-bold text-sm text-gray-800 mb-3">📊 Distribuição Processual</h2>
        <ProcessAnalyticsPanel />
      </section>

      {/* Ações rápidas */}
      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-bold text-sm text-gray-800 mb-3">⚡ Ações Rápidas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button onClick={() => navigate('cases', '&new=1')} className="p-3 rounded-lg bg-nc-black text-white text-sm font-medium hover:opacity-90" data-testid="action-new-case">
            ➕ Novo Caso
          </button>
          <button onClick={() => navigate('funnel')} className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium">
            🔀 Funil de Atendimento
          </button>
          <button onClick={() => navigate('agenda')} className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium">
            📅 Agenda de Prazos
          </button>
          <button onClick={() => navigate('cases')} className="p-3 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm font-medium">
            💰 Simular Honorários
          </button>
        </div>
      </section>

      {/* Tarefas Juridicas */}
      <TasksQuickPanel />

      {/* Próximos prazos */}
      <section className="bg-white rounded-lg shadow p-4">
        <h2 className="font-bold text-sm text-gray-800 mb-3">🗓️ Próximos Prazos</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum prazo nos próximos 7 dias.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2">Data</th>
                <th>Caso</th>
                <th className="hidden md:table-cell">Fase</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {upcoming.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className={`py-2 font-medium ${new Date(c.deadline_date) < new Date() ? 'text-red-600' : 'text-amber-600'}`}>
                    {shortDate(c.deadline_date)}
                  </td>
                  <td className="py-2">{c.title}</td>
                  <td className="py-2 hidden md:table-cell text-gray-500">{STEP_LABELS[c.procedural_step] || c.procedural_step || '-'}</td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => navigate('cases', `&caseId=${c.id}`)}
                      className="text-xs text-blue-600 hover:underline font-medium"
                    >
                      Abrir →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Resumo Rápido do Escritório (Legado) */}
      <section className="bg-white rounded-lg shadow p-5">
        <h2 className="text-base font-bold text-gray-900 mb-4">🏛️ Resumo Geral do Escritório</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div className="text-2xl font-bold text-blue-600">{conversations.length}</div>
            <div className="text-xs text-gray-500 mt-1">Total de Contatos / Clientes</div>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div className="text-2xl font-bold text-green-600">{totalActiveCases}</div>
            <div className="text-xs text-gray-500 mt-1">Processos Ativos</div>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div className="text-2xl font-bold text-yellow-600">{urgentDeadlines.length}</div>
            <div className="text-xs text-gray-500 mt-1">Prazos Próximos (7d)</div>
          </div>
          <div className="p-3 rounded-lg bg-gray-50 border border-gray-100">
            <div className="text-2xl font-bold text-purple-600">{brl(metrics?.case_value?.total)}</div>
            <div className="text-xs text-gray-500 mt-1">Honorários em Gestão</div>
          </div>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
