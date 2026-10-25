import React, { useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { serializeFeeIntoNotes } from '../lib/caseFeeHelper';

export default function CaseDecisionExtractorModal({ caseItem, allCases = [], onClose, onRefresh }) {
  const [text, setText] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Caso alvo (se já existe ou se foi selecionado)
  const [targetCase, setTargetCase] = useState(caseItem || null);
  const [isNewCase, setIsNewCase] = useState(false);

  // Dados para novo caso caso não exista
  const [newCaseData, setNewCaseData] = useState({
    title: '',
    process_number: '',
    court: 'TJ',
    judicial_district: '',
    court_division: '',
    legal_area: 'civel',
    status: 'em_execucao',
    client_name: '',
    opposing_party: ''
  });

  // Valores editáveis de condenação e honorários
  const [editableCondenacao, setEditableCondenacao] = useState('');
  const [editableHonorariosPercentual, setEditableHonorariosPercentual] = useState(20);

  // Seletores para aplicação
  const [selectedTasks, setSelectedTasks] = useState({});
  const [applyPhase, setApplyPhase] = useState(true);
  const [applyDeadline, setApplyDeadline] = useState(true);
  const [applyFees, setApplyFees] = useState(false);
  const [saveMovement, setSaveMovement] = useState(true);

  const cleanDigits = (s) => String(s || '').replace(/\D/g, '');

  const handleAnalyze = async (e) => {
    e.preventDefault();
    if (!text.trim() || analyzing) return;

    setAnalyzing(true);
    setError(null);
    setAnalysis(null);

    try {
      const caseContext = targetCase
        ? `Título: ${targetCase.title || ''}, Processo: ${targetCase.process_number || ''}, Tribunal: ${targetCase.court || ''}, Fase atual: ${targetCase.procedural_step || ''}`
        : '';

      const res = await apiJson('/api/cases/ai-extract-decision', {
        method: 'POST',
        body: JSON.stringify({ text: text.trim(), caseContext })
      });

      if (res && res.analysis) {
        const ana = res.analysis;
        setAnalysis(ana);

        // Se já foi aberto a partir de um caso específico (da linha da tabela)
        if (caseItem && caseItem.id) {
          setTargetCase(caseItem);
          setIsNewCase(false);
        } else {
          // Extração geral (botão superior do painel de Casos)
          const extractedCnj = ana.dados_processo?.numero_processo || '';
          const extractedDigits = cleanDigits(extractedCnj);

          let found = null;
          if (extractedDigits && allCases && allCases.length > 0) {
            found = allCases.find((c) => cleanDigits(c.process_number) === extractedDigits);
          }

          if (!found && extractedDigits) {
            try {
              const { data: dbCases } = await supabase
                .from('cases')
                .select('*')
                .ilike('process_number', `%${extractedCnj.trim()}%`)
                .limit(1);
              if (dbCases && dbCases[0]) {
                found = dbCases[0];
              }
            } catch (err) {
              console.warn('[AI-EXTRACT] Erro ao buscar processo no banco:', err);
            }
          }

          if (found) {
            setTargetCase(found);
            setIsNewCase(false);
          } else {
            // Processo NÃO encontrado -> Configura modo de NOVO CASO
            setTargetCase(null);
            setIsNewCase(true);
            const dp = ana.dados_processo || {};
            const suggestedTitle = dp.titulo_sugerido || (dp.cliente_provavel ? `Cumprimento de Sentença — ${dp.cliente_provavel}` : (dp.autor ? `${dp.autor} v. ${dp.reu || 'Réu'}` : 'Novo Processo Judicial'));
            setNewCaseData({
              title: suggestedTitle,
              process_number: dp.numero_processo || '',
              court: dp.tribunal || 'TJ',
              judicial_district: dp.comarca || '',
              court_division: dp.vara || '',
              legal_area: dp.area_juridica || 'civel',
              status: ana.fase_sugerida === 'execucao' ? 'em_execucao' : (ana.fase_sugerida === 'recurso' ? 'em_recurso' : 'em_andamento'),
              client_name: dp.cliente_provavel || dp.autor || '',
              opposing_party: dp.reu || ''
            });
          }
        }

        if (ana.valores?.valor_condenacao) {
          setEditableCondenacao(String(ana.valores.valor_condenacao));
        } else {
          setEditableCondenacao('');
        }
        if (ana.valores?.honorarios_percentual) {
          setEditableHonorariosPercentual(Number(ana.valores.honorarios_percentual));
        }
        if (ana.valores?.tem_valores || ana.valores?.honorarios_percentual) {
          setApplyFees(true);
        }

        const initialTasks = {};
        (ana.tarefas_sugeridas || []).forEach((t, i) => {
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
    if (!analysis || applying) return;
    setApplying(true);
    setError(null);

    try {
      let activeCaseId = targetCase?.id;
      let activeCaseTitle = targetCase?.title || newCaseData.title;

      let deadlineDate = null;
      let deadlineType = null;
      if (applyDeadline) {
        if (analysis.audiencia?.identificada && analysis.audiencia.data) {
          deadlineDate = analysis.audiencia.data;
          deadlineType = `Audiência ${analysis.audiencia.tipo || ''}`.trim();
        } else if (analysis.prazo?.identificado && analysis.prazo.sugestao_data_limite) {
          deadlineDate = analysis.prazo.sugestao_data_limite;
          deadlineType = analysis.prazo.tipo || 'Prazo Judicial';
        }
      }

      // Se for NOVO CASO
      if (isNewCase) {
        if (!newCaseData.title.trim()) {
          setError('O título do novo caso é obrigatório.');
          setApplying(false);
          return;
        }

        let newNotes = `Cadastrado automaticamente via IA através de ato judicial (${analysis.tipo_ato || 'Decisão'}).\nResumo: ${analysis.resumo || ''}`;

        if (applyFees && (editableCondenacao || editableHonorariosPercentual)) {
          const valCond = Number(editableCondenacao) || null;
          const pct = Number(editableHonorariosPercentual) || 20;
          const finalEst = valCond ? (valCond * pct) / 100 : null;
          const feeData = {
            fee_type: 'percentual',
            fee_percentage: pct,
            fee_basis: 'condenacao',
            awarded_value: valCond,
            fee_final_value: finalEst
          };
          newNotes = serializeFeeIntoNotes(newNotes, feeData);
        }

        const newCasePayload = {
          title: newCaseData.title.trim(),
          process_number: newCaseData.process_number ? newCaseData.process_number.trim() : null,
          court: newCaseData.court || 'TJ',
          judicial_district: newCaseData.judicial_district ? newCaseData.judicial_district.trim() : null,
          court_division: newCaseData.court_division ? newCaseData.court_division.trim() : null,
          legal_area: newCaseData.legal_area || 'civel',
          status: newCaseData.status || (analysis.fase_sugerida === 'execucao' ? 'em_execucao' : 'em_andamento'),
          procedural_step: analysis.fase_sugerida || 'execucao',
          priority: 'alta',
          notes: newNotes,
          deadline_date: deadlineDate,
          deadline_type: deadlineType
        };

        const { data: createdCase, error: createError } = await supabase
          .from('cases')
          .insert([newCasePayload])
          .select()
          .single();

        if (createError) throw createError;

        activeCaseId = createdCase.id;
        activeCaseTitle = createdCase.title;

        // Cria vínculo no case_processes se houver número de processo
        if (newCasePayload.process_number) {
          try {
            await supabase.from('case_processes').insert([{
              case_id: createdCase.id,
              process_number: newCasePayload.process_number,
              court_name: newCasePayload.court || 'TJ',
              court_unit: newCasePayload.court_division || null,
              client_role: 'autor',
              is_primary: true,
              monitoring_status: 'ativo'
            }]);
          } catch (e) {
            console.warn('[AI-EXTRACT] Erro ao cadastrar case_processes:', e);
          }
        }
      } else {
        // CASO EXISTENTE: Atualiza
        const updates = {};
        if (applyPhase && analysis.fase_sugerida) {
          updates.procedural_step = analysis.fase_sugerida;
          if (analysis.fase_sugerida === 'execucao') {
            updates.status = 'em_execucao';
          } else if (analysis.fase_sugerida === 'recurso') {
            updates.status = 'em_recurso';
          }
        }
        if (applyDeadline) {
          if (deadlineDate) {
            updates.deadline_date = deadlineDate;
            updates.deadline_type = deadlineType;
          }
        }
        if (applyFees && (editableCondenacao || editableHonorariosPercentual)) {
          const valCond = Number(editableCondenacao) || null;
          const pct = Number(editableHonorariosPercentual) || 20;
          const finalEst = valCond ? (valCond * pct) / 100 : null;
          const feeData = {
            fee_type: 'percentual',
            fee_percentage: pct,
            fee_basis: 'condenacao',
            awarded_value: valCond,
            fee_final_value: finalEst
          };
          updates.notes = serializeFeeIntoNotes(targetCase?.notes || '', feeData);
        }

        if (Object.keys(updates).length > 0) {
          const { error: updErr } = await supabase.from('cases').update(updates).eq('id', activeCaseId);
          if (updErr) throw updErr;
        }
      }

      // Salva no histórico de movimentações se selecionado
      if (saveMovement && activeCaseId) {
        try {
          let { data: procs } = await supabase.from('case_processes').select('id').eq('case_id', activeCaseId).limit(1);
          let caseProcessId = procs && procs[0] ? procs[0].id : null;

          // Se não encontrou case_process, cria um básico para registrar a movimentação
          if (!caseProcessId) {
            const cnj = isNewCase ? newCaseData.process_number : targetCase?.process_number;
            if (cnj) {
              const { data: newProc } = await supabase.from('case_processes').insert([{
                case_id: activeCaseId,
                process_number: cnj,
                court_name: targetCase?.court || newCaseData.court || 'TJ',
                is_primary: true
              }]).select().single();
              if (newProc) caseProcessId = newProc.id;
            }
          }

          if (caseProcessId) {
            const movementText = `[IA] ${analysis.tipo_ato || 'Decisão'}: ${analysis.resumo || text.slice(0, 300)}`;
            await supabase.from('process_movements').insert([{
              case_process_id: caseProcessId,
              movement_date: analysis.audiencia?.data || new Date().toISOString().slice(0, 10),
              movement_text: movementText,
              movement_text_normalized: movementText.toLowerCase(),
              source: 'IA - Extração de Decisão',
              detected_at: new Date().toISOString(),
              review_status: 'nova'
            }]);
          }
        } catch (e) {
          console.warn('[AI-EXTRACT] Erro ao gravar movimentação automática:', e);
        }
      }

      // Cria tarefas sugeridas selecionadas
      const tasksToCreate = (analysis.tarefas_sugeridas || []).filter((_, i) => selectedTasks[i]);
      for (const taskTitle of tasksToCreate) {
        try {
          await supabase.from('tasks').insert([{
            title: taskTitle,
            description: `Gerada automaticamente via IA para o caso "${activeCaseTitle}"`,
            case_id: activeCaseId,
            priority: 'alta',
            due_date: (analysis.audiencia?.data || analysis.prazo?.sugestao_data_limite) || null,
            status: 'pendente',
            done: false
          }]);
        } catch (e) {
          console.warn('[AI-EXTRACT] Erro ao criar tarefa:', e);
        }
      }

      setSuccessMsg(
        isNewCase
          ? `🎉 Novo caso "${activeCaseTitle}" cadastrado com sucesso e tarefas geradas!`
          : `✓ Ato processual analisado e aplicado ao caso "${activeCaseTitle}"!`
      );

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
              <h3 className="font-bold text-lg leading-tight">Agente IA de Decisões e Despachos</h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                {targetCase
                  ? `Caso: ${targetCase.title} (${targetCase.process_number || 'Sem CNJ'})`
                  : 'Análise automática de ato judicial (identifica ou cadastra novos casos)'}
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
                  <span className="text-[11px] font-normal text-gray-500">A IA identificará o processo e suas decisões</span>
                </label>
                <textarea
                  required
                  rows={8}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Cole aqui o texto completo copiado do Projudi ou PJe (com número de processo, partes, decisão, etc)..."
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
              {/* CARD DE IDENTIFICAÇÃO OU NOVO CADASTRO */}
              {isNewCase ? (
                <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded bg-amber-600 text-white font-bold text-xs flex items-center gap-1.5">
                      <span>✨</span> Novo Processo Identificado (Não Cadastrado)
                    </span>
                    <span className="text-xs text-amber-900 font-semibold">
                      O sistema criará este caso automaticamente no banco
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs pt-1">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Título do Novo Caso:</label>
                      <input
                        type="text"
                        value={newCaseData.title}
                        onChange={(e) => setNewCaseData({ ...newCaseData, title: e.target.value })}
                        className="w-full p-2 border border-amber-300 rounded-lg bg-white text-xs font-semibold text-gray-900"
                        placeholder="Ex: Cumprimento de Sentença — Beatriz Soares Andrade"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Número CNJ:</label>
                      <input
                        type="text"
                        value={newCaseData.process_number}
                        onChange={(e) => setNewCaseData({ ...newCaseData, process_number: e.target.value })}
                        className="w-full p-2 border border-amber-300 rounded-lg bg-white text-xs font-mono text-gray-900"
                        placeholder="0001620-89.2025.8.05.0120"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Tribunal:</label>
                      <input
                        type="text"
                        value={newCaseData.court}
                        onChange={(e) => setNewCaseData({ ...newCaseData, court: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-lg bg-white text-xs text-gray-900"
                        placeholder="Ex: TJ, TRT"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Comarca:</label>
                      <input
                        type="text"
                        value={newCaseData.judicial_district}
                        onChange={(e) => setNewCaseData({ ...newCaseData, judicial_district: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-lg bg-white text-xs text-gray-900"
                        placeholder="Ex: Itamaraju"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Vara / Juízo:</label>
                      <input
                        type="text"
                        value={newCaseData.court_division}
                        onChange={(e) => setNewCaseData({ ...newCaseData, court_division: e.target.value })}
                        className="w-full p-2 border border-gray-300 rounded-lg bg-white text-xs text-gray-900"
                        placeholder="Ex: Vara do Sistema dos Juizados"
                      />
                    </div>
                  </div>

                  {allCases && allCases.length > 0 && (
                    <div className="pt-1 flex items-center gap-2 text-[11px] text-gray-600">
                      <span>Ou vincular a um caso existente:</span>
                      <select
                        className="p-1 border border-gray-300 rounded bg-white text-gray-800 text-[11px]"
                        onChange={(e) => {
                          const c = allCases.find((x) => String(x.id) === e.target.value);
                          if (c) {
                            setTargetCase(c);
                            setIsNewCase(false);
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Selecione um caso existente...</option>
                        {allCases.map((c) => (
                          <option key={c.id} value={c.id}>{c.title} ({c.process_number || 'Sem CNJ'})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-emerald-700 text-white font-bold text-[11px]">
                      ✓ Processo Existente Localizado
                    </span>
                    <span className="font-bold text-emerald-950">
                      {targetCase?.title || 'Caso do Sistema'}
                    </span>
                    {targetCase?.process_number && (
                      <span className="text-gray-500 font-mono text-[11px]">({targetCase.process_number})</span>
                    )}
                  </div>
                  <span className="text-[11px] text-emerald-800 font-semibold">
                    Fase atual: {targetCase?.procedural_step || 'Em andamento'}
                  </span>
                </div>
              )}

              {/* RESUMO DA DECISÃO */}
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
                    {analysis.valores?.tem_valores || analysis.valores?.honorarios_percentual ? (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Fixados / Editáveis</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-500">Opcional</span>
                    )}
                  </div>
                  <div className="space-y-2 text-gray-700 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          Valor da Condenação / Execução (R$):
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={editableCondenacao}
                          onChange={(e) => setEditableCondenacao(e.target.value)}
                          className="w-full p-1.5 border border-gray-300 rounded text-xs font-semibold bg-gray-50 text-gray-900"
                          placeholder="Ex: 7154.68"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-gray-600 mb-0.5">
                          % Honorários:
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={editableHonorariosPercentual}
                          onChange={(e) => setEditableHonorariosPercentual(e.target.value)}
                          className="w-full p-1.5 border border-gray-300 rounded text-xs font-semibold bg-gray-50 text-gray-900"
                          placeholder="Ex: 20"
                        />
                      </div>
                    </div>
                    {analysis.valores?.detalhes && (
                      <p className="text-[11px] text-gray-500 italic">{analysis.valores.detalhes}</p>
                    )}
                  </div>
                </div>

                {/* 4. Fase Sugerida */}
                <div className="p-3.5 rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold flex items-center gap-1.5 text-gray-900">
                      <span>🎯</span> Fase Processual Sugerida
                    </span>
                  </div>
                  <p className="text-gray-700">
                    O sistema recomenda definir a fase do processo para:
                  </p>
                  <span className="inline-block mt-2 px-3 py-1 rounded-lg bg-indigo-100 text-indigo-900 font-bold text-xs uppercase tracking-wide">
                    {analysis.fase_sugerida || 'execucao'}
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
                <p className="font-bold text-gray-900">Confirmar o que será gravado no processo:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={applyPhase} onChange={(e) => setApplyPhase(e.target.checked)} className="rounded text-indigo-600" />
                    <span>Definir Fase Processual como "{analysis.fase_sugerida || 'execucao'}"</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={applyDeadline} onChange={(e) => setApplyDeadline(e.target.checked)} className="rounded text-indigo-600" />
                    <span>Lançar Prazo / Audiência no Caso</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={applyFees} onChange={(e) => setApplyFees(e.target.checked)} className="rounded text-indigo-600" />
                    <span>Gravar Honorários / Condenação</span>
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
                    className={`px-5 py-2.5 ${isNewCase ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-lg text-xs font-bold shadow-md inline-flex items-center gap-2 transition disabled:opacity-50`}
                  >
                    {applying ? (
                      isNewCase ? 'Cadastrando Caso e Tarefas...' : 'Aplicando ao Caso...'
                    ) : isNewCase ? (
                      '✨ Cadastrar Novo Caso & Criar Tarefas'
                    ) : (
                      '✓ Aplicar ao Caso & Criar Tarefas'
                    )}
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
