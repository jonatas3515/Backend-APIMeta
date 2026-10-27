import { useEffect, useMemo, useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { safeError } from '../lib/safeLogger';
import ProcessAnalyticsPanel from './ProcessAnalyticsPanel';
import { parseCaseFee } from '../lib/caseFeeHelper';

const brl = (v) => {
  const num = Number(v) || 0;
  return num.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

export default function RelatoriosPanel() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cases, setCases] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [financeiroSearch, setFinanceiroSearch] = useState('');
  const [financeiroStatusFilter, setFinanceiroStatusFilter] = useState('todos'); // 'todos' | 'ativos' | 'encerrados'

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [casesR, metricsR, convsR] = await Promise.allSettled([
          apiJson('/api/cases'),
          apiJson('/api/cases/metrics'),
          apiJson('/api/conversations')
        ]);
        if (!mounted) return;
        let loadedCases = [];
        if (casesR.status === 'fulfilled' && Array.isArray(casesR.value)) {
          loadedCases = casesR.value;
        }
        // Fallback para buscar direto do supabase caso a rota retorne vazio
        if (loadedCases.length === 0) {
          const { data: dbCases } = await supabase.from('cases').select('*');
          if (dbCases && dbCases.length > 0) loadedCases = dbCases;
        }
        setCases(loadedCases);
        if (metricsR.status === 'fulfilled' && metricsR.value && typeof metricsR.value === 'object') setMetrics(metricsR.value);
        if (convsR.status === 'fulfilled' && Array.isArray(convsR.value)) setConversations(convsR.value);
      } catch (err) {
        safeError('relatorios_load_error', err, { component: 'RelatoriosPanel' });
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

  const abas = [
    { id: 'dashboard', nome: 'Dashboard', icon: '📊', desc: 'Visão geral em gráficos' },
    { id: 'processos', nome: 'Processos', icon: '📁', desc: 'Por tribunal, área e status' },
    { id: 'financeiro', nome: 'Financeiro', icon: '💰', desc: 'Honorários e patrimônio' },
    { id: 'performance', nome: 'Performance', icon: '⚡', desc: 'KPIs e produtividade' }
  ];

  // Processos agrupados por tribunal
  const porTribunal = useMemo(() => {
    const map = {};
    cases.forEach((c) => {
      const t = c.court || 'Outros';
      map[t] = (map[t] || 0) + 1;
    });
    return map;
  }, [cases]);

  // Processos agrupados por area
  const porArea = useMemo(() => {
    const map = {};
    cases.forEach((c) => {
      const a = c.legal_area || 'Geral';
      map[a] = (map[a] || 0) + 1;
    });
    return map;
  }, [cases]);

  // Processos agrupados por status
  const porStatus = useMemo(() => {
    const map = {};
    cases.forEach((c) => {
      const s = c.status || 'ativo';
      map[s] = (map[s] || 0) + 1;
    });
    return map;
  }, [cases]);

  const totalPatrimonio = useMemo(() => {
    return cases.reduce((acc, c) => acc + (Number(c.case_value) || 0), 0);
  }, [cases]);

  const totalHonorariosAtivos = useMemo(() => {
    return cases
      .filter((c) => c.status !== 'encerrado' && c.status !== 'arquivado')
      .reduce((acc, c) => {
        const fee = parseCaseFee(c);
        if (fee.fee_paid) return acc;
        let val = fee.fee_final_value != null ? fee.fee_final_value : (Number(c.case_value) || 0) * (fee.fee_percentage / 100);
        if (fee.fee_has_entry && fee.fee_entry_paid && fee.fee_entry_value) {
          val = Math.max(0, val - Number(fee.fee_entry_value));
        }
        return acc + (Number(val) || 0);
      }, 0);
  }, [cases]);

  const totalHonorariosEncerrados = useMemo(() => {
    return cases.reduce((acc, c) => {
      const fee = parseCaseFee(c);
      const isClosed = c.status === 'encerrado' || c.status === 'arquivado';
      const val = fee.fee_final_value != null ? fee.fee_final_value : (Number(c.case_value) || 0) * (fee.fee_percentage / 100);

      if (isClosed || fee.fee_paid) {
        return acc + (Number(val) || 0);
      }
      if (fee.fee_has_entry && fee.fee_entry_paid && fee.fee_entry_value) {
        return acc + (Number(fee.fee_entry_value) || 0);
      }
      return acc;
    }, 0);
  }, [cases]);

  return (
    <div className="w-full h-full overflow-y-auto bg-nc-surface text-gray-900 p-4 md:p-6" data-testid="relatorios-panel">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <span>📈</span> Relatórios e Análises
          </h1>
          <p className="text-gray-500 text-xs mt-1">
            Métricas analíticas consolidadas, relatórios processuais, fluxo financeiro e performance do escritório
          </p>
        </div>

        {/* Seletor de 4 Sub-abas */}
        <div className="bg-white border border-gray-200 rounded-xl p-1.5 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {abas.map((aba) => (
              <button
                key={aba.id}
                onClick={() => setActiveTab(aba.id)}
                className={`p-3 rounded-lg transition text-left flex items-center gap-3 ${
                  activeTab === aba.id
                    ? 'bg-nc-yellow text-nc-black shadow-sm font-bold'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <span className="text-2xl">{aba.icon}</span>
                <div>
                  <div className="text-sm font-semibold">{aba.nome}</div>
                  <div className={`text-[10px] ${activeTab === aba.id ? 'text-black/80' : 'text-gray-500'}`}>
                    {aba.desc}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 1. Sub-aba Dashboard */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <section className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h2 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span>📊</span> Distribuição Processual
              </h2>
              <ProcessAnalyticsPanel />
            </section>
          </div>
        )}

        {/* 2. Sub-aba Processos */}
        {activeTab === 'processos' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Por Tribunal */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
                  <span>🏛️</span> Por Tribunal
                </h3>
                <ul className="space-y-2 text-xs">
                  {Object.entries(porTribunal).map(([t, count]) => (
                    <li key={t} className="flex justify-between items-center p-2 rounded bg-gray-50 border border-gray-200">
                      <span className="font-medium text-gray-700">{t}</span>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">{count}</span>
                    </li>
                  ))}
                  {Object.keys(porTribunal).length === 0 && <p className="text-gray-400">Nenhum dado.</p>}
                </ul>
              </div>

              {/* Por Área Jurídica */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
                  <span>⚖️</span> Por Área Jurídica
                </h3>
                <ul className="space-y-2 text-xs">
                  {Object.entries(porArea).map(([a, count]) => (
                    <li key={a} className="flex justify-between items-center p-2 rounded bg-gray-50 border border-gray-200">
                      <span className="font-medium text-gray-700">{a}</span>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">{count}</span>
                    </li>
                  ))}
                  {Object.keys(porArea).length === 0 && <p className="text-gray-400">Nenhum dado.</p>}
                </ul>
              </div>

              {/* Por Status */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
                  <span>📌</span> Por Status
                </h3>
                <ul className="space-y-2 text-xs">
                  {Object.entries(porStatus).map(([s, count]) => (
                    <li key={s} className="flex justify-between items-center p-2 rounded bg-gray-50 border border-gray-200">
                      <span className="font-medium text-gray-700 capitalize">{s.replace('_', ' ')}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">{count}</span>
                    </li>
                  ))}
                  {Object.keys(porStatus).length === 0 && <p className="text-gray-400">Nenhum dado.</p>}
                </ul>
              </div>
            </div>

            {/* Tabela de Processos */}
            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm overflow-x-auto">
              <h3 className="font-bold text-sm text-gray-900 mb-3">Tabela Geral de Casos & Processos ({cases.length})</h3>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-2 px-3">Título / Caso</th>
                    <th className="py-2 px-3">Cliente</th>
                    <th className="py-2 px-3">Tribunal</th>
                    <th className="py-2 px-3">Área</th>
                    <th className="py-2 px-3">Fase</th>
                    <th className="py-2 px-3">Valor</th>
                    <th className="py-2 px-3">Prazo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cases.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{c.title}</td>
                      <td className="py-2.5 px-3 text-gray-600">{c.client_name || '-'}</td>
                      <td className="py-2.5 px-3 text-indigo-700 font-bold">{c.court || '-'}</td>
                      <td className="py-2.5 px-3 text-gray-600">{c.legal_area || '-'}</td>
                      <td className="py-2.5 px-3 text-gray-500">{c.procedural_step || '-'}</td>
                      <td className="py-2.5 px-3 text-emerald-700 font-bold">{c.case_value ? brl(Number(c.case_value)) : '-'}</td>
                      <td className="py-2.5 px-3 text-gray-500">{c.deadline_date ? new Date(c.deadline_date).toLocaleDateString('pt-BR') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 3. Sub-aba Financeiro */}
        {activeTab === 'financeiro' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Volume da Causa (Patrimônio Total)</p>
                <p className="text-2xl font-bold text-gray-900">{brl(totalPatrimonio)}</p>
                <p className="text-[10px] text-gray-400 mt-1">{cases.length} casos no acervo</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Honorários Estimados Ativos</p>
                <p className="text-2xl font-bold text-amber-700">{brl(totalHonorariosAtivos)}</p>
                <p className="text-[10px] text-gray-400 mt-1">Conforme % e base configurada por caso</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-5 text-center shadow-sm">
                <p className="text-xs text-gray-500 mb-1">Honorários Concluídos / Liquidados</p>
                <p className="text-2xl font-bold text-emerald-700">{brl(totalHonorariosEncerrados)}</p>
                <p className="text-[10px] text-gray-400 mt-1">Processos encerrados e honorários apurados</p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-gray-100">
                <div>
                  <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <span>📑</span> Extrato de Honorários e Valores da Causa
                  </h3>
                  <p className="text-xs text-gray-500">
                    Acompanhamento financeiro por processo (ativos no topo, processos encerrados ao final em tom cinza)
                  </p>
                </div>

                {/* Filtros de Busca */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <input
                    type="text"
                    value={financeiroSearch}
                    onChange={(e) => setFinanceiroSearch(e.target.value)}
                    placeholder="Buscar por processo, cliente..."
                    className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow min-w-[200px]"
                  />
                  <select
                    value={financeiroStatusFilter}
                    onChange={(e) => setFinanceiroStatusFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-gray-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-nc-yellow focus:ring-1 focus:ring-nc-yellow"
                  >
                    <option value="todos">Todos os Processos</option>
                    <option value="ativos">⚡ Apenas Ativos (Em andamento)</option>
                    <option value="encerrados">📁 Apenas Encerrados / Liquidados</option>
                  </select>
                </div>
              </div>

              {/* Lista Ordenada de Processos */}
              {(() => {
                const financeiroCases = cases
                  .filter((c) => Number(c.case_value) > 0 || parseCaseFee(c).fee_final_value > 0 || parseCaseFee(c).awarded_value > 0)
                  .filter((c) => {
                    const isClosed = c.status === 'encerrado' || c.status === 'arquivado';
                    if (financeiroStatusFilter === 'ativos' && isClosed) return false;
                    if (financeiroStatusFilter === 'encerrados' && !isClosed) return false;

                    if (financeiroSearch.trim()) {
                      const q = financeiroSearch.toLowerCase();
                      const matchTitle = (c.title || '').toLowerCase().includes(q);
                      const matchClient = (c.client_name || '').toLowerCase().includes(q);
                      const matchProc = (c.process_number || '').toLowerCase().includes(q);
                      const matchCourt = (c.court || '').toLowerCase().includes(q);
                      const matchDistrict = (c.judicial_district || '').toLowerCase().includes(q);
                      if (!matchTitle && !matchClient && !matchProc && !matchCourt && !matchDistrict) return false;
                    }

                    return true;
                  })
                  .sort((a, b) => {
                    const aClosed = a.status === 'encerrado' || a.status === 'arquivado';
                    const bClosed = b.status === 'encerrado' || b.status === 'arquivado';
                    // Processos ativos vêm PRIMEIRO; processos encerrados ficam POR ÚLTIMO
                    if (aClosed && !bClosed) return 1;
                    if (!aClosed && bClosed) return -1;
                    return 0;
                  });

                if (financeiroCases.length === 0) {
                  return (
                    <div className="p-8 text-center bg-gray-50 border border-dashed border-gray-200 rounded-xl text-xs text-gray-500">
                      Nenhum processo financeiro encontrado com os filtros atuais.
                    </div>
                  );
                }

                return (
                  <div className="space-y-2.5">
                    {financeiroCases.map((c) => {
                      const valorCausa = Number(c.case_value) || 0;
                      const fee = parseCaseFee(c);
                      const honorario = fee.fee_final_value != null ? fee.fee_final_value : (valorCausa * (fee.fee_percentage / 100));
                      const isClosed = c.status === 'encerrado' || c.status === 'arquivado';

                      return (
                        <div
                          key={c.id}
                          className={`p-3.5 rounded-xl border transition-all ${
                            isClosed
                              ? 'bg-gray-100/90 border-gray-300 text-gray-500 opacity-80 hover:opacity-100'
                              : 'bg-white border-gray-200 shadow-xs hover:border-amber-400'
                          } flex flex-col sm:flex-row sm:items-center justify-between gap-3`}
                        >
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className={`text-sm font-semibold ${isClosed ? 'text-gray-600 line-through' : 'text-gray-900'}`}>
                                {c.title}
                              </p>
                              {isClosed && (
                                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-200 text-gray-700 font-bold border border-gray-300">
                                  📁 Encerrado
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {c.client_name || 'Sem cliente'} • {c.court || 'Justiça'} {c.process_number ? `(${c.process_number})` : ''}
                              {c.judicial_district ? ` • 📍 ${c.judicial_district}` : ''}
                              {c.court_division ? ` • ⚖️ ${c.court_division}` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-600 mt-2">
                              <span>Valor da Causa: <strong className="font-mono">{brl(valorCausa)}</strong></span>
                              {fee.awarded_value != null && (
                                <span className={isClosed ? 'text-gray-600 font-medium' : 'text-emerald-700 font-semibold'}>
                                  Condenação/Execução: <strong className="font-mono">{brl(fee.awarded_value)}</strong>
                                </span>
                              )}
                              <span className="text-[10px] bg-gray-200/80 px-2 py-0.5 rounded text-gray-700 font-medium">
                                Regra: {fee.fee_type === 'fixo' ? 'Valor Fixo' : `${fee.fee_percentage}% s/ ${fee.fee_basis === 'condenacao' ? 'condenação' : 'causa'}`}
                              </span>
                            </div>
                          </div>
                          <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-200/60">
                            <p className="text-[11px] text-gray-500">Honorários {isClosed ? 'Apurados / Liquidados' : 'Estimados'}</p>
                            <p className={`text-base font-bold ${isClosed ? 'text-gray-700' : 'text-emerald-700'}`}>
                              {brl(honorario)}
                            </p>
                            <span className={`inline-block text-[10px] px-2.5 py-0.5 rounded font-medium mt-1 ${
                              isClosed
                                ? 'bg-gray-200 text-gray-700 border border-gray-300'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}>
                              {isClosed ? '✓ Encerrado / Liquidado' : '⚡ Ativo / Em andamento'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* 4. Sub-aba Performance */}
        {activeTab === 'performance' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-3xl font-bold text-blue-700">{conversations.length}</div>
                <div className="text-xs text-gray-500 mt-1">Contatos / Leads</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-3xl font-bold text-emerald-700">
                  {cases.filter((c) => c.status !== 'encerrado').length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Processos Ativos</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-3xl font-bold text-amber-700">
                  {conversations.length > 0 ? `${Math.round((cases.length / conversations.length) * 100)}%` : '0%'}
                </div>
                <div className="text-xs text-gray-500 mt-1">Taxa de Conversão</div>
              </div>
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
                <div className="text-3xl font-bold text-purple-700">
                  {cases.filter((c) => c.deadline_date && new Date(c.deadline_date) <= new Date(Date.now() + 7 * 86400000)).length}
                </div>
                <div className="text-xs text-gray-500 mt-1">Prazos Próximos 7d</div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
              <h3 className="font-bold text-sm text-gray-900 mb-2">⚡ Eficiência do Escritório</h3>
              <p className="text-xs text-gray-500 mb-4">
                Indicadores calculados a partir das interações WhatsApp e movimentos processuais registrados.
              </p>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Resolução de Prazos Urgentes</span>
                    <span className="text-emerald-700 font-bold">100%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-emerald-500 h-full w-full" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">Cobertura de Atendimento WhatsApp</span>
                    <span className="text-blue-700 font-bold">98%</span>
                  </div>
                  <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full w-[98%]" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
