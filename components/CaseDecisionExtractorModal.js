import React, { useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { serializeFeeIntoNotes } from '../lib/caseFeeHelper';

export default function CaseDecisionExtractorModal({ caseItem, onClose, onRefresh }) {
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Seletores para aplicação
  const [selectedTasks, setSelectedTasks] = useState({});
  const [applyPhase, setApplyPhase] = useState(true);
  const [applyDeadline, setApplyDeadline] = useState(true);
  const [applyFees, setApplyFees] = useState(true);
  const [saveMovement, setSaveMovement] = useState(true);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!text.trim() || analyzing) return;

    setAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const caseContext = caseItem
        ? `Título: ${caseItem.title || ''}, Processo: ${caseItem.process_number || ''}, Tribunal: ${caseItem.court || ''}, Fase atual: ${caseItem.procedural_step || ''}`
        : '';

      const res = await apiJson('/api/cases/ai-extract-decision', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), caseContext })
      });

      if (res && res.analysis) {
        setAnalysis(res.analysis);
        // Inicializa tarefas selecionadas como verdadeiras por padrão
        const initialTasks = {};
        (res.analysis.tarefas_sugeridas || []).forEach((t, i) => {
          initialTasks[i] = true;
        });
        setSelectedTasks(initialTasks);
      } else {
        setError('Não foi possível analisar o ato judicial. Verifique o texto e tente novamente.');
      }
    } catch (err) {
      setError(err.message || 'Erro ao comunicar com a inteligência artificial.');
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApply = async () => {
    if (!analysis || !caseItem || applying) return;
    setApplying(true);
    setError(null);

    try {
      const updates = {};

      // 1. Fase processual
      if (applyPhase && analysis.fase_sugerida) {
        updates.procedural_step = analysis.fase_sugerida;
      }

      // 2. Audiência ou Prazo
      if (applyDeadline) {
        if (analysis.audiencia?.identificada && analysis.audiencia.data) {
          updates.deadline_date = analysis.audiencia.data;
          updates.deadline_type = `Audiência ${analysis.audiencia.tipo || ''}`.trim();
        } else if (analysis.prazo?.identificado && analysis.prazo.sugestao_data_limite) {
          updates.deadline_date = analysis.prazo.sugestao_data_limite;
          updates.deadline_type = analysis.prazo.tipo || 'Prazo Judicial';
        }
      }

      // 3. Honorários e Valores
      if (applyFees && analysis.valores?.tem_valores) {
        const feeData = {
          fee_type: 'percentual',
          fee_percentage: analysis.valores.honorarios_percentual || 20,
          fee_basis: analysis.valores.honorarios_base || 'condenacao',
          awarded_value: analysis.valores.valor_condenacao || null,
          fee_final_value: analysis.valores.honorarios_valor_estimado || null
        };
        updates.notes = serializeFeeIntoNotes(caseItem.notes, feeData);
      }

      // Salva atualizações do caso
      if (Object.keys(updates).length > 0) {
        await apiJson(`/api/cases?id=${caseItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates)
        }).catch(async () => {
          await supabase.from('cases').update(updates).eq('id', caseItem.id);
        });
      }

      // 4. Salva no histórico de movimentações se selecionado
      if (saveMovement) {
        const movementPayload = {
          movement_date: analysis.audiencia?.data || new Date().toISOString().slice(0, 10),
          movement_text: `[IA] ${analysis.tipo_ato || 'Decisão'}: ${analysis.resumo || text.slice(0, 300)}`,
          source: 'Análise IA - Projudi / PJe'
        };
        try {
          // Busca o id do case_process
          const { data: procs } = await supabase.from('case_processes').select('id').eq('case_id', caseItem.id).limit(1);
          if (procs && procs[0]) {
            await apiJson(`/api/case-processes/${procs[0].id}/movements`, {
              method: 'POST',
              body: JSON.stringify(movementPayload)
            });
          }
        } catch (e) {
          console.warn('[AI-EXTRACT] Erro ao gravar movimentação automática:', e);
        }
      }

      // 5. Cria tarefas sugeridas selecionadas
      const tasksToCreate = (analysis.tarefas_sugeridas || []).filter((_, i) => selectedTasks[i]);
      for (const taskTitle of tasksToCreate) {
        try {
          await supabase.from('tasks').insert([{
            title: taskTitle,
            description: `Gerada automaticamente via IA para o caso "${caseItem.title}"`,
            case_id: caseItem.id,
            priority: 'alta',
            due_date: updates.deadline_date || null,
            status: 'pendente',
            done: false
          }]);
        } catch (e) {
          console.warn('[AI-EXTRACT] Erro ao criar tarefa:', e);
        }
      }

      setSuccessMsg('Ato processual analisado e aplicado com sucesso ao caso!');
      setTimeout(() => {
        if (onRefresh) onRefresh();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err.message || 'Erro ao aplicar alterações ao caso.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-3xl overflow-hidden my-auto text-gray-900 animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 via-indigo-950 to-gray-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/40 flex items-center justify-center text-xl shadow-inner">
              🤖
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Agente IA de Despachos e Decisões</h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                {caseItem ? `Caso: ${caseItem.title} (${caseItem.process_number || 'Sem CNJ'})` : 'Extração jurídica automática'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl p-1 rounded-lg hover:bg-white/10 transition">
            ✕
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs font-medium">
              ⚠️ {error}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-xs font-bold flex items-center gap-2">
              <span>✓</span> {successMsg}
            </div>
          )}

          {/* Form de entrada */}
          {!analysis && (
            <form onSubmit={handleAnalyze} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 flex items-center justify-between">
                  <span>Cole aqui o texto da decisão, despacho, certidão ou ata do Projudi / PJe:</span>
                  <span className="text-[11px] font-normal text-gray-500">Ex: decisão monocrática de recurso, agendamento de audiência...</span>
                </label>
                <textarea
                  required
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Exemplo: Diante do quanto exposto, CONHEÇO E NEGO PROVIMENTO AO RECURSO DA PARTE AUTORA, MANTENDO A SENTENÇA EM TODOS OS SEUS TERMOS. Custas e honorários, estes em 20% do valor da condenação a cargo do recorrente vencido..."
                  className="w-full p-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-mono text-gray-800 bg-gray-50/50"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={analyzing || !text.trim()}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-md inline-flex items-center gap-2 transition disabled:opacity-50"
                >
                  {analyzing ? (
                    <>
                      <span className="animate-spin text-sm">⏳</span> Analisando juridicamente...
                    </>
                  ) : (
                    <>
                      <span>🤖</span> Analisar com Inteligência Artificial
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Resultado da Análise */}
          {analysis && (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="px-2.5 py-1 rounded bg-indigo-600 text-white font-bold text-xs">
                    {analysis.tipo_ato || 'Ato Processual'}
                  </span>
                  <span className="text-xs font-medium text-indigo-900">
                    Resultado: <strong className="capitalize">{analysis.resultado?.replace(/_/g, ' ') || 'Processado'}</strong>
                  </span>
                </div>
                <p className="text-xs text-gray-800 leading-relaxed font-medium">
                  {analysis.resumo}
                </p>
              </div>

              {/* Grid com detalhes extraídos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                {/* 1. Audiência */}
                <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center gap-1.5 text-gray-900">
                      <span>📅</span> Audiência
                    </span>
                    {analysis.audiencia?.identificada ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Identificada</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">Sem audiência</span>
                    )}
                  </div>
                  {analysis.audiencia?.identificada ? (
                    <div className="space-y-1 text-gray-700">
                      <p><strong>Tipo:</strong> {analysis.audiencia.tipo || 'Não especificado'}</p>
                      <p><strong>Data/Hora:</strong> {analysis.audiencia.data || 'A definir'} {analysis.audiencia.hora ? `às ${analysis.audiencia.hora}` : ''}</p>
                      {analysis.audiencia.modalidade && <p><strong>Modalidade:</strong> {analysis.audiencia.modalidade}</p>}
                    </div>
                  ) : (
                    <p className="text-gray-400">Nenhuma designação de audiência no texto.</p>
                  )}
                </div>

                {/* 2. Prazos */}
                <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center gap-1.5 text-gray-900">
                      <span>⏳</span> Prazo & Providência
                    </span>
                    {analysis.prazo?.identificado ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">Prazo Ativo</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">Sem prazo fixado</span>
                    )}
                  </div>
                  {analysis.prazo?.identificado ? (
                    <div className="space-y-1 text-gray-700">
                      <p><strong>Ato/Prazo:</strong> {analysis.prazo.tipo || 'Intimação'}</p>
                      <p><strong>Duração:</strong> {analysis.prazo.dias ? `${analysis.prazo.dias} dias ${analysis.prazo.tipo_dias || ''}` : 'Conforme lei'}</p>
                      {analysis.prazo.sugestao_data_limite && (
                        <p className="text-amber-700 font-bold">Data sugerida: {analysis.prazo.sugestao_data_limite}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400">Nenhum prazo recursal ou de manifestação imediato.</p>
                  )}
                </div>

                {/* 3. Valores e Honorários */}
                <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center gap-1.5 text-gray-900">
                      <span>💰</span> Valores & Honorários
                    </span>
                    {analysis.valores?.tem_valores ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Fixados</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">Sem condenação</span>
                    )}
                  </div>
                  {analysis.valores?.tem_valores ? (
                    <div className="space-y-1 text-gray-700">
                      {analysis.valores.valor_condenacao && (
                        <p><strong>Condenação:</strong> R$ {Number(analysis.valores.valor_condenacao).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                      )}
                      {analysis.valores.honorarios_percentual && (
                        <p><strong>Honorários:</strong> <span className="text-emerald-700 font-bold">{analysis.valores.honorarios_percentual}%</span> sobre {analysis.valores.honorarios_base === 'condenacao' ? 'a condenação' : 'o valor da causa'}</p>
                      )}
                      {analysis.valores.detalhes && (
                        <p className="text-[11px] text-gray-500">{analysis.valores.detalhes}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-400">Sem condenação ou arbitramento expresso de valores.</p>
                  )}
                </div>

                {/* 4. Fase Sugerida */}
                <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center gap-1.5 text-gray-900">
                      <span>🎯</span> Fase Processual Sugerida
                    </span>
                  </div>
                  <p className="text-gray-700">
                    O sistema recomenda atualizar a fase do processo para:
                  </p>
                  <span className="inline-block mt-2 px-3 py-1 rounded-lg bg-indigo-100 text-indigo-900 font-bold text-xs uppercase tracking-wide">
                    {analysis.fase_sugerida || 'Em andamento'}
                  </span>
                </div>
              </div>

              {/* 5. Tarefas sugeridas */}
              {analysis.tarefas_sugeridas && analysis.tarefas_sugeridas.length > 0 && (
                <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/70">
                  <h4 className="font-bold text-xs text-gray-900 mb-2 flex items-center gap-1.5">
                    <span>📋</span> Tarefas Operacionais Recomendadas (selecione as que deseja criar na aba Tarefas):
                  </h4>
                  <div className="space-y-2">
                    {analysis.tarefas_sugeridas.map((tarefa, idx) => (
                      <label key={idx} className="flex items-start gap-2.5 p-2 bg-white rounded-lg border border-gray-200 hover:border-indigo-300 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={!!selectedTasks[idx]}
                          onChange={(e) => setSelectedTasks({ ...selectedTasks, [idx]: e.target.checked })}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-gray-800">{tarefa}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Opções de aplicação */}
              <div className="p-3.5 bg-white border border-gray-200 rounded-xl space-y-2 text-xs">
                <p className="font-bold text-gray-900">Confirmar o que será atualizado no processo:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={applyPhase} onChange={(e) => setApplyPhase(e.target.checked)} className="rounded text-indigo-600" />
                    <span>Atualizar Fase Processual para "{analysis.fase_sugerida}"</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={applyDeadline} onChange={(e) => setApplyDeadline(e.target.checked)} className="rounded text-indigo-600" />
                    <span>Lançar Prazo / Audiência no Caso</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={applyFees} onChange={(e) => setApplyFees(e.target.checked)} className="rounded text-indigo-600" />
                    <span>Atualizar Honorários / Condenação</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={saveMovement} onChange={(e) => setSaveMovement(e.target.checked)} className="rounded text-indigo-600" />
                    <span>Salvar no Histórico de Movimentações</span>
                  </label>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setAnalysis(null)}
                  className="text-xs text-gray-600 hover:text-gray-900 underline"
                >
                  ← Analisar outro texto
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    disabled={applying}
                    onClick={handleApply}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md inline-flex items-center gap-2 transition disabled:opacity-50"
                  >
                    {applying ? 'Aplicando ao Caso...' : '✓ Aplicar ao Caso & Criar Tarefas'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
