import { useState, useEffect } from 'react';
import { apiJson } from '../lib/apiClient';
import FeeTablesManager from './FeeTablesManager';

const BILLING_MODELS = ['fixo', 'percentual', 'entrada_parcelas', 'por_etapa', 'sob_consulta'];
const RULE_TYPES = ['complexidade', 'urgencia', 'etapa', 'volume_documental', 'deslocamento', 'desconto'];
const ADJUSTMENT_KINDS = ['percentual', 'valor_fixo'];

export default function FeeServiceAdmin({ viewMode = null }) {
  const [services, setServices] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState({
    name: '', legal_area: '', case_type: '', description: '', base_amount: '',
    min_amount: '', max_amount: '', billing_model: 'fixo', success_fee_percent: '',
    default_installments: '1', is_active: true, effective_from: '', reference_source: 'tabela_interna', notes: ''
  });
  const [ruleForm, setRuleForm] = useState({
    rule_type: 'complexidade', rule_value: '', adjustment_kind: 'percentual', adjustment_value: ''
  });

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    setLoading(true);
    try {
      const data = await apiJson('/api/fee-services', { method: 'GET' });
      setServices(Array.isArray(data) ? data : []);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao buscar serviços' });
    } finally {
      setLoading(false);
    }
  };

  const fetchRules = async (serviceId) => {
    try {
      const data = await apiJson(`/api/fee-rules?service_id=${serviceId}`, { method: 'GET' });
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('[FEE-ADMIN] Erro ao buscar regras:', err);
    }
  };

  const handleSelect = (svc) => {
    setSelected(svc);
    setForm({
      ...svc,
      base_amount: svc.base_amount,
      min_amount: svc.min_amount,
      max_amount: svc.max_amount,
      default_installments: svc.default_installments,
      is_active: svc.is_active,
      success_fee_percent: svc.success_fee_percent
    });
    fetchRules(svc.id);
  };

  const handleSaveService = async () => {
    if (!form.name || !form.legal_area || !form.base_amount || !form.min_amount || !form.max_amount) {
      setMessage({ type: 'error', text: 'Preencha campos obrigatórios' });
      return;
    }
    setLoading(true);
    try {
      const payload = {
        ...form,
        base_amount: parseFloat(form.base_amount),
        min_amount: parseFloat(form.min_amount),
        max_amount: parseFloat(form.max_amount),
        success_fee_percent: parseFloat(form.success_fee_percent || 0),
        default_installments: parseInt(form.default_installments || 1),
        effective_from: form.effective_from || new Date().toISOString().split('T')[0]
      };

      if (selected) {
        await apiCall(`/api/fee-services?id=${selected.id}`, { method: 'PATCH', body: payload });
      } else {
        await apiCall('/api/fee-services', { method: 'POST', body: payload });
      }

      setMessage({ type: 'success', text: 'Serviço salvo' });
      setSelected(null);
      resetForm();
      fetchServices();
    } catch (err) {
      const text = err.message || 'Erro ao salvar';
      setMessage({ type: 'error', text });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteService = async (id) => {
    if (!confirm('Tem certeza?')) return;
    try {
      await apiCall(`/api/fee-services?id=${id}`, { method: 'DELETE' });
      setMessage({ type: 'success', text: 'Serviço removido' });
      fetchServices();
      setSelected(null);
      resetForm();
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao remover' });
    }
  };

  const handleSaveRule = async () => {
    if (!selected || !ruleForm.rule_value) return;
    try {
      const payload = {
        service_id: selected.id,
        rule_type: ruleForm.rule_type,
        rule_value: ruleForm.rule_value,
        adjustment_kind: ruleForm.adjustment_kind,
        adjustment_value: parseFloat(ruleForm.adjustment_value)
      };
      await apiCall('/api/fee-rules', { method: 'POST', body: payload });
      setMessage({ type: 'success', text: 'Regra salva' });
      setRuleForm({ rule_type: 'complexidade', rule_value: '', adjustment_kind: 'percentual', adjustment_value: '' });
      fetchRules(selected.id);
    } catch (err) {
      const text = err.message || 'Erro ao salvar regra';
      setMessage({ type: 'error', text });
    }
  };

  const handleDeleteRule = async (id) => {
    if (!confirm('Tem certeza?')) return;
    try {
      await apiCall(`/api/fee-rules?id=${id}`, { method: 'DELETE' });
      fetchRules(selected.id);
    } catch (err) {
      setMessage({ type: 'error', text: 'Erro ao remover regra' });
    }
  };

  const resetForm = () => {
    setForm({
      name: '', legal_area: '', case_type: '', description: '', base_amount: '',
      min_amount: '', max_amount: '', billing_model: 'fixo', success_fee_percent: '',
      default_installments: '1', is_active: true, effective_from: '', reference_source: 'tabela_interna', notes: ''
    });
  };

  return (
    <div className="p-4 space-y-4 h-full w-full overflow-y-auto min-w-0">
      <h2 className="font-bold text-xl">💰 Tabela de Honorários</h2>

      {message && (
        <div className={`p-3 rounded text-sm ${message.type === 'error' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border rounded p-3 bg-gray-50">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-sm">Serviços</h3>
            <button onClick={() => { setSelected(null); resetForm(); setRules([]); }} className="text-xs text-blue-600 hover:underline">+ Novo</button>
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {services.map((s) => (
              <div
                key={s.id}
                onClick={() => handleSelect(s)}
                className={`p-2 rounded cursor-pointer text-sm ${selected?.id === s.id ? 'bg-blue-100 border border-blue-300' : 'bg-white border hover:bg-gray-100'}`}
              >
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-gray-600">{s.legal_area} {s.case_type ? `— ${s.case_type}` : ''}</p>
                <p className="text-xs text-gray-600">R$ {Number(s.base_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                {!s.is_active && <span className="text-xs text-red-600">Inativo</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 border rounded p-4 bg-white space-y-4">
          <h3 className="font-semibold text-sm">{selected ? 'Editar serviço' : 'Novo serviço'}</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded p-2 text-sm" />
            <input placeholder="Área jurídica" value={form.legal_area} onChange={(e) => setForm({ ...form, legal_area: e.target.value })} className="border rounded p-2 text-sm" />
            <input placeholder="Tipo de caso (opcional)" value={form.case_type} onChange={(e) => setForm({ ...form, case_type: e.target.value })} className="border rounded p-2 text-sm" />
            <select value={form.billing_model} onChange={(e) => setForm({ ...form, billing_model: e.target.value })} className="border rounded p-2 text-sm">
              {BILLING_MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" placeholder="Valor-base" value={form.base_amount} onChange={(e) => setForm({ ...form, base_amount: e.target.value })} className="border rounded p-2 text-sm" />
            <input type="number" placeholder="Mínimo" value={form.min_amount} onChange={(e) => setForm({ ...form, min_amount: e.target.value })} className="border rounded p-2 text-sm" />
            <input type="number" placeholder="Máximo" value={form.max_amount} onChange={(e) => setForm({ ...form, max_amount: e.target.value })} className="border rounded p-2 text-sm" />
            <input type="number" placeholder="% êxito" value={form.success_fee_percent} onChange={(e) => setForm({ ...form, success_fee_percent: e.target.value })} className="border rounded p-2 text-sm" />
            <input type="number" placeholder="Parcelas padrão" value={form.default_installments} onChange={(e) => setForm({ ...form, default_installments: e.target.value })} className="border rounded p-2 text-sm" />
            <input type="date" placeholder="Vigência" value={form.effective_from} onChange={(e) => setForm({ ...form, effective_from: e.target.value })} className="border rounded p-2 text-sm" />
            <select value={form.reference_source} onChange={(e) => setForm({ ...form, reference_source: e.target.value })} className="border rounded p-2 text-sm">
              <option value="tabela_interna">Tabela interna</option>
              <option value="tabela_oab">Tabela da OAB</option>
              <option value="pratica_consolidada">Prática consolidada</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Ativo
            </label>
          </div>
          <textarea placeholder="Descrição interna" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border rounded p-2 text-sm" rows={2} />
          <textarea placeholder="Observações" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full border rounded p-2 text-sm" rows={2} />

          <div className="flex gap-2">
            <button onClick={handleSaveService} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
              {loading ? 'Salvando...' : 'Salvar serviço'}
            </button>
            {selected && (
              <button onClick={() => handleDeleteService(selected.id)} className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm">
                Remover
              </button>
            )}
          </div>

          {selected && (
            <div className="pt-4 border-t">
              <h4 className="font-semibold text-sm mb-2">Regras de ajuste</h4>
              <div className="flex gap-2 mb-2">
                <select value={ruleForm.rule_type} onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })} className="border rounded p-2 text-sm">
                  {RULE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Valor (ex: alta)" value={ruleForm.rule_value} onChange={(e) => setRuleForm({ ...ruleForm, rule_value: e.target.value })} className="border rounded p-2 text-sm" />
                <select value={ruleForm.adjustment_kind} onChange={(e) => setRuleForm({ ...ruleForm, adjustment_kind: e.target.value })} className="border rounded p-2 text-sm">
                  {ADJUSTMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                <input type="number" placeholder="Valor" value={ruleForm.adjustment_value} onChange={(e) => setRuleForm({ ...ruleForm, adjustment_value: e.target.value })} className="border rounded p-2 text-sm" />
                <button onClick={handleSaveRule} className="px-3 py-2 bg-green-600 text-white rounded text-sm">+</button>
              </div>
              <div className="space-y-1">
                {rules.map((r) => (
                  <div key={r.id} className="flex justify-between items-center p-2 bg-gray-50 rounded text-sm">
                    <span>{r.rule_type}={r.rule_value} ({r.adjustment_kind} {r.adjustment_value})</span>
                    <button onClick={() => handleDeleteRule(r.id)} className="text-red-600 text-xs hover:underline">Remover</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!viewMode && <FeeTablesManager />}
    </div>
  );
}

