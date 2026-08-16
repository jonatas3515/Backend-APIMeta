import { useState, useEffect } from 'react';
import axios from 'axios';
import { getAuthHeaders } from '../lib/api';

export default function FeeSimulator({ caseId, caseData, userRole }) {
  const [services, setServices] = useState([]);
  const [simulations, setSimulations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedService, setSelectedService] = useState('');
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

  useEffect(() => {
    fetchServices();
    fetchSimulations();
  }, [caseId]);

  const fetchServices = async () => {
    try {
      const headers = await getAuthHeaders();
      const { data } = await axios.get(`/api/fee-services?active=true&legal_area=${encodeURIComponent(caseData?.legal_area || '')}`, { headers });
      setServices(data || []);
    } catch (err) {
      console.error('[FEE-SIMULATOR] Erro ao buscar serviços:', err);
    }
  };

  const fetchSimulations = async () => {
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
        estimated_economic_value: form.estimated_economic_value ? parseFloat(form.estimated_economic_value) : null
      }, { headers });

      setResult(data);
      setForm((prev) => ({
        ...prev,
        final_amount: data.suggested_amount,
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
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const payload = {
        case_id: caseId,
        service_id: selectedService,
        complexity: form.complexity,
        urgency: form.urgency,
        service_stage: form.service_stage,
        document_volume: form.document_volume,
        estimated_economic_value: form.estimated_economic_value ? parseFloat(form.estimated_economic_value) : null,
        internal_notes: form.internal_notes,
        final_amount: form.final_amount ? parseFloat(form.final_amount) : result.suggested_amount,
        out_of_range_justification: form.out_of_range_justification,
        proposal_valid_until: form.proposal_valid_until || null
      };

      const { data } = await axios.post('/api/fee-simulations', payload, { headers });

      if (status !== 'rascunho') {
        await axios.patch(`/api/fee-simulations?id=${data.id}`, { status }, { headers });
      }

      setMessage({ type: 'success', text: status === 'rascunho' ? 'Rascunho salvo' : 'Simulação enviada para aprovação' });
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

  const isAdminOrLawyer = userRole === 'admin' || userRole === 'advogado';
  const selected = services.find((s) => s.id === selectedService);

  return (
    <div className="p-4 bg-white rounded-lg border shadow-sm space-y-4 max-h-[80vh] overflow-y-auto">
      <h3 className="font-bold text-lg flex items-center gap-2">💰 Simular Honorários</h3>

      {services.length === 0 && (
        <div className="p-3 bg-yellow-50 text-yellow-800 rounded text-sm">
          Não existe serviço ativo configurado para este tipo de demanda. Solicite ao administrador a inclusão na tabela interna de honorários.
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

          <div className="p-2 bg-yellow-100 text-yellow-800 rounded text-xs">
            Sugestão interna. O valor final depende de revisão e aprovação de advogado ou administrador.
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Valor final (R$)</label>
            <input
              type="number"
              value={form.final_amount}
              onChange={(e) => setForm({ ...form, final_amount: e.target.value })}
              className="w-full mt-1 border rounded p-2 text-sm"
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

          <div className="flex gap-2">
            <button
              onClick={() => handleSave('rascunho')}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 disabled:opacity-50 text-sm"
            >
              Salvar rascunho
            </button>
            {isAdminOrLawyer && (
              <button
                onClick={() => handleSave('aguardando_aprovacao')}
                disabled={saving}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                Enviar para aprovação
              </button>
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
                  {isAdminOrLawyer && sim.status === 'aguardando_aprovacao' && (
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
