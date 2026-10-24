import React, { useState } from 'react';
import { apiJson } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';
import { parseCaseFee, calculateFeeAmount, serializeFeeIntoNotes } from '../lib/caseFeeHelper';

export default function CaseFinalizeModal({ caseItem, onClose, onRefresh }) {
  const initialFee = parseCaseFee(caseItem);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [resultado, setResultado] = useState('procedente_parcial');
  const [awardedValue, setAwardedValue] = useState(initialFee.awarded_value != null ? String(initialFee.awarded_value) : '');
  const [feeType, setFeeType] = useState(initialFee.fee_type || 'percentual');
  const [feePercentage, setFeePercentage] = useState(initialFee.fee_percentage != null ? String(initialFee.fee_percentage) : '30');
  const [feeBasis, setFeeBasis] = useState(initialFee.fee_basis || 'condenacao');
  const [feeFixedValue, setFeeFixedValue] = useState(initialFee.fee_fixed_value != null ? String(initialFee.fee_fixed_value) : '');
  const [manualFeeOverride, setManualFeeOverride] = useState(initialFee.fee_final_value != null ? String(initialFee.fee_final_value) : '');
  const [statusFinal, setStatusFinal] = useState('encerrado');
  const [dataEncerramento, setDataEncerramento] = useState(new Date().toISOString().slice(0, 10));
  const [obs, setObs] = useState('');

  // Cálculo dinâmico de honorários
  const computedFee = calculateFeeAmount({
    fee_type: feeType,
    fee_percentage: Number(feePercentage) || 0,
    fee_basis: feeBasis,
    awarded_value: awardedValue ? Number(awardedValue) : null,
    fee_fixed_value: feeFixedValue ? Number(feeFixedValue) : null,
    case_value: caseItem.case_value
  });

  const finalHonorarios = manualFeeOverride !== '' ? Number(manualFeeOverride) : computedFee;

  const handleFinalize = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      const feeData = {
        fee_type: feeType,
        fee_percentage: Number(feePercentage) || 30,
        fee_basis: feeBasis,
        awarded_value: awardedValue ? Number(awardedValue) : null,
        fee_fixed_value: feeFixedValue ? Number(feeFixedValue) : null,
        fee_final_value: finalHonorarios
      };

      const closingNote = `[ENCERRAMENTO DO PROCESSO em ${new Date(dataEncerramento + 'T12:00:00').toLocaleDateString('pt-BR')}]
Resultado: ${resultado}
Valor da Causa Original: R$ ${Number(caseItem.case_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
Valor Condenação/Acordo: ${awardedValue ? 'R$ ' + Number(awardedValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : 'Não aplicável'}
Honorários Apurados: R$ ${finalHonorarios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${feeType === 'fixo' ? 'Fixo' : feePercentage + '% sobre ' + feeBasis})
${obs ? 'Obs: ' + obs : ''}`.trim();

      const combinedNotes = serializeFeeIntoNotes(caseItem.notes ? `${caseItem.notes}\n\n${closingNote}` : closingNote, feeData);

      const updates = {
        status: statusFinal,
        procedural_step: 'encerrado',
        deadline_date: null,
        deadline_type: null,
        notes: combinedNotes
      };

      try {
        await apiJson(`/api/cases?id=${caseItem.id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates)
        });
      } catch {
        await supabase.from('cases').update(updates).eq('id', caseItem.id);
      }

      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao finalizar o processo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-xl overflow-hidden my-auto text-gray-900 animate-fadeIn">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-900 text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl shadow-inner">
              🏁
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Finalizar / Encerrar Processo Judicial</h3>
              <p className="text-xs text-emerald-100 mt-0.5">
                {caseItem.title} {caseItem.process_number ? `(${caseItem.process_number})` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-emerald-200 hover:text-white text-xl p-1 rounded-lg hover:bg-white/10 transition">
            ✕
          </button>
        </div>

        <form onSubmit={handleFinalize} className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 font-medium">
              ⚠️ {error}
            </div>
          )}

          <div className="p-3 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-1">
            <p className="font-bold text-emerald-950 text-xs">Atenção sobre o encerramento:</p>
            <p className="text-emerald-900 text-[11px] leading-relaxed">
              O encerramento do processo é definitivo para o ciclo processual ativo. Todos os prazos e alertas em atraso deste caso serão zerados e os honorários finais serão registrados no extrato de casos concluídos.
            </p>
          </div>

          {/* 1. Resultado */}
          <div>
            <label className="block font-bold text-gray-700 mb-1">Resultado Processual / Motivo de Encerramento *</label>
            <select
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 font-medium focus:outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            >
              <option value="procedente_integral">Procedência Total</option>
              <option value="procedente_parcial">Procedência Parcial com Condenação</option>
              <option value="acordo_homologado">Acordo Homologado e Pago</option>
              <option value="extincao_com_resolucao">Extinção com Resolução do Mérito</option>
              <option value="improcedente">Improcedência</option>
              <option value="arquivamento_definitivo">Arquivamento Definitivo</option>
            </select>
          </div>

          {/* 2. Valores Condenação e Causa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-600 mb-1">Valor da Causa Original</label>
              <div className="px-3 py-2 bg-gray-100 border border-gray-200 rounded-lg font-mono text-gray-700">
                R$ {Number(caseItem.case_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>

            <div>
              <label className="block font-bold text-gray-700 mb-1">Valor da Condenação / Acordo (R$)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="Ex: 6207.59"
                value={awardedValue}
                onChange={(e) => setAwardedValue(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg font-mono text-gray-900 focus:outline-none focus:border-emerald-600"
              />
              <span className="text-[10px] text-gray-500">Ex: No caso de Amanda, a causa era R$ 15.400 e a condenação R$ 6.207,59.</span>
            </div>
          </div>

          {/* 3. Regra e Percentual de Honorários */}
          <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <h4 className="font-bold text-gray-900 flex items-center justify-between">
              <span>💰 Honorários Advocatícios Finais</span>
              <span className="text-emerald-700 font-mono text-sm">
                R$ {finalHonorarios.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-gray-600 mb-0.5">Tipo</label>
                <select
                  value={feeType}
                  onChange={(e) => setFeeType(e.target.value)}
                  className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs"
                >
                  <option value="percentual">Percentual (%)</option>
                  <option value="fixo">Valor Fixo (R$)</option>
                </select>
              </div>

              {feeType === 'percentual' ? (
                <>
                  <div>
                    <label className="block text-gray-600 mb-0.5">Porcentagem (%)</label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        value={feePercentage}
                        onChange={(e) => setFeePercentage(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setFeePercentage('20')}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${feePercentage === '20' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-300 text-gray-700'}`}
                      >
                        20%
                      </button>
                      <button
                        type="button"
                        onClick={() => setFeePercentage('30')}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${feePercentage === '30' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-gray-300 text-gray-700'}`}
                      >
                        30%
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-gray-600 mb-0.5">Base de Cálculo</label>
                    <select
                      value={feeBasis}
                      onChange={(e) => setFeeBasis(e.target.value)}
                      className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs"
                    >
                      <option value="condenacao">Sobre a Condenação / Acordo</option>
                      <option value="causa">Sobre o Valor da Causa</option>
                    </select>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <label className="block text-gray-600 mb-0.5">Valor Fixo de Honorários (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Ex: 2500.00"
                    value={feeFixedValue}
                    onChange={(e) => setFeeFixedValue(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded text-xs font-mono"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-gray-600 mb-0.5">Ajuste Fino Manual do Honorário Final (opcional):</label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder={`Cálculo automático: R$ ${computedFee.toFixed(2)}`}
                value={manualFeeOverride}
                onChange={(e) => setManualFeeOverride(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-gray-300 rounded text-xs font-mono"
              />
              <span className="text-[10px] text-gray-400">Preencha apenas se quiser forçar um valor diferente do cálculo automático.</span>
            </div>
          </div>

          {/* 4. Data e Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-gray-700 mb-1">Data de Encerramento</label>
              <input
                type="date"
                required
                value={dataEncerramento}
                onChange={(e) => setDataEncerramento(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
              />
            </div>

            <div>
              <label className="block font-medium text-gray-700 mb-1">Status Final</label>
              <select
                value={statusFinal}
                onChange={(e) => setStatusFinal(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
              >
                <option value="encerrado">Encerrado</option>
                <option value="arquivado">Arquivado</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-gray-700 mb-1">Observações de Fechamento (opcional)</label>
            <textarea
              rows={2}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex: Alvará expedido e levantado. TED realizada para a conta do cliente..."
              className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-md inline-flex items-center gap-1.5 transition disabled:opacity-50"
            >
              {saving ? 'Finalizando...' : '✓ Confirmar Encerramento do Processo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
