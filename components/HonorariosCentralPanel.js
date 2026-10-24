import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';
import { parseCaseFee } from '../lib/caseFeeHelper';

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
            .filter((c) => c.deadline_date && c.status !== 'encerrado' && c.status !== 'arquivado')
            .map((c) => {
              const fee = parseCaseFee(c);
              const valorCausa = Number(c.case_value) || 0;
              const honorarioEstimado = fee.fee_final_value != null
                ? fee.fee_final_value
                : (fee.awarded_value != null ? fee.awarded_value * (fee.fee_percentage / 100) : valorCausa * (fee.fee_percentage / 100));

              return {
                id: c.id,
                cliente: c.client_name || c.title,
                titulo: c.title,
                processo: c.process_number,
                data: c.deadline_date,
                valorCausa,
                awardedValue: fee.awarded_value,
                feeType: fee.fee_type,
                feePercentage: fee.fee_percentage,
                feeBasis: fee.fee_basis,
                honorarioEstimado,
                valor: honorarioEstimado
              };
            })
            .filter((item) => item.valor > 0)
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
  const totalCausa = (arr) => arr.reduce((s, e) => s + (e.valorCausa || 0), 0);

  const marcarRecebido = async (evento) => {
    setEventos((prev) => prev.filter((e) => e.id !== evento.id));
    setMsg({ type: 'success', text: `Recebimento de honorários de ${evento.cliente} registrado com sucesso!` });
    setTimeout(() => setMsg(null), 3000);

    try {
      await apiJson(`/api/cases?id=${evento.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'encerrado' })
      });
    } catch {
      await supabase.from('cases').update({ status: 'encerrado', updated_at: new Date().toISOString() }).eq('id', evento.id);
    }
  };

  const colunas = [
    {
      key: 'hoje',
      titulo: 'Hoje',
      icon: '📅',
      accent: 'text-emerald-700',
      badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      itens: grupos.hoje,
      vazio: 'Nenhum honorário para receber hoje.'
    },
    {
      key: 'prox7',
      titulo: 'Próximos 7 Dias',
      icon: '📅',
      accent: 'text-blue-700',
      badge: 'bg-blue-50 text-blue-700 border border-blue-200',
      itens: grupos.prox7,
      vazio: 'Nenhum honorário nos próximos 7 dias.'
    },
    {
      key: 'vencidos',
      titulo: 'Vencidos',
      icon: '❗',
      accent: 'text-red-700',
      badge: 'bg-red-50 text-red-700 border border-red-200',
      itens: grupos.vencidos,
      vazio: 'Nenhum honorário vencido.'
    }
  ];

  const totalGeral = total(eventos);

  return (
    <div className="min-h-full bg-nc-surface text-gray-900 p-4 md:p-6" data-testid="honorarios-central">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>💰</span> Central de Honorários
          </h1>
          <p className="text-gray-500 text-xs mt-1">Gerencie e controle recebimentos contratuais e sucumbenciais do escritório</p>
        </div>

        {msg && (
          <div className={`p-3 rounded-lg text-sm border ${msg.type === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
            {msg.text}
          </div>
        )}

        {/* 3 Colunas com lista interna de cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {colunas.map((col) => (
            <div key={col.key} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col" data-testid={`honor-${col.key}`}>
              {/* Header da coluna */}
              <div className="mb-4 pb-3 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
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
                  <p className="text-center py-6 text-xs text-gray-400">Carregando...</p>
                ) : col.itens.length === 0 ? (
                  <p className="text-center py-6 text-xs text-gray-400">{col.vazio}</p>
                ) : (
                  col.itens.map((item) => (
                    <div key={item.id} className="bg-gray-50 p-3.5 rounded-lg border border-gray-200 hover:border-nc-yellow shadow-2xs transition">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{item.cliente}</p>
                          <p className="text-xs text-gray-500 truncate">{item.titulo}</p>
                          {item.processo && (
                            <p className="text-[10px] font-mono text-gray-500 mt-0.5">Proc: {item.processo}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-gray-200 mt-2">
                        <div>
                          <p className="text-[10px] text-gray-500">Vencimento</p>
                          <p className="text-xs font-medium text-gray-700">
                            {new Date(item.data).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-gray-500 font-medium">
                            Honorários ({item.feeType === 'fixo' ? 'Fixo' : `${item.feePercentage}%`})
                          </p>
                          <p className="text-sm font-bold text-emerald-700">{brl(item.honorarioEstimado)}</p>
                          <p className="text-[10px] text-gray-400">
                            {item.awardedValue ? `Conden.: ${brl(item.awardedValue)}` : `Causa: ${brl(item.valorCausa)}`}
                          </p>
                          <button
                            onClick={() => marcarRecebido(item)}
                            className="mt-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition shadow-sm"
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
        <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm">
          <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span>📊</span> Resumo Geral de Honorários
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Total a Receber</p>
              <p className="text-xl font-bold text-gray-900">{brl(totalGeral)}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{eventos.length} pendência(s)</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Vencidos</p>
              <p className="text-xl font-bold text-red-700">{brl(total(grupos.vencidos))}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{grupos.vencidos.length} pendência(s)</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">A Receber Hoje</p>
              <p className="text-xl font-bold text-emerald-700">{brl(total(grupos.hoje))}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{grupos.hoje.length} pendência(s)</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">Próximos 7 Dias</p>
              <p className="text-xl font-bold text-blue-700">{brl(total(grupos.prox7))}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{grupos.prox7.length} pendência(s)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
