import { useState } from 'react';

const PURPOSES = [
  { key: 'whatsapp_contact', label: 'Contato via WhatsApp' },
  { key: 'email_marketing', label: 'Marketing por e-mail' },
  { key: 'data_processing', label: 'Tratamento de dados' },
  { key: 'marketing', label: 'Marketing geral' },
  { key: 'signature', label: 'Assinatura digital' },
  { key: 'retention', label: 'Retenção de dados' }
];

const BASES = [
  { key: 'consent', label: 'Consentimento' },
  { key: 'contract', label: 'Execução de contrato' },
  { key: 'legal_obligation', label: 'Obrigação legal' },
  { key: 'legitimate_interest', label: 'Interesse legítimo' }
];

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'E-mail' },
  { key: 'web', label: 'Web' },
  { key: 'in_person', label: 'Presencial' },
  { key: 'panel', label: 'Painel' }
];

export default function ConsentForm({ clientId, onSuccess, onCancel }) {
  const [form, setForm] = useState({
    purpose: 'whatsapp_contact',
    legalBasis: 'consent',
    channel: 'panel',
    version: '1.0',
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          purpose: form.purpose,
          legalBasis: form.legalBasis,
          channel: form.channel,
          version: form.version,
          notes: form.notes || undefined
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Erro ao registrar consentimento');
      }

      setLoading(false);
      onSuccess();
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Erro ao registrar consentimento');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-nc-gray-200 rounded p-3 space-y-3 text-sm">
      <p className="font-bold text-nc-text-title">Novo Consentimento</p>

      <div>
        <label htmlFor="consent-purpose" className="block text-xs text-nc-text-secondary mb-1">Finalidade</label>
        <select
          id="consent-purpose"
          value={form.purpose}
          onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          className="nc-input text-xs w-full"
        >
          {PURPOSES.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="consent-basis" className="block text-xs text-nc-text-secondary mb-1">Base legal</label>
        <select
          id="consent-basis"
          value={form.legalBasis}
          onChange={(e) => setForm({ ...form, legalBasis: e.target.value })}
          className="nc-input text-xs w-full"
        >
          {BASES.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="consent-channel" className="block text-xs text-nc-text-secondary mb-1">Canal</label>
        <select
          id="consent-channel"
          value={form.channel}
          onChange={(e) => setForm({ ...form, channel: e.target.value })}
          className="nc-input text-xs w-full"
        >
          {CHANNELS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>

      <div>
        <label htmlFor="consent-version" className="block text-xs text-nc-text-secondary mb-1">Versão do termo</label>
        <input
          id="consent-version"
          type="text"
          value={form.version}
          onChange={(e) => setForm({ ...form, version: e.target.value })}
          className="nc-input text-xs w-full"
          maxLength="20"
          required
        />
      </div>

      <div>
        <label htmlFor="consent-notes" className="block text-xs text-nc-text-secondary mb-1">Observações</label>
        <textarea
          id="consent-notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          className="nc-input text-xs w-full"
          rows="2"
        />
      </div>

      {error && (
        <div className="p-2 bg-red-50 border border-red-200 text-red-700 rounded text-xs" role="alert">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={loading}
          className="nc-btn-primary text-xs py-1.5 flex-1 disabled:opacity-50"
        >
          {loading ? 'Registrando...' : 'Registrar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="nc-btn text-xs py-1.5"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
