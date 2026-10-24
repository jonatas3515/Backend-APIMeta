import { useEffect, useMemo, useState } from 'react';

import { apiJson } from '../lib/apiClient';
import { useAuth } from '../lib/useAuth';
import { safeError } from '../lib/safeLogger';
import ProcessAnalyticsPanel from './ProcessAnalyticsPanel';

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

  return (
    <div className="p-4 md:p-6 space-y-6 w-full" data-testid="executive-dashboard">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900" data-testid="dashboard-greeting">{greeting}</h1>
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
    </div>
  );
}
