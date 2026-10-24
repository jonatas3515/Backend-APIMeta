import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';

const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export default function HonorariosCentralPanel() {
  const [eventos, setEventos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let mounted = true;
    apiJson('/api/cases')
      .then((cases) => {
        if (!mounted) return;
        setEventos(
          (cases || [])
            .filter((c) => c.deadline_date && Number(c.case_value) > 0 && c.status !== 'encerrado')
            .map((c) => ({ id: c.id, cliente: c.client_name || c.title, titulo: c.title, data: c.deadline_date, valor: Number(c.case_value) }))
        );
      })
      .catch((err) => safeError('honorarios_load_error', err, { component: 'HonorariosCentralPanel' }))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  const grupos = useMemo(() => {
    const today = startOfToday();
    const tomorrow = new Date(today.getTime() + 86400000);
    const week = new Date(today.getTime() + 7 * 86400000);
    const g = { hoje: [], prox7: [], vencidos: [] };
    eventos.forEach((e) => {
      const dt = new Date(e.data);
      if (dt < today) g.vencidos.push(e);
      else if (dt < tomorrow) g.hoje.push(e);
      else if (dt <= week) g.prox7.push(e);
    });
    return g;
  }, [eventos]);

  const total = (arr) => arr.reduce((s, e) => s + e.valor, 0);

  const marcarRecebido = async (evento) => {
    setEventos((prev) => prev.filter((e) => e.id !== evento.id));
    const { error } = await supabase.from('cases').update({ status: 'encerrado' }).eq('id', evento.id);
    if (error) {
      safeError('honorarios_recebido_error', error, { component: 'HonorariosCentralPanel' });
      setMsg({ type: 'error', text: 'Erro ao marcar como recebido.' });
    } else {
      setMsg({ type: 'success', text: `Recebimento de ${evento.cliente} registrado.` });
    }
  };

  const cards = [
    { key: 'hoje', titulo: 'Hoje', icon: '📅', accent: 'text-green-400', itens: grupos.hoje },
    { key: 'prox7', titulo: 'Próximos 7 dias', icon: '📅', accent: 'text-blue-400', itens: grupos.prox7 },
    { key: 'vencidos', titulo: 'Vencidos', icon: '❗', accent: 'text-red-400', itens: grupos.vencidos }
  ];

  const todos = [...grupos.vencidos, ...grupos.hoje, ...grupos.prox7];

  return (
    <div className="min-h-full bg-black text-white p-4 md:p-6" data-testid="honorarios-central">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
          $ Central de Honorários
        </h1>
        <p className="text-gray-400 mt-2 mb-6">Gerencie seus honorários a receber</p>

        {msg && (
          <div className={`mb-4 p-3 rounded text-sm border ${msg.type === 'error' ? 'bg-red-900/50 border-red-700 text-red-200' : 'bg-green-900/50 border-green-700 text-green-200'}`}>
            {msg.text}
          </div>
        )}

        {/* 3 Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {cards.map((c) => (
            <div key={c.key} className="bg-gray-800 rounded-xl p-6 border border-gray-700" data-testid={`honor-${c.key}`}>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className={c.accent}>{c.icon}</span> {c.titulo}
              </h2>
              <div className="mb-4">
                <div className={`text-2xl font-bold ${c.accent}`}>{brl(total(c.itens))}</div>
                <div className="text-sm text-gray-400">{c.itens.length} honorário(s)</div>
              </div>
            </div>
          ))}
        </div>

        {/* Lista de honorarios */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 mb-6">
          {loading ? (
            <p className="p-6 text-center text-sm text-gray-400">Carregando honorários...</p>
          ) : todos.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">Nenhum honorário a receber.</p>
          ) : (
            <ul className="divide-y divide-gray-700">
              {todos.map((e) => (
                <li key={e.id} className="p-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{e.cliente}</p>
                    <p className="text-xs text-gray-400">{new Date(e.data).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-yellow-500">{brl(e.valor)}</span>
                    <button
                      onClick={() => marcarRecebido(e)}
                      className="px-3 py-1.5 rounded bg-green-600 hover:bg-green-700 text-white text-xs font-bold"
                    >
                      ✓ Recebido
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Resumo Geral */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-lg font-semibold text-white mb-4">Resumo Geral</h2>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400 mb-1">A Receber Hoje</p>
              <p className="text-xl font-bold text-green-400">{brl(total(grupos.hoje))}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Próximos 7 dias</p>
              <p className="text-xl font-bold text-blue-400">{brl(total(grupos.prox7))}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Vencidos</p>
              <p className="text-xl font-bold text-red-400">{brl(total(grupos.vencidos))}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
