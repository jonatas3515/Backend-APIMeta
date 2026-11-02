import { useEffect, useMemo, useState } from 'react';

import { apiJson } from '../lib/apiClient';
import { useAuth } from '../lib/useAuth';
import { safeError } from '../lib/safeLogger';
import ProcessAnalyticsPanel from './ProcessAnalyticsPanel';
import MetricsDashboard from './MetricsDashboard';
import TasksQuickPanel from './TasksQuickPanel';
import UserRoleBadge from './UserRoleBadge';

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

    const handleOfficeUpdate = (e) => {
      if (e?.detail) setOffice((prev) => ({ ...prev, ...e.detail }));
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('nc:office-updated', handleOfficeUpdate);
    }

    return () => {
      mounted = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('nc:office-updated', handleOfficeUpdate);
      }
    };
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
            {office?.logo_url ? (
              <img
                src={office.logo_url}
                alt={office.name || 'Logo'}
                className="h-10 w-auto max-w-[140px] object-contain rounded"
              />
            ) : (
              <img src="/JNC.png" alt="JNC" className="h-9 w-9 object-contain" />
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-white dark:text-white" data-testid="dashboard-greeting">{greeting}</h1>
              <UserRoleBadge role={profile?.role} isMaster={profile?.is_master} />
            </div>
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
      <div className="bg-[#1B1D1E] border border-gray-800 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-xl text-yellow-400 shadow-sm">
            📅
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">Resumo de Hoje</h2>
            <p className="text-gray-400 text-xs">O que precisa de atenção imediata no escritório</p>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Prazos de Hoje: Vermelho crítico APENAS quando houver pendências (>0), senão neutro elegante */}
          <div className={`p-3.5 rounded-xl text-center border transition ${
            todayDeadlinesCount > 0
              ? 'bg-red-500/10 border-red-500/40 shadow-sm shadow-red-500/10'
              : 'bg-[#1E2022] border-gray-800/80 hover:border-gray-700'
          }`}>
            <div className={`text-2xl font-black ${todayDeadlinesCount > 0 ? 'text-red-500' : 'text-gray-300'}`}>
              {todayDeadlinesCount}
            </div>
            <div className={`text-xs mt-1 font-semibold ${todayDeadlinesCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>
              Prazos de Hoje
            </div>
          </div>

          {/* Audiências: Neutro / Âmbar */}
          <div className="bg-[#1E2022] border border-gray-800/80 hover:border-gray-700 rounded-xl p-3.5 text-center transition">
            <div className="text-2xl font-black text-amber-400">{todayHearings}</div>
            <div className="text-xs text-gray-400 mt-1 font-medium">Audiências</div>
          </div>

          {/* Eventos Próximos (7d): Azul Suave */}
          <div className="bg-[#1E2022] border border-gray-800/80 hover:border-blue-500/30 rounded-xl p-3.5 text-center transition">
            <div className="text-2xl font-black text-blue-400">{urgentDeadlines.length}</div>
            <div className="text-xs text-gray-400 mt-1 font-medium">Eventos Próximos (7d)</div>
          </div>

          {/* Clientes Ativos: Verde para status Ativo */}
          <div className="bg-[#1E2022] border border-green-500/20 hover:border-green-500/40 rounded-xl p-3.5 text-center transition">
            <div className="text-2xl font-black text-green-400">{activeClientsCount}</div>
            <div className="text-xs text-green-400/90 mt-1 font-semibold">Clientes Ativos</div>
          </div>
        </div>
      </div>

      {/* Seletor de visao */}
      <div className="flex gap-2" data-testid="dashboard-view-selector">
        <button
          onClick={() => setView('executive')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-sm ${
            view === 'executive'
              ? 'bg-nc-yellow text-nc-black'
              : 'bg-[#1B1D1E] text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700'
          }`}
        >
          📊 Visão Executiva & Processos
        </button>
        <button
          onClick={() => setView('funil')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition shadow-sm ${
            view === 'funil'
              ? 'bg-nc-yellow text-nc-black'
              : 'bg-[#1B1D1E] text-gray-400 hover:text-white border border-gray-800 hover:border-gray-700'
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
        <div className="p-4 bg-[#1B1D1E] border border-gray-800 rounded-xl shadow-sm border-l-4 border-l-blue-500">
          <p className="text-xs text-gray-400">⚖️ Casos & Processos Ativos</p>
          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-cases">{loading ? '…' : (metrics?.total ?? cases.length)}</p>
          {newThisMonth > 0 && (
            <span className="inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 font-semibold" data-testid="kpi-new-month">
              +{newThisMonth} este mês
            </span>
          )}
        </div>
        <div className="p-4 bg-[#1B1D1E] border border-gray-800 rounded-xl shadow-sm border-l-4 border-l-green-500">
          <p className="text-xs text-gray-400">💰 Patrimônio Sob Gestão</p>
          <p className="text-2xl font-black text-green-400 mt-1" data-testid="kpi-patrimony">{loading ? '…' : brl(metrics?.case_value?.total)}</p>
          <span className="text-[10px] text-green-400/70">Ativo circulante</span>
        </div>
        <div className={`p-4 bg-[#1B1D1E] border border-gray-800 rounded-xl shadow-sm border-l-4 ${urgentDeadlines.length > 0 ? 'border-l-red-500' : 'border-l-gray-700'}`}>
          <p className="text-xs text-gray-400">📅 Prazos Urgentes (7 dias)</p>
          <p className={`text-2xl font-bold mt-1 ${urgentDeadlines.length > 0 ? 'text-red-400' : 'text-gray-300'}`} data-testid="kpi-urgent">
            {loading ? '…' : urgentDeadlines.length}
          </p>
          <span className="text-[10px] text-gray-500">Exige acompanhamento</span>
        </div>
        <div className="p-4 bg-[#1B1D1E] border border-gray-800 rounded-xl shadow-sm border-l-4 border-l-teal-500">
          <p className="text-xs text-gray-400">💬 Atendimentos WhatsApp</p>
          <p className="text-2xl font-bold text-white mt-1" data-testid="kpi-conversations">{loading ? '…' : convsThisMonth}</p>
          <span className="text-[10px] text-gray-500">este mês</span>
        </div>
      </div>

      {/* Graficos */}
      <section className="bg-[#1B1D1E] border border-gray-800 rounded-2xl shadow-lg p-5">
        <h2 className="font-bold text-sm text-white mb-4 flex items-center gap-2">
          <span>📊</span> Distribuição Processual
        </h2>
        <ProcessAnalyticsPanel />
      </section>

      {/* Ações rápidas */}
      <section className="bg-[#1B1D1E] border border-gray-800 rounded-2xl shadow-lg p-5">
        <h2 className="font-bold text-sm text-white mb-4 flex items-center gap-2">
          <span>⚡</span> Ações Rápidas
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Ação Primária Dourada */}
          <button
            onClick={() => navigate('cases', '&new=1')}
            className="p-3.5 rounded-xl bg-gradient-to-r from-yellow-500 via-amber-500 to-yellow-600 hover:from-yellow-400 hover:to-amber-400 text-black font-extrabold text-sm shadow-md shadow-yellow-500/15 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2"
            data-testid="action-new-case"
          >
            <span>➕</span> Novo Caso
          </button>
          {/* Ações Secundárias */}
          <button
            onClick={() => navigate('funnel')}
            className="p-3.5 rounded-xl bg-[#1E2022] hover:bg-gray-800 text-gray-200 hover:text-white border border-gray-800 hover:border-gray-700 text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            <span>🔀</span> Funil de Atendimento
          </button>
          <button
            onClick={() => navigate('agenda')}
            className="p-3.5 rounded-xl bg-[#1E2022] hover:bg-gray-800 text-gray-200 hover:text-white border border-gray-800 hover:border-gray-700 text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            <span>📅</span> Agenda de Prazos
          </button>
          <button
            onClick={() => navigate('cases')}
            className="p-3.5 rounded-xl bg-[#1E2022] hover:bg-gray-800 text-gray-200 hover:text-white border border-gray-800 hover:border-gray-700 text-sm font-semibold transition flex items-center justify-center gap-2"
          >
            <span>💰</span> Simular Honorários
          </button>
        </div>
      </section>

      {/* Tarefas Juridicas */}
      <TasksQuickPanel />

      {/* Próximos prazos */}
      <section className="bg-[#1B1D1E] border border-gray-800 rounded-2xl shadow-lg p-5">
        <h2 className="font-bold text-sm text-white mb-4 flex items-center gap-2">
          <span>🗓️</span> Próximos Prazos
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhum prazo nos próximos 7 dias.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-800 pb-2">
                  <th className="py-2.5">Data</th>
                  <th>Caso</th>
                  <th className="hidden md:table-cell">Fase</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {upcoming.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-800/40 transition">
                    <td className={`py-3 font-semibold ${new Date(c.deadline_date) < new Date() ? 'text-red-400' : 'text-yellow-400'}`}>
                      {shortDate(c.deadline_date)}
                    </td>
                    <td className="py-3 text-white font-medium">{c.title}</td>
                    <td className="py-3 hidden md:table-cell text-gray-400">{STEP_LABELS[c.procedural_step] || c.procedural_step || '-'}</td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => navigate('cases', `&caseId=${c.id}`)}
                        className="text-xs text-blue-400 hover:text-blue-300 hover:underline font-semibold"
                      >
                        Abrir →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Resumo Rápido do Escritório (Legado) */}
      <section className="bg-[#1B1D1E] border border-gray-800 rounded-2xl shadow-lg p-5">
        <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
          <span>🏛️</span> Resumo Geral do Escritório
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="p-4 rounded-xl bg-[#1E2022] border border-gray-800 hover:border-gray-700 transition">
            <div className="text-2xl font-bold text-white">{conversations.length}</div>
            <div className="text-xs text-gray-400 mt-1">Total de Contatos / Clientes</div>
          </div>
          <div className="p-4 rounded-xl bg-[#1E2022] border border-gray-800 hover:border-gray-700 transition">
            <div className="text-2xl font-bold text-white">{totalActiveCases}</div>
            <div className="text-xs text-gray-400 mt-1">Processos Ativos</div>
          </div>
          <div className="p-4 rounded-xl bg-[#1E2022] border border-gray-800 hover:border-gray-700 transition">
            <div className="text-2xl font-bold text-yellow-400">{urgentDeadlines.length}</div>
            <div className="text-xs text-gray-400 mt-1">Prazos Próximos (7d)</div>
          </div>
          <div className="p-4 rounded-xl bg-[#1E2022] border border-green-500/20 hover:border-green-500/40 transition">
            <div className="text-2xl font-black text-green-400">{brl(metrics?.case_value?.total)}</div>
            <div className="text-xs text-green-400/80 mt-1 font-semibold">Honorários em Gestão</div>
          </div>
        </div>
      </section>
      </>
      )}
    </div>
  );
}
