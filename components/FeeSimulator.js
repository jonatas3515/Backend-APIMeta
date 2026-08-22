import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

import { calculateRegionalSuggestion, calculateOabDiscount } from '../lib/feeSuggestion';

export default function FeeSimulator({ caseId, caseData, userRole, isAdminOrLawyer = null, showTracking = false, hideForm = false }) {
  const [services, setServices] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedService, setSelectedService] = useState('');
  const [oabReference, setOabReference] = useState(null);
  const [form, setForm] = useState({
    complexity: 'media',
    urgency: 'normal',
    service_stage: 'consulta',
    document_volume: 'padrao',
    estimated_economic_value: '',
    internal_notes: '',
    final_amount: '',
    out_of_range_justification: '',
    proposal_valid_until: ''
  });

  const isAdminOrLawyerFinal = isAdminOrLawyer !== null ? isAdminOrLawyer : (userRole === 'admin' || userRole === 'advogado');

  useEffect(() => {
    fetchServices();
    fetchSimulations();
  }, [caseId]);

  const fetchServices = async () => {
    try {
      const headers = await getAuthHeaders();
      
      // Tenta buscar serviços da área jurídica do caso
      let url = `/api/fee-services?active=true`;
      if (caseData?.legal_area) {
        url += `&legal_area=${encodeURIComponent(caseData.legal_area)}`;
      }
      
      const { data } = await axios.get(url, { headers });
      
      // Se não encontrou serviços com filtro de área, busca todos ativos
      if ((!data || data.length === 0) && caseData?.legal_area) {
        const { data: allServices } = await axios.get(`/api/fee-services?active=true`, { headers });
        setServices(allServices || []);
      } else {
        setServices(data || []);
      }
    } catch (err) {
      console.error('[FEE-SIMULATOR] Erro ao buscar serviços:', err);
    }
  };

  const fetchOabReference = async (serviceName) => {
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams();
      if (caseData?.legal_area) params.set('legal_area', caseData.legal_area);
      if (caseData?.case_type) params.set('case_type', caseData.case_type);
      if (serviceName) params.set('service', serviceName);
      const { data } = await axios.get(`/api/fee-reference?${params.toString()}`, { headers });
      setOabReference(data && data.length > 0 ? data[0] : null);
    } catch (err) {
      console.error('[FEE-SIMULATOR] Erro ao buscar referência OAB:', err);
      setOabReference(null);
    }
  };

  const fetchSimulations = async () => {
    if (!caseId) return;
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/fee-simulations?case_id=${caseId}`, { headers });
      setSimulations(data || []);
    } catch (err) {
      console.error('[FEE-SIMULATOR] Erro ao buscar simulações:', err);
    }
  };

  const handleCalculate = async () => {
    if (!selectedService) {
      setMessage({ type: 'error', text: 'Selecione um serviço da tabela interna.' });
      return;
    }
    setLoading(true);
    setMessage(null);
    setResult(null);
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.post('/api/fee-simulations', {
        action: 'calculate',
        service_id: selectedService,
        complexity: form.complexity,
        urgency: form.urgency,
        service_stage: form.service_stage,
        document_volume: form.document_volume,
        estimated_economic_value: form.estimated_economic_value ? parseFloat(form.estimated_economic_value) : null,
        oab_reference: oabReference ? {
          min_amount: oabReference.min_amount,
          suggested_amount: oabReference.suggested_amount,
          max_amount: oabReference.max_amount,
          regional_suggestion: oabReference.regional_suggestion
        } : null
      }, { headers });

      const selected = services.find((s) => s.id === selectedService);
      await fetchOabReference(selected?.name);

      setResult(data);
      const defaultFinal = oabReference?.regional_suggestion || data.suggested_amount;
      setForm((prev) => ({
        ...prev,
        final_amount: defaultFinal,
        proposal_valid_until: ''
      }));
    } catch (err) {
      const text = err.response?.data?.error || 'Erro ao calcular honorários';
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (status = 'rascunho') => {
    if (!result) return;
    if (!caseId) {
      setMessage({ type: 'error', text: 'Selecione um caso para salvar a simulação.' });
      return;
    }
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const final = form.final_amount ? parseFloat(form.final_amount) : (oabReference?.regional_suggestion || result.suggested_amount);
      const payload = {
        case_id: caseId,
        service_id: selectedService,
        complexity: form.complexity,
        urgency: form.urgency,
        service_stage: form.service_stage,
        document_volume: form.document_volume,
        estimated_economic_value: form.estimated_economic_value ? parseFloat(form.estimated_economic_value) : null,
        internal_notes: form.internal_notes,
        base_amount: result.base_amount,
        suggested_amount: result.suggested_amount,
        min_amount_snapshot: result.min_amount,
        max_amount_snapshot: result.max_amount,
        final_amount: final,
        oab_reference: oabReference ? {
          min_amount: oabReference.min_amount,
          suggested_amount: oabReference.suggested_amount,
          max_amount: oabReference.max_amount,
          regional_suggestion: oabReference.regional_suggestion,
          discount_percent: calculateOabDiscount(oabReference.suggested_amount, final)
        } : null,
        out_of_range_justification: form.out_of_range_justification,
        proposal_valid_until: form.proposal_valid_until || null,
        status
      };

      const { data } = await axios.post('/api/fee-simulations', payload, { headers });

      setMessage({ type: 'success', text: status === 'rascunho' ? 'Rascunho salvo' : 'Proposta salva' });
      setResult(null);
      setForm({
        complexity: 'media',
        urgency: 'normal',
        service_stage: 'consulta',
        document_volume: 'padrao',
        estimated_economic_value: '',
        internal_notes: '',
        final_amount: '',
        out_of_range_justification: '',
        proposal_valid_until: ''
      });
      setSelectedService('');
      fetchSimulations();
    } catch (err) {
      const text = err.response?.data?.error || 'Erro ao salvar simulação';
      setMessage({ type: 'error', text });
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async (id, action) => {
    try {
      const headers = await getAuthHeaders();
      const status = action === 'approve' ? 'aprovada' : 'rejeitada';
      const extra = action === 'reject' ? { rejection_reason: 'Rejeitada pelo responsável' } : {};
      await axios.patch(`/api/fee-simulations?id=${id}`, { status, ...extra }, { headers });
      fetchSimulations();
    } catch (err) {
      const text = err.response?.data?.error || 'Erro ao atualizar';
      setMessage({ type: 'error', text });
    }
  };

  const selected = services.find((s) => s.id === selectedService);

  return (
    <div className="p-4 bg-white rounded-lg border shadow-sm space-y-4 max-h-[80vh] overflow-y-auto">
      <h3 className="font-bold text-lg flex items-center gap-2">💰 Simular Honorários</h3>

      {services.length === 0 && (
        <div className="p-3 bg-yellow-50 text-yellow-800 rounded text-sm">
          <p className="font-semibold mb-1">⚠️ Nenhum serviço ativo encontrado</p>
          <p className="text-xs">
            Verifique se há serviços cadastrados na aba <strong>Honorários</strong> e se estão marcados como <strong>Ativos</strong>.
            {caseData?.legal_area && (
              <span> Área do caso: <strong>{caseData.legal_area}</strong>.</span>
            )}
          </p>
        </div>
      )}

      {message && (
        <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700">Serviço</label>
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="w-full mt-1 border rounded p-2 text-sm"
          >
            <option value="">Selecione...</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — R$ {Number(s.base_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ({s.billing_model})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Complexidade</label>
            <select value={form.complexity} onChange={(e) => setForm({ ...form, complexity: e.target.value })} className="w-full mt-1 border rounded p-2 text-sm">
              <option value="baixa">Baixa</option>
              <option value="media">Média</option>
              <option value="alta">Alta</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Urgência</label>
            <select value={form.urgency} onChange={(e) => setForm({ ...form, urgency: e.target.value })} className="w-full mt-1 border rounded p-2 text-sm">
              <option value="normal">Normal</option>
              <option value="prazo_curto">Prazo curto</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Etapa</label>
            <select value={form.service_stage} onChange={(e) => setForm({ ...form, service_stage: e.target.value })} className="w-full mt-1 border rounded p-2 text-sm">
              <option value="consulta">Consulta</option>
              <option value="extrajudicial">Extrajudicial</option>
              <option value="administrativo">Administrativo</option>
              <option value="peticao_inicial">Petição inicial</option>
              <option value="defesa">Defesa</option>
              <option value="recurso">Recurso</option>
              <option value="execucao">Execução</option>
              <option value="cumprimento_sentenca">Cumprimento de sentença</option>
              <option value="acompanhamento">Acompanhamento</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Volume documental</label>
            <select value={form.document_volume} onChange={(e) => setForm({ ...form, document_volume: e.target.value })} className="w-full mt-1 border rounded p-2 text-sm">
              <option value="reduzido">Reduzido</option>
              <option value="padrao">Padrão</option>
              <option value="elevado">Elevado</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Valor econômico estimado (R$)</label>
          <input
            type="number"
            value={form.estimated_economic_value}
            onChange={(e) => setForm({ ...form, estimated_economic_value: e.target.value })}
            className="w-full mt-1 border rounded p-2 text-sm"
            placeholder="Ex: 10000"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Observações internas</label>
          <textarea
            value={form.internal_notes}
            onChange={(e) => setForm({ ...form, internal_notes: e.target.value })}
            className="w-full mt-1 border rounded p-2 text-sm"
            rows={2}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleCalculate}
            disabled={loading || !selectedService}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {loading ? 'Calculando...' : 'Calcular sugestão'}
          </button>
        </div>
      </div>

      {result && (
        <div className="p-4 bg-gray-50 border rounded space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase">Sugestão interna</p>
          <div className="text-sm space-y-1">
            <p><strong>Valor-base:</strong> R$ {Number(result.base_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
            {result.applied_rules.map((r, i) => (
              <p key={i} className="text-gray-600">
                {r.rule_type} ({r.rule_value}): {r.adjustment_kind === 'percentual' ? `${r.adjustment_value}%` : `R$ ${Number(r.adjustment_value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} → {r.amount >= 0 ? '+' : ''} R$ {Number(r.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            ))}
            <p className="font-semibold text-lg">
              Valor sugerido: R$ {Number(result.suggested_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-gray-600">
              Faixa permitida: R$ {Number(result.min_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} a R$ {Number(result.max_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-gray-600">
              Pagamento sugerido: entrada R$ {Number(result.down_payment).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} + {result.installments_count}x R$ {Number(result.installment_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          </div>

          {oabReference && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded space-y-1">
              <p className="text-xs font-semibold text-blue-700 uppercase">Referência OAB</p>
              <p className="text-sm"><strong>Serviço:</strong> {oabReference.service}</p>
              <p className="text-sm text-gray-700">
                Valor OAB: mín. R$ {Number(oabReference.min_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | sugerido R$ {Number(oabReference.suggested_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} | máx. R$ {Number(oabReference.max_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm font-semibold text-green-700">
                Sugestão regional (70-80%): R$ {Number(oabReference.regional_suggestion || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              {form.final_amount && <p className="text-xs text-gray-600">Desconto vs OAB: {calculateOabDiscount(oabReference.suggested_amount, form.final_amount) !== null ? `${calculateOabDiscount(oabReference.suggested_amount, form.final_amount)}%` : '-'}</p>}
            </div>
          )}

          <div className="p-2 bg-yellow-100 text-yellow-800 rounded text-xs">
            Sugestão interna. O valor final depende de revisão e aprovação de advogado ou administrador.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Valor proposto (R$)</label>
            <input
              type="number"
              value={form.final_amount}
              onChange={(e) => setForm({ ...form, final_amount: e.target.value })}
              className="w-full mt-1 border rounded p-2 text-sm"
              placeholder={oabReference ? 'Sugestão regional preenchida' : 'Valor sugerido preenchido'}
            />
          </div>

          {form.final_amount && (parseFloat(form.final_amount) < result.min_amount || parseFloat(form.final_amount) > result.max_amount) && (
            <div>
              <label className="block text-sm font-medium text-red-700">Justificativa obrigatória (valor fora da faixa)</label>
              <textarea
                value={form.out_of_range_justification}
                onChange={(e) => setForm({ ...form, out_of_range_justification: e.target.value })}
                className="w-full mt-1 border rounded p-2 text-sm"
                rows={2}
                placeholder="Explique a divergência..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Validade da proposta</label>
            <input
              type="date"
              value={form.proposal_valid_until}
              onChange={(e) => setForm({ ...form, proposal_valid_until: e.target.value })}
              className="w-full mt-1 border rounded p-2 text-sm"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleSave('rascunho')}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
            >
              Salvar rascunho
            </button>
            {isAdminOrLawyerFinal && (
              <>
                <button
                  onClick={() => handleSave('enviada')}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  Enviar proposta
                </button>
                <button
                  onClick={() => handleSave('convertida_em_proposta')}
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
                >
                  Gerar proposta
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="pt-4 border-t">
        <h4 className="font-semibold text-sm mb-2">Histórico de simulações</h4>
        {simulations.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma simulação para este caso.</p>
        ) : (
          <div className="space-y-2">
            {simulations.map((sim) => (
              <div key={sim.id} className="p-3 border rounded text-sm">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium">{sim.fee_service_catalog?.name || 'Serviço'}</p>
                    <p className="text-gray-600">Status: <span className="capitalize font-semibold">{sim.status}</span></p>
                    <p className="text-gray-600">Sugerido: R$ {Number(sim.suggested_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    {sim.final_amount && sim.final_amount !== sim.suggested_amount && (
                      <p className="text-gray-600">Final: R$ {Number(sim.final_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                    )}
                  </div>
                  {isAdminOrLawyerFinal && sim.status === 'aguardando_aprovacao' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(sim.id, 'approve')}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                      >
                        Aprovar
                      </button>
                      <button
                        onClick={() => handleApprove(sim.id, 'reject')}
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                  {sim.status === 'aprovada' && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Aprovada</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
