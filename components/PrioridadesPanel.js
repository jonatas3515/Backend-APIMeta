import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';
import { useAuth } from '../lib/useAuth';

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export default function PrioridadesPanel() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    const officeId = profile?.office_id || profile?.office?.id;
    let taskQuery = supabase.from('tasks').select('*').eq('done', false);
    if (officeId) {
      taskQuery = taskQuery.eq('office_id', officeId);
    }

    Promise.allSettled([
      apiJson('/api/cases'),
      taskQuery
    ]).then(([casesR, tasksR]) => {
      if (!mounted) return;
      const caseItems = (casesR.status === 'fulfilled' ? casesR.value : []) || [];
      const taskItems = tasksR.status === 'fulfilled' && !tasksR.value.error ? (tasksR.value.data || []) : [];
      const merged = [
        ...caseItems
          .filter((c) => c.deadline_date && c.status !== 'encerrado' && c.status !== 'arquivado')
          .map((c) => {
            const isHearing = `${c.title || ''} ${c.case_type || ''}`.toLowerCase().includes('audiência') || `${c.title || ''} ${c.case_type || ''}`.toLowerCase().includes('audiencia');
            return {
              id: `case-${c.id}`,
              rawId: c.id,
              origin: 'case',
              tipo: isHearing ? 'Audiência' : (Number(c.case_value) > 0 ? 'Honorário' : 'Prazo'),
              cliente: c.client_name || c.title,
              titulo: c.title,
              processo: c.process_number,
              tribunal: c.court,
              valor: Number(c.case_value) || null,
              data: c.deadline_date
            };
          }),
        ...taskItems
          .map((t) => ({
            id: `task-${t.id}`,
            rawId: t.id,
            origin: 'task',
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

  const handleMarcarComoCumprido = async (item) => {
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setFeedbackMsg(`"${item.tipo || 'Prazo'}: ${item.titulo}" cumprido(a) com sucesso! O processo continua ativo.`);
    setTimeout(() => setFeedbackMsg(null), 4000);

    try {
      if (item.origin === 'task') {
        await supabase.from('tasks').update({ done: true, status: 'concluida', updated_at: new Date().toISOString() }).eq('id', item.rawId);
      } else if (item.origin === 'case') {
        // Cumpre a audiência ou prazo específico, limpando a pendência temporal SEM encerrar o processo
        const updatePayload = {
          deadline_date: null,
          deadline_type: null,
          updated_at: new Date().toISOString()
        };
        try {
          await apiJson(`/api/cases?id=${item.rawId}`, {
            method: 'PATCH',
            body: JSON.stringify(updatePayload)
          });
        } catch {
          await supabase.from('cases').update(updatePayload).eq('id', item.rawId);
        }
      }
    } catch (e) {
      safeError('prioridade_cumprir_error', e, { component: 'PrioridadesPanel' });
    }
  };

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
    { key: 'overdue', titulo: 'Itens Atrasados', count: groups.overdue.length, card: groups.overdue.length > 0 ? 'bg-red-950/20 border border-red-800/40' : 'bg-[#1B1D1E] border border-gray-800', label: groups.overdue.length > 0 ? 'text-red-300' : 'text-gray-400', countClass: groups.overdue.length > 0 ? 'text-red-400' : 'text-gray-300', icon: '🔴' },
    { key: 'today', titulo: 'Para Hoje', count: groups.today.length, card: 'bg-[#1B1D1E] border border-gray-800', label: 'text-gray-300', countClass: 'text-yellow-400', icon: '🟡' },
    { key: 'week', titulo: 'Próximos 7 Dias', count: groups.week.length, card: 'bg-[#1B1D1E] border border-gray-800', label: 'text-gray-400', countClass: 'text-blue-400', icon: '🔵' }
  ];

  const renderItem = (i) => (
    <li key={i.id} className="bg-[#1E2022] border border-[#2A2D2F] rounded-lg p-4 hover:border-nc-yellow/60 shadow-sm transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-white truncate flex-1">{i.titulo}</p>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${
            i.tipo === 'Audiência' ? 'bg-amber-950/40 text-amber-300 border border-amber-800/50' :
            i.tipo === 'Honorário' ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/50' :
            i.tipo === 'Tarefa' ? 'bg-blue-950/40 text-blue-300 border border-blue-800/50' :
            'bg-gray-800 text-gray-300 border border-gray-700'
          }`}>
            {i.tipo}
          </span>
          <button
            onClick={() => handleMarcarComoCumprido(i)}
            className="p-1 rounded text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
            title="Marcar como cumprido"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {new Date(i.data).toLocaleDateString('pt-BR')}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
        <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      {i.valor && (
        <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 mt-1">
          <span>💰</span>
          <span>{i.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
      )}
      {i.tribunal && (
        <span className="inline-block mt-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-300 border border-blue-800/50 font-bold">{i.tribunal}</span>
      )}
    </li>
  );

  const renderColumn = (titulo, list, accent, testid) => (
    <section className="bg-[#1B1D1E] border border-gray-800 rounded-xl p-4 shadow-sm" data-testid={testid}>
      <h3 className={`font-bold text-sm mb-4 flex items-center gap-2 ${accent}`}>
        {titulo} <span className="text-xs text-gray-500 font-normal">({list.length})</span>
      </h3>
      {list.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">Nenhum item pendente.</p>
      ) : (
        <ul className="space-y-3">{list.map(renderItem)}</ul>
      )}
    </section>
  );

  return (
    <div className="min-h-full bg-[#181A1B] text-gray-100 p-4 md:p-6" data-testid="prioridades-panel">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Prioridades</h1>
          <p className="text-xs text-gray-400 mt-0.5">Gestão automatizada por urgência de prazos e audiências</p>
        </div>

        {/* Banner explicativo */}
        <div className="bg-[#1B1D1E] border border-blue-900/40 rounded-xl p-4 text-xs md:text-sm text-gray-300">
          📌 <span className="font-bold">Como funciona:</span> Os itens são organizados automaticamente por urgência.
          Primeiro aparecem os <span className="text-red-400 font-bold">atrasados</span>, depois os de <span className="text-yellow-400 font-bold">hoje</span> e por fim os dos <span className="text-blue-400 font-bold">próximos 7 dias</span>. Eventos com honorários têm destaque financeiro.
        </div>

        {feedbackMsg && (
          <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm flex items-center gap-2">
            <span>✓</span> {feedbackMsg}
          </div>
        )}

        {loading ? (
          <div className="space-y-6 animate-pulse">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#1B1D1E] border border-gray-800 rounded-xl p-5 h-24"></div>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-[#1B1D1E] border border-gray-800 rounded-xl p-4 h-64 space-y-3">
                  <div className="h-4 bg-gray-800 rounded w-1/3"></div>
                  <div className="h-20 bg-[#141516] border border-gray-800/80 rounded-lg"></div>
                  <div className="h-20 bg-[#141516] border border-gray-800/80 rounded-lg"></div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Cards de resumo */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {resumo.map((r) => (
                <div key={r.key} className={`${r.card} rounded-xl p-5 shadow-sm`} data-testid={`summary-${r.key}`}>
                  <div className={`text-3xl font-extrabold ${r.countClass} mb-1`}>{r.count}</div>
                  <div className={`text-xs font-bold ${r.label}`}>{r.icon} {r.titulo}</div>
                </div>
              ))}
            </div>

            {/* Grade de 3 colunas */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
