import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

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
            tipo: 'Prazo',
            cliente: c.client_name || c.title,
            titulo: c.title,
            processo: c.process_number,
            tribunal: c.court,
            data: c.deadline_date
          })),
        ...taskItems
          .map((t) => ({
            id: `task-${t.id}`,
            tipo: 'Tarefa',
            cliente: t.title,
            titulo: t.title,
            data: t.due_date
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
      if (!i.data) return;
      const dt = new Date(i.data);
      if (dt < today) g.overdue.push(i);
      else if (dt < tomorrow) g.today.push(i);
      else if (dt <= week) g.week.push(i);
    });
    Object.values(g).forEach((arr) => arr.sort((a, b) => new Date(a.data) - new Date(b.data)));
    return g;
  }, [items]);

  const resumo = [
    { key: 'overdue', titulo: 'Itens Atrasados', count: groups.overdue.length, card: 'bg-red-900 bg-opacity-20 border border-red-700', label: 'text-red-300', icon: '🔴' },
    { key: 'today', titulo: 'Para Hoje', count: groups.today.length, card: 'bg-yellow-900 bg-opacity-20 border border-yellow-700', label: 'text-yellow-300', icon: '🟡' },
    { key: 'week', titulo: 'Próximos 7 Dias', count: groups.week.length, card: 'bg-blue-900 bg-opacity-20 border border-blue-700', label: 'text-blue-300', icon: '🔵' }
  ];

  const renderItem = (i) => (
    <li key={i.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 hover:border-yellow-500/50 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-white truncate">{i.titulo}</p>
        <span className="text-[10px] px-2 py-0.5 rounded bg-gray-700 text-gray-300 font-medium">{i.tipo}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {new Date(i.data).toLocaleDateString('pt-BR')}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        {i.cliente}
      </div>
      {i.processo && (
        <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {i.processo}
        </div>
      )}
      {i.tribunal && (
        <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/50 text-indigo-300 border border-indigo-700 font-bold">{i.tribunal}</span>
      )}
    </li>
  );

  const renderColumn = (titulo, list, accent, testid) => (
    <section className="bg-gray-800/50 border border-gray-700 rounded-xl p-4" data-testid={testid}>
      <h3 className={`font-bold text-sm mb-4 flex items-center gap-2 ${accent}`}>
        {titulo} <span className="text-xs text-gray-500">({list.length})</span>
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum item.</p>
      ) : (
        <ul className="space-y-3">{list.map(renderItem)}</ul>
      )}
    </section>
  );

  return (
    <div className="min-h-full bg-gray-900 text-white p-4 md:p-6" data-testid="prioridades-panel">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-yellow-500 mb-2">Prioridades</h1>

        {/* Banner explicativo */}
        <div className="bg-blue-900 bg-opacity-20 border border-blue-700 rounded-lg p-4 mb-6 text-sm text-blue-300">
          📌 <span className="text-white font-medium">Como funciona:</span> Os itens são organizados automaticamente por urgência.
          Fique atento aos atrasados e ao que vence hoje para não perder prazos processuais.
        </div>

        {loading ? (
          <p className="text-sm text-gray-400">Carregando...</p>
        ) : (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {resumo.map((r) => (
                <div key={r.key} className={`${r.card} rounded-xl p-6`} data-testid={`summary-${r.key}`}>
                  <div className="text-4xl font-bold text-white mb-1">{r.count}</div>
                  <div className={`text-sm ${r.label}`}>{r.icon} {r.titulo}</div>
                </div>
              ))}
            </div>

            {/* Grade de 3 colunas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {renderColumn('📌 Hoje', groups.today, 'text-yellow-400', 'group-today')}
              {renderColumn('📅 Próximos 7 Dias', groups.week, 'text-blue-400', 'group-week')}
              {renderColumn('❗ Atrasos', groups.overdue, 'text-red-400', 'group-overdue')}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
