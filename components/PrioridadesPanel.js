import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

function itemDate(item) {
  return item.date || null;
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
          .map((c) => ({ id: `case-${c.id}`, type: 'case', title: c.title, date: c.deadline_date, priority: c.priority || 'media' })),
        ...taskItems
          .map((t) => ({ id: `task-${t.id}`, type: 'task', title: t.title, date: t.due_date, priority: t.priority || 'media' }))
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
    const week = new Date(today.getTime() + 7 * 86400000);
    const g = { overdue: [], today: [], week: [] };
    items.forEach((i) => {
      const d = itemDate(i);
      if (!d) return;
      const dt = new Date(d);
      if (dt < today) g.overdue.push(i);
      else if (dt < new Date(today.getTime() + 86400000)) g.today.push(i);
      else if (dt <= week) g.week.push(i);
    });
    Object.values(g).forEach((arr) => arr.sort((a, b) => new Date(itemDate(a)) - new Date(itemDate(b))));
    return g;
  }, [items]);

  const renderGroup = (title, list, border, testid) => (
    <section className={`bg-white rounded-lg shadow p-4 border-l-4 ${border}`} data-testid={testid}>
      <h3 className="font-bold text-sm mb-3 text-gray-800">
        {title} <span className="text-xs text-gray-400">({list.length})</span>
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhum item.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((i) => (
            <li key={i.id} className="flex items-center gap-2 text-sm">
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${i.type === 'case' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                {i.type === 'case' ? 'CASO' : 'TAREFA'}
              </span>
              <span className="flex-1 text-gray-800 truncate">{i.title}</span>
              <span className="text-xs text-gray-500">{new Date(itemDate(i)).toLocaleDateString('pt-BR')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="p-4 md:p-6 space-y-4" data-testid="prioridades-panel">
      <h2 className="text-xl font-bold text-gray-900">🔥 Prioridades</h2>
      {loading ? (
        <p className="text-sm text-gray-500">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {renderGroup('⏰ Atrasados', groups.overdue, 'border-red-500', 'group-overdue')}
          {renderGroup('📌 Hoje', groups.today, 'border-amber-500', 'group-today')}
          {renderGroup('🗓️ Próximos 7 dias', groups.week, 'border-blue-500', 'group-week')}
        </div>
      )}
    </div>
  );
}
