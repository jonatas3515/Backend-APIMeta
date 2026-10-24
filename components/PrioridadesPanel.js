import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function daysUntil(dateStr) {
  const d = new Date(dateStr);
  const diff = Math.ceil((d - startOfToday()) / 86400000);
  return diff;
}

export default function PrioridadesPanel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([
      apiJson('/api/cases'),
      supabase.from('tasks').select('*').eq('done', false)
    ]).then(([casesR, tasksR]) => {
      if (!mounted) return;
      const caseItems = (casesR.status === 'fulfilled' ? casesR.value : []) || [];
      const taskItems = tasksR.status === 'fulfilled' && !tasksR.value.error ? (tasksR.value.data || []) : [];
      const merged = [
        ...caseItems
          .filter((c) => c.deadline_date && c.status !== 'encerrado')
          .map((c) => ({
            id: `case-${c.id}`,
            type: 'Prazo',
            client: c.client_name || c.title,
            title: c.title,
            process_number: c.process_number,
            court: c.court,
            date: c.deadline_date,
            priority: 'alta'
          })),
        ...taskItems
          .map((t) => ({
            id: `task-${t.id}`,
            type: 'Tarefa',
            client: t.title,
            title: t.title,
            date: t.due_date,
            priority: t.priority || 'media'
          }))
      ];
      setItems(merged);
      [casesR, tasksR].filter((r) => r.status === 'rejected')
        .forEach((r) => safeError('priorities_load_error', r.reason, { component: 'PrioridadesPanel' }));
      setLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const groups = useMemo(() => {
    const today = startOfToday();
    const tomorrow = new Date(today.getTime() + 86400000);
    const week = new Date(today.getTime() + 7 * 86400000);
    const g = { overdue: [], today: [], week: [] };
    items.forEach((i) => {
      if (!i.date) return;
      const dt = new Date(i.date);
      if (dt < today) g.overdue.push(i);
      else if (dt < tomorrow) g.today.push(i);
      else if (dt <= week) g.week.push(i);
    });
    Object.values(g).forEach((arr) => arr.sort((a, b) => new Date(a.date) - new Date(b.date)));
    return g;
  }, [items]);

  const summary = [
    { key: 'overdue', label: 'Itens Atrasados', icon: '🔴', count: groups.overdue.length, cls: 'bg-red-50 border-red-200 text-red-700' },
    { key: 'today', label: 'Para Hoje', icon: '🟡', count: groups.today.length, cls: 'bg-yellow-50 border-yellow-200 text-yellow-700' },
    { key: 'week', label: 'Próximos 7 Dias', icon: '🔵', count: groups.week.length, cls: 'bg-blue-50 border-blue-200 text-blue-700' }
  ];

  const renderItem = (i) => (
    <li key={i.id} className="p-3 bg-white border border-gray-200 rounded-lg hover:border-nc-yellow transition">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{i.client}</p>
          <p className="text-xs text-gray-500">{i.type}</p>
          {i.process_number && (
            <p className="text-[10px] font-mono text-gray-400 mt-0.5">{i.process_number}</p>
          )}
          {i.court && (
            <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-bold">{i.court}</span>
          )}
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{new Date(i.date).toLocaleDateString('pt-BR')}</span>
      </div>
    </li>
  );

  const renderColumn = (title, list, testid, subtitle) => (
    <section className="bg-gray-50 rounded-lg p-3" data-testid={testid}>
      <h3 className="font-bold text-sm mb-3 text-gray-800">
        {title} <span className="text-xs text-gray-400">({list.length})</span>
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-gray-400 p-2">{subtitle}</p>
      ) : (
        <ul className="space-y-2">{list.map(renderItem)}</ul>
      )}
    </section>
  );

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="prioridades-panel">
      {/* Banner explicativo */}
      <div className="bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-lg p-4">
        <h2 className="text-lg font-bold text-gray-900">🔥 Prioridades</h2>
        <p className="text-sm text-gray-600">
          Itens que exigem atenção imediata: prazos vencidos, compromissos de hoje e o que vem nos próximos 7 dias.
          Organize-se para não perder nenhum prazo processual.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {summary.map((s) => (
              <div key={s.key} className={`rounded-lg border p-4 ${s.cls}`} data-testid={`summary-${s.key}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium">{s.icon} {s.label}</p>
                    <p className="text-3xl font-bold mt-1">{s.count}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Colunas detalhadas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {renderColumn('🔴 Atrasados — Ação Imediata', groups.overdue, 'group-overdue', 'Nenhum item atrasado. Excelente!')}
            {renderColumn('� Para Hoje', groups.today, 'group-today', 'Nada agendado para hoje.')}
            {renderColumn('� Próximos 7 Dias', groups.week, 'group-week', 'Nenhum prazo nesta semana.')}
          </div>
        </>
      )}
    </div>
  );
}
