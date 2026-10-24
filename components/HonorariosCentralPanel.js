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
            .map((c) => ({
              id: c.id,
              cliente: c.client_name || c.title,
              titulo: c.title,
              processo: c.process_number,
              data: c.deadline_date,
              valor: Number(c.case_value)
            }))
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
    setMsg({ type: 'success', text: `Recebimento de ${evento.cliente} registrado com sucesso!` });
    setTimeout(() => setMsg(null), 3000);

    const { error } = await supabase.from('cases').update({ status: 'encerrado', updated_at: new Date().toISOString() }).eq('id', evento.id);
    if (error) {
      safeError('honorarios_recebido_error', error, { component: 'HonorariosCentralPanel' });
    }
  };

  const colunas = [
    {
      key: 'hoje',
      titulo: 'Hoje',
      icon: '📅',
      accent: 'text-green-400',
      border: 'border-green-700/60',
      badge: 'bg-green-900/40 text-green-300',
      itens: grupos.hoje,
      vazio: 'Nenhum honorário para receber hoje.'
    },
    {
      key: 'prox7',
      titulo: 'Próximos 7 Dias',
      icon: '📅',
      accent: 'text-blue-400',
      border: 'border-blue-700/60',
      badge: 'bg-blue-900/40 text-blue-300',
      itens: grupos.prox7,
      vazio: 'Nenhum honorário nos próximos 7 dias.'
    },
    {
      key: 'vencidos',
      titulo: 'Vencidos',
      icon: '❗',
      accent: 'text-red-400',
      border: 'border-red-700/60',
      badge: 'bg-red-900/40 text-red-300',
      itens: grupos.vencidos,
      vazio: 'Nenhum honorário vencido.'
    }
  ];

  const totalGeral = total(eventos);

  return (
    <div className="min-h-full bg-black text-white p-4 md:p-6" data-testid="honorarios-central">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
            <span>💰</span> Central de Honorários
          </h1>
          <p className="text-gray-400 text-xs mt-1">Gerencie e controle recebimentos contratuais e sucumbenciais do escritório</p>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm border ${msg.type === 'error' ? 'bg-red-900/50 border-red-700 text-red-200' : 'bg-green-900/50 border-green-700 text-green-200'}`}>
            {msg.text}
          </div>
        )}

        {/* 3 Colunas com lista interna de cards (fiel ao legado) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {colunas.map((col) => (
            <div key={col.key} className="bg-gray-800 rounded-xl p-5 border border-gray-700 flex flex-col" data-testid={`honor-${col.key}`}>
              {/* Header da coluna */}
              <div className="mb-4 pb-3 border-b border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span className={col.accent}>{col.icon}</span> {col.titulo}
                  </h2>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${col.badge}`}>
                    {col.itens.length} honorário(s)
                  </span>
                </div>
                <div className={`text-2xl font-bold ${col.accent}`}>{brl(total(col.itens))}</div>
              </div>

              {/* Lista de itens da coluna */}
              <div className="flex-1 space-y-3">
                {loading ? (
                  <p className="text-center py-6 text-xs text-gray-500">Carregando...</p>
                ) : col.itens.length === 0 ? (
                  <p className="text-center py-6 text-xs text-gray-500">{col.vazio}</p>
                ) : (
                  col.itens.map((item) => (
                    <div key={item.id} className="bg-gray-750 p-3.5 rounded-lg border border-gray-700 hover:border-yellow-500/50 transition">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{item.cliente}</p>
                          <p className="text-xs text-gray-400 truncate">{item.titulo}</p>
                          {item.processo && (
                            <p className="text-[10px] font-mono text-gray-500 mt-0.5">Proc: {item.processo}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-700/60 mt-2">
                        <div>
                          <p className="text-[10px] text-gray-400">Vencimento</p>
                          <p className="text-xs font-medium text-gray-300">
                            {new Date(item.data).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-yellow-400">{brl(item.valor)}</p>
                          <button
                            onClick={() => marcarRecebido(item)}
                            className="mt-1 px-2.5 py-1 rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-bold transition shadow"
                          >
                            ✓ Recebido
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Resumo Geral */}
        <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
          <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
            <span>📊</span> Resumo Geral de Honorários
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-gray-750 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Total a Receber</p>
              <p className="text-xl font-bold text-yellow-400">{brl(totalGeral)}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{eventos.length} pendência(s)</p>
            </div>
            <div className="p-3 bg-gray-750 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Vencidos</p>
              <p className="text-xl font-bold text-red-400">{brl(total(grupos.vencidos))}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{grupos.vencidos.length} pendência(s)</p>
            </div>
            <div className="p-3 bg-gray-750 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">A Receber Hoje</p>
              <p className="text-xl font-bold text-green-400">{brl(total(grupos.hoje))}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{grupos.hoje.length} pendência(s)</p>
            </div>
            <div className="p-3 bg-gray-750 rounded-lg border border-gray-700">
              <p className="text-xs text-gray-400 mb-1">Próximos 7 Dias</p>
              <p className="text-xl font-bold text-blue-400">{brl(total(grupos.prox7))}</p>
              <p className="text-[10px] text-gray-500 mt-0.5">{grupos.prox7.length} pendência(s)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
